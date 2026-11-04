import { judge } from '../arbiter/arbiter';
import type { Grimoire } from '../combat/grimoire';
import type { IncantationSpec } from '../schemas/incantationSpec';
import type { FloorSpec } from '../schemas/floorSpec';
import type { InterpretResponse } from '../schemas/interpret';
import { requestInterpretation, type InterpretContext } from './interpretClient';
import type { Utterance } from './pipeline';

/** Starts of a refinement: CLAUDE.md voice routing step 3. */
const REFINE = /^(make it|make that|now make it|add|remove|more|less|give it|change it|turn it)\b/i;

export interface RouterDeps {
  grimoire: Grimoire;
  currentFloor(): FloorSpec;
  loadFloor(spec: FloorSpec): Promise<void>;
  say(text: string): void;
  thinking(on: boolean): void;
  onMode?(response: InterpretResponse & { offline?: boolean }): void;
}

/**
 * Routes in-game utterances. Today: refine (with context) and everything else → /api/interpret
 * → forge / build / reply. Recite, system commands and Talk slot in before the network call later.
 */
export class CommandRouter {
  private busy = false;

  constructor(private readonly deps: RouterDeps) {}

  async handle(u: Utterance): Promise<void> {
    if (this.busy) {
      this.deps.say('The Spire is still shaping your last words…');
      return;
    }
    this.busy = true;
    this.deps.thinking(true);
    try {
      const context: InterpretContext | undefined = REFINE.test(u.text)
        ? { ...(this.deps.grimoire.last ? { incantation: this.deps.grimoire.last } : {}), floor: this.deps.currentFloor() }
        : undefined;
      const r = await requestInterpretation(u.text, context);
      this.deps.onMode?.(r);
      await this.apply(r);
    } finally {
      this.busy = false;
      this.deps.thinking(false);
    }
  }

  private async apply(r: InterpretResponse): Promise<void> {
    if (r.intent === 'forge' && r.incantation) {
      const j = this.deps.grimoire.add(judge(r.incantation));
      if (r.reply) this.deps.say(r.reply);
      this.deps.say(`Forged ${j.incantation.name}: ${summary(j.incantation)}. ${j.sentence}`);
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

/** "3× fire spin, 18 dmg, burn, 9 s, 23 mana" */
export function summary(i: IncantationSpec): string {
  const effect = i.status_effect.kind === 'none' ? '' : `, ${i.status_effect.kind}`;
  const chain = i.chain_targets ? `, chains ×${i.chain_targets}` : '';
  return `${i.hits}× ${i.element} ${i.shape}, ${i.damage_per_hit} dmg${effect}${chain}, ${i.cooldown} s, ${i.mana_cost} mana`;
}
