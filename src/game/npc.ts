import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { assetUrl, type ModelIndex } from './assets';
import type { ManifestModel } from '../schemas/manifest';

const NPC_SCALE = 1.75 / 3.3;
/** Strolling speed of villagers on a route (m/s). */
const WALK_SPEED = 1.1;
/** A villager waits this long (s) at each end of its route. */
const ROUTE_PAUSE = 2.5;

/** NPCs cast shadows only this close to the Incanter (each costs ~6 extra draw calls). */
const SHADOW_DISTANCE = 7;

/** Proximity within which the Incanter is "near" an NPC. */
export const GUIDE_RADIUS = 3.5;

/** One download per model, shared by every NPC that uses it (each gets its own skeleton clone). */
const gltfCache = new Map<string, Promise<GLTF>>();
function loadGltf(path: string): Promise<GLTF> {
  let p = gltfCache.get(path);
  if (!p) {
    p = new GLTFLoader().loadAsync(assetUrl(path));
    p.catch(() => gltfCache.delete(path)); // a failed download may be retried on the next floor
    gltfCache.set(path, p);
  }
  return p;
}

/**
 * A friendly NPC: an animated GLB Quaternius character that idles (or strolls a route), turns to
 * face the Incanter when nearby, and shows a name tag (plus what F does, if anything). No physics,
 * no combat. Dispose between floors.
 */
export class GuideNpc {
  readonly object = new THREE.Group();
  private mixer: THREE.AnimationMixer | undefined;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | undefined;
  private readonly badgeEl: HTMLElement;
  /** Role name shown on the badge, e.g. "Elder", "Villager". */
  readonly role: string;
  /** What F does near this NPC ("trade", "rest"), if anything. */
  readonly interact: string | undefined;
  private readonly route: { x: number; z: number }[];
  private routeIndex = 1;
  private routeDir = 1;
  private pause = 0;
  private cheerTime = 0;
  private readonly meshes: THREE.Mesh[] = [];
  private shadows = true;

  constructor(
    private readonly scene: THREE.Scene,
    hud: HTMLElement,
    position: { x: number; z: number },
    groundY: number,
    role = 'Guide',
    opts: { interact?: string | undefined; route?: readonly { x: number; z: number }[] | undefined } = {},
  ) {
    this.role = role;
    this.interact = opts.interact;
    this.route = opts.route ? [...opts.route] : [];
    this.object.position.set(position.x, groundY, position.z);
    scene.add(this.object);

    // Name tag: "Merchant · F trade" when F does something here.
    this.badgeEl = document.createElement('div');
    this.badgeEl.className = 'npc-talk-badge';
    this.badgeEl.textContent = opts.interact ? `${role} · F ${opts.interact}` : `${role} · V talk`;
    this.badgeEl.hidden = true;
    hud.appendChild(this.badgeEl);
  }

