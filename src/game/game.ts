import * as THREE from 'three';
import { createPhysicsWorld, FIXED_DT } from './physics';
import { Input } from './input';
import { FollowCamera } from './camera';
import { Incanter } from './player';
import { loadManifest, ModelIndex } from './assets';
import { buildFloor, type Floor } from './floorLoader';
import { STARTING_ARENA } from '../fallback/floors';
import { DebugOverlay } from '../ui/debugOverlay';

/** Longest frame we simulate; avoids a "spiral of death" after a tab switch or hitch. */
const MAX_FRAME = 0.1;
const MAX_STEPS = 5;

export async function startGame(canvas: HTMLCanvasElement, hud: HTMLElement): Promise<void> {
  const [world, manifest] = await Promise.all([createPhysicsWorld(), loadManifest()]);
  const models = new ModelIndex(manifest);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const floor: Floor = await buildFloor(STARTING_ARENA, { scene, world, models });
  if (floor.warnings.length) console.info(`Floor "${floor.spec.name}":`, floor.warnings);

  const input = new Input(canvas);
  const cam = new FollowCamera(window.innerWidth / window.innerHeight);
  const incanter = new Incanter(world, input, cam);
  scene.add(incanter.object);
  incanter.setSpawn(floor.spawn);
  cam.snapTo(incanter.position);

  const aimMarker = new THREE.Mesh(
    new THREE.RingGeometry(0.25, 0.35, 24),
    new THREE.MeshBasicMaterial({ color: '#7cd6ff', transparent: true, opacity: 0.8, depthWrite: false }),
  );
  aimMarker.rotation.x = -Math.PI / 2;
  scene.add(aimMarker);

  const debug = new DebugOverlay(hud);

  window.addEventListener('resize', () => {
    cam.setAspect(window.innerWidth / window.innerHeight);
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Colliders were just added; update the query pipeline before the first character move.
  world.step();

  const sunOffset = floor.sun.position.clone();
  const timer = new THREE.Timer();
  timer.connect(document); // pause-aware: no huge delta after returning to the tab
  let accumulator = 0;

  renderer.setAnimationLoop((time) => {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), MAX_FRAME);
    accumulator += dt;

    incanter.frameInput();

    let steps = 0;
    while (accumulator >= FIXED_DT && steps < MAX_STEPS) {
      incanter.fixedUpdate(FIXED_DT);
      world.step();
      incanter.postStep();
      accumulator -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_STEPS) accumulator = 0;

    incanter.render(accumulator / FIXED_DT, dt);
    cam.update(incanter.position, dt);

    aimMarker.position.set(incanter.aimPoint.x, incanter.aimPoint.y + 0.02, incanter.aimPoint.z);

    // Keep the shadow frustum centred on the Incanter.
    floor.sun.position.copy(incanter.position).add(sunOffset);
    floor.sun.target.position.copy(incanter.position);

    renderer.render(scene, cam.camera);
    input.endFrame();

    debug.update(
      dt,
      renderer,
      `${floor.spec.name} · ${incanter.isGrounded ? 'grounded' : 'airborne'} · dodge ${incanter.dodgeReady ? 'ready' : 'cooling'}`,
    );
  });
}
