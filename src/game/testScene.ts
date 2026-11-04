import * as THREE from 'three';
import { RAPIER } from './physics';

export interface TestScene {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  aimMarker: THREE.Mesh;
}

/**
 * Empty test arena for movement: flat ground plus a few blocks, a step and a ramp
 * to check collisions, autostep and slopes. Temporary until the FloorSpec loader exists.
 */
export function createTestScene(world: RAPIER.World): TestScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0b0d1a');
  scene.fog = new THREE.Fog('#0b0d1a', 25, 60);

  scene.add(new THREE.HemisphereLight('#9fb4ff', '#1a1020', 0.9));
  const sun = new THREE.DirectionalLight('#ffffff', 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0005;
  const s = sun.shadow.camera;
  s.left = -15;
  s.right = 15;
  s.top = 15;
  s.bottom = -15;
  s.near = 1;
  s.far = 50;
  scene.add(sun, sun.target);

  const groundMat = new THREE.MeshStandardMaterial({ color: '#262b40', roughness: 1 });
  const blockMat = new THREE.MeshStandardMaterial({ color: '#45507a', roughness: 0.8 });

  // Ground: 40 × 40, top surface at y = 0.
  addBox(scene, world, [40, 1, 40], [0, -0.5, 0], groundMat, { castShadow: false });

  const grid = new THREE.GridHelper(40, 40, '#3c4570', '#2f3654');
  grid.position.y = 0.01;
  scene.add(grid);

  // Obstacles.
  addBox(scene, world, [2, 2, 2], [6, 1, -4], blockMat);
  addBox(scene, world, [1, 3, 6], [-7, 1.5, -2], blockMat);
  addBox(scene, world, [8, 1.5, 1], [0, 0.75, -10], blockMat);
  // Low step (0.3 m): should be walked up via autostep.
  addBox(scene, world, [3, 0.3, 3], [-3, 0.15, 5], blockMat);
  // Ramp (~25°) up onto a platform.
  const rampAngle = THREE.MathUtils.degToRad(25);
  const rampLen = 6;
  const rise = Math.sin(rampAngle) * rampLen;
  addBox(scene, world, [3, 0.4, rampLen], [8, rise / 2, 5], blockMat, { rotX: rampAngle });
  // Platform at the ramp's high (-Z) end; its top meets the ramp's top surface.
  const platformZ = 5 - (Math.cos(rampAngle) * rampLen) / 2 - 1.5;
  addBox(scene, world, [3, 0.4, 3], [8, rise, platformZ], blockMat);

  // Aim marker on the ground under the mouse.
  const aimMarker = new THREE.Mesh(
    new THREE.RingGeometry(0.25, 0.35, 24),
    new THREE.MeshBasicMaterial({ color: '#7cd6ff', transparent: true, opacity: 0.8, depthWrite: false }),
  );
  aimMarker.rotation.x = -Math.PI / 2;
  scene.add(aimMarker);

  return { scene, sun, aimMarker };
}

function addBox(
  scene: THREE.Scene,
  world: RAPIER.World,
  size: [number, number, number],
  pos: [number, number, number],
  material: THREE.Material,
  opts: { rotX?: number; castShadow?: boolean } = {},
): void {
  const [w, h, d] = size;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(...pos);
  if (opts.rotX) mesh.rotation.x = opts.rotX;
  mesh.castShadow = opts.castShadow ?? true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  const q = mesh.quaternion;
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2)
      .setTranslation(pos[0], pos[1], pos[2])
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
  );
}
