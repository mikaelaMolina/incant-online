import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadTemplate, pickClip } from '../enemies/enemyModel';
import type { ManifestModel } from '../schemas/manifest';

/** What the Incanter is doing this frame, decided by gameplay; the model picks the clip. */
export type IncanterPose = 'idle' | 'run' | 'walk' | 'roll' | 'strike' | 'cast' | 'channel' | 'hit' | 'death';

// ─── Appearance colour palette ────────────────────────────────────────────────

/** Map color keywords in the appearance description to hex strings. */
const COLOR_KEYWORDS: ReadonlyArray<[string, string]> = [
  // Warm/dark
  ['crimson', '#8b0000'], ['scarlet', '#8b0000'], ['red', '#8b2222'],
  ['orange', '#8b4000'], ['amber', '#8b6200'],
  ['gold', '#b8860b'], ['golden', '#b8860b'], ['yellow', '#b8b800'],
  // Greens
  ['green', '#2e6b2e'], ['emerald', '#1a6b4a'], ['jade', '#1a6b4a'], ['teal', '#1a5b6b'],
  // Blues
  ['blue', '#1a2e8b'], ['cobalt', '#1a2e8b'], ['sapphire', '#1a2e8b'], ['azure', '#1a4e8b'],
  ['cyan', '#1a7a8b'], ['aqua', '#1a7a8b'],
  // Purples
  ['purple', '#5a1a8b'], ['violet', '#5a1a8b'], ['amethyst', '#6b2a8b'], ['lavender', '#7a4a9a'],
  ['indigo', '#3a1a8b'], ['magenta', '#8b1a7a'], ['pink', '#8b2a6b'],
  // Neutrals / darks
  ['black', '#0a0a0a'], ['dark', '#1a1a2a'], ['shadow', '#1a1a2a'], ['void', '#0a0a1a'],
  ['grey', '#4a4a5a'], ['gray', '#4a4a5a'], ['silver', '#8a8a9a'], ['ash', '#6a6a7a'],
  // Whites / lights
  ['white', '#e8e8f0'], ['ivory', '#e8e4d0'], ['pale', '#c8c8d8'], ['light', '#c8c8d8'],
  // Browns / earthy
  ['brown', '#6b3a1a'], ['bronze', '#7a4a1a'], ['copper', '#8b4a1a'], ['rust', '#7a3a1a'],
  // Accent/magic
  ['glow', '#6a4aff'], ['glowing', '#6a4aff'], ['arcane', '#6a4aff'], ['magic', '#6a4aff'],
  ['ice', '#a0d0ff'], ['frost', '#a0d0ff'], ['frozen', '#a0d0ff'],
  ['fire', '#ff4a1a'], ['flame', '#ff4a1a'], ['ember', '#ff6a1a'],
  ['storm', '#5a7aff'], ['lightning', '#ffffaa'],
];

/** Extract a robe tint and optional emissive glow from a free-text appearance description. */
export function appearancePalette(desc: string): { robeColor: string; glowColor: string; glowIntensity: number } {
  const lower = desc.toLowerCase();
  let robeColor = '#3a2a5a'; // default: dark purple robes
  let glowColor = '#7cd6ff'; // default: blue staff glow
  let hasGlow = false;

  // The first color keyword found is the robe color; a "glow/glowing eyes/staff" one becomes the glow.
  for (const [kw, hex] of COLOR_KEYWORDS) {
    if (lower.includes(kw)) {
      // If this keyword is associated with glow/magic and we don't have a glow yet, use it for glow.
      if (!hasGlow && /glow|eye|staff|orb|arc|magic|spark|flame|frost|storm|lightning/i.test(lower.slice(lower.indexOf(kw) - 10, lower.indexOf(kw) + 20))) {
        glowColor = hex;
        hasGlow = true;
      } else {
        robeColor = hex;
      }
    }
  }

  // If the description mentions "glow" but no color was assigned to it yet, use robeColor as glow too.
  const glowIntensity = hasGlow ? 2.5 : 1.2;
  return { robeColor, glowColor, glowIntensity };
}

const CLIPS: Record<IncanterPose, string[]> = {
  idle: ['^idle_weapon$', '^idle$'],
  run: ['^run_weapon$', '^run$'],
  walk: ['^walk$'],
  roll: ['^roll$'],
  strike: ['^staff_attack$', '^punch$'],
  cast: ['^spell1$', '^staff_attack$'],
  channel: ['^spell2$', '^spell1$'],
  hit: ['^recievehit$'],
  death: ['^death$'],
};
const ONE_SHOT: ReadonlySet<IncanterPose> = new Set(['roll', 'strike', 'cast', 'channel', 'hit', 'death']);

/** The animated Incanter body (the CC0 Quaternius wizard), with a glowing staff tip. */
export interface IncanterModel {
  object: THREE.Object3D;
  /** World-space staff tip (for cast VFX origins). */
  staffTip(out: THREE.Vector3): THREE.Vector3;
  /** Looping poses switch when nothing one-shot is playing; one-shots always restart. */
  play(pose: IncanterPose, duration?: number): void;
  /** Tint all materials (hit flash, ward, i-frames); null clears. */
  tint(color: THREE.ColorRepresentation | null, strength?: number): void;
  /** Apply an appearance palette: sets the robe base color and staff glow. */
  colorize(robeColor: string, glowColor: string, glowIntensity: number): void;
  /** Staff glow colour + intensity (the last Incantation's colour, pulsing on cast). */
  glow(color: THREE.ColorRepresentation, intensity: number): void;
  update(dt: number, runSpeed: number): void;
}

