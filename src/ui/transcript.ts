/** A dialogue box, not a log: few lines, the newest in full, older ones shrunk to one line. */
const MAX_LINES = 3;
/** Long lines stay longer so they can be read: 4 s + ~45 ms per character, at most 15 s. */
const lifetimeMs = (text: string): number => Math.min(15_000, 4_000 + text.length * 45);

export type LineKind = 'you' | 'spire' | 'npc';

/** Live transcript above the command bar: interim speech while listening, then recent lines. */
export class Transcript {
  readonly el = document.createElement('div');
  private readonly lines = document.createElement('div');
  private readonly interim = document.createElement('div');

  constructor(parent: HTMLElement) {
    this.el.className = 'transcript';
    this.el.setAttribute('aria-live', 'polite');
    this.lines.className = 'transcript-lines';
    this.interim.className = 'transcript-interim';
    this.interim.hidden = true;
    this.el.append(this.lines, this.interim);
    parent.appendChild(this.el);
  }

  setInterim(text: string | null): void {
    this.interim.hidden = !text;
    this.interim.textContent = text ?? '';
  }

  /** `name` labels an NPC's line (e.g. "Elder"). */
  add(kind: LineKind, text: string, name?: string): void {
    const line = document.createElement('div');
    line.className = `transcript-line transcript-${kind}`;
    const who = document.createElement('span');
    who.className = 'badge transcript-who';
    who.dataset.variant = kind === 'you' ? 'outline' : 'secondary';
    who.textContent = kind === 'you' ? 'You' : kind === 'npc' ? (name ?? 'Stranger') : 'The Arbiter';
    const body = document.createElement('span');
    body.textContent = text; // never innerHTML: this is player / model text
    line.append(who, body);
    for (const older of this.lines.children) older.classList.add('transcript-old');
    this.lines.appendChild(line);
    while (this.lines.children.length > MAX_LINES) this.lines.firstElementChild?.remove();
    window.setTimeout(() => {
      line.classList.add('fading');
      window.setTimeout(() => line.remove(), 600);
    }, lifetimeMs(text));
  }
}