  /** Load and attach the character model. Fails silently (a glowing orb appears). */
  async loadModel(entry: ManifestModel): Promise<void> {
    try {
      const gltf = await loadGltf(entry.path);
      const model = SkeletonUtils.clone(gltf.scene) as THREE.Group;
      // Quaternius characters are ~3.3 units tall (before hats): scale them to ~1.75 m, the Incanter's height.
      model.scale.setScalar((entry.baseScale ?? 1) * NPC_SCALE);
      model.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.castShadow = true;
          o.frustumCulled = false;
          this.meshes.push(o);
        }
      });
      this.object.add(model);
      if (gltf.animations.length) {
        this.mixer = new THREE.AnimationMixer(model);
        for (const clip of gltf.animations) this.actions.set(clip.name.toLowerCase(), this.mixer.clipAction(clip));
        this.play('idle');
      }
    } catch {
      const geo = new THREE.SphereGeometry(0.25, 8, 8);
      const mat = new THREE.MeshStandardMaterial({ color: '#8fd8ff', emissive: '#8fd8ff', emissiveIntensity: 2 });
      this.object.add(new THREE.Mesh(geo, mat));
    }
  }

  /** Cross-fade to an animation ("idle", "walk", "victory"). */
  private play(name: string): void {
    const next = this.actions.get(name) ?? this.actions.get('idle');
    if (!next || next === this.current) return;
    next.reset().fadeIn(0.25).play();
    this.current?.fadeOut(0.25);
    this.current = next;
  }

  /** A short cheer (a quest the NPC gave was completed). */
  cheer(): void {
    this.cheerTime = 2.2;
    this.play('victory');
  }

  /** Update: stroll the route, face the player when nearby, place the name tag. Returns whether the player is in talk range. */
  update(dt: number, playerPos: THREE.Vector3, cam: THREE.Camera): boolean {
    this.mixer?.update(dt);
    const dx = playerPos.x - this.object.position.x;
    const dz = playerPos.z - this.object.position.z;
    const dist = Math.hypot(dx, dz);
    const near = dist <= GUIDE_RADIUS;
    const shadows = dist <= SHADOW_DISTANCE;
    if (shadows !== this.shadows) {
      this.shadows = shadows;
      for (const m of this.meshes) m.castShadow = shadows;
    }
    let targetYaw: number | undefined;
    if (this.cheerTime > 0) {
      this.cheerTime -= dt;
      if (this.cheerTime <= 0) this.play('idle');
    } else if (near) {
      // Stop and turn to the Incanter.
      targetYaw = Math.atan2(dx, dz);
      this.play('idle');
    } else if (this.route.length > 1) {
      targetYaw = this.stroll(dt);
    }
    if (targetYaw !== undefined) {
      const current = this.object.rotation.y;
      const diff = ((targetYaw - current + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      this.object.rotation.y += diff * Math.min(1, dt * 6);
    }
    if (near) {
      const head = this.object.position.clone();
      head.y += 2.3;
      head.project(cam);
      if (head.z < 1) {
        const x = ((head.x + 1) / 2) * window.innerWidth;
        const y = ((1 - head.y) / 2) * window.innerHeight;
        this.badgeEl.style.transform = `translate(-50%, -100%) translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
        this.badgeEl.hidden = false;
      } else {
        this.badgeEl.hidden = true;
      }
    } else {
      this.badgeEl.hidden = true;
    }
    return near;
  }

  /** Walk back and forth along the route, pausing at each end. Returns the walking direction (yaw). */
  private stroll(dt: number): number | undefined {
    if (this.pause > 0) {
      this.pause -= dt;
      this.play('idle');
      return undefined;
    }
    const target = this.route[this.routeIndex]!;
    const p = this.object.position;
    const tx = target.x - p.x;
    const tz = target.z - p.z;
    const dist = Math.hypot(tx, tz);
    if (dist < 0.15) {
      const atEnd = this.routeIndex === 0 || this.routeIndex === this.route.length - 1;
      if (atEnd) {
        this.routeDir = -this.routeDir;
        this.pause = ROUTE_PAUSE;
      }
      this.routeIndex += this.routeDir;
      return undefined;
    }
    const step = Math.min(dist, WALK_SPEED * dt);
    p.x += (tx / dist) * step;
    p.z += (tz / dist) * step;
    this.play('walk');
    return Math.atan2(tx, tz);
  }

  dispose(): void {
    this.scene.remove(this.object);
    this.mixer?.stopAllAction();
    this.badgeEl.remove();
  }
}

// ---------------------------------------------------------------------------
// NPC catalogue
// ---------------------------------------------------------------------------

export interface NpcDef {
  role: string;
  position: { x: number; z: number };
  /** NPC model id. */
  modelId: string;
  /** Initial facing (radians, 0 = north). */
  yaw?: number;
  /** What F does near them ("trade", "rest"). */
  interact?: string;
  /** A route they stroll back and forth (the first point is where they start). */
  route?: readonly { x: number; z: number }[];
}

/**
 * The prologue village NPCs — four distinct characters around the Threshold who set the
 * scene before the player steps through the gate for the first time.
 */
export const PROLOGUE_NPCS: readonly NpcDef[] = [
  { role: 'Elder',    position: { x: -6,  z: -5  }, modelId: 'npc.oldclassy_male',   yaw: Math.PI * 0.75 },
  { role: 'Villager', position: { x:  9,  z:  5  }, modelId: 'npc.casual_female',    yaw: Math.PI * 1.5  },
  { role: 'Knight',   position: { x:  0,  z: 11  }, modelId: 'npc.knight_male',      yaw: 0              },
  { role: 'Wanderer', position: { x: -11, z:  7  }, modelId: 'npc.elf',              yaw: Math.PI        },
  // Village life: the Merchant's stall (east), the Innkeeper's tent (west), a villager on an errand.
  { role: 'Merchant', position: { x: 10.5, z: -6.5 }, modelId: 'npc.worker_male', yaw: -1.0, interact: 'trade' },
  { role: 'Innkeeper', position: { x: -10.5, z: -7.5 }, modelId: 'npc.chef_male', yaw: 0.9, interact: 'rest' },
  {
    role: 'Villager',
    position: { x: 4.1, z: -11.3 },
    modelId: 'npc.casual2_female',
    route: [{ x: 4.1, z: -11.3 }, { x: 0, z: -12 }, { x: -4.1, z: -11.3 }, { x: -7.7, z: -9.2 }],
  },
];

/** For non-prologue floors: a single guide NPC placed off to the side. */
export const REGULAR_GUIDE_NPCS: readonly NpcDef[] = [
  { role: 'Wanderer', position: { x: 7, z: 7 }, modelId: 'npc.oldclassy_male'  },
  { role: 'Wanderer', position: { x: 7, z: 7 }, modelId: 'npc.oldclassy_female' },
  { role: 'Wanderer', position: { x: 7, z: 7 }, modelId: 'npc.knight_male'     },
  { role: 'Wanderer', position: { x: 7, z: 7 }, modelId: 'npc.elf'             },
  { role: 'Wanderer', position: { x: 7, z: 7 }, modelId: 'npc.witch'           },
  { role: 'Wanderer', position: { x: 7, z: 7 }, modelId: 'npc.casual_male'     },
  { role: 'Wanderer', position: { x: 7, z: 7 }, modelId: 'npc.casual_female'   },
];

/** The prologue (the village at the Spire's base, before the climb) is floor 0. */
export const PROLOGUE_FLOOR = 0;

/** Pick the right NPC definition set for a floor: the village on the prologue, one guide elsewhere. */
export function npcsForFloor(floor: number): readonly NpcDef[] {
  return floor === PROLOGUE_FLOOR ? PROLOGUE_NPCS : [REGULAR_GUIDE_NPCS[Math.max(0, floor - 1) % REGULAR_GUIDE_NPCS.length]!];
}

export function npcModel(def: NpcDef, models: ModelIndex): ManifestModel | undefined {
  return models.resolve(def.modelId, 'npc');
}

/**
 * Where a floor's guide stands: a few metres from the Incanter's spawn, in a direction picked
 * from the floor's name (stable per floor), so it is close enough to find but not in the way.
 */
export function guideSpawnPoint(spawn: { x: number; z: number }, halfExtent: number, seedText: string): { x: number; z: number } {
  const seed = [...seedText].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 2166136261);
  const angle = ((seed % 360) * Math.PI) / 180;
  const limit = halfExtent - 2;
  const clampTo = (v: number): number => Math.max(-limit, Math.min(limit, v));
  return { x: clampTo(spawn.x + Math.sin(angle) * 6), z: clampTo(spawn.z + Math.cos(angle) * 6) };
}
