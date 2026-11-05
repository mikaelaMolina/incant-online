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
import type { FloorSpec } from '../schemas/floorSpec';
import type { IncantationSpec } from '../schemas/incantationSpec';
import { IncantationRunner, type CastOutcome } from '../combat/incantationRunner';
import { TEST_INCANTATIONS, TEST_KEYS } from '../combat/testIncantations';
import { CACHED_INCANTATIONS } from '../fallback/cache';
import { judge } from '../arbiter/arbiter';
import { Vfx } from '../vfx/presets';
import { PostFx } from '../vfx/bloom';
import { CastHud } from '../ui/castHud';

/** Longest frame we simulate; avoids a "spiral of death" after a tab switch or hitch. */
const MAX_FRAME = 0.1;
const MAX_STEPS = 5;
const REVIVE_DELAY = 2.5;
const CLEARED_BANNER_TIME = 3;

export interface GameController {
  /** While paused the world renders but nothing simulates (start screen). */
  setPaused(paused: boolean): void;
  /** Replace the current floor (props, lighting, enemies) and respawn the Incanter. */
  loadFloor(spec: FloorSpec): Promise<void>;
  /** The floor currently loaded, e.g. as context for "make it night". */
  currentFloor(): FloorSpec;
  /** Cast an (Arbiter-judged) Incantation toward the current aim. Refusals are also shown on the HUD. */
  castIncantation(spec: IncantationSpec): CastOutcome;
}

