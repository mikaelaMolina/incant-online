import * as THREE from 'three';
import type { Element, IncantationSpec, Particles } from '../schemas/incantationSpec';

/** Colours and defaults for one cast. `primary` comes from the spec's vfx.color; the rest from the element. */
export interface Palette {
  primary: THREE.Color;
  /** Hot core / highlight colour. */
  core: THREE.Color;
  /** Accent for particles and secondary layers. */
  accent: THREE.Color;
  particles: Particles;
  trail: boolean;
  /** HDR multiplier: how far above the bloom threshold this element glows. */
  glow: number;
}

interface ElementStyle {
  core: string;
  accent: string;
  particles: Particles;
  glow: number;
}

/** Per-element look. The spec's own colour always wins for the main layer. */
export const ELEMENT_STYLES: Record<Element, ElementStyle> = {
  physical: { core: '#ffffff', accent: '#c9d2e0', particles: 'sparks', glow: 2.2 },
  fire: { core: '#fff1a8', accent: '#ff3d00', particles: 'embers', glow: 4 },
  ice: { core: '#ffffff', accent: '#6fc8ff', particles: 'frost', glow: 3 },
  lightning: { core: '#ffffff', accent: '#9fd0ff', particles: 'sparks', glow: 5 },
  wind: { core: '#f2fff6', accent: '#7fe0a8', particles: 'leaves', glow: 2.4 },
  light: { core: '#ffffff', accent: '#ffe27a', particles: 'motes', glow: 4.5 },
  shadow: { core: '#e6d4ff', accent: '#5a2a9a', particles: 'smoke', glow: 3 },
};

export function paletteFor(spec: Pick<IncantationSpec, 'element' | 'vfx'>): Palette {
  const style = ELEMENT_STYLES[spec.element];
  return {
    primary: new THREE.Color(spec.vfx.color),
    core: new THREE.Color(style.core),
    accent: new THREE.Color(style.accent),
    particles: spec.vfx.particles ?? style.particles,
    trail: spec.vfx.trail,
    glow: style.glow,
  };
}

/** Status tints for enemies (emissive RGB, 0–1). */
export const STATUS_TINT = {
  burn: new THREE.Color(0.6, 0.2, 0.02),
  freeze: new THREE.Color(0.25, 0.55, 0.95),
  stun: new THREE.Color(0.6, 0.55, 0.1),
  slow: new THREE.Color(0.28, 0.1, 0.45),
} as const;

export const STATUS_PARTICLES: Record<keyof typeof STATUS_TINT, { kind: Particles; color: THREE.Color }> = {
  burn: { kind: 'embers', color: new THREE.Color('#ff7a1a') },
  freeze: { kind: 'frost', color: new THREE.Color('#bfe9ff') },
  stun: { kind: 'sparks', color: new THREE.Color('#fff36a') },
  slow: { kind: 'smoke', color: new THREE.Color('#8a5ad0') },
};
