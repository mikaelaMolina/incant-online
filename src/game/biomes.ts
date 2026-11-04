import type { Biome, TimeOfDay } from '../schemas/floorSpec';

export interface BiomePreset {
  /** Ground colour and per-vertex variation. */
  ground: string;
  groundVariation: number;
  /** Sky / fog colour at full daylight. */
  sky: string;
  /** Hemisphere light's ground bounce colour. */
  bounce: string;
}

export const BIOMES: Record<Biome, BiomePreset> = {
  forest: { ground: '#3f6b35', groundVariation: 0.12, sky: '#9cc7e8', bounce: '#2d4a22' },
  ruins: { ground: '#6b6a5c', groundVariation: 0.1, sky: '#a9b4c8', bounce: '#4a4639' },
  ice: { ground: '#d6e6f2', groundVariation: 0.05, sky: '#c9dcf0', bounce: '#9fb8cc' },
  desert: { ground: '#d4b483', groundVariation: 0.08, sky: '#f0d9a8', bounce: '#a9825a' },
  cavern: { ground: '#3b3631', groundVariation: 0.1, sky: '#1c1a1f', bounce: '#2a2420' },
  castle: { ground: '#7a7468', groundVariation: 0.07, sky: '#b8c2d4', bounce: '#57524a' },
  void: { ground: '#1d1a33', groundVariation: 0.15, sky: '#07060f', bounce: '#3b2a6b' },
};

export interface TimePreset {
  sunColor: string;
  sunIntensity: number;
  /** Sun elevation in degrees above the horizon. */
  sunElevation: number;
  hemiIntensity: number;
  /** Multiplies the biome sky colour. */
  skyTint: string;
}

export const TIMES: Record<TimeOfDay, TimePreset> = {
  dawn: { sunColor: '#ffc89a', sunIntensity: 2.0, sunElevation: 25, hemiIntensity: 1.1, skyTint: '#e8b9a8' },
  day: { sunColor: '#fff6e8', sunIntensity: 2.6, sunElevation: 60, hemiIntensity: 1.2, skyTint: '#ffffff' },
  dusk: { sunColor: '#ffa36b', sunIntensity: 2.0, sunElevation: 25, hemiIntensity: 1.1, skyTint: '#b47a8a' },
  night: { sunColor: '#8fa6ff', sunIntensity: 1.0, sunElevation: 45, hemiIntensity: 0.8, skyTint: '#2a3050' },
};

/** Map FloorSpec fog_density (0–1) to THREE.FogExp2 density. 0.5 ≈ haze starting ~20 m away. */
export function fogDensity(normalised: number): number {
  return 0.004 + normalised * 0.05;
}
