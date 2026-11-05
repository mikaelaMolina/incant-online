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
import { GRIMOIRE_BAR_SIZE } from '../combat/grimoire';
import { CACHED_INCANTATIONS } from '../fallback/cache';
import { judge } from '../arbiter/arbiter';
import { Vfx } from '../vfx/presets';
import { PostFx } from '../vfx/bloom';
import { CastHud } from '../ui/castHud';
import { Gate, chooseGateSpot, rayClearance } from './gate';
import { INCANTER_CENTER_Y } from './player';

/** Longest frame we simulate; avoids a "spiral of death" after a tab switch or hitch. */
const MAX_FRAME = 0.1;
const MAX_STEPS = 5;
const REVIVE_DELAY = 2.5;
const CLEARED_BANNER_TIME = 3;
/** Number keys (top row and numpad) cast Grimoire bar slots 1–6. */
const BAR_KEYS = Array.from({ length: GRIMOIRE_BAR_SIZE }, (_, i) => [`Digit${i + 1}`, `Numpad${i + 1}`]);

export interface GameController {
  /** While paused the world renders but nothing simulates (start screen). */
  setPaused(paused: boolean): void;
  /**
   * Replace the current floor (props, lighting, enemies) and respawn the Incanter.
   * Never rejects: if the floor can't be built, the starting arena is loaded instead.
   * Resolves with the floor actually loaded.
   */
  loadFloor(spec: FloorSpec): Promise<FloorSpec>;
  /** The floor currently loaded, e.g. as context for "make it night". */
  currentFloor(): FloorSpec;
  /** Cast an (Arbiter-judged) Incantation toward the current aim. Refusals are also shown on the HUD. */
  castIncantation(spec: IncantationSpec): CastOutcome;
  /** Show the Grimoire bar (one entry per slot, undefined = empty); number keys cast these. */
  setBar(slots: readonly (IncantationSpec | undefined)[]): void;
  /** Is the Incanter standing in the open gate (describing the next floor)? */
  atGate(): boolean;
  /** Event callbacks set by the UI layer. */
  readonly hooks: GameHooks;
}

export interface GameHooks {
  /** A successful cast from a number key. */
  onBarCast?: (spec: IncantationSpec) => void;
  /** All enemies defeated (or none to fight): the gate has opened. */
  onGateOpen?: () => void;
  /** The Incanter stepped into / out of the gate. */
  onGateEnter?: () => void;
  onGateLeave?: () => void;
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
        // Nothing to fight on this floor: the way on is open from the start.
        if (!hadEnemies) openGate();
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
  let bar: readonly (IncantationSpec | undefined)[] = [];
  const hooks: GameHooks = {};

  // The gate to the next floor: opens when the floor is cleared.
  let gate: Gate | undefined;
  let inGate = false;
  function openGate(): void {
    if (gate) return;
    const me = incanter.physicsPosition;
    const spot = chooseGateSpot(me, rayClearance(world, me), Math.atan2(incanter.aimPoint.x - me.x, incanter.aimPoint.z - me.z));
    gate = new Gate(scene, vfx, spot, me.y - INCANTER_CENTER_Y);
    hooks.onGateOpen?.();
  }
  function closeGate(): void {
    gate?.dispose();
    gate = undefined;
    if (inGate) hooks.onGateLeave?.();
    inGate = false;
  }
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
        /** Defeat every enemy (opens the gate). */
        killAll: () => {
          for (const e of enemies) e.takeHit(1e6, e.physicsPosition, 0);
        },
        gate: () => (gate ? { x: gate.position.x, z: gate.position.z, open: gate.open, inside: inGate } : null),
        /** Move the Incanter onto the gate (dev only: also moves the respawn point). */
        warpToGate: () => {
          if (gate) incanter.setSpawn(gate.position);
        },
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
      BAR_KEYS.forEach((codes, i) => {
        const spec = bar[i];
        if (spec && codes.some((c) => input.wasPressed(c)) && castIncantation(spec).ok) hooks.onBarCast?.(spec);
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
      healthBars.showBanner('Floor cleared: a gate opens');
      openGate();
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
    if (gate) {
      const near = incanter.alive && gate.open && gate.contains(incanter.physicsPosition);
      gate.update(dt, near);
      if (near !== inGate) {
        inGate = near;
        if (near) hooks.onGateEnter?.();
        else hooks.onGateLeave?.();
      }
    }
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
        closeGate();
        floor.dispose();
        try {
          floor = await buildFloor(spec, { scene, world, models });
        } catch (err) {
          console.warn(`Floor "${spec.name}" failed to build; loading the starting arena.`, err);
          floor = await buildFloor(STARTING_ARENA, { scene, world, models });
        }
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
      return floor.spec;
    },
    currentFloor: () => floor.spec,
    castIncantation,
    setBar(slots) {
      bar = [...slots];
      castHud.setSlots(bar);
    },
    atGate: () => inGate,
    hooks,
  };
}