/** Load the first floor and start rendering. Resolves once the floor is playable (paused). */
export async function startGame(canvas: HTMLCanvasElement, hud: HTMLElement): Promise<GameController> {
  const [world, manifest] = await Promise.all([createPhysicsWorld(), loadManifest()]);
  const models = new ModelIndex(manifest);

  // No default-framebuffer MSAA: the bloom composer renders the scene with its own multisampling.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, stencil: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  // The bloom composer renders several passes; count the whole frame, not just the last pass.
  renderer.info.autoReset = false;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  let floor: Floor = await buildFloor(STARTING_ARENA, { scene, world, models });

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
  let clearedShown = false;
  /** Bumped on every floor change, so late spawns from an old floor are discarded. */
  let generation = 0;
  const spawnFor = (f: Floor): void => {
    const gen = ++generation;
    spawnEnemies(f, models, { world, scene, player: incanter, projectiles })
      .then((spawned) => {
        if (gen !== generation) {
          for (const e of spawned) e.dispose();
          return;
        }
        enemies = spawned;
        hadEnemies = spawned.length > 0;
        clearedShown = false;
      })
      .catch((err: unknown) => console.warn('Enemies failed to spawn.', err))
      .finally(() => {
        if (f.warnings.length) console.info(`Floor "${f.spec.name}":`, f.warnings);
      });
  };
  spawnFor(floor);

  // Incantations: runner (logic), VFX presets, bloom, HUD.
  const vfx = new Vfx(scene);
  const runner = new IncantationRunner({ world, incanter, vfx });
  const postFx = new PostFx(renderer, scene, cam.camera);
  const castHud = new CastHud(hud);
  castHud.setSlots(TEST_INCANTATIONS.map((j, i) => ({ key: String(i + 1), spec: j.incantation })));
  const castIncantation = (spec: IncantationSpec): CastOutcome => {
    runner.setTargets(enemies);
    const outcome = runner.cast(spec);
    if (outcome.ok) castHud.pulse(spec.name);
    else castHud.say(outcome.message);
    return outcome;
  };

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
            status: e.status.dominant,
          })),
        /** Cast any spec (goes through the Arbiter first), e.g. __incant.cast({ type: 'beam', shape: 'spin' }). */
        cast: (raw: unknown) => castIncantation(judge(raw).incantation),
        /** Cast cached Incantation 0–9 (covers every type). */
        castCached: (i: number) => castIncantation(judge(CACHED_INCANTATIONS[i % CACHED_INCANTATIONS.length]).incantation),
        mana: () => runner.resources.mana,
        refill: () => runner.resources.reset(),
        particles: () => vfx.particles.count,
        activeCasts: () => runner.activeCasts,
        aim: () => ({ x: incanter.aimPoint.x, z: incanter.aimPoint.z }),
        /** Project a world point to client pixels (to aim the mouse in automated checks). */
        screenOf: (x: number, y: number, z: number) => {
          const v = new THREE.Vector3(x, y, z).project(cam.camera);
          return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight };
        },
      },
    });
  }

  const healthBars = new HealthBars(hud);
  const debug = new DebugOverlay(hud);

  window.addEventListener('resize', () => {
    cam.setAspect(window.innerWidth / window.innerHeight);
    renderer.setSize(window.innerWidth, window.innerHeight);
    postFx.setSize(window.innerWidth, window.innerHeight);
  });

  let sunOffset = floor.sun.position.clone();
  const timer = new THREE.Timer();
  timer.connect(document); // pause-aware: no huge delta after returning to the tab
  let accumulator = 0;
  let paused = true;
  /** True while a floor is being swapped: render, but don't simulate. */
  let loading = false;
  let reviveTimer = 0;
  let clearedTimer = 0;

  renderer.setAnimationLoop((time) => {
    renderer.info.reset();
    timer.update(time);
    const frozen = paused || loading;
    const dt = frozen ? 0 : Math.min(timer.getDelta(), MAX_FRAME);
    if (frozen) timer.getDelta(); // keep the clock moving so unpausing doesn't jump
    accumulator += dt;

    if (!frozen) {
      incanter.frameInput();
      TEST_KEYS.forEach((code, i) => {
        const j = TEST_INCANTATIONS[i];
        if (j && input.wasPressed(code)) castIncantation(j.incantation);
      });
    }
    runner.setTargets(enemies);

    let steps = 0;
    while (accumulator >= FIXED_DT && steps < MAX_STEPS) {
      incanter.fixedUpdate(FIXED_DT);
      for (const e of enemies) e.fixedUpdate(FIXED_DT);
      projectiles.fixedUpdate(FIXED_DT);
      runner.fixedUpdate(FIXED_DT);
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
        runner.clear();
        healthBars.showBanner('You fall. The Spire draws you back…');
      }
      reviveTimer = Math.max(0, reviveTimer - dt);
      if (reviveTimer === 0) {
        incanter.revive();
        runner.reset();
        vfx.clear();
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
    runner.render(dt);
    cam.update(incanter.position, dt);
    vfx.update(dt, cam.camera, renderer.domElement.height);

    aimMarker.position.set(incanter.aimPoint.x, incanter.aimPoint.y + 0.02, incanter.aimPoint.z);

    // Keep the shadow frustum centred on the Incanter.
    floor.sun.position.copy(incanter.position).add(sunOffset);
    floor.sun.target.position.copy(incanter.position);

    postFx.render(dt);
    input.endFrame();

    healthBars.update(enemies, incanter.health, cam.camera, incanter.position);
    castHud.update(dt, runner.resources);
    const alive = enemies.filter((e) => e.alive);
    debug.update(
      dt,
      renderer,
      `${floor.spec.name} · ${incanter.isGrounded ? 'grounded' : 'airborne'} · dodge ${incanter.dodgeReady ? 'ready' : 'cooling'}\n` +
        `enemies ${alive.length}: ${alive.map((e) => `${e.profile.label}:${e.state}${e.status.dominant !== 'none' ? `(${e.status.dominant})` : ''}`).join(' ')}\n` +
        `mana ${Math.floor(runner.resources.mana)} · casts ${runner.activeCasts} · fx ${vfx.activeEffects} · particles ${vfx.particles.count}`,
    );
  });

  return {
    setPaused(p) {
      paused = p;
      input.clear();
    },
    async loadFloor(spec) {
      loading = true;
      try {
        generation++; // drop any spawn still in flight for the old floor
        for (const e of enemies) e.dispose();
        enemies = [];
        hadEnemies = false;
        clearedTimer = 0;
        healthBars.showBanner(null);
        projectiles.clear();
        runner.clear();
        vfx.clear();
        floor.dispose();
        floor = await buildFloor(spec, { scene, world, models });
        sunOffset = floor.sun.position.clone();
        incanter.revive();
        incanter.setSpawn(floor.spawn);
        world.step(); // update the query pipeline before spawn checks
        cam.snapTo(incanter.position);
        spawnFor(floor);
      } finally {
        loading = false;
        input.clear();
      }
    },
    currentFloor: () => floor.spec,
    castIncantation,
  };
}
