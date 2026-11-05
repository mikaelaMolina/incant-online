import { judge } from '../arbiter/arbiter';
import type { Grimoire } from '../combat/grimoire';
import type { CastOutcome } from '../combat/incantationRunner';
import type { IncantationSpec } from '../schemas/incantationSpec';
import { parseFloorSpec, type FloorSpec } from '../schemas/floorSpec';
import type { InterpretResponse } from '../schemas/interpret';
import { CACHED_FLOORS } from '../fallback/cache';
import { requestInterpretation, type InterpretContext } from './interpretClient';
import { classify, INTERIM_RECITE_THRESHOLD, ReciteIndex, words, type Route, type SystemCommand } from './intentRouter';
import type { Utterance } from './pipeline';

/** A final transcript repeating what an interim already cast is ignored within this window. */
const INTERIM_DEDUPE_MS = 4000;

export interface RouterDeps {
  grimoire: Grimoire;
  currentFloor(): FloorSpec;
  loadFloor(spec: FloorSpec): Promise<void>;
  /** Cast locally (the runner checks mana and cooldown). */
  cast(spec: IncantationSpec): CastOutcome;
  say(text: string): void;
  thinking(on: boolean): void;
  showGrimoire(open: boolean): void;
  onMode?(response: InterpretResponse & { offline?: boolean }): void;
  /** Talk route (guide NPC): not built yet, so the route stays closed until both exist. */
  nearGuide?(): boolean;
  talk?(text: string): Promise<string>;
  /** Timing hook for the recite budget (< 500 ms from words to cast). */
  onRecite?(name: string, ms: number, fromInterim: boolean): void;
}

/**
 * Routes in-game utterances (CLAUDE.md voice routing):
 * recite (local, instant) → system command (local) → refine → talk → /api/interpret.
 * Local routes never wait for a network request in flight, so you can cast while forging.
 */
export class CommandRouter {
  private busy = false;
  private readonly recite = new ReciteIndex();
  private lastInterim: { name: string; at: number } | undefined;
  private floorCursor = 0;

  constructor(private readonly deps: RouterDeps) {
    this.syncNames();
  }

  /** Call after the Grimoire changes so reciting knows the new names. */
  syncNames(): void {
    this.recite.setNames(this.deps.grimoire.all.map((j) => j.incantation.name));
  }

  /**
   * Interim (still-speaking) transcript: cast as soon as a name is clearly said, without waiting
   * for the recogniser's final result. Strict threshold, and never when the words so far could
   * still become a longer name ("Frost Comet" vs "Frost Comet Barrage").
   */
  handleInterim(text: string, startedAt = performance.now()): void {
    const m = this.recite.match(text, INTERIM_RECITE_THRESHOLD);
    if (!m) return;
    const said = words(text);
    const longer = this.deps.grimoire.all.some((j) => {
      const n = words(j.incantation.name);
      return n !== words(m.name) && n.startsWith(said) && n.length > said.length;
    });
    if (longer) return;
    if (this.lastInterim && this.lastInterim.name === m.name && performance.now() - this.lastInterim.at < INTERIM_DEDUPE_MS) return;
    this.lastInterim = { name: m.name, at: performance.now() };
    this.castByName(m.name, startedAt, true);
  }

  /** Route a final utterance. Recite and system commands resolve synchronously. */
  handle(u: Utterance, startedAt = performance.now()): Promise<void> {
    const route = classify(u.text, {
      recite: this.recite,
      canRefine: true, // the current floor is always refinable
      nearGuide: !!(this.deps.talk && this.deps.nearGuide?.()),
    });
    return this.run(route, u, startedAt);
  }

  private async run(route: Route, u: Utterance, startedAt: number): Promise<void> {
    switch (route.kind) {
      case 'recite': {
        const li = this.lastInterim;
        this.lastInterim = undefined;
        if (li && li.name === route.name && performance.now() - li.at < INTERIM_DEDUPE_MS) return; // already cast
        this.castByName(route.name, startedAt, false);
        return;
      }
      case 'command':
        return this.command(route.command);
      case 'refine':
        return this.network(u.text, true);
      case 'talk':
        return this.withBusy(async () => {
          const reply = await this.deps.talk!(u.text);
          this.deps.say(reply);
        });
      case 'interpret':
        return this.network(u.text, false);
    }
  }

