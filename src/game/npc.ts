import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { assetUrl, type ModelIndex } from './assets';
import type { ManifestModel } from '../schemas/manifest';

const NPC_SCALE = 1.75 / 3.3;

/** Proximity within which the Incanter is "near" an NPC. */
export const GUIDE_RADIUS = 3.5;

/**
 * A simple ambient NPC: a GLB Quaternius character that plays its idle animation in a loop,
 * faces the Incanter when nearby, and shows a talk badge. No physics, no combat. Dispose between floors.
 */
export class GuideNpc {
  readonly object = new THREE.Group();
  private mixer: THREE.AnimationMixer | undefined;
  private readonly badgeEl: HTMLElement;
  /** Role name shown on the badge, e.g. "Elder", "Villager". */
  readonly role: string;

  constructor(
    private readonly scene: THREE.Scene,
    hud: HTMLElement,
    position: { x: number; z: number },
    groundY: number,
    role = 'Guide',
  ) {
    this.role = role;
    this.object.position.set(position.x, groundY, position.z);
    scene.add(this.object);

    // Talk badge
    this.badgeEl = document.createElement('div');
    this.badgeEl.className = 'npc-talk-badge';
    this.badgeEl.textContent = `${role} · V`;
    this.badgeEl.hidden = true;
    hud.appendChild(this.badgeEl);
  }

  /** Load and attach the character model. Fails silently (a glowing orb appears). */
  async loadModel(entry: ManifestModel): Promise<void> {
    try {
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(assetUrl(entry.path));
      const root = gltf.scene;
      // Quaternius characters are ~3.3 units tall (before hats): scale them to ~1.75 m, the Incanter's height.
      const s = (entry.baseScale ?? 1) * NPC_SCALE;
      root.scale.setScalar(s);
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.castShadow = true;
          o.frustumCulled = false;
        }
      });
      const model = SkeletonUtils.clone(root) as THREE.Group;
      this.object.add(model);
      if (gltf.animations.length) {
        this.mixer = new THREE.AnimationMixer(model);
        const idleClip = gltf.animations.find((a) => /idle/i.test(a.name)) ?? gltf.animations[0]!;
        this.mixer.clipAction(idleClip).play();
      }
    } catch {
      const geo = new THREE.SphereGeometry(0.25, 8, 8);
      const mat = new THREE.MeshStandardMaterial({ color: '#8fd8ff', emissive: '#8fd8ff', emissiveIntensity: 2 });
      this.object.add(new THREE.Mesh(geo, mat));
    }
  }

  /** Update: NPC faces player when nearby; badge appears. Returns whether the player is in talk range. */
  update(dt: number, playerPos: THREE.Vector3, cam: THREE.Camera): boolean {
    this.mixer?.update(dt);
    const dx = playerPos.x - this.object.position.x;
    const dz = playerPos.z - this.object.position.z;
    const near = Math.hypot(dx, dz) <= GUIDE_RADIUS;
    if (near) {
      const targetYaw = Math.atan2(dx, dz);
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
