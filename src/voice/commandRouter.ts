import { judge } from '../arbiter/arbiter';
import type { Grimoire } from '../combat/grimoire';
import type { CastOutcome } from '../combat/incantationRunner';
import type { IncantationSpec } from '../schemas/incantationSpec';
import { parseFloorSpec, type FloorSpec } from '../schemas/floorSpec';
import { parseInterpretResponse, type InterpretResponse } from '../schemas/interpret';
import { CACHED_FLOORS, cachedFloor, cachedIncantation } from '../fallback/cache';
import { offlineFallback, requestInterpretation, type InterpretContext } from './interpretClient';
import { classify, INTERIM_RECITE_THRESHOLD, ReciteIndex, words, type Route, type SystemCommand } from './intentRouter';
import type { Utterance } from './pipeline';

/** A final transcript repeating what an interim already cast is ignored within this window. */
const INTERIM_DEDUPE_MS = 4000;
/** Floor build target is < 10 s end to end; the request gets most of it, the build the rest. */
const GATE_REQUEST_BUDGET_MS = 6000;
/** At the gate, a second, explicit "build" request is only tried if the first came back this fast. */
const GATE_REPHRASE_IF_UNDER_MS = 3500;
/** Questions get an answer even at the gate ("what is this place?"). */
const QUESTION = /\?\s*$|^(what|who|why|how|where|when|is|are|can|could|do|does|will|should)\b/i;

export interface RouterDeps {
  grimoire: Grimoire;
  currentFloor(): FloorSpec;
  /** Load a floor; resolves with the floor actually loaded (a fallback if building failed). */
  loadFloor(spec: FloorSpec): Promise<FloorSpec | void>;
  /** Cast locally (the runner checks mana and cooldown). */
  cast(spec: IncantationSpec): CastOutcome;
  say(text: string): void;
  /** The Arbiter's voice (speechSynthesis). Lines are also shown with say(). */
  speak?(text: string): void;
  thinking(on: boolean): void;
  /** "The Spire reshapes…" curtain; hiding resolves once it has faded. */
  reshape?(on: boolean, subtitle?: string): Promise<void> | void;
  /** Is the Incanter standing in the open gate? Then words describe the next floor. */
  atGate?(): boolean;
  /** Timing hook for the floor budget (< 10 s from words to a playable floor). */
  onFloorBuilt?(name: string, ms: number): void;
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
    // In the gate, anything that isn't a recital or a command describes the next floor.
    if (this.deps.atGate?.() && route.kind !== 'recite' && route.kind !== 'command') return this.gateBuild(u.text, startedAt);
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
        return this.network(u.text, true, startedAt);
      case 'talk':
        return this.withBusy(async () => {
          const reply = await this.deps.talk!(u.text);
          this.deps.say(reply);
        });
      case 'interpret':
        return this.network(u.text, false, startedAt);
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
        const t0 = performance.now();
        return this.withBusy(() => this.buildFloor(next, t0));
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
  private network(text: string, refine: boolean, startedAt: number): Promise<void> {
    return this.withBusy(async () => {
      const base = refine ? this.deps.grimoire.last : undefined;
      const context: InterpretContext | undefined = refine ? { ...(base ? { incantation: base } : {}), floor: this.deps.currentFloor() } : undefined;
      const r = await requestInterpretation(text, context, this.avoid());
      this.deps.onMode?.(r);
      await this.apply(r, base, startedAt, text);
    });
  }

