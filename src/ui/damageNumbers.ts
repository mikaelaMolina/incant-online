import * as THREE from 'three';
import type { Point3 } from '../combat/events';

const LIFE = 0.85; // seconds
const RISE = 1.4; // metres
const MAX = 40;

interface Num {
  el: HTMLSpanElement;
  at: THREE.Vector3;
  age: number;
  drift: number;
  active: boolean;
}

/**
 * Floating damage numbers: pooled DOM labels projected from world space each frame. They take the
 * spell's colour (orange for burn ticks, red for damage to the Incanter) and big hits are bigger.
 */
export class DamageNumbers {
  private readonly layer = document.createElement('div');
  private readonly pool: Num[] = [];
  private readonly v = new THREE.Vector3();

  constructor(hud: HTMLElement) {
    this.layer.className = 'dmg-layer';
    this.layer.setAttribute('aria-hidden', 'true'); // purely visual; the transcript carries the meaning
    hud.appendChild(this.layer);
  }

  show(at: Point3, amount: number, opts: { color?: string; player?: boolean; overTime?: boolean } = {}): void {
    const shown = Math.round(amount);
    if (shown <= 0) return;
    let n = this.pool.find((p) => !p.active);
    if (!n) {
      if (this.pool.length >= MAX) n = this.pool.reduce((a, b) => (a.age > b.age ? a : b)); // reuse the oldest
      else {
        const el = document.createElement('span');
        el.className = 'dmg';
        this.layer.appendChild(el);
        n = { el, at: new THREE.Vector3(), age: 0, drift: 0, active: false };
        this.pool.push(n);
      }
    }
    n.active = true;
    n.age = 0;
    n.drift = (Math.random() - 0.5) * 0.8;
    // Several hits on one target in quick succession stack upwards instead of overlapping.
    const stacked = this.pool.filter((p) => p !== n && p.active && p.age < 0.3 && Math.hypot(p.at.x - at.x, p.at.z - at.z) < 0.6).length;
    n.at.set(at.x + (Math.random() - 0.5) * 0.3, at.y + stacked * 0.45, at.z);
    n.el.textContent = String(shown);
    n.el.className = `dmg${opts.player ? ' dmg-player' : ''}${opts.overTime ? ' dmg-dot' : ''}${shown >= 40 ? ' dmg-big' : ''}`;
    n.el.style.setProperty('--c', opts.player ? '#ff5a4a' : (opts.color ?? '#ffffff'));
    n.el.hidden = false;
  }

  update(dt: number, camera: THREE.Camera): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const n of this.pool) {
      if (!n.active) continue;
      n.age += dt;
      const t = n.age / LIFE;
      if (t >= 1) {
        n.active = false;
        n.el.hidden = true;
        continue;
      }
      this.v.set(n.at.x + n.drift * t, n.at.y + RISE * (1 - (1 - t) * (1 - t)), n.at.z).project(camera);
      if (this.v.z > 1) {
        n.el.hidden = true;
        continue;
      }
      n.el.hidden = false;
      const pop = t < 0.12 ? 1 + (0.12 - t) * 3 : 1;
      n.el.style.transform = `translate(${((this.v.x + 1) / 2) * w}px, ${((1 - this.v.y) / 2) * h}px) translate(-50%, -50%) scale(${pop})`;
      n.el.style.opacity = String(t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3);
    }
  }

  clear(): void {
    for (const n of this.pool) {
      n.active = false;
      n.el.hidden = true;
    }
  }
}
