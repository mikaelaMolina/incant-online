import * as THREE from 'three';
import { RAPIER } from '../game/physics';
import type { ModelIndex } from '../game/assets';
import type { Floor } from '../game/floorLoader';
import { ARCHETYPES } from './archetypes';
import { createEnemyVisual, preloadEnemyModels } from './enemyModel';
import { Enemy, type EnemyContext } from './enemy';

export const MAX_ENEMIES = 16;
/** Enemies never spawn closer than this to the Incanter's spawn point. */
const MIN_SPAWN_DISTANCE = 9;
const GROUP_SPREAD = 2.5;
/** Different groups keep at least this far apart. */
const GROUP_SEPARATION = 8;
const TRIES = 30;

/** Deterministic RNG so a floor always spawns the same way. */
function seeded(text: string): () => number {
  let s = [...text].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 2166136261) || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/**
 * Spawn every group in floor.spec.spawns. Groups cluster around an anchor point that is away
 * from the Incanter's spawn and clear of props. Missing models fall back to placeholders.
 */
export async function spawnEnemies(
  floor: Floor,
  models: ModelIndex,
  ctx: EnemyContext,
  spawns: Floor['spec']['spawns'] = floor.spec.spawns,
  /** Keep spawns away from this point (the Incanter, for reinforcements); default the floor spawn. */
  awayFrom: { x: number; z: number } = floor.spawn,
): Promise<Enemy[]> {
  const rand = seeded(floor.spec.name + spawns.length + Math.round(awayFrom.x) + Math.round(awayFrom.z));
  const half = floor.halfExtent - 2;
  const enemies: Enemy[] = [];
  const taken: THREE.Vector3[] = [];
  const anchors: THREE.Vector3[] = [];

  const entries = spawns.map((g) => models.resolve(g.enemy.model, 'enemy'));
  await preloadEnemyModels(entries.filter((e) => e !== undefined));

  for (const [gi, group] of spawns.entries()) {
    const profile = ARCHETYPES[group.enemy.archetype];
    const entry = entries[gi];
    if (!entry && group.enemy.model) floor.warnings.push(`enemy model "${group.enemy.model}" not found; using a placeholder`);
    const shape = new RAPIER.Capsule(Math.max(0.05, profile.height / 2 - profile.radius), profile.radius + 0.1);

    const isClear = (p: THREE.Vector3): boolean => {
      if (Math.abs(p.x) > half || Math.abs(p.z) > half) return false;
      if (Math.hypot(p.x - awayFrom.x, p.z - awayFrom.z) < MIN_SPAWN_DISTANCE) return false;
      if (taken.some((t) => t.distanceTo(p) < profile.radius * 2 + 0.6)) return false;
      // Lift the test capsule clear of the ground collider (its bottom sits ~0.2 m up).
      const hit = ctx.world.intersectionWithShape(
        { x: p.x, y: profile.height / 2 + 0.3, z: p.z },
        { x: 0, y: 0, z: 0, w: 1 },
        shape,
      );
      return hit === null;
    };

    let anchor: THREE.Vector3 | undefined;
    for (let i = 0; i < TRIES && !anchor; i++) {
      const a = rand() * Math.PI * 2;
      const r = MIN_SPAWN_DISTANCE + 1 + rand() * Math.max(1, half - MIN_SPAWN_DISTANCE - 1);
      const p = new THREE.Vector3(Math.sin(a) * r, 0, -Math.cos(a) * r);
      // Spread groups out; relax the rule for the last tries rather than fail.
      const apart = i > TRIES * 0.7 || anchors.every((a) => a.distanceTo(p) >= GROUP_SEPARATION);
      if (apart && isClear(p)) anchor = p;
    }
    if (!anchor) {
      floor.warnings.push(`no room to spawn ${group.enemy.id}`);
      continue;
    }
    anchors.push(anchor);

    for (let n = 0; n < group.count && enemies.length < MAX_ENEMIES; n++) {
      let pos: THREE.Vector3 | undefined = n === 0 ? anchor : undefined;
      for (let i = 0; i < TRIES && !pos; i++) {
        const a = rand() * Math.PI * 2;
        const p = new THREE.Vector3(anchor.x + Math.sin(a) * GROUP_SPREAD, 0, anchor.z + Math.cos(a) * GROUP_SPREAD);
        if (isClear(p)) pos = p;
      }
      if (!pos) continue;
      taken.push(pos);
      const visual = await createEnemyVisual(entry, profile);
      // Face the centre of the floor.
      const yaw = Math.atan2(-pos.x, -pos.z);
      enemies.push(new Enemy(group.enemy, profile, visual, ctx, pos, yaw));
    }
  }
  if (spawns.reduce((a, g) => a + g.count, 0) > MAX_ENEMIES) {
    floor.warnings.push(`enemy count capped at ${MAX_ENEMIES}`);
  }
  return enemies;
}
