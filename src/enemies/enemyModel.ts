import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { assetUrl } from '../game/assets';
import type { ManifestModel } from '../schemas/manifest';
import type { ArchetypeProfile } from './archetypes';

export type ClipRole = 'idle' | 'move' | 'attack' | 'hit' | 'death';

/** A per-enemy visual: a scene object plus animation controls (no-ops for placeholders). */
export interface EnemyVisual {
  object: THREE.Object3D;
  /** Materials owned by this instance (for hit flashes). */
  materials: (THREE.MeshPhongMaterial | THREE.MeshStandardMaterial)[];
  play(role: ClipRole, opts?: { duration?: number; once?: boolean }): void;
  update(dt: number): void;
  dispose(): void;
}

interface Template {
  root: THREE.Group;
  clips: THREE.AnimationClip[];
  /** Native height and the y offset to put feet at 0. */
  height: number;
  minY: number;
}

const loader = new FBXLoader();
const cache = new Map<string, Promise<Template>>();

const textureLoader = new THREE.TextureLoader();

/** Attach textures listed in the manifest to materials with matching names. */
async function applyTextures(root: THREE.Group, paths: readonly string[]): Promise<void> {
  if (!paths.length) return;
  const named = await Promise.all(
    paths.map(async (path) => {
      const tex = await textureLoader.loadAsync(assetUrl(path)).catch(() => undefined);
      if (tex) tex.colorSpace = THREE.SRGBColorSpace;
      const file = path.slice(path.lastIndexOf('/') + 1).replace(/\.png$/i, '').toLowerCase();
      return { file, tex };
    }),
  );
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    for (const m of ([] as THREE.Material[]).concat(o.material)) {
      const mat = m as THREE.MeshPhongMaterial;
      const name = mat.name.toLowerCase();
      if (!name || mat.map) continue;
      // Exact name, else a file ending with the name ("bow_texture" → "ranger_bow_texture").
      const hit = named.find((n) => n.file === name) ?? named.find((n) => n.file.endsWith(name));
      if (hit?.tex) {
        mat.map = hit.tex;
        mat.color.set('#ffffff');
        mat.needsUpdate = true;
      }
    }
  });
}

function loadTemplate(entry: ManifestModel): Promise<Template> {
  let p = cache.get(entry.id);
  if (!p) {
    p = loader.loadAsync(assetUrl(entry.path)).then(async (root) => {
      await applyTextures(root, entry.textures ?? []);
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      return { root, clips: root.animations, height: Math.max(0.01, box.max.y - box.min.y), minY: box.min.y };
    });
    p.catch(() => cache.delete(entry.id));
    cache.set(entry.id, p);
  }
  return p;
}

/** Preload enemy models so spawning is instant. Failures are fine: placeholders are used. */
export function preloadEnemyModels(entries: ManifestModel[]): Promise<unknown> {
  return Promise.allSettled(entries.filter((e) => e.format === 'fbx').map(loadTemplate));
}

export async function createEnemyVisual(entry: ManifestModel | undefined, profile: ArchetypeProfile): Promise<EnemyVisual> {
  if (entry?.format === 'fbx') {
    try {
      return fromTemplate(await loadTemplate(entry), profile);
    } catch (err) {
      console.warn(`Enemy model ${entry.id} failed to load; using a placeholder.`, err);
    }
  }
  return placeholder(profile);
}

function pickClip(clips: THREE.AnimationClip[], patterns: string[]): THREE.AnimationClip | undefined {
  for (const p of patterns) {
    const re = new RegExp(p, 'i');
    const c = clips.find((clip) => re.test(clip.name.replace(/^.*\|/, '')));
    if (c) return c;
  }
  return undefined;
}

function fromTemplate(t: Template, profile: ArchetypeProfile): EnemyVisual {
  const model = SkeletonUtils.clone(t.root) as THREE.Group;
  const s = profile.height / t.height;
  model.scale.setScalar(s);
  model.position.y = -t.minY * s;

  const materials: THREE.MeshPhongMaterial[] = [];
  model.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.castShadow = false; // blob shadow instead: keeps draw calls down
    o.frustumCulled = false; // skinned bounds don't follow the animation
    const own = ([] as THREE.Material[]).concat(o.material).map((m) => {
      const c = m.clone() as THREE.MeshPhongMaterial;
      materials.push(c);
      return c;
    });
    o.material = Array.isArray(o.material) ? own : own[0]!;
  });

  const object = new THREE.Group();
  object.add(model);

  const mixer = new THREE.AnimationMixer(model);
  const clips: Record<ClipRole, THREE.AnimationClip | undefined> = {
    idle: pickClip(t.clips, ['^idle_weapon$', '^idle$', 'idle']),
    move: pickClip(t.clips, profile.clips.move),
    attack: pickClip(t.clips, profile.clips.attack),
    hit: pickClip(t.clips, ['^recievehit$', 'hit']),
    death: pickClip(t.clips, ['death']),
  };
  let current: THREE.AnimationAction | undefined;
  /** Seconds left in a one-shot (hit, attack, death); looping clips wait for it. */
  let lock = 0;

  return {
    object,
    materials,
    play(role, opts = {}) {
      const clip = clips[role];
      if (!clip) return;
      if (!opts.once && lock > 0) return;
      const action = mixer.clipAction(clip);
      if (action === current && !opts.once) return;
      action.reset();
      action.setLoop(opts.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = !!opts.once;
      action.timeScale = opts.duration ? clip.duration / opts.duration : 1;
      action.play();
      if (current && current !== action) action.crossFadeFrom(current, 0.15, false);
      current = action;
      if (opts.once) lock = role === 'death' ? Infinity : clip.duration / action.timeScale;
    },
    update(dt) {
      lock = Math.max(0, lock - dt);
      mixer.update(dt);
    },
    dispose() {
      mixer.stopAllAction();
      for (const m of materials) m.dispose();
    },
  };
}

/** Simple readable shape per archetype when no model is available. */
function placeholder(profile: ArchetypeProfile): EnemyVisual {
  const material = new THREE.MeshStandardMaterial({ color: profile.color, roughness: 0.7 });
  const r = profile.radius;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.1, profile.height - 2 * r), 4, 10), material);
  body.position.y = profile.height / 2;
  const eye = new THREE.Mesh(new THREE.BoxGeometry(r * 1.1, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: '#fff2c0' }));
  eye.position.set(0, profile.height * 0.8, r * 0.95);
  const object = new THREE.Group();
  object.add(body, eye);
  return {
    object,
    materials: [material],
    play() {},
    update() {},
    dispose() {
      body.geometry.dispose();
      eye.geometry.dispose();
      material.dispose();
      (eye.material as THREE.Material).dispose();
    },
  };
}
