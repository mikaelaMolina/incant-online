import * as THREE from 'three';
import { createPhysicsWorld, FIXED_DT } from './physics';
import { Input } from './input';
import { FollowCamera } from './camera';
import { loadIncanterModel } from './incanterModel';
import { Incanter } from './player';
import { Progression, XP_FOR, floorSubtitle, planWaves, spawnsForFloor, xpToNext } from './progression';
import { preloadEnemyModels } from '../enemies/enemyModel';
import { UnitFrame } from '../ui/unitFrame';
import { OffscreenMarkers } from '../ui/offscreenMarkers';
import { Pickups, type PickupKind } from './pickups';
import { ProgressHud } from '../ui/progressHud';
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
import { DamageNumbers } from '../ui/damageNumbers';
import { sfx, type SoundId } from '../audio/sfx';
import { drainCombat } from '../combat/events';
import type { CastFx } from '../combat/incantationRunner';
import { AdaptiveQuality, QUALITY_LEVELS, SEVERE_FRAME_MS, type QualityLevel } from './quality';
import { Gate, GATE_STONE, chooseGateSpot, rayClearance } from './gate';
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
  /** How high the Incanter has climbed (1 = the first floor). */
  floorNumber(): number;
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
  /** A floor guardian has appeared. */
  onBossAwake?: (name: string) => void;
}

