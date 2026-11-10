import type { Biome, TimeOfDay } from '../schemas/floorSpec';

/** Ambient particles that drift around the Incanter (fireflies, snow, dust, embers …). */
export interface MotePreset {
  color: string;
  /** HDR multiplier: above ~1.6 the motes bloom (fireflies, embers); below, they read as dust or snow. */
  glow: number;
  /** World size in metres. */
  size: number;
  count: number;
  /** Vertical speed in m/s: positive rises (embers), negative falls (snow). */
  rise: number;
  /** Sideways sway in metres. */
  drift: number;
  /** Twinkle on and off (fireflies, sparks). */
  flicker: boolean;
}

export interface BiomePreset {
  /** Ground colour and per-vertex variation. */
  ground: string;
  groundVariation: number;
  /** Horizon / fog colour at full daylight. */
  sky: string;
  /** Sky colour straight up (the dome blends from the horizon into it). */
  zenith: string;
  /** Hemisphere light's ground bounce colour. */
  bounce: string;
  motes: MotePreset;
}

export const BIOMES: Record<Biome, BiomePreset> = {
  forest: {
    ground: '#4a7a3a', groundVariation: 0.14, sky: '#b5d8ee', zenith: '#4f8fd6', bounce: '#3a5a26',
    motes: { color: '#d8ff7a', glow: 2.6, size: 0.13, count: 110, rise: 0.12, drift: 0.5, flicker: true },
  },
  ruins: {
    ground: '#77745f', groundVariation: 0.12, sky: '#c2cad6', zenith: '#6f88b8', bounce: '#5a5340',
    motes: { color: '#f3e6c4', glow: 1.1, size: 0.07, count: 140, rise: 0.05, drift: 0.35, flicker: false },
  },
  ice: {
    ground: '#dbe9f4', groundVariation: 0.05, sky: '#d6e6f5', zenith: '#6fa8e0', bounce: '#a9c4dc',
    motes: { color: '#ffffff', glow: 1.15, size: 0.09, count: 260, rise: -0.9, drift: 0.55, flicker: false },
  },
  desert: {
    ground: '#dcb985', groundVariation: 0.09, sky: '#f6e2b8', zenith: '#6fa6d8', bounce: '#b88a5a',
    motes: { color: '#f2d29a', glow: 1.0, size: 0.06, count: 170, rise: 0.03, drift: 1.2, flicker: false },
  },
  cavern: {
    ground: '#443d36', groundVariation: 0.12, sky: '#2a2228', zenith: '#0d0b10', bounce: '#3a2a20',
    motes: { color: '#ff8a3a', glow: 3.0, size: 0.08, count: 120, rise: 0.6, drift: 0.25, flicker: true },
  },
  castle: {
    ground: '#827b6e', groundVariation: 0.08, sky: '#c6cfdf', zenith: '#5f7fb8', bounce: '#625a4e',
    motes: { color: '#ffe7b0', glow: 1.4, size: 0.06, count: 120, rise: 0.08, drift: 0.3, flicker: false },
  },
  void: {
    ground: '#231e3d', groundVariation: 0.16, sky: '#1a1230', zenith: '#040209', bounce: '#4a3480',
    motes: { color: '#b48cff', glow: 3.0, size: 0.08, count: 160, rise: 0.3, drift: 0.4, flicker: true },
  },
};

export interface TimePreset {
  sunColor: string;
  sunIntensity: number;
  /** Sun elevation in degrees above the horizon. */
  sunElevation: number;
  hemiIntensity: number;
  /** Multiplies the biome sky colours. */
  skyTint: string;
  /** Cool back light that outlines characters against the ground. */
  rimColor: string;
  rimIntensity: number;
  /** How visible the stars are (0–1). */
  stars: number;
}

export const TIMES: Record<TimeOfDay, TimePreset> = {
  dawn: { sunColor: '#ffc89a', sunIntensity: 2.4, sunElevation: 25, hemiIntensity: 1.15, skyTint: '#f0c4b4', rimColor: '#9fb8ff', rimIntensity: 0.8, stars: 0.15 },
  day: { sunColor: '#fff4e2', sunIntensity: 2.9, sunElevation: 58, hemiIntensity: 1.25, skyTint: '#ffffff', rimColor: '#cfe0ff', rimIntensity: 0.6, stars: 0 },
  dusk: { sunColor: '#ff9a5e', sunIntensity: 2.4, sunElevation: 22, hemiIntensity: 1.1, skyTint: '#c88a9a', rimColor: '#8fa0ff', rimIntensity: 0.9, stars: 0.35 },
  // Moonlit rather than black: readable, cool, with a starry sky and blooming fireflies or embers.
  night: { sunColor: '#b4c6ff', sunIntensity: 2.1, sunElevation: 45, hemiIntensity: 1.4, skyTint: '#4a5a96', rimColor: '#7f9aff', rimIntensity: 1.1, stars: 1 },
};

/** Map FloorSpec fog_density (0–1) to THREE.FogExp2 density. 0.5 ≈ haze starting ~20 m away. */
export function fogDensity(normalised: number): number {
  return 0.004 + normalised * 0.05;
}
