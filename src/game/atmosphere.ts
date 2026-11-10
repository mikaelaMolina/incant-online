import * as THREE from 'three';
import type { BiomePreset, TimePreset } from './biomes';

/**
 * Atmosphere around the Incanter, created once and re-tinted per floor (no shader recompiles):
 * - a sky dome that blends from the horizon (= fog colour, so the ground fades into it) up to the
 *   zenith, with a glow around the sun or moon and stars at night;
 * - ambient motes per biome (fireflies, snow, dust, embers, sparks), animated entirely on the GPU.
 * Two draw calls in total.
 */

const SKY_RADIUS = 150; // inside the camera's far plane (200)
const MOTE_BOX = new THREE.Vector3(36, 9, 36); // the region around the Incanter that motes fill
const MAX_MOTES = 300;

export class Atmosphere {
  readonly sky: THREE.Mesh;
  readonly motes: THREE.Points;
  private readonly skyUniforms = {
    zenith: { value: new THREE.Color() },
    horizon: { value: new THREE.Color() },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    sunColor: { value: new THREE.Color() },
    stars: { value: 0 },
    time: { value: 0 },
  };
  private readonly moteUniforms = {
    color: { value: new THREE.Color() },
    centre: { value: new THREE.Vector3() },
    box: { value: MOTE_BOX.clone() },
    size: { value: 0.1 },
    scale: { value: 600 },
    rise: { value: 0 },
    drift: { value: 0 },
    flicker: { value: 0 },
    time: { value: 0 },
  };
  private readonly moteGeometry: THREE.BufferGeometry;

  constructor(scene: THREE.Scene) {
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 zenith;
        uniform vec3 horizon;
        uniform vec3 sunDir;
        uniform vec3 sunColor;
        uniform float stars;
        uniform float time;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y, 0.0, 1.0);
          vec3 col = mix(horizon, zenith, pow(h, 0.6));
          float s = max(dot(d, sunDir), 0.0);
          col += sunColor * (pow(s, 6.0) * 0.25 + pow(s, 400.0) * 2.0);
          if (stars > 0.0) {
            vec3 cell = floor(d * 160.0);
            float n = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
            float twinkle = 0.6 + 0.4 * sin(time * 1.7 + n * 60.0);
            col += vec3(step(0.9972, n) * smoothstep(0.05, 0.4, h) * stars * twinkle * 1.4);
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 32, 16), skyMat);
    this.sky.name = 'sky';
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;

    // Motes: random positions in a unit box plus a phase each; the vertex shader moves and wraps them.
    this.moteGeometry = new THREE.BufferGeometry();
    const pos = new Float32Array(MAX_MOTES * 3);
    const phase = new Float32Array(MAX_MOTES);
    let seed = 1234567;
    const rand = (): number => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < MAX_MOTES; i++) {
      pos.set([rand(), rand(), rand()], i * 3);
      phase[i] = rand() * 100;
    }
    this.moteGeometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.moteGeometry.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
    const moteMat = new THREE.ShaderMaterial({
      uniforms: this.moteUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      vertexShader: /* glsl */ `
        uniform vec3 centre;
        uniform vec3 box;
        uniform float size;
        uniform float scale;
        uniform float rise;
        uniform float drift;
        uniform float flicker;
        uniform float time;
        attribute float phase;
        varying float vAlpha;
        void main() {
          vec3 p = position * box;
          p.x += sin(time * 0.5 + phase) * drift;
          p.z += cos(time * 0.4 + phase * 1.3) * drift;
          p.y += rise * time;
          // Wrap into a box that follows the Incanter (x/z centred on them, y from the ground up).
          vec3 origin = vec3(centre.x - box.x * 0.5, 0.0, centre.z - box.z * 0.5);
          p = origin + mod(p - origin, box);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = size * scale / -mv.z;
          float tw = flicker > 0.5 ? 0.25 + 0.75 * max(0.0, sin(time * 2.3 + phase * 7.0)) : 1.0;
          // Fade out near the top and bottom of the box so wrapping never pops.
          float edge = smoothstep(0.0, 0.8, p.y) * (1.0 - smoothstep(box.y - 1.5, box.y, p.y));
          vAlpha = tw * edge;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 color;
        varying float vAlpha;
        void main() {
          float r = length(gl_PointCoord - 0.5) * 2.0;
          float a = (1.0 - smoothstep(0.35, 1.0, r)) * vAlpha;
          if (a < 0.01) discard;
          gl_FragColor = vec4(color * a, a);
        }`,
    });
    this.motes = new THREE.Points(this.moteGeometry, moteMat);
    this.motes.name = 'motes';
    this.motes.frustumCulled = false;
    scene.add(this.sky, this.motes);
  }

  /** Re-tint for a floor: biome palette × time of day, the sun's direction, the biome's motes. */
  setFloor(biome: BiomePreset, time: TimePreset, sunDirection: THREE.Vector3, horizon: THREE.Color): void {
    const tint = new THREE.Color(time.skyTint);
    this.skyUniforms.horizon.value.copy(horizon);
    this.skyUniforms.zenith.value.set(biome.zenith).multiply(tint);
    this.skyUniforms.sunDir.value.copy(sunDirection).normalize();
    this.skyUniforms.sunColor.value.set(time.sunColor);
    this.skyUniforms.stars.value = time.stars;

    const m = biome.motes;
    this.moteUniforms.color.value.set(m.color).multiplyScalar(m.glow);
    this.moteUniforms.size.value = m.size;
    this.moteUniforms.rise.value = m.rise;
    this.moteUniforms.drift.value = m.drift;
    this.moteUniforms.flicker.value = m.flicker ? 1 : 0;
    this.moteGeometry.setDrawRange(0, Math.min(MAX_MOTES, m.count));
  }

  /** Follow the camera (sky) and the Incanter (motes). `viewportHeight` in device pixels. */
  update(dt: number, camera: THREE.PerspectiveCamera, focus: THREE.Vector3, viewportHeight: number): void {
    this.skyUniforms.time.value += dt;
    this.moteUniforms.time.value += dt;
    this.sky.position.copy(camera.position);
    this.moteUniforms.centre.value.copy(focus);
    // Point size in pixels for a 1 m sprite at 1 m distance.
    this.moteUniforms.scale.value = viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  }
}
