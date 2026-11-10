import { WandSparkles } from 'lucide';
import { icon } from './icons';

/**
 * The Incanter's unit frame (bottom left): an avatar with the level badge, and the existing
 * health and mana bars moved inside one card.
 */
export class UnitFrame {
  private readonly root = document.createElement('div');
  private readonly levelEl: HTMLSpanElement;

  constructor(hud: HTMLElement) {
    this.root.className = 'card unit-frame';
    const portrait = document.createElement('div');
    portrait.className = 'uf-portrait';
    portrait.innerHTML = icon(WandSparkles, 22);
    this.levelEl = document.createElement('span');
    this.levelEl.className = 'badge uf-level';
    this.levelEl.textContent = '1';
    this.levelEl.title = 'Level';
    portrait.appendChild(this.levelEl);
    const bars = document.createElement('div');
    bars.className = 'uf-bars';
    const title = document.createElement('div');
    title.className = 'uf-title';
    title.textContent = 'Incanter';
    bars.appendChild(title);
    // Adopt the bars the other HUD parts already created (they keep updating them).
    for (const sel of ['.hp-player', '.mana-player']) {
      const el = hud.querySelector(sel);
      if (el) bars.appendChild(el);
    }
    this.root.append(portrait, bars);
    hud.appendChild(this.root);
  }

  setLevel(level: number): void {
    this.levelEl.textContent = String(level);
  }

  /** Avatar icon tint follows the last Incantation's colour. */
  setColor(color: string): void {
    this.root.style.setProperty('--uf-glow', color);
  }
}
