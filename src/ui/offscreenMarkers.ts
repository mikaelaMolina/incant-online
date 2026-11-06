import * as THREE from 'three';
import type { Enemy } from '../enemies/enemy';

const MAX = 10;
const MARGIN = 28; // px from the screen edge

/**
 * Arrows on the screen edge pointing at enemies outside the view, so the last foes of a floor
 * are never lost. Coloured by archetype; bosses get a bigger marker.
 */
export class OffscreenMarkers {
  private readonly layer = document.createElement('div');
  private readonly pool: HTMLDivElement[] = [];
  private readonly v = new THREE.Vector3();

  constructor(hud: HTMLElement) {
    this.layer.className = 'offscreen-layer';
    this.layer.setAttribute('aria-hidden', 'true');
    hud.appendChild(this.layer);
  }

  update(enemies: readonly Enemy[], camera: THREE.Camera): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cx = w / 2;
    const cy = h / 2;
    let used = 0;
    for (const e of enemies) {
      if (!e.alive || used >= MAX) continue;
      this.v.copy(e.position);
      this.v.y += e.height * 0.5;
      this.v.project(camera);
      const behind = this.v.z > 1;
      let x = this.v.x;
      let y = this.v.y;
      if (!behind && Math.abs(x) < 0.98 && Math.abs(y) < 0.95) continue; // on screen
      if (behind) {
        x = -x;
        y = -y;
      }
      // Direction from the screen centre, clamped to the edge rectangle.
      const dx = x * cx;
      const dy = -y * cy;
      const k = Math.min((cx - MARGIN) / Math.max(1e-3, Math.abs(dx)), (cy - MARGIN) / Math.max(1e-3, Math.abs(dy)));
      const px = cx + dx * k;
      const py = cy + dy * k;
      const angle = Math.atan2(dy, dx);
      let el = this.pool[used];
      if (!el) {
        el = document.createElement('div');
        el.className = 'offscreen-marker';
        this.layer.appendChild(el);
        this.pool.push(el);
      }
      el.hidden = false;
      el.classList.toggle('offscreen-boss', e.spec.archetype === 'boss');
      el.style.setProperty('--accent', e.profile.color);
      el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, -50%) rotate(${angle.toFixed(3)}rad)`;
      used++;
    }
    for (let i = used; i < this.pool.length; i++) this.pool[i]!.hidden = true;
  }
}