  /**
   * At the gate: the words describe the next floor. The curtain goes up straight away; if the
   * Spire answers with something other than a floor, it is asked once more explicitly, then a
   * cached floor stands in. A plain question still gets its answer.
   */
  private gateBuild(text: string, startedAt: number): Promise<void> {
    return this.withBusy(async () => {
      void this.deps.reshape?.(true, 'The Spire listens…');
      let r = await requestInterpretation(text, undefined, { ...this.avoid(), want: 'floor', budgetMs: GATE_REQUEST_BUDGET_MS });
      this.deps.onMode?.(r);
      if (r.intent !== 'build' || !r.floor) {
        if (r.intent === 'reply' && r.reply && QUESTION.test(text.trim())) {
          await this.deps.reshape?.(false);
          this.reply(r.reply);
          return;
        }
        const elapsed = performance.now() - startedAt;
        if (elapsed < GATE_REPHRASE_IF_UNDER_MS) {
          r = await requestInterpretation(`Build the next floor of the Spire: ${text}`, undefined, {
            ...this.avoid(),
            want: 'floor',
            budgetMs: GATE_REQUEST_BUDGET_MS - elapsed,
          });
        }
        if (r.intent !== 'build' || !r.floor) r = offlineFallback(text, undefined, { ...this.avoid(), want: 'floor', reason: 'llm-error' });
      }
      if (r.reply && r.intent === 'build') this.deps.say(r.reply);
      if (r.floor) await this.buildFloor(r.floor, startedAt);
    });
  }

  /** Curtain up, build, curtain down, announce. */
  private async buildFloor(spec: FloorSpec, startedAt: number): Promise<void> {
    void this.deps.reshape?.(true, spec.name);
    this.deps.speak?.('The Spire reshapes.');
    const loaded = (await this.deps.loadFloor(spec)) ?? spec;
    this.deps.onFloorBuilt?.(loaded.name, performance.now() - startedAt);
    await this.deps.reshape?.(false);
    const line = `${loaded.name} awaits.`;
    this.deps.say(line);
    this.deps.speak?.(line);
  }

  /** An in-character Arbiter line: shown and spoken. */
  private reply(text: string): void {
    this.deps.say(text);
    this.deps.speak?.(text);
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
      void this.deps.reshape?.(false); // never leave the curtain down
    }
  }

  /** What a fallback must not hand out: Incantations already in the Grimoire, the floor we're on. */
  private avoid(): { avoidIncantations: string[]; avoidFloors: string[] } {
    return {
      avoidIncantations: this.deps.grimoire.all.map((j) => j.incantation.name),
      avoidFloors: [this.deps.currentFloor().name],
    };
  }

  /**
   * A cached answer from the server doesn't know the Grimoire or the current floor: if it repeats
   * one, pick a different pre-forged Incantation / pre-built floor from the same cache.
   */
  private freshen(r: InterpretResponse, refined: IncantationSpec | undefined, text: string): InterpretResponse {
    if (r.source !== 'cache' || refined) return r;
    const { avoidIncantations, avoidFloors } = this.avoid();
    if (r.intent === 'forge' && r.incantation && this.deps.grimoire.find(r.incantation.name)) {
      const { element, type, shape } = r.incantation;
      const swap = parseInterpretResponse({ ...r, incantation: cachedIncantation(text, avoidIncantations, { element, type, shape }) });
      if (swap.ok) return swap.value;
    }
    if (r.intent === 'build' && r.floor && avoidFloors.includes(r.floor.name)) {
      const swap = parseInterpretResponse({ ...r, floor: cachedFloor(text, avoidFloors, { biome: r.floor.biome }) });
      if (swap.ok) return swap.value;
    }
    return r;
  }

  private async apply(response: InterpretResponse, refined: IncantationSpec | undefined, startedAt: number, text = ''): Promise<void> {
    const r = this.freshen(response, refined, text);
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
      await this.buildFloor(r.floor, startedAt);
      return;
    }
    this.reply(r.reply ?? 'The Spire is silent.');
  }
}

/** "3× fire spin, 3.5 m, 18 dmg, burn, 9 s, 23 mana" */
export function summary(i: IncantationSpec): string {
  const effect = i.status_effect.kind === 'none' ? '' : `, ${i.status_effect.kind}`;
  const chain = i.chain_targets ? `, chains ×${i.chain_targets}` : '';
  const radius = Number.isInteger(i.radius) ? String(i.radius) : i.radius.toFixed(1);
  return `${i.hits}× ${i.element} ${i.shape}, ${radius} m, ${i.damage_per_hit} dmg${effect}${chain}, ${i.cooldown} s, ${i.mana_cost} mana`;
}
