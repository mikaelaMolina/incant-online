/**
 * The Incanter's unit frame (bottom left): a medallion portrait with the level badge, and the
 * existing health and mana bars moved inside one framed panel. The emblem is an original inline
 * SVG (a staff and a spoken-word arc), so no image asset is needed.
 */
const EMBLEM = `
<svg viewBox="0 0 64 64" aria-hidden="true">
  <defs>
    <radialGradient id="uf-bg" cx="50%" cy="40%" r="60%">
      <stop offset="0" stop-color="#3b2d6e"/><stop offset="1" stop-color="#120c26"/>
    </radialGradient>
    <radialGradient id="uf-orb" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#ffffff"/><stop offset="0.4" stop-color="#9fe4ff"/><stop offset="1" stop-color="#2a7bd6" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="32" cy="32" r="30" fill="url(#uf-bg)"/>
  <path d="M14 26 Q32 10 50 26" fill="none" stroke="#c9a6ff" stroke-width="1.6" stroke-linecap="round" opacity="0.7"/>
  <path d="M18 31 Q32 19 46 31" fill="none" stroke="#c9a6ff" stroke-width="1.4" stroke-linecap="round" opacity="0.45"/>
  <line x1="24" y1="54" x2="38" y2="22" stroke="#b07a3e" stroke-width="3.2" stroke-linecap="round"/>
  <circle class="uf-orb" cx="39" cy="20" r="9" fill="url(#uf-orb)"/>
</svg>`;

export class UnitFrame {
  private readonly root = document.createElement('div');
  private readonly levelEl: HTMLSpanElement;

  constructor(hud: HTMLElement) {
    this.root.className = 'unit-frame';
    const portrait = document.createElement('div');
    portrait.className = 'uf-portrait';
    portrait.innerHTML = EMBLEM;
    this.levelEl = document.createElement('span');
    this.levelEl.className = 'uf-level';
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

  /** Orb tint follows the last Incantation's colour. */
  setColor(color: string): void {
    this.root.style.setProperty('--uf-glow', color);
  }
}
