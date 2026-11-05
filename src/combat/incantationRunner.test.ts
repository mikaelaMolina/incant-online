import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createPhysicsWorld, FIXED_DT, type RAPIER } from '../game/physics';
import { IncantationRunner } from './incantationRunner';
import { StatusSet } from './statusEffects';
import { Health } from './health';
import { judge } from '../arbiter/arbiter';
import { INCANTATION_SHAPES, INCANTATION_TYPES, type StatusEffect } from '../schemas/incantationSpec';
import { Vfx } from '../vfx/presets';
import type { Incanter } from '../game/player';
import type { Enemy } from '../enemies/enemy';

/**
 * Runs the real runner + VFX against a real (empty) Rapier world with stand-in Incanter and
 * enemies, so every type × shape is proven to deal damage, not just to plan.
 */

const CENTER_Y = 0.85;

class FakeIncanter {
  readonly physicsPosition = new THREE.Vector3(0, CENTER_Y, 0);
  readonly position = this.physicsPosition;
  readonly aimPoint = new THREE.Vector3(0, 0, 3);
  readonly health = new Health(100);
  alive = true;
  isCastDashing = false;
  warded = 0;
  private dashVel = new THREE.Vector3();
  private dashT = 0;
  get feetY(): number {
    return this.physicsPosition.y - CENTER_Y;
  }
  aimDirection(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(this.aimPoint.x - this.physicsPosition.x, 0, this.aimPoint.z - this.physicsPosition.z).normalize();
  }
  faceDirection(): void {}
  ward(s: number): void {
    this.warded = Math.max(this.warded, s);
  }
  dash(dir: THREE.Vector3, distance: number, duration: number): void {
    this.dashVel.copy(dir).normalize().multiplyScalar(distance / duration);
    this.dashT = duration;
    this.isCastDashing = true;
  }
  step(dt: number): void {
    if (this.dashT > 0) {
      this.physicsPosition.addScaledVector(this.dashVel, Math.min(dt, this.dashT));
      this.dashT -= dt;
      this.isCastDashing = this.dashT > 0;
    }
  }
}

class FakeEnemy {
  readonly physicsPosition: THREE.Vector3;
  readonly status = new StatusSet();
  readonly radius = 0.45;
  readonly height = 1.8;
  damage = 0;
  statuses: string[] = [];
  constructor(x: number, z: number) {
    this.physicsPosition = new THREE.Vector3(x, 0.9, z);
  }
  get alive(): boolean {
    return true;
  }
  takeHit(amount: number): void {
    this.damage += amount;
  }
  applyStatus(e: StatusEffect): void {
    const s = this.status.apply(e);
    if (s) this.statuses.push(s);
  }
}

let world: RAPIER.World;
beforeAll(async () => {
  world = await createPhysicsWorld();
});

function setup(enemyAt: [number, number][]) {
  const incanter = new FakeIncanter();
  const vfx = new Vfx(new THREE.Scene());
  const runner = new IncantationRunner({ world, incanter: incanter as unknown as Incanter, vfx });
  const enemies = enemyAt.map(([x, z]) => new FakeEnemy(x, z));
  runner.setTargets(enemies as unknown as Enemy[]);
  const run = (seconds: number) => {
    for (let t = 0; t < seconds; t += FIXED_DT) {
      incanter.step(FIXED_DT);
      runner.fixedUpdate(FIXED_DT);
      runner.render(FIXED_DT);
      vfx.update(FIXED_DT, new THREE.PerspectiveCamera(), 720);
    }
  };
  return { incanter, runner, enemies, vfx, run };
}

describe('IncantationRunner', () => {
  it('every type × shape damages an enemy standing where the Incanter aims', () => {
    const misses: string[] = [];
    for (const type of INCANTATION_TYPES)
      for (const shape of INCANTATION_SHAPES) {
        const spec = judge({ name: `${type}-${shape}`, type, shape, hits: 2, radius: 3, damage_per_hit: 20, status_effect: { kind: 'slow', duration: 2 } }).incantation;
        // Dashes travel through the target; everything else hits a foe 2.5 m ahead.
        const { runner, enemies, run, vfx } = setup([[0, 2.5]]);
        expect(runner.cast(spec).ok).toBe(true);
        run(12);
        if (enemies[0]!.damage <= 0) misses.push(`${type}/${shape}`);
        expect(runner.activeCasts, `${type}/${shape} finished`).toBe(0);
        expect(enemies[0]!.statuses.includes('slow') || enemies[0]!.damage === 0).toBe(true);
        vfx.clear();
      }
    expect(misses).toEqual([]);
  });

  it('chain_targets: the hit leaps to more enemies at half damage', () => {
    const spec = judge({ name: 'Arc', type: 'chain', shape: 'orb', hits: 1, damage_per_hit: 20, chain_targets: 2 }).incantation;
    const { runner, enemies, run } = setup([
      [0, 3],
      [2, 5],
      [4, 7],
      [30, 30], // too far to reach
    ]);
    expect(runner.cast(spec).ok).toBe(true);
    run(2);
    expect(enemies.map((e) => e.damage)).toEqual([20, 10, 10, 0]);
  });

  it('melee_combo lands `hits` times', () => {
    const spec = judge({ name: 'Trio', type: 'melee_combo', shape: 'spin', hits: 3, radius: 3, damage_per_hit: 10 }).incantation;
    const { runner, enemies, run } = setup([[-2, 0]]); // behind: spins hit all around
    runner.cast(spec);
    run(2);
    expect(enemies[0]!.damage).toBe(30);
  });

  it('cooldown and mana gate casting; nothing is spent on a refused chain', () => {
    const spec = judge({ name: 'Bolt', type: 'projectile', damage_per_hit: 20 }).incantation;
    const { runner } = setup([[0, 3]]);
    expect(runner.cast(spec).ok).toBe(true);
    const again = runner.cast(spec);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('cooldown');

    const chain = judge({ name: 'Lonely Arc', type: 'chain' }).incantation;
    const empty = setup([]);
    const manaBefore = empty.runner.resources.mana;
    const r = empty.runner.cast(chain);
    expect(r.ok).toBe(false);
    expect(empty.runner.resources.mana).toBe(manaBefore);

    const pricey = judge({ name: 'Pricey', hits: 5, damage_per_hit: 60, radius: 8, shape: 'circle', type: 'area' }).incantation;
    empty.runner.resources.mana = 0;
    const broke = empty.runner.cast(pricey);
    expect(broke.ok).toBe(false);
    if (!broke.ok) expect(broke.reason).toBe('mana');
  });

  it('heal restores the Incanter; freeze buff wards', () => {
    const { runner, incanter, run } = setup([]);
    incanter.health.damage(50);
    runner.cast(judge({ name: 'Mend', type: 'buff', status_effect: { kind: 'heal', dps: 6, duration: 5 } }).incantation);
    run(6);
    expect(incanter.health.current).toBeCloseTo(80, 0);
    runner.cast(judge({ name: 'Ice Ward', type: 'buff', status_effect: { kind: 'freeze', duration: 2 } }).incantation);
    expect(incanter.warded).toBe(2);
  });

  it('dash moves the Incanter toward the aim', () => {
    const { runner, incanter, run } = setup([]);
    runner.cast(judge({ name: 'Rush', type: 'dash', radius: 2 }).incantation);
    run(1);
    expect(incanter.physicsPosition.z).toBeGreaterThan(5);
  });
});