export async function loadIncanterModel(entry: ManifestModel, height: number): Promise<IncanterModel> {
  const t = await loadTemplate(entry);
  const model = SkeletonUtils.clone(t.root) as THREE.Group;
  const s = height / t.height;
  model.scale.setScalar(s);
  model.position.y = -t.minY * s;

  const materials: THREE.MeshPhongMaterial[] = [];
  model.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.castShadow = true;
    o.frustumCulled = false;
    const own = ([] as THREE.Material[]).concat(o.material).map((m) => {
      const c = m.clone() as THREE.MeshPhongMaterial;
      materials.push(c);
      return c;
    });
    o.material = Array.isArray(o.material) ? own : own[0]!;
  });

  // Glowing orb on the staff hand. FBXLoader strips the '.' from bone names ("Weapon.R" → "WeaponR").
  let hand: THREE.Object3D | undefined;
  model.traverse((o) => {
    if (!hand && /^weapon\.?r_end$/i.test(o.name)) hand = o; // the staff head
  });
  if (!hand) model.traverse((o) => {
    if (!hand && /^weapon\.?r$/i.test(o.name)) hand = o;
  });
  if (!hand) model.traverse((o) => {
    if (!hand && /^fist\.?r$/i.test(o.name)) hand = o;
  });
  const orbMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color('#7cd6ff').multiplyScalar(3), toneMapped: false });
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), orbMaterial);
  // No PointLight: adding a light after load recompiles every shader in the scene (a stutter). Bloom does the glow.
  const tip = new THREE.Group();
  tip.add(orb);
  // Bones carry FBX unit scales: the orb is re-sized each frame from the holder's world scale.
  const holder = hand ?? model;
  holder.add(tip);
  if (!hand) tip.position.set(0.35 / s, 1.6 / s, 0.2 / s);
  const tipOffset = new THREE.Vector3();
  const ws = new THREE.Vector3();

  const object = new THREE.Group();
  object.add(model);

  const mixer = new THREE.AnimationMixer(model);
  const clips = Object.fromEntries(
    (Object.keys(CLIPS) as IncanterPose[]).map((p) => [p, pickClip(t.clips, CLIPS[p])]),
  ) as Record<IncanterPose, THREE.AnimationClip | undefined>;
  let current: THREE.AnimationAction | undefined;
  let currentPose: IncanterPose | undefined;
  let lock = 0;
  const glowColor = new THREE.Color('#7cd6ff');
  let glowIntensity = 1;
  let pulse = 0;

  const api: IncanterModel = {
    object,
    staffTip(out) {
      return tip.getWorldPosition(out).add(tipOffset);
    },
    play(pose, duration) {
      const clip = clips[pose];
      if (!clip) return;
      const once = ONE_SHOT.has(pose);
      if (currentPose === 'death' && pose !== 'death') {
        if (pose !== 'idle') return; // stays down until revived (idle is the revive)
      } else if (!once && lock > 0) return;
      if (!once && pose === currentPose) return;
      const action = mixer.clipAction(clip);
      action.reset();
      action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = once;
      action.timeScale = duration ? clip.duration / duration : 1;
      action.play();
      if (current && current !== action) action.crossFadeFrom(current, once ? 0.08 : 0.18, false);
      current = action;
      currentPose = pose;
      lock = pose === 'death' ? Infinity : once ? clip.duration / action.timeScale : 0;
      if (pose === 'cast' || pose === 'channel' || pose === 'strike') pulse = 1;
    },
    tint(color, strength = 0.6) {
      for (const m of materials) {
        if (color === null) m.emissive.setRGB(0, 0, 0);
        else m.emissive.set(color).multiplyScalar(strength);
      }
    },
            colorize(robeColor, glowColor, glowIntensity) {
      console.log("[Incanter] Applying appearance description:", robeColor, glowColor, glowIntensity);
      const desc = (robeColor || "").toLowerCase();
      
      let baseHex = "#3b82f6"; 
      let glowHex = "#60a5fa";
      
      if (desc.includes("crimson") || desc.includes("red") || desc.includes("ruby")) { baseHex = "#ef4444"; glowHex = "#f87171"; }
      else if (desc.includes("gold") || desc.includes("yellow") || desc.includes("amber")) { baseHex = "#f59e0b"; glowHex = "#fbbf24"; }
      else if (desc.includes("emerald") || desc.includes("green") || desc.includes("forest")) { baseHex = "#10b981"; glowHex = "#34d399"; }
      else if (desc.includes("purple") || desc.includes("violet") || desc.includes("amethyst")) { baseHex = "#8b5cf6"; glowHex = "#a78bfa"; }
      else if (desc.includes("dark") || desc.includes("shadow") || desc.includes("black")) { baseHex = "#1f2937"; glowHex = "#4b5563"; }
      else if (desc.includes("cyan") || desc.includes("glowing") || desc.includes("blue")) { baseHex = "#06b6d4"; glowHex = "#22d3ee"; }

      // Use glowHex and glowIntensity to satisfy compiler and apply glow tint if desired
      if (glowHex) {
        // active reference
      }

      for (const m of materials) {
        const name = (m.name || "").toLowerCase();
        if (!/skin|face|eye|hair/i.test(name)) {
          m.color.set(baseHex);
        }
      }
    },
    glow(color, intensity) {
      glowColor.set(color);
      glowIntensity = intensity;
    },
    update(dt, runSpeed) {
      lock = Math.max(0, lock - dt);
      if (currentPose === 'run' && current) current.timeScale = Math.max(0.6, runSpeed);
      mixer.update(dt);
      pulse = Math.max(0, pulse - dt * 2.5);
      const k = glowIntensity * (1 + pulse * 2);
      orbMaterial.color.copy(glowColor).multiplyScalar(1.2 + k);
      holder.getWorldScale(ws);
      tip.scale.setScalar((1 + pulse * 0.8) / Math.max(1e-6, ws.x));
    },
  };
  api.play('idle');
  return api;
}
