import { X } from 'lucide';
import type { Grimoire } from '../combat/grimoire';
import { summary } from '../voice/commandRouter';
import { icon } from './icons';

/** Full Grimoire listing, opened with "open Grimoire" (or typed), closed with "close Grimoire" or ×. */
export class GrimoirePanel {
  private readonly el = document.createElement('div');
  private readonly list = document.createElement('section');

  constructor(parent: HTMLElement) {
    this.el.className = 'card grimoire-panel';
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'Grimoire');

    const header = document.createElement('header');
    const title = document.createElement('h2');
    title.textContent = 'Grimoire';
    const hint = document.createElement('p');
    hint.className = 'grimoire-hint';
    hint.textContent = 'Say a name to recite it, or press its number. Only six fit on the bar; every Incantation here can still be recited.';
    const close = document.createElement('button');
    close.className = 'btn card-action grimoire-close';
    close.type = 'button';
    close.dataset.variant = 'ghost';
    close.dataset.size = 'icon-sm';
    close.innerHTML = icon(X, 16);
    close.setAttribute('aria-label', 'Close the Grimoire');
    close.addEventListener('click', () => this.show(false));
    header.append(title, hint, close);

    this.list.className = 'item-group grimoire-list';
    this.el.append(header, this.list);
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
      row.className = 'item grimoire-entry';
      row.dataset.variant = 'outline';
      row.dataset.size = 'sm';
      row.style.setProperty('--spell', spec.vfx.color);
      const slot = grimoire.bar.indexOf(j);
      const badge = document.createElement('figure');
      badge.className = 'grimoire-slot';
      badge.textContent = slot >= 0 ? String(slot + 1) : '·';
      const body = document.createElement('section');
      const name = document.createElement('h3');
      name.className = 'grimoire-name';
      name.textContent = spec.name;
      body.appendChild(name);
      for (const [cls, text] of [
        ['grimoire-stats', summary(spec)],
        ['grimoire-flavor', spec.flavor],
      ] as const) {
        if (!text) continue;
        const p = document.createElement('p');
        p.className = cls;
        p.textContent = text;
        body.appendChild(p);
      }
      row.append(badge, body);
      this.list.appendChild(row);
    }
  }
}
