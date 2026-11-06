import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FollowCamera } from './camera';

const step = (cam: FollowCamera, target: THREE.Vector3, seconds: number, aim?: THREE.Vector3) => {
  for (let t = 0; t < seconds; t += 1 / 60) cam.update(target, 1 / 60, aim);
};

describe('FollowCamera', () => {
  it('settles behind and above the target', () => {
    const cam = new FollowCamera(16 / 9, false);
    const target = new THREE.Vector3(3, 0.85, -2);
    cam.snapTo(new THREE.Vector3());
    step(cam, target, 3);
    expect(cam.camera.position.x).toBeCloseTo(3, 1);
    expect(cam.camera.position.y).toBeCloseTo(9.85, 1);
  });

  it('looks ahead toward the aim, but never more than 2.6 m', () => {
    const cam = new FollowCamera(16 / 9, false);
    const target = new THREE.Vector3(0, 0.85, 0);
    cam.snapTo(target);
    step(cam, target, 4, new THREE.Vector3(40, 0, 0));
    expect(cam.camera.position.x).toBeGreaterThan(2);
    expect(cam.camera.position.x).toBeLessThanOrEqual(2.61);
  });

  it('shake decays to nothing in about a second', () => {
    const cam = new FollowCamera(16 / 9, false);
    const target = new THREE.Vector3();
    cam.snapTo(target);
    cam.shake(0.8);
    step(cam, target, 0.1);
    expect(cam.currentTrauma).toBeGreaterThan(0.5);
    step(cam, target, 1);
    expect(cam.currentTrauma).toBe(0);
  });

  it('FOV kick springs back to 55°', () => {
    const cam = new FollowCamera(16 / 9, false);
    cam.kick(8);
    step(cam, new THREE.Vector3(), 0.05);
    expect(cam.camera.fov).toBeGreaterThan(58);
    step(cam, new THREE.Vector3(), 2);
    expect(cam.camera.fov).toBeCloseTo(55, 1);
  });

  it('no shake and no FOV kick with reduced motion', () => {
    const cam = new FollowCamera(16 / 9, true);
    cam.shake(1);
    cam.kick(10);
    step(cam, new THREE.Vector3(), 0.1);
    expect(cam.currentTrauma).toBe(0);
    expect(cam.camera.fov).toBe(55);
  });
});
