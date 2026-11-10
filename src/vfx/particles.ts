import * as THREE from 'three';
import type { Particles } from '../schemas/incantationSpec';

/** The performance budget is 3,000 particles; stay under it. */
export const MAX_PARTICLES = 2400;

interface KindParams {
  life: [number, number];
  /** Vertical acceleration (+ rises). */
  gravity: number;
  /** Velocity damping per second. */
  drag: number;
  size: number;
  /** Size multiplier at end of life. */
  grow: number;
  /** Sideways wobble strength (leaves). */
  swirl: number;
  /** Brightness (HDR multiplier; > ~2 blooms). */
  glow: number;
  speed: number;
}

const KINDS: Record<Particles, KindParams> = {
  embers: { life: [0.5, 1.1], gravity: 2.5, drag: 1.5, size: 0.16, grow: 0.3, swirl: 0.6, glow: 4, speed: 3 },
  frost: { life: [0.7, 1.3], gravity: -1.5, drag: 2.2, size: 0.15, grow: 0.6, swirl: 0.3, glow: 2.6, speed: 2.2 },
  sparks: { life: [0.2, 0.45], gravity: -14, drag: 0.6, size: 0.09, grow: 0.2, swirl: 0, glow: 5, speed: 8 },
  leaves: { life: [0.8, 1.4], gravity: -1.2, drag: 2.5, size: 0.2, grow: 0.8, swirl: 3, glow: 1.6, speed: 3.5 },
  motes: { life: [0.9, 1.6], gravity: 1.0, drag: 3, size: 0.13, grow: 0.4, swirl: 0.8, glow: 3.5, speed: 1.4 },
  smoke: { life: [0.8, 1.4], gravity: 0.9, drag: 2.2, size: 0.32, grow: 2.2, swirl: 0.4, glow: 1.1, speed: 1.3 },
};

export interface EmitOptions {
  count: number;
  color: THREE.Color;
  /** Random spawn offset radius around `at`. */
  spread?: number;
  /** Spawn on a horizontal ring of this radius instead of a ball (shockwaves). */
  ring?: number;
  /** Base velocity added to the random burst (e.g. outward, along a trail). */
  velocity?: THREE.Vector3;
  /** Scales the kind's burst speed. */
  speedScale?: number;
}

const VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
attribute float aAlpha;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aAlpha > 0.0 ? aSize * uScale / max(0.1, -mv.z) : 0.0;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor * a, a);
}`;

/**
 * One pooled point cloud for every particle in the game: a single draw call.
 * New particles overwrite the oldest when the pool is full, so emitting never allocates.
 */
export class ParticleSystem {
  readonly points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;
  private readonly geo = new THREE.BufferGeometry();
  private readonly pos = new Float32Array(MAX_PARTICLES * 3);
  private readonly vel = new Float32Array(MAX_PARTICLES * 3);
  private readonly col = new Float32Array(MAX_PARTICLES * 3);
  private readonly size = new Float32Array(MAX_PARTICLES);
  private readonly alpha = new Float32Array(MAX_PARTICLES);
  private readonly life = new Float32Array(MAX_PARTICLES);
  private readonly maxLife = new Float32Array(MAX_PARTICLES);
  private readonly baseSize = new Float32Array(MAX_PARTICLES);
  private readonly kind = new Uint8Array(MAX_PARTICLES);
  private readonly seed = new Float32Array(MAX_PARTICLES);
  private cursor = 0;
  private alive = 0;
  private time = 0;
  private readonly kinds = Object.keys(KINDS) as Particles[];
  private readonly tmpColor = new THREE.Color();

  constructor() {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: 400 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  get count(): number {
    return this.alive;
  }

  emit(kindName: Particles, at: THREE.Vector3, o: EmitOptions): void {
    const k = KINDS[kindName];
    const kindIndex = this.kinds.indexOf(kindName);
    const spread = o.spread ?? 0.3;
    const speed = k.speed * (o.speedScale ?? 1);
    const n = Math.min(o.count, MAX_PARTICLES);
    const bx = o.velocity?.x ?? 0;
    const by = o.velocity?.y ?? 0;
    const bz = o.velocity?.z ?? 0;
    for (let j = 0; j < n; j++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;
      if ((this.life[i] ?? 0) <= 0) this.alive++;
      const i3 = i * 3;

      let px: number, py: number, pz: number, vx: number, vy: number, vz: number;
      if (o.ring !== undefined) {
        // On a horizontal ring, moving outward (shockwaves).
        const a = Math.random() * Math.PI * 2;
        px = at.x + Math.cos(a) * o.ring;
        py = at.y + Math.random() * 0.3;
        pz = at.z + Math.sin(a) * o.ring;
        vx = Math.cos(a) * speed * 0.6;
        vy = Math.random() * speed * 0.4;
        vz = Math.sin(a) * speed * 0.6;
      } else {
        const [dx, dy, dz] = randomInSphere();
        px = at.x + dx * spread;
        py = at.y + dy * spread;
        pz = at.z + dz * spread;
        const [rx, ry, rz] = randomInSphere();
        vx = rx * speed;
        vy = ry * speed;
        vz = rz * speed;
      }
      this.pos.set([px, py, pz], i3);
      this.vel.set([vx + bx, vy + by, vz + bz], i3);

      // Slight colour variation keeps bursts from looking flat.
      this.tmpColor.copy(o.color).offsetHSL((Math.random() - 0.5) * 0.04, 0, (Math.random() - 0.5) * 0.15);
      const g = k.glow;
      this.col.set([this.tmpColor.r * g, this.tmpColor.g * g, this.tmpColor.b * g], i3);

      const life = k.life[0] + Math.random() * (k.life[1] - k.life[0]);
      this.life[i] = life;
      this.maxLife[i] = life;
      this.baseSize[i] = k.size * (0.7 + Math.random() * 0.6);
      this.kind[i] = kindIndex;
      this.seed[i] = Math.random() * 100;
    }
  }

  /** `pixelHeight / (2 tan(fov/2))` keeps particle sizes in world metres. */
  update(dt: number, camera: THREE.PerspectiveCamera, pixelHeight: number): void {
    this.time += dt;
    const scale = this.material.uniforms.uScale;
    if (scale) scale.value = pixelHeight / (2 * Math.tan((camera.fov * Math.PI) / 360));
    if (this.alive === 0) return;

    const { pos, vel, life, maxLife, size, alpha, baseSize, kind, seed } = this;
    let alive = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const left = (life[i] ?? 0) - dt;
      if (left <= 0) {
        life[i] = 0;
        alpha[i] = 0;
        continue;
      }
      life[i] = left;
      alive++;
      const k = KINDS[this.kinds[kind[i] ?? 0] ?? 'sparks'];
      const i3 = i * 3;
      const damp = Math.exp(-k.drag * dt);
      let vx = (vel[i3] ?? 0) * damp;
      const vy = (vel[i3 + 1] ?? 0) * damp + k.gravity * dt;
      let vz = (vel[i3 + 2] ?? 0) * damp;
      if (k.swirl > 0) {
        const sd = (seed[i] ?? 0) + this.time * 4;
        vx += Math.sin(sd) * k.swirl * dt;
        vz += Math.cos(sd * 1.3) * k.swirl * dt;
      }
      vel[i3] = vx;
      vel[i3 + 1] = vy;
      vel[i3 + 2] = vz;
      pos[i3] = (pos[i3] ?? 0) + vx * dt;
      pos[i3 + 1] = (pos[i3 + 1] ?? 0) + vy * dt;
      pos[i3 + 2] = (pos[i3 + 2] ?? 0) + vz * dt;

      const t = 1 - left / (maxLife[i] ?? 1); // 0 → 1 over life
      size[i] = (baseSize[i] ?? 0) * (1 + (k.grow - 1) * t);
      // Quick fade in, long fade out.
      alpha[i] = Math.min(1, t * 10) * (1 - t) * (1 - t * 0.3);
    }
    this.alive = alive;

    for (const name of ['position', 'aColor', 'aSize', 'aAlpha']) this.geo.getAttribute(name).needsUpdate = true;
  }

  clear(): void {
    this.life.fill(0);
    this.alpha.fill(0);
    this.alive = 0;
    this.geo.getAttribute('aAlpha').needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
    this.material.dispose();
  }
}

function randomInSphere(): [number, number, number] {
  for (;;) {
    const x = Math.random() * 2 - 1;
    const y = Math.random() * 2 - 1;
    const z = Math.random() * 2 - 1;
    if (x * x + y * y + z * z <= 1) return [x, y, z];
  }
}