  private castByName(name: string, startedAt: number, fromInterim: boolean): void {
    const entry = this.deps.grimoire.find(name);
    if (!entry) return;
    const outcome = this.deps.cast(entry.incantation);
    if (outcome.ok) this.deps.grimoire.touch(name);
    this.deps.onRecite?.(name, performance.now() - startedAt, fromInterim);
  }

  private async command(c: SystemCommand): Promise<void> {
    switch (c) {
      case 'open-grimoire':
        this.deps.showGrimoire(true);
        if (!this.deps.grimoire.all.length) this.deps.say('Your Grimoire is empty. Describe an Incantation to forge one.');
        return;
      case 'close-grimoire':
        this.deps.showGrimoire(false);
        return;
      case 'next-floor': {
        const next = this.nextFloor();
        if (!next) {
          this.deps.say('The stair above is sealed.');
          return;
        }
        return this.withBusy(async () => {
          this.deps.say(`You climb to ${next.name}…`);
          await this.deps.loadFloor(next);
        });
      }
    }
  }

  /** Next cached floor that isn't the current one. */
  private nextFloor(): FloorSpec | undefined {
    const current = this.deps.currentFloor().name;
    for (let tries = 0; tries < CACHED_FLOORS.length; tries++) {
      this.floorCursor = (this.floorCursor + 1) % CACHED_FLOORS.length;
      const r = parseFloorSpec(CACHED_FLOORS[this.floorCursor]);
      if (r.ok && r.value.name !== current) return r.value;
    }
    return undefined;
  }

  /** Refine (with the last Incantation and the current floor attached) or a fresh interpretation. */
  private network(text: string, refine: boolean): Promise<void> {
    return this.withBusy(async () => {
      const base = refine ? this.deps.grimoire.last : undefined;
      const context: InterpretContext | undefined = refine ? { ...(base ? { incantation: base } : {}), floor: this.deps.currentFloor() } : undefined;
      const r = await requestInterpretation(text, context);
      this.deps.onMode?.(r);
      await this.apply(r, base);
    });
  }

  private async withBusy(fn: () => Promise<void>): Promise<void> {
    if (this.busy) {
      this.deps.say('The Spire is still shaping your last words…');
      return;
    }
    this.busy = true;
    this.deps.thinking(true);
    try {
      await fn();
    } catch (err) {
      console.warn('Router step failed.', err);
      this.deps.say('The Spire falters. Speak again.');
    } finally {
      this.busy = false;
      this.deps.thinking(false);
    }
  }

  private async apply(r: InterpretResponse, refined: IncantationSpec | undefined): Promise<void> {
    if (r.intent === 'forge' && r.incantation) {
      const judged = judge(r.incantation);
      const j = refined ? this.deps.grimoire.replace(refined.name, judged) : this.deps.grimoire.add(judged);
      this.syncNames();
      if (r.reply) this.deps.say(r.reply);
      const slot = this.deps.grimoire.bar.indexOf(j) + 1;
      const where = slot > 0 ? ` [${slot}]` : '';
      const verb = refined ? (refined.name === j.incantation.name ? 'Reshaped' : `Reshaped ${refined.name} into`) : 'Forged';
      this.deps.say(`${verb} ${j.incantation.name}${where}: ${summary(j.incantation)}. ${j.sentence}`);
      return;
    }
    if (r.intent === 'build' && r.floor) {
      if (r.reply) this.deps.say(r.reply);
      this.deps.say(`The Spire raises ${r.floor.name}…`);
      await this.deps.loadFloor(r.floor);
      this.deps.say(`${r.floor.name} awaits.`);
      return;
    }
    this.deps.say(r.reply ?? 'The Spire is silent.');
  }
}

/** "3× fire spin, 3.5 m, 18 dmg, burn, 9 s, 23 mana" */
export function summary(i: IncantationSpec): string {
  const effect = i.status_effect.kind === 'none' ? '' : `, ${i.status_effect.kind}`;
  const chain = i.chain_targets ? `, chains ×${i.chain_targets}` : '';
  const radius = Number.isInteger(i.radius) ? String(i.radius) : i.radius.toFixed(1);
  return `${i.hits}× ${i.element} ${i.shape}, ${radius} m, ${i.damage_per_hit} dmg${effect}${chain}, ${i.cooldown} s, ${i.mana_cost} mana`;
}
