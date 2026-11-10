import * as THREE from 'three';
import {
  BloomEffect,
  BrightnessContrastEffect,
  EffectComposer,
  EffectPass,
  HueSaturationEffect,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';

/**
 * Post-processing: bloom, then a filmic look. Renders into a half-float buffer so HDR colours
 * (> 1.0) survive; the bloom threshold sits above what sunlit scenery reaches, so only Incantation
 * VFX (pushed to 2–6× in materials.ts), glowing motes and particles bloom. After bloom: neutral
 * tone mapping (keeps hues, rolls off highlights instead of clipping), a touch of saturation and
 * contrast, and a soft vignette. All effects merge into one fullscreen pass.
 */
export const BLOOM_THRESHOLD = 1.6;

export class PostFx {
  private readonly composer: EffectComposer;
  private readonly maxSamples: number;
  readonly bloom: BloomEffect;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.maxSamples = renderer.capabilities.isWebGL2 ? renderer.capabilities.maxSamples : 0;
    this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: Math.min(4, this.maxSamples) });
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new BloomEffect({
      luminanceThreshold: BLOOM_THRESHOLD,
      luminanceSmoothing: 0.3,
      intensity: 1.1,
      radius: 0.7,
      mipmapBlur: true,
      // 5 MIP levels instead of 8: looks the same at game resolutions, ~6 fewer draw calls a frame.
      levels: 5,
    });
    this.composer.addPass(
      new EffectPass(
        camera,
        this.bloom,
        new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }),
        new HueSaturationEffect({ saturation: 0.12 }),
        new BrightnessContrastEffect({ contrast: 0.08 }),
        new VignetteEffect({ offset: 0.32, darkness: 0.5 }),
      ),
    );
  }

  /** The buffer the scene is drawn into (shaders compile per target: see precompile in game.ts). */
  get sceneTarget(): THREE.WebGLRenderTarget {
    return this.composer.inputBuffer;
  }

  /** MSAA samples for the scene buffer (adaptive quality). */
  setSamples(samples: number): void {
    const n = Math.min(samples, this.maxSamples);
    if (this.composer.multisampling !== n) this.composer.multisampling = n;
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
