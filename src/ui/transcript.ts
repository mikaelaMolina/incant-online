const MAX_LINES = 4;
const LINE_LIFETIME_MS = 9000;

export type LineKind = 'you' | 'spire';

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

  add(kind: LineKind, text: string): void {
    const line = document.createElement('div');
    line.className = `transcript-line transcript-${kind}`;
    const who = document.createElement('span');
    who.className = 'transcript-who';
    who.textContent = kind === 'you' ? 'You' : 'The Arbiter';
    const body = document.createElement('span');
    body.textContent = text; // never innerHTML: this is player / model text
    line.append(who, body);
    this.lines.appendChild(line);
    while (this.lines.children.length > MAX_LINES) this.lines.firstElementChild?.remove();
    window.setTimeout(() => {
      line.classList.add('fading');
      window.setTimeout(() => line.remove(), 600);
    }, LINE_LIFETIME_MS);
  }
}
