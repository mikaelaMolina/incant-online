import * as THREE from 'three';
import { BloomEffect, EffectComposer, EffectPass, RenderPass } from 'postprocessing';

/**
 * Bloom pass. Renders into a half-float buffer so HDR colours (> 1.0) survive; the threshold sits
 * above what sunlit scenery reaches, so only Incantation VFX (pushed to 2–6× in materials.ts),
 * the Incanter's visor and particles glow.
 */
export const BLOOM_THRESHOLD = 1.6;

export class PostFx {
  private readonly composer: EffectComposer;
  readonly bloom: BloomEffect;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const samples = renderer.capabilities.isWebGL2 ? Math.min(4, renderer.capabilities.maxSamples) : 0;
    this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: samples });
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new BloomEffect({
      luminanceThreshold: BLOOM_THRESHOLD,
      luminanceSmoothing: 0.3,
      intensity: 1.1,
      radius: 0.7,
      mipmapBlur: true,
    });
    this.composer.addPass(new EffectPass(camera, this.bloom));
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  render(dt: number): void {
    this.composer.render(dt);
  }

  dispose(): void {
    this.composer.dispose();
  }
}
