import * as THREE from 'three';

/** Fixed-angle third-person camera that smoothly trails a target. */
export class FollowCamera {
  readonly camera: THREE.PerspectiveCamera;
  /** Offset from the target (behind and above). */
  private readonly offset = new THREE.Vector3(0, 9, 9);
  private readonly lookOffset = new THREE.Vector3(0, 1, 0);
  /** Higher = snappier. Frame-rate independent. */
  private readonly stiffness = 8;
  private readonly desired = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 200);
  }

  /** Camera's forward direction flattened onto the ground plane (unit x/z), for camera-relative movement. */
  groundForward(): { x: number; z: number } {
    const len = Math.hypot(this.offset.x, this.offset.z) || 1;
    return { x: -this.offset.x / len, z: -this.offset.z / len };
  }

  snapTo(target: THREE.Vector3): void {
    this.camera.position.copy(target).add(this.offset);
    this.camera.lookAt(this.lookAt.copy(target).add(this.lookOffset));
  }

  update(target: THREE.Vector3, dt: number): void {
    this.desired.copy(target).add(this.offset);
    const t = 1 - Math.exp(-this.stiffness * dt);
    this.camera.position.lerp(this.desired, t);
    this.lookAt.copy(this.camera.position).sub(this.offset).add(this.lookOffset);
    this.camera.lookAt(this.lookAt);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
