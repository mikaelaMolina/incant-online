import * as THREE from 'three';
import { createPhysicsWorld, FIXED_DT } from './physics';
import { Input } from './input';
import { FollowCamera } from './camera';
import { Incanter } from './player';
import { createTestScene } from './testScene';
import { DebugOverlay } from '../ui/debugOverlay';

/** Longest frame we simulate; avoids a "spiral of death" after a tab switch or hitch. */
const MAX_FRAME = 0.1;
const MAX_STEPS = 5;

export async function startGame(canvas: HTMLCanvasElement, hud: HTMLElement): Promise<void> {
  const world = await createPhysicsWorld();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const { scene, sun, aimMarker } = createTestScene(world);
  const input = new Input(canvas);
  const cam = new FollowCamera(window.innerWidth / window.innerHeight);
  const incanter = new Incanter(world, input, cam);
  scene.add(incanter.object);
  cam.snapTo(incanter.position);

  const debug = new DebugOverlay(hud);

  window.addEventListener('resize', () => {
    cam.setAspect(window.innerWidth / window.innerHeight);
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const sunOffset = new THREE.Vector3(6, 12, 5);
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
    sun.position.copy(incanter.position).add(sunOffset);
    sun.target.position.copy(incanter.position);

    renderer.render(scene, cam.camera);
    input.endFrame();

    debug.update(
      dt,
      renderer,
      `${incanter.isGrounded ? 'grounded' : 'airborne'} · dodge ${incanter.dodgeReady ? 'ready' : 'cooling'}`,
    );
  });
}
