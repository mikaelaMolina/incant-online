import type { Grimoire } from '../combat/grimoire';
import { summary } from '../voice/commandRouter';

/** Full Grimoire listing, opened with "open Grimoire" (or typed), closed with "close Grimoire" or ×. */
export class GrimoirePanel {
  private readonly el = document.createElement('div');
  private readonly list = document.createElement('div');

  constructor(parent: HTMLElement) {
    this.el.className = 'grimoire-panel';
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'Grimoire');
    const close = document.createElement('button');
    close.className = 'grimoire-close';
    close.type = 'button';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Close the Grimoire');
    close.addEventListener('click', () => this.show(false));
    const title = document.createElement('h2');
    title.textContent = 'Grimoire';
    const hint = document.createElement('p');
    hint.className = 'grimoire-hint';
    hint.textContent = 'Say a name to recite it, or press its number. Only six fit on the bar; every Incantation here can still be recited.';
    this.el.append(close, title, hint, this.list);
    parent.appendChild(this.el);
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  show(open: boolean): void {
    this.el.hidden = !open;
  }

  render(grimoire: Grimoire): void {
    this.list.replaceChildren();
    for (const j of grimoire.all) {
      const spec = j.incantation;
      const row = document.createElement('div');
      row.className = 'grimoire-entry';
      row.style.setProperty('--accent', spec.vfx.color);
      const slot = grimoire.bar.indexOf(j);
      const cells: [string, string][] = [
        ['grimoire-slot', slot >= 0 ? String(slot + 1) : '·'],
        ['grimoire-name', spec.name],
        ['grimoire-stats', summary(spec)],
        ['grimoire-flavor', spec.flavor],
      ];
      for (const [cls, text] of cells) {
        if (!text) continue;
        const span = document.createElement('span');
        span.className = cls;
        span.textContent = text;
        row.appendChild(span);
      }
      this.list.appendChild(row);
    }
  }
}
