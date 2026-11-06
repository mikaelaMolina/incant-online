import * as THREE from 'three';
import type { Enemy } from '../enemies/enemy';
import type { Health } from '../combat/health';

const MAX_DISTANCE = 30;

function displayName(id: string): string {
  return id.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** HTML health bars that follow enemies on screen, plus the Incanter's own bar. */
export class HealthBars {
  private readonly layer = document.createElement('div');
  private readonly bars = new Map<number, { el: HTMLDivElement; fill: HTMLDivElement; last: number }>();
  private readonly playerFill: HTMLDivElement;
  private readonly playerLag: HTMLDivElement;
  private readonly playerEl: HTMLDivElement;
  private readonly vignette = document.createElement('div');
  private readonly flash = document.createElement('div');
  private readonly playerText: HTMLSpanElement;
  private readonly banner: HTMLDivElement;
  private readonly v = new THREE.Vector3();
  private lastPlayerHp = -1;

  constructor(hud: HTMLElement) {
    this.layer.className = 'hp-layer';
    hud.appendChild(this.layer);

    const player = document.createElement('div');
    player.className = 'hp-player';
    player.innerHTML = '<span class="hp-player-name">Incanter</span><div class="hp-track"><div class="hp-lag"></div><div class="hp-fill"></div></div><span class="hp-player-text"></span>';
    hud.appendChild(player);
    this.playerFill = player.querySelector('.hp-fill') as HTMLDivElement;
    this.playerLag = player.querySelector('.hp-lag') as HTMLDivElement;
    this.playerEl = player;
    // Screen-edge effects: a red vignette that deepens at low health, and a flash when hit.
    this.vignette.className = 'low-hp';
    this.flash.className = 'hurt-flash';
    hud.prepend(this.vignette, this.flash);
    this.playerText = player.querySelector('.hp-player-text') as HTMLSpanElement;

    this.banner = document.createElement('div');
    this.banner.className = 'hud-banner';
    this.banner.hidden = true;
    hud.appendChild(this.banner);
  }

  showBanner(text: string | null): void {
    this.banner.hidden = text === null;
    if (text !== null) this.banner.textContent = text;
  }

  update(enemies: readonly Enemy[], player: Health, camera: THREE.Camera, playerPos: THREE.Vector3): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const seen = new Set<number>();

    for (const e of enemies) {
      if (!e.alive) continue;
      seen.add(e.uid);
      let bar = this.bars.get(e.uid);
      if (!bar) {
        const el = document.createElement('div');
        el.className = 'hp-enemy';
        el.style.setProperty('--accent', e.profile.color);
        el.innerHTML = `<span class="hp-name"></span><div class="hp-track"><div class="hp-fill"></div></div>`;
        (el.querySelector('.hp-name') as HTMLSpanElement).textContent = displayName(e.spec.id);
        this.layer.appendChild(el);
        bar = { el, fill: el.querySelector('.hp-fill') as HTMLDivElement, last: -1 };
        this.bars.set(e.uid, bar);
      }

      this.v.copy(e.position);
      this.v.y += e.height + 0.35;
      const far = this.v.distanceTo(playerPos) > MAX_DISTANCE;
      this.v.project(camera);
      const visible = !far && this.v.z < 1 && Math.abs(this.v.x) < 1.1 && Math.abs(this.v.y) < 1.1;
      bar.el.hidden = !visible;
      if (!visible) continue;
      const x = (this.v.x * 0.5 + 0.5) * w;
      const y = (-this.v.y * 0.5 + 0.5) * h;
      bar.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      const f = e.health.fraction;
      if (f !== bar.last) {
        bar.fill.style.width = `${(f * 100).toFixed(1)}%`;
        bar.last = f;
      }
    }

    for (const [uid, bar] of this.bars) {
      if (!seen.has(uid)) {
        bar.el.remove();
        this.bars.delete(uid);
      }
    }

    if (player.current !== this.lastPlayerHp) {
      // The lag bar trails behind (CSS delay) so a hit reads as a chunk being knocked off.
      this.lastPlayerHp = player.current;
      const pct = `${(player.fraction * 100).toFixed(1)}%`;
      this.playerFill.style.width = pct;
      this.playerLag.style.width = pct;
      this.playerText.textContent = `${Math.ceil(player.current)} / ${player.max}`;
      const danger = Math.max(0, Math.min(1, (0.35 - player.fraction) / 0.35));
      this.vignette.style.setProperty('--danger', player.dead ? '0' : danger.toFixed(2));
      this.playerEl.classList.toggle('hp-low', danger > 0 && !player.dead);
    }
  }

  /** Red flash at the screen edges when the Incanter is hit. */
  hurt(): void {
    this.flash.classList.remove('hurt-on');
    void this.flash.offsetWidth; // restart the animation
    this.flash.classList.add('hurt-on');
  }
}
