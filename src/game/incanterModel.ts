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
  updateAppearance?(desc: string): void;
}

export async function loadIncanterModel(entry: ManifestModel, height: number): Promise<IncanterModel> {
  // AI Character Generator: Fetch live appearance description from window or localStorage
  const rawDesc = (window as any).__INCANTER_APPEARANCE__ || localStorage.getItem("incant.appearance") || "";
  console.log("[AI Character Generator] Generating model from description:", rawDesc);

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
      if (!c.name) c.name = "robe_cloth";
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

  // Apply appearance on spawn
  const liveDesc = (window as any).__INCANTER_APPEARANCE__ || localStorage.getItem("incant.appearance") || "";
  if (liveDesc) {
    const desc = liveDesc.toLowerCase();
    let baseHex = "#3b82f6";
    let orbHex = "#7cd6ff";
    if (desc.includes("bunny") || desc.includes("rabbit") || desc.includes("pink")) { baseHex = "#f472b6"; orbHex = "#fda4af"; }
    else if (desc.includes("kid") || desc.includes("child") || desc.includes("gold") || desc.includes("yellow")) { baseHex = "#f59e0b"; orbHex = "#fef08a"; }
    else if (desc.includes("crimson") || desc.includes("red") || desc.includes("blood")) { baseHex = "#ef4444"; orbHex = "#fca5a5"; }
    else if (desc.includes("emerald") || desc.includes("green") || desc.includes("forest")) { baseHex = "#10b981"; orbHex = "#6ee7b7"; }
    else if (desc.includes("shadow") || desc.includes("dark") || desc.includes("black")) { baseHex = "#1f2937"; orbHex = "#c084fc"; }
    else if (desc.length > 0) {
      let hash = 0;
      for (let i = 0; i < desc.length; i++) { hash = desc.charCodeAt(i) + ((hash << 5) - hash); }
      const c = (hash & 0x00ffffff).toString(16).toUpperCase();
      baseHex = "#" + "00000".substring(0, 6 - c.length) + c;
    }
    for (const m of materials) {
      const name = (m.name || "").toLowerCase();
      if (!/skin|face|eye|head/i.test(name)) {
        m.color.set(baseHex);
        m.needsUpdate = true;
      }
    }
    if (orbMaterial && orbMaterial.color) {
      orbMaterial.color.set(orbHex);
    }
  }
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

  const aiRoot = new THREE.Group();
  aiRoot.visible = false;
  object.add(aiRoot);
  let lastPrompt = "";

  async function buildAiMesh(raw: string) {
    const desc = (raw || "").trim();
    if (!desc || desc.startsWith("#") || desc === lastPrompt) return;
    lastPrompt = desc;
    try {
      console.log("[AI Character] Requesting 3D character from claude-opus-5-5:", desc);
      const r = await fetch("/api/character", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: desc }),
      });
      if (!r.ok) return;
      const spec = await r.json();
      if (!Array.isArray(spec.parts) || !spec.parts.length) return;
      while (aiRoot.children.length) aiRoot.remove(aiRoot.children[0]!);
      materials.length = 0;
      for (const p of spec.parts) {
        let geo;
        if (p.shape === "box") geo = new THREE.BoxGeometry(p.w, p.h, p.d);
        else if (p.shape === "cylinder") geo = new THREE.CylinderGeometry(p.w / 2, p.d / 2, p.h, 12);
        else if (p.shape === "cone") geo = new THREE.ConeGeometry(p.w / 2, p.h, 12);
        else { geo = new THREE.SphereGeometry(0.5, 14, 12); geo.scale(p.w, p.h, p.d); }
        const c = new THREE.Color(p.color || "#ffffff");
        const mat = new THREE.MeshPhongMaterial({ color: c, ...(p.emissive ? { emissive: c } : {}) });
        materials.push(mat);
        const m = new THREE.Mesh(geo, mat);
        m.castShadow = true;
        m.position.set(p.x || 0, p.y || 0, p.z || 0);
        m.rotation.set((p.rx || 0) * Math.PI / 180, (p.ry || 0) * Math.PI / 180, (p.rz || 0) * Math.PI / 180);
        aiRoot.add(m);
      }
      if (spec.orbColor) glowColor.set(spec.orbColor);
      model.visible = false;
      aiRoot.visible = true;
      console.log("[AI Character] Built 3D mesh with", spec.parts.length, "parts!");
    } catch (e) {
      console.warn("[AI Character] Error:", e);
    }
  }

  const initPrompt = (window as any).__INCANTER_APPEARANCE__ || localStorage.getItem("incant.appearance") || "";
  if (initPrompt) void buildAiMesh(initPrompt);

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
                            colorize(robeColor) {
      const desc = (window as any).__INCANTER_APPEARANCE__ || localStorage.getItem("incant.appearance") || robeColor || "";
      void buildAiMesh(desc);
    },
    updateAppearance(desc: string) {
      void buildAiMesh(desc);
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
