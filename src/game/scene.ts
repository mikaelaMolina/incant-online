import * as THREE from 'three';

export interface GameScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  start(): void;
}

/** Placeholder scene: a lit ground plane and a marker cube. Replaced by the floor loader later. */
export function createScene(canvas: HTMLCanvasElement): GameScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0b0d1a');
  scene.fog = new THREE.FogExp2('#0b0d1a', 0.03);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 8, 12);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.HemisphereLight('#9fb4ff', '#1a1020', 0.8));
  const sun = new THREE.DirectionalLight('#ffffff', 1.2);
  sun.position.set(5, 10, 4);
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(20, 48),
    new THREE.MeshStandardMaterial({ color: '#2a2f45' }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const marker = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: '#7cc4ff', emissive: '#1a3a66' }),
  );
  marker.position.y = 0.5;
  scene.add(marker);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const clock = new THREE.Clock();
  return {
    renderer,
    scene,
    camera,
    start() {
      renderer.setAnimationLoop(() => {
        marker.rotation.y += clock.getDelta();
        renderer.render(scene, camera);
      });
    },
  };
}