/** Load the first floor and start rendering. Resolves once the floor is playable (paused). */
export async function startGame(canvas: HTMLCanvasElement, hud: HTMLElement): Promise<GameController> {
  const [world, manifest] = await Promise.all([createPhysicsWorld(), loadManifest()]);
  const models = new ModelIndex(manifest);

  // No default-framebuffer MSAA: the bloom composer renders the scene with its own multisampling.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, stencil: false, powerPreference: 'high-performance' });
  const basePixelRatio = (): number => Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(basePixelRatio());
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
  const progress = new Progression();
  const pickups = new Pickups(scene);
  scene.add(incanter.object);
  incanter.setSpawn(floor.spawn);
  // The animated wizard body loads in the background; the capsule stands in until then (or if it fails).
  const wizard = models.resolve('rpg.wizard', 'character');
  if (wizard) {
    loadIncanterModel(wizard, 1.75)
      .then((m) => {
        incanter.attachModel(m);
        void precompile();
      })
      .catch((err: unknown) => console.warn('Incanter model failed to load; keeping the placeholder.', err));
  }
  cam.snapTo(incanter.position);

  // Colliders were just added; update the query pipeline before spawn checks and the first move.
  world.step();

  const projectiles = new ProjectileSystem(world, incanter);
  scene.add(projectiles.mesh);
  // Enemy models (FBX) take a moment to parse: start playing now, enemies join when ready.
  let enemies: Enemy[] = [];
  let hadEnemies = false;
  /** A boss that just spawned, to announce on the next frame. */
  let bossIntro: Enemy | undefined;
  let bossIntroDelay = 0;
  let clearedShown = false;
  /** Bumped on every floor change, so late spawns from an old floor are discarded. */
  let generation = 0;
  /** The floor's waves (see planWaves) and which one is in play. */
  let waves: Floor['spec']['spawns'][] = [];
  let waveIndex = 0;
  let spawningWave = false;
  const spawnWave = (f: Floor, gen: number): void => {
    const reinforcements = waveIndex > 0;
    spawningWave = true;
    const me = incanter.physicsPosition;
    spawnEnemies(f, models, { world, scene, player: incanter, projectiles }, waves[waveIndex] ?? [], reinforcements ? { x: me.x, z: me.z } : f.spawn)
      .then((spawned) => {
        if (gen !== generation) {
          for (const e of spawned) e.dispose();
          return;
        }
        for (const e of spawned) {
          // Reinforcements arrive in a burst of light and come straight for the Incanter.
          if (reinforcements) {
            e.hunting = true;
            vfx.deathBurst(e.physicsPosition.clone().setY(e.physicsPosition.y + 1), '#8f6bff');
          }
        }
        enemies = [...enemies, ...spawned];
        hadEnemies = hadEnemies || spawned.length > 0;
        const boss = spawned.find((e) => e.spec.archetype === 'boss');
        if (boss) {
          bossIntro = boss; // announced by the main loop
          bossIntroDelay = reinforcements ? 0.3 : 3.4; // on a fresh floor, after the title card fades
        }
        // Enemy models arrive after the floor: compile their shaders before they're first drawn in a fight.
        void precompile();
        clearedShown = false;
        // Nothing to fight on this floor: the way on is open from the start.
        if (!hadEnemies) openGate();
      })
      .catch((err: unknown) => console.warn('Enemies failed to spawn.', err))
      .finally(() => {
        spawningWave = false;
        if (f.warnings.length) console.info(`Floor "${f.spec.name}":`, f.warnings);
      });
  };
  const spawnFor = (f: Floor): void => {
    const gen = ++generation;
    waves = planWaves(spawnsForFloor(f.spec, progress.floor), progress.floor);
    waveIndex = 0;
    // Load every wave's models now, so reinforcements never wait on a download mid-fight.
    void preloadEnemyModels(waves.flat().map((g) => models.resolve(g.enemy.model, 'enemy')).filter((m) => m !== undefined));
    spawnWave(f, gen);
  };
  spawnFor(floor);

  // Incantations: runner (logic), VFX presets, bloom, HUD.
  const vfx = new Vfx(scene);
  // Positional sound: panned by where it is on screen, quieter further from the Incanter.
  const soundAt = (id: SoundId, at?: { x: number; y: number; z: number }, gain = 1): void => {
    if (!at) return sfx.play(id, { volume: gain });
    const p = new THREE.Vector3(at.x, at.y, at.z).project(cam.camera);
    const d = Math.hypot(at.x - incanter.physicsPosition.x, at.z - incanter.physicsPosition.z);
    sfx.play(id, { pan: Math.max(-1, Math.min(1, p.x)) * 0.7, volume: gain * Math.max(0.25, Math.min(1, 1.2 - d / 25)) });
  };
  const ELEMENT_ACCENT: Partial<Record<IncantationSpec['element'], SoundId>> = { ice: 'ice', lightning: 'zap', wind: 'wind', light: 'light', shadow: 'shadow' };
  /** Spell feedback: sound, screen shake, FOV kick. Bigger effects shake more. */
  const onFx = (e: CastFx): void => {
    switch (e.kind) {
      case 'cast': {
        const t = e.spec.type;
        unitFrame.setColor(e.spec.vfx.color);
        incanter.castPose(t === 'melee_combo' ? 'strike' : t === 'beam' || t === 'area' || t === 'buff' ? 'channel' : 'cast', e.spec.vfx.color);
        soundAt('cast');
        const accent = ELEMENT_ACCENT[e.spec.element];
        if (accent) soundAt(accent, undefined, 0.8);
        if (e.spec.type === 'area' || e.spec.type === 'beam') cam.kick(1.5);
        break;
      }
      case 'hit':
        soundAt('hit', e.at, 0.8);
        break;
      case 'explode':
        soundAt('explode', e.at);
        cam.shake(0.1 + e.radius * 0.025);
        break;
      case 'pulse':
        if (e.shape === 'slash' || e.shape === 'thrust' || e.shape === 'line') soundAt('swing', e.at);
        else {
          soundAt(e.radius >= 3 ? 'slam' : 'swing', e.at, e.radius >= 3 ? 0.7 : 1);
          if (e.radius >= 3) cam.shake(0.05 + e.radius * 0.015);
        }
        break;
      case 'zap':
        soundAt('zap', e.at, 0.7);
        break;
      case 'dash':
        soundAt('dodge');
        cam.kick(6);
        break;
    }
  };
  const runner = new IncantationRunner({ world, incanter, vfx, onFx });
  const postFx = new PostFx(renderer, scene, cam.camera);
  /**
   * Compile shaders for everything now in the scene, in the background where supported.
   * compileAsync does its target-dependent work synchronously when called, so the render target
   * is swapped only around that call and never while a frame is drawing.
   */
  async function precompile(cleanup?: () => void): Promise<void> {
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(postFx.sceneTarget);
    let pending: Promise<unknown>;
    try {
      pending = renderer.compileAsync(scene, cam.camera);
    } finally {
      renderer.setRenderTarget(previous);
    }
    await pending.catch((err: unknown) => console.warn('Shader precompile failed; shaders will compile on first use.', err));
    cleanup?.();
  }

  /**
   * Draw hidden copies of every effect material for a few frames. Some drivers (e.g. ANGLE on
   * Direct3D 12) build each shader's GPU pipeline only at its first real draw, for the current
   * buffer format and MSAA level, which costs hundreds of ms per shader. Doing it now (start
   * screen, behind a floor change, right after a quality change) keeps it out of fights.
   */
  let warmFrames = 0;
  let removeWarm: (() => void) | undefined;
  function warmEffects(frames = 3): void {
    removeWarm ??= vfx.addPrewarmMeshes([GATE_STONE, ...pickups.prewarm]);
    warmFrames = Math.max(warmFrames, frames);
  }

  // Adaptive quality: full quality first, stepping down if the GPU can't hold ~50 fps.
  // Dev only: ?quality=0…4 pins a level (for profiling).
  const pinned = import.meta.env.DEV ? new URLSearchParams(location.search).get('quality') : null;
  const quality = new AdaptiveQuality(pinned === null);
  let pendingQuality: QualityLevel | undefined;
  const applyQuality = (q: QualityLevel): void => {
    warmEffects(); // a new MSAA level means new GPU pipelines for every shader
    postFx.setSamples(q.samples);
    renderer.setPixelRatio(basePixelRatio() * q.resolution);
    renderer.setSize(window.innerWidth, window.innerHeight);
    postFx.setSize(window.innerWidth, window.innerHeight);
    if (import.meta.env.DEV) console.info(`render quality: ${q.label}`);
  };
  if (pinned !== null) {
    quality.level = Math.max(0, Math.min(QUALITY_LEVELS.length - 1, Number(pinned) || 0));
    applyQuality(quality.current);
  }

  // Compile every shader the first floor and the effects need before the first frame, in the
  // background where the browser supports parallel compilation (KHR_parallel_shader_compile), so
  // the first frame doesn't freeze the page and no cast compiles mid-fight. Compiled against the
  // bloom pass's scene buffer: shaders compile per render target, and the screen's would differ.
  await precompile(vfx.addPrewarmMeshes([GATE_STONE, ...pickups.prewarm]));
  warmEffects();
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
    sfx.play('gate');
    cam.shake(0.25);
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
    else {
      castHud.say(outcome.message);
      if (outcome.reason !== 'dead') sfx.play('refuse');
      if (outcome.reason === 'mana') castHud.manaShort();
    }
    return outcome;
  };

  const basicAttack = new BasicAttack(scene);
  incanter.onBasicAttack = (e) => {
    sfx.play('swing');
    if (basicAttack.resolve(e, enemies) > 0) soundAt('hit', e.origin.clone().addScaledVector(e.direction, 1.5));
  };
  let wasDodging = false;

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
        progress: () => ({ level: progress.level, xp: progress.xp, floor: progress.floor, maxHp: incanter.health.max, maxMana: runner.resources.max }),
        setFloorNumber: (n: number) => {
          progress.floor = n;
        },
        /** Damage the Incanter (checks hurt feedback). */
        hurt: (n: number) => incanter.takeHit(n, incanter.physicsPosition.clone().add(new THREE.Vector3(1, 0, 0)), 2),
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
  const progressHud = new ProgressHud(hud);
  const unitFrame = new UnitFrame(hud);
  const offscreen = new OffscreenMarkers(hud);
  const showTitle = (): void => progressHud.titleCard(progress.floor, floor.spec.name, floorSubtitle(floor.spec.biome, progress.bossFloor));
  let titleShown = false;
  const showProgress = (): void => {
    unitFrame.setLevel(progress.level);
    progressHud.setXp(progress.level, progress.xpFraction, progress.xp, xpToNext(progress.level));
    progressHud.setFloor(progress.floor, floor.spec.name, progress.bossFloor);
  };
  showProgress();
  /** A kill: experience, maybe a level, and orbs to pick up. */
  const onKill = (archetype: keyof typeof XP_FOR, at: { x: number; y: number; z: number }): void => {
    const xp = XP_FOR[archetype];
    const before = progress.stats;
    const gained = progress.addXp(xp);
    progressHud.xpGained(xp);
    if (gained > 0) {
      const after = progress.stats;
      incanter.health.max = after.maxHp;
      incanter.health.heal(after.maxHp);
      runner.resources.max = after.maxMana;
      runner.resources.regen = after.manaRegen;
      runner.resources.mana = after.maxMana;
      progressHud.levelUp(progress.level, `+${after.maxHp - before.maxHp} HP · +${after.maxMana - before.maxMana} mana · fully restored`);
      sfx.play('levelUp');
      vfx.deathBurst(incanter.position.clone().setY(incanter.position.y + 0.4), '#ffd36a', true);
    }
    showProgress();
    const drops: PickupKind[] =
      archetype === 'boss' ? ['health', 'health', 'mana', 'mana', 'mana'] : archetype === 'tank' ? ['health', 'mana'] : Math.random() < 0.45 ? [Math.random() < 0.5 ? 'health' : 'mana'] : [];
    for (const k of drops) pickups.drop(at, incanter.feetY, k);
  };
  const damageNumbers = new DamageNumbers(hud);
  const debug = new DebugOverlay(hud);

  window.addEventListener('resize', () => {
    cam.setAspect(window.innerWidth / window.innerHeight);
    renderer.setPixelRatio(basePixelRatio() * quality.current.resolution);
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
  /** Seconds of hit-stop left (time nearly frozen after a heavy hit or a kill). */
  let hitStop = 0;
  let clearedTimer = 0;

  renderer.setAnimationLoop((time) => {
    renderer.info.reset();
    timer.update(time);
    const frozen = paused || loading;
    const rawDt = timer.getDelta(); // also keeps the clock moving while frozen, so unpausing doesn't jump
    // During hit-stop the world crawls at 5% speed (the HUD and camera still run on rawDt).
    const stopped = hitStop > 0;
    hitStop = Math.max(0, hitStop - rawDt);
    const dt = frozen ? 0 : Math.min(rawDt, MAX_FRAME) * (stopped ? 0.05 : 1);
    // Measure on the start screen too (the scene still renders): changes made there are invisible.
    if (loading) quality.reset();
    else if (!pendingQuality) {
      const next = quality.sample(rawDt);
      if (next) {
        if (paused || quality.lastMedian > SEVERE_FRAME_MS) applyQuality(next);
        else pendingQuality = next; // applied behind the next floor-change curtain
      }
    }
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

    // Packs fight together: a fighting enemy wakes idle ones near it. The last two of a wave hunt
    // the Incanter from anywhere, so a floor never ends in a search for stragglers.
    if (!frozen) {
      let alive = 0;
      for (const e of enemies) if (e.alive) alive++;
      for (const e of enemies) {
        if (!e.alive) continue;
        if (alive <= 2) e.hunting = true;
        if (e.state !== 'chase' && e.state !== 'attack') continue;
        for (const o of enemies) {
          if (o !== e && o.state === 'idle' && o.physicsPosition.distanceToSquared(e.physicsPosition) < 144) o.alert();
        }
      }
    }

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
    } else if (hadEnemies && !clearedShown && !spawningWave && enemies.every((e) => !e.alive) && waveIndex < waves.length - 1) {
      // Next wave: a short beat, then reinforcements burst in around the Incanter.
      waveIndex++;
      const last = waveIndex === waves.length - 1;
      const bossNext = waves[waveIndex]?.some((g) => g.enemy.archetype === 'boss');
      healthBars.showBanner(bossNext ? 'The guardian stirs…' : last ? 'Final wave' : `Wave ${waveIndex + 1}`);
      clearedTimer = 2;
      sfx.play('gate');
      spawnWave(floor, generation);
    } else if (hadEnemies && !clearedShown && !spawningWave && enemies.every((e) => !e.alive)) {
      clearedShown = true;
      clearedTimer = CLEARED_BANNER_TIME;
      healthBars.showBanner('Floor cleared: a gate opens');
      sfx.play('cleared');
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
    // Feedback from this frame's combat: damage numbers, hurt flash, deaths.
    for (const ev of drainCombat()) {
      if (ev.kind === 'damage') {
        damageNumbers.show(ev.at, ev.amount, { player: ev.target === 'player', ...(ev.color ? { color: ev.color } : {}), ...(ev.overTime ? { overTime: true } : {}) });
        if (ev.target === 'player') {
          healthBars.hurt();
          sfx.play('hurt');
          cam.shake(Math.min(0.45, 0.18 + ev.amount / 60));
        }
        // Hit-stop: a heavy blow freezes time for a few frames.
        else if (ev.amount >= 25 && !ev.overTime) hitStop = Math.max(hitStop, 0.045);
      } else {
        const big = ev.archetype === 'tank' || ev.archetype === 'boss';
        soundAt(big ? 'bigDeath' : 'death', ev.at);
        vfx.deathBurst(new THREE.Vector3(ev.at.x, ev.at.y, ev.at.z), ev.archetype === 'boss' ? '#ff5ad0' : '#a98bff', big);
        if (ev.archetype in XP_FOR) onKill(ev.archetype as keyof typeof XP_FOR, ev.at);
        hitStop = Math.max(hitStop, ev.archetype === 'boss' ? 0.25 : big ? 0.1 : 0.06);
        if (big) cam.shake(0.35);
      }
    }
    if (incanter.isDodging && !wasDodging) {
      sfx.play('dodge');
      cam.kick(3);
    }
    wasDodging = incanter.isDodging;

    cam.update(incanter.position, dt, incanter.alive ? incanter.aimPoint : undefined);
    if (bossIntro && !paused) bossIntroDelay -= rawDt;
    if (bossIntro && !paused && bossIntroDelay <= 0) {
      healthBars.showBanner(`${bossIntro.spec.id} awakens`);
      clearedTimer = CLEARED_BANNER_TIME; // the cleared-banner timer hides it again
      sfx.play('bossRoar');
      cam.shake(0.5);
      hooks.onBossAwake?.(bossIntro.spec.id);
      bossIntro = undefined;
    }
    damageNumbers.update(dt, cam.camera);
    for (const kind of pickups.update(dt, incanter.position, incanter.feetY)) {
      if (!incanter.alive) break;
      if (kind === 'health') incanter.health.heal(incanter.health.max * 0.2);
      else runner.resources.mana = Math.min(runner.resources.max, runner.resources.mana + runner.resources.max * 0.25);
      sfx.play('pickup');
    }
    vfx.update(dt, cam.camera, renderer.domElement.height);

    aimMarker.position.set(incanter.aimPoint.x, incanter.aimPoint.y + 0.02, incanter.aimPoint.z);

    // Keep the shadow frustum centred on the Incanter.
    floor.sun.position.copy(incanter.position).add(sunOffset);
    floor.sun.target.position.copy(incanter.position);

    postFx.render(dt);
    if (removeWarm && --warmFrames <= 0) {
      removeWarm();
      removeWarm = undefined;
    }
    input.endFrame();

    healthBars.update(enemies, incanter.health, cam.camera, incanter.position);
    progressHud.updateBoss(enemies);
    offscreen.update(enemies, cam.camera);
    castHud.update(dt, runner.resources);
    const alive = enemies.filter((e) => e.alive);
    debug.update(
      dt,
      renderer,
      `${floor.spec.name} · ${incanter.isGrounded ? 'grounded' : 'airborne'} · dodge ${incanter.dodgeReady ? 'ready' : 'cooling'}\n` +
        `enemies ${alive.length}: ${alive.map((e) => `${e.profile.label}:${e.state}${e.status.dominant !== 'none' ? `(${e.status.dominant})` : ''}`).join(' ')}\n` +
        `mana ${Math.floor(runner.resources.mana)} · casts ${runner.activeCasts} · fx ${vfx.activeEffects} · particles ${vfx.particles.count}\n` +
        `quality ${quality.current.label}`,
    );
  });

  return {
    setPaused(p) {
      paused = p;
      if (!p && !titleShown) {
        titleShown = true;
        showTitle();
      }
      quality.reset();
      if (pendingQuality) applyQuality(pendingQuality);
      pendingQuality = undefined;
      input.clear();
    },
    async loadFloor(spec) {
      loading = true;
      quality.reset();
      if (pendingQuality) applyQuality(pendingQuality);
      pendingQuality = undefined;
      try {
        generation++; // drop any spawn still in flight for the old floor
        for (const e of enemies) e.dispose();
        enemies = [];
        hadEnemies = false;
        clearedTimer = 0;
        // Leaving through the open gate climbs a floor; reshaping the current floor does not.
        if (gate) progress.floor++;
        pickups.clear();
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
        warmEffects(); // behind the curtain
        spawnFor(floor);
        showProgress();
        window.setTimeout(showTitle, 450); // after the reshape curtain lifts
      } finally {
        loading = false;
        input.clear();
      }
      return floor.spec;
    },
    currentFloor: () => floor.spec,
    floorNumber: () => progress.floor,
    castIncantation,
    setBar(slots) {
      bar = [...slots];
      castHud.setSlots(bar);
    },
    atGate: () => inGate,
    hooks,
  };
}
