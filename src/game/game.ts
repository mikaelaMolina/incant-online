import * as THREE from 'three';
import { createPhysicsWorld, FIXED_DT } from './physics';
import { Input } from './input';
import { FollowCamera } from './camera';
import { Incanter } from './player';
import { loadManifest, ModelIndex } from './assets';
import { buildFloor, type Floor } from './floorLoader';
import { STARTING_ARENA } from '../fallback/floors';
import { DebugOverlay } from '../ui/debugOverlay';
import { HealthBars } from '../ui/healthBars';
import { ProjectileSystem } from '../combat/projectiles';
import { BasicAttack } from '../combat/basicAttack';
import { spawnEnemies } from '../enemies/spawner';
import type { Enemy } from '../enemies/enemy';

/** Longest frame we simulate; avoids a "spiral of death" after a tab switch or hitch. */
const MAX_FRAME = 0.1;
const MAX_STEPS = 5;
const REVIVE_DELAY = 2.5;
const CLEARED_BANNER_TIME = 3;

export interface GameController {
  /** While paused the world renders but nothing simulates (start screen). */
  setPaused(paused: boolean): void;
}

/** Load the first floor and start rendering. Resolves once the floor is playable (paused). */
export async function startGame(canvas: HTMLCanvasElement, hud: HTMLElement): Promise<GameController> {
  const [world, manifest] = await Promise.all([createPhysicsWorld(), loadManifest()]);
  const models = new ModelIndex(manifest);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const floor: Floor = await buildFloor(STARTING_ARENA, { scene, world, models });

  const input = new Input(canvas);
  const cam = new FollowCamera(window.innerWidth / window.innerHeight);
  const incanter = new Incanter(world, input, cam);
  scene.add(incanter.object);
  incanter.setSpawn(floor.spawn);
  cam.snapTo(incanter.position);

  // Colliders were just added; update the query pipeline before spawn checks and the first move.
  world.step();

  const projectiles = new ProjectileSystem(world, incanter);
  scene.add(projectiles.mesh);
  // Enemy models (FBX) take a moment to parse: start playing now, enemies join when ready.
  let enemies: Enemy[] = [];
  let hadEnemies = false;
  spawnEnemies(floor, models, { world, scene, player: incanter, projectiles })
    .then((spawned) => {
      enemies = spawned;
      hadEnemies = spawned.length > 0;
    })
    .catch((err: unknown) => console.warn('Enemies failed to spawn.', err))
    .finally(() => {
      if (floor.warnings.length) console.info(`Floor "${floor.spec.name}":`, floor.warnings);
    });

  const basicAttack = new BasicAttack(scene);
  incanter.onBasicAttack = (e) => basicAttack.resolve(e, enemies);

  const aimMarker = new THREE.Mesh(
    new THREE.RingGeometry(0.25, 0.35, 24),
    new THREE.MeshBasicMaterial({ color: '#7cd6ff', transparent: true, opacity: 0.8, depthWrite: false }),
  );
  aimMarker.rotation.x = -Math.PI / 2;
  scene.add(aimMarker);

  // Dev-only hook for automated browser checks; stripped from production builds.
  if (import.meta.env.DEV) {
    Object.assign(window, {
      __incant: {
        player: () => ({ ...incanter.physicsPosition, hp: incanter.health.current }),
        enemies: () =>
          enemies.map((e) => ({
            id: e.spec.id,
            archetype: e.profile.label,
            state: e.state,
            hp: e.health.current,
            x: e.physicsPosition.x,
            z: e.physicsPosition.z,
          })),
      },
    });
  }

  const healthBars = new HealthBars(hud);
  const debug = new DebugOverlay(hud);

  window.addEventListener('resize', () => {
    cam.setAspect(window.innerWidth / window.innerHeight);
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const sunOffset = floor.sun.position.clone();
  const timer = new THREE.Timer();
  timer.connect(document); // pause-aware: no huge delta after returning to the tab
  let accumulator = 0;
  let paused = true;
  let reviveTimer = 0;
  let clearedTimer = 0;
  let clearedShown = false;

  renderer.setAnimationLoop((time) => {
    timer.update(time);
    const dt = paused ? 0 : Math.min(timer.getDelta(), MAX_FRAME);
    if (paused) timer.getDelta(); // keep the clock moving so unpausing doesn't jump
    accumulator += dt;

    if (!paused) incanter.frameInput();

    let steps = 0;
    while (accumulator >= FIXED_DT && steps < MAX_STEPS) {
      incanter.fixedUpdate(FIXED_DT);
      for (const e of enemies) e.fixedUpdate(FIXED_DT);
      projectiles.fixedUpdate(FIXED_DT);
      world.step();
      incanter.postStep();
      for (const e of enemies) e.postStep();
      accumulator -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_STEPS) accumulator = 0;

    // Remove corpses that have finished sinking.
    if (enemies.some((e) => e.gone)) {
      for (const e of enemies) if (e.gone) e.dispose();
      enemies = enemies.filter((e) => !e.gone);
    }

    // The Incanter falls → short pause → back at the spawn, enemies reset.
    if (!incanter.alive) {
      if (reviveTimer === 0) {
        reviveTimer = REVIVE_DELAY;
        projectiles.clear();
        healthBars.showBanner('You fall. The Spire draws you back…');
      }
      reviveTimer = Math.max(0, reviveTimer - dt);
      if (reviveTimer === 0) {
        incanter.revive();
        for (const e of enemies) e.reset();
        healthBars.showBanner(null);
        cam.snapTo(incanter.position);
      }
    } else if (hadEnemies && !clearedShown && enemies.every((e) => !e.alive)) {
      clearedShown = true;
      clearedTimer = CLEARED_BANNER_TIME;
      healthBars.showBanner('Floor cleared');
    }
    if (clearedTimer > 0) {
      clearedTimer -= dt;
      if (clearedTimer <= 0) healthBars.showBanner(null);
    }

    const alpha = accumulator / FIXED_DT;
    incanter.render(alpha, dt);
    for (const e of enemies) e.render(alpha, dt);
    projectiles.render(alpha);
    basicAttack.update(dt);
    cam.update(incanter.position, dt);

    aimMarker.position.set(incanter.aimPoint.x, incanter.aimPoint.y + 0.02, incanter.aimPoint.z);

    // Keep the shadow frustum centred on the Incanter.
    floor.sun.position.copy(incanter.position).add(sunOffset);
    floor.sun.target.position.copy(incanter.position);

    renderer.render(scene, cam.camera);
    input.endFrame();

    healthBars.update(enemies, incanter.health, cam.camera, incanter.position);
    const alive = enemies.filter((e) => e.alive);
    debug.update(
      dt,
      renderer,
      `${floor.spec.name} · ${incanter.isGrounded ? 'grounded' : 'airborne'} · dodge ${incanter.dodgeReady ? 'ready' : 'cooling'}\n` +
        `enemies ${alive.length}: ${alive.map((e) => `${e.profile.label}:${e.state}`).join(' ')}`,
    );
  });

  return {
    setPaused(p) {
      paused = p;
      input.clear();
    },
  };
}
