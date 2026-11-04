import type * as THREE from 'three';

/** Small perf readout (fps, frame time, draw calls). Toggle with F3; on by default in dev. */
export class DebugOverlay {
  private readonly el = document.createElement('div');
  private frames = 0;
  private elapsed = 0;
  private worst = 0;

  constructor(parent: HTMLElement) {
    this.el.className = 'debug-overlay';
    this.el.hidden = !import.meta.env.DEV;
    parent.appendChild(this.el);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F3') {
        e.preventDefault();
        this.el.hidden = !this.el.hidden;
      }
    });
  }

  update(dt: number, renderer: THREE.WebGLRenderer, extra: string): void {
    this.frames++;
    this.elapsed += dt;
    this.worst = Math.max(this.worst, dt);
    if (this.elapsed < 0.5) return;
    if (!this.el.hidden) {
      const fps = this.frames / this.elapsed;
      const info = renderer.info.render;
      this.el.textContent =
        `${fps.toFixed(0)} fps · worst ${(this.worst * 1000).toFixed(1)} ms\n` +
        `${info.calls} draw calls · ${info.triangles} tris\n${extra}`;
    }
    this.frames = 0;
    this.elapsed = 0;
    this.worst = 0;
  }
}
