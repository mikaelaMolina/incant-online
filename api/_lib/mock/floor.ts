import type { Biome, FloorSize, TimeOfDay, GeneratedProp } from '../../../src/schemas/floorSpec.js';
import { FLOOR_HALF_EXTENT } from '../../../src/schemas/floorSpec.js';
import type { EnemySpec } from '../../../src/schemas/enemySpec.js';
import { CREATURE_WORDS, monsterFor } from '../../../src/schemas/monsters.js';
import { countFor, findKeyword, hasAny, pick, seededRandom } from './words.js';

/** Raw FloorSpec as the mock "LLM" would emit it (validated by FloorSpec later). */
export interface RawFloor {
  name: string;
  biome: Biome;
  lighting: { time_of_day: TimeOfDay; fog_density: number; ambient_color: string };
  size: FloorSize;
  props: { model: string; x: number; z: number; rotation: number; scale: number; tint?: string }[];
  generated_props: GeneratedProp[];
  spawns: { enemy: Omit<EnemySpec, 'phases'> & { phases: [] }; count: number }[];
}

/** Unambiguous place words. "ice"/"snow" are biome hints only when a place is also named. */
export const BIOME_WORDS: ReadonlyArray<readonly [string, Biome]> = [
  ['forest*', 'forest'], ['wood', 'forest'], ['woods', 'forest'], ['woodland*', 'forest'], ['jungle', 'forest'], ['grove', 'forest'], ['meadow*', 'forest'], ['glade', 'forest'],
  ['castle*', 'castle'], ['fortress', 'castle'], ['keep', 'castle'], ['citadel', 'castle'], ['palace', 'castle'], ['stronghold', 'castle'], ['bastion', 'castle'],
  ['desert*', 'desert'], ['dune*', 'desert'], ['sand*', 'desert'], ['oasis', 'desert'], ['wasteland*', 'desert'],
  ['cave', 'cavern'], ['caves', 'cavern'], ['cavern*', 'cavern'], ['dungeon*', 'cavern'], ['underground', 'cavern'], ['mine', 'cavern'], ['grotto', 'cavern'], ['volcano', 'cavern'],
  ['ruin*', 'ruins'], ['temple*', 'ruins'], ['shrine', 'ruins'], ['graveyard', 'ruins'], ['colosseum', 'ruins'], ['arena', 'ruins'],
  ['tundra', 'ice'], ['glacier*', 'ice'], ['icefield*', 'ice'],
  ['abyss', 'void'], ['nowhere', 'void'], ['astral', 'void'], ['cosmos', 'void'], ['space', 'void'],
  // Settlements have no biome of their own: a forest floor with tents, fences and campfires.
  ['village*', 'forest'], ['town*', 'forest'], ['hamlet*', 'forest'], ['settlement*', 'forest'], ['farm*', 'forest'], ['camp', 'forest'], ['campsite', 'forest'],
];
/** Words that turn a floor into a settlement (palette + names), whatever the biome. */
export const SETTLEMENT_WORDS = ['village*', 'town*', 'hamlet*', 'settlement*', 'farm*', 'camp', 'campsite', 'outpost*'];
/**
 * Creatures we have no model for become a boss (a large, hard-hitting enemy) named after them,
 * so "put a dragon on a castle" puts something dragon-sized there.
 */
export const BOSS_WORDS: ReadonlyArray<readonly [string, string]> = [
  ['dragon*', 'Dragon'], ['wyrm*', 'Wyrm'], ['drake*', 'Drake'], ['wyvern*', 'Wyvern'], ['hydra*', 'Hydra'], ['demon*', 'Demon'],
  ['lich*', 'Lich'], ['titan*', 'Titan'], ['behemoth*', 'Behemoth'], ['colossus', 'Colossus'], ['kraken*', 'Kraken'], ['boss*', 'Tyrant'],
  ['king', 'King'], ['queen', 'Queen'], ['lord', 'Lord'], ['beast*', 'Beast'], ['monstrosity', 'Monstrosity'],
];
export const SOFT_BIOME_WORDS: ReadonlyArray<readonly [string, Biome]> = [
  ['ice', 'ice'], ['icy', 'ice'], ['snow*', 'ice'], ['frozen', 'ice'], ['frost*', 'ice'], ['winter', 'ice'],
  ['void', 'void'], ['dark', 'void'],
  ['trees', 'forest'], ['ancient', 'ruins'],
];
export const PLACE_NOUNS = ['floor', 'place', 'level', 'world', 'land*', 'map', 'stage', 'realm', 'zone', 'room', 'room*', 'field*', 'valley', 'island', 'plains', 'battlefield'];

const TIME_WORDS: ReadonlyArray<readonly [string, TimeOfDay]> = [
  ['dawn', 'dawn'], ['morning', 'dawn'], ['sunrise', 'dawn'],
  ['day*', 'day'], ['noon', 'day'], ['sunny', 'day'], ['bright', 'day'],
  ['dusk', 'dusk'], ['sunset', 'dusk'], ['evening', 'dusk'], ['twilight', 'dusk'],
  ['night*', 'night'], ['midnight', 'night'], ['moon*', 'night'], ['dark*', 'night'],
];

interface PropRule {
  model: string;
  weight: number;
  scale: [number, number];
  tint?: string;
}

/** Prop palettes per biome. Every id must exist in public/assets/manifest.json (tested). */
export const PALETTES: Record<Biome, PropRule[]> = {
  forest: [
    { model: 'nature.tree_oak', weight: 4, scale: [0.9, 1.3] },
    { model: 'nature.tree_default', weight: 4, scale: [0.9, 1.3] },
    { model: 'nature.tree_pinetalla', weight: 3, scale: [0.9, 1.2] },
    { model: 'nature.tree_detailed', weight: 2, scale: [0.9, 1.2] },
    { model: 'nature.rock_largea', weight: 1, scale: [0.6, 1] },
    { model: 'nature.stump_old', weight: 1, scale: [0.8, 1.1] },
    { model: 'nature.log', weight: 1, scale: [0.8, 1.1] },
    { model: 'nature.plant_bush', weight: 2, scale: [0.8, 1.2] },
    { model: 'nature.grass_large', weight: 4, scale: [0.7, 1.2] },
    { model: 'nature.flower_reda', weight: 2, scale: [0.7, 1] },
    { model: 'nature.flower_yellowa', weight: 2, scale: [0.7, 1] },
    { model: 'nature.mushroom_red', weight: 1, scale: [0.7, 1] },
  ],
  ruins: [
    { model: 'nature.statue_column', weight: 3, scale: [0.9, 1.1] },
    { model: 'nature.statue_columndamaged', weight: 3, scale: [0.9, 1.1] },
    { model: 'nature.statue_obelisk', weight: 1, scale: [0.9, 1.2] },
    { model: 'nature.statue_block', weight: 1, scale: [0.8, 1.1] },
    { model: 'nature.stone_tallb', weight: 1, scale: [0.6, 0.9] },
    { model: 'nature.rock_largec', weight: 1, scale: [0.6, 0.9] },
    { model: 'nature.tree_default_dark', weight: 2, scale: [0.9, 1.2] },
    { model: 'nature.grass', weight: 4, scale: [0.7, 1.2] },
  ],
  ice: [
    { model: 'nature.tree_pinetalla', weight: 4, scale: [0.9, 1.3], tint: '#e4f1ff' },
    { model: 'nature.tree_pineroundc', weight: 3, scale: [0.9, 1.2], tint: '#e4f1ff' },
    { model: 'nature.rock_largea', weight: 2, scale: [0.7, 1.1], tint: '#cfe6ff' },
    { model: 'nature.stone_tallb', weight: 2, scale: [0.6, 1], tint: '#d8ecff' },
    { model: 'nature.rock_smalla', weight: 3, scale: [0.8, 1.3], tint: '#e8f4ff' },
  ],
  desert: [
    { model: 'nature.cactus_tall', weight: 3, scale: [0.8, 1.2] },
    { model: 'nature.cactus_short', weight: 3, scale: [0.8, 1.2] },
    { model: 'nature.tree_palmtall', weight: 2, scale: [0.9, 1.2] },
    { model: 'nature.tree_palmbend', weight: 1, scale: [0.9, 1.2] },
    { model: 'nature.rock_largeb', weight: 2, scale: [0.7, 1.1], tint: '#e8c99a' },
    { model: 'nature.rock_tallc', weight: 2, scale: [0.6, 1], tint: '#e0b98a' },
    { model: 'nature.tent_detailedopen', weight: 1, scale: [0.9, 1] },
    { model: 'nature.campfire_stones', weight: 1, scale: [0.8, 1] },
  ],
  cavern: [
    { model: 'nature.cliff_block_rock', weight: 3, scale: [0.8, 1.2] },
    { model: 'nature.cliff_large_rock', weight: 2, scale: [0.8, 1.1] },
    { model: 'nature.rock_talla', weight: 3, scale: [0.7, 1.2] },
    { model: 'nature.rock_tallg', weight: 2, scale: [0.7, 1.1] },
    { model: 'nature.stone_tallc', weight: 2, scale: [0.6, 1] },
    { model: 'nature.mushroom_tangroup', weight: 2, scale: [0.8, 1.3], tint: '#9fe0ff' },
    { model: 'nature.mushroom_redtall', weight: 1, scale: [0.8, 1.2], tint: '#c79bff' },
  ],
  castle: [
    { model: 'castle.wall', weight: 4, scale: [0.8, 1] },
    { model: 'castle.wall_corner', weight: 2, scale: [0.8, 1] },
    { model: 'castle.tower_square', weight: 2, scale: [0.8, 1] },
    { model: 'castle.tower_hexagon_base', weight: 1, scale: [0.8, 1] },
    { model: 'castle.flag', weight: 2, scale: [0.8, 1] },
    { model: 'castle.siege_catapult', weight: 1, scale: [0.6, 0.8] },
    { model: 'castle.tree_large', weight: 2, scale: [0.8, 1.1] },
    { model: 'castle.rocks_small', weight: 2, scale: [0.6, 1] },
  ],
  void: [
    { model: 'nature.statue_obelisk', weight: 3, scale: [0.9, 1.4], tint: '#b9a0ff' },
    { model: 'nature.statue_ring', weight: 1, scale: [1, 1.4], tint: '#8f7bff' },
    { model: 'nature.rock_tallh', weight: 3, scale: [0.6, 1.1], tint: '#6b4cff' },
    { model: 'nature.stone_talld', weight: 2, scale: [0.6, 1], tint: '#7a5cff' },
    { model: 'nature.statue_head', weight: 1, scale: [0.7, 0.9], tint: '#a08cff' },
  ],
};

/** Settlement props (all in the manifest; tested with the other palettes). */
export const SETTLEMENT_PALETTE: PropRule[] = [
  { model: 'nature.tent_detailedopen', weight: 3, scale: [0.9, 1.1] },
  { model: 'nature.tent_detailedclosed', weight: 3, scale: [0.9, 1.1] },
  { model: 'nature.tent_smallopen', weight: 2, scale: [0.9, 1.1] },
  { model: 'nature.campfire_stones', weight: 2, scale: [0.8, 1] },
  { model: 'nature.fence_simple', weight: 3, scale: [0.9, 1.1] },
  { model: 'nature.fence_planks', weight: 2, scale: [0.9, 1.1] },
  { model: 'nature.tree_oak', weight: 3, scale: [0.9, 1.2] },
  { model: 'nature.tree_default', weight: 2, scale: [0.9, 1.2] },
  { model: 'nature.flower_reda', weight: 2, scale: [0.7, 1] },
  { model: 'nature.flower_yellowa', weight: 2, scale: [0.7, 1] },
  { model: 'nature.grass_large', weight: 3, scale: [0.7, 1.1] },
];
const SETTLEMENT_NAMES: [string[], string[]] = [
  ['Lantern', 'Hearthlit', 'Quiet', 'Ember', 'Willow'],
  ['Hamlet', 'Hollow', 'Crossing', 'Rest', 'Commons'],
];

const DEFAULT_TIME: Record<Biome, TimeOfDay> = {
  forest: 'day', ruins: 'dusk', ice: 'day', desert: 'day', cavern: 'night', castle: 'dusk', void: 'night',
};
const AMBIENT: Record<Biome, string> = {
  forest: '#9cc7a0', ruins: '#8a8fd0', ice: '#c9e2ff', desert: '#f0d6a0', cavern: '#6a6a90', castle: '#a0a8c8', void: '#6b4cff',
};
const NAMES: Record<Biome, [string[], string[]]> = {
  forest: [['Whispering', 'Verdant', 'Tangled', 'Mossy'], ['Grove', 'Wilds', 'Thicket', 'Glade']],
  ruins: [['Broken', 'Forgotten', 'Sunken', 'Silent'], ['Colonnade', 'Sanctum', 'Ruins', 'Courtyard']],
  ice: [['Frozen', 'Pale', 'Glittering', 'Bitter'], ['Reach', 'Tundra', 'Glacier', 'Expanse']],
  desert: [['Burning', 'Endless', 'Gilded', 'Scorched'], ['Dunes', 'Expanse', 'Wastes', 'Sands']],
  cavern: [['Hollow', 'Echoing', 'Deep', 'Glowing'], ['Caverns', 'Depths', 'Grotto', 'Hollows']],
  castle: [['Fallen', 'Silent', 'Crimson', 'Iron'], ['Keep', 'Bastion', 'Citadel', 'Ramparts']],
  void: [['Starless', 'Endless', 'Hungering', 'Drifting'], ['Void', 'Abyss', 'Expanse', 'Rift']],
};
const ENEMY_ADJ: Record<Biome, string> = {
  forest: 'Mossbound', ruins: 'Hollow', ice: 'Rimeborn', desert: 'Sunscorched', cavern: 'Deepdwelling', castle: 'Oathless', void: 'Voidtouched',
};

const PROP_COUNT: Record<FloorSize, number> = { small: 26, medium: 40, large: 60 };

// ─── Generative themes (non-biome worlds built from procedural primitives) ───────────────────

type Rand = () => number;

interface ThemePreset {
  name: string;
  time: TimeOfDay;
  fog: number;
  ambient: string;
  build: (size: FloorSize, rand: Rand) => GeneratedProp[];
}

/** Shorthand helpers for building GeneratedProp objects. */
function box(label: string, x: number, y: number, z: number, w: number, h: number, d: number, color: string, material: GeneratedProp['material'] = 'solid', extra: Partial<GeneratedProp> = {}): GeneratedProp {
  return { shape: 'box', x, y: y + h / 2, z, width: w, height: h, depth: d, rotation_y: 0, color, material, emissive_intensity: 2, collidable: true, label, ...extra };
}
function cyl(label: string, x: number, y: number, z: number, r: number, h: number, color: string, material: GeneratedProp['material'] = 'solid', extra: Partial<GeneratedProp> = {}): GeneratedProp {
  return { shape: 'cylinder', x, y: y + h / 2, z, width: r, height: h, depth: r, rotation_y: 0, color, material, emissive_intensity: 2, collidable: true, label, ...extra };
}

/** Subway station platform. */
function subwayTheme(): ThemePreset {
  return {
    name: 'The Underground Station',
    time: 'night',
    fog: 0.3,
    ambient: '#3a4a6a',
    build(size) {
      const half = FLOOR_HALF_EXTENT[size];
      const W = half * 2 - 2;
      const D = half * 2 - 2;
      const H = 5; // ceiling height
      const props: GeneratedProp[] = [];

      // Platform floor (slightly raised concrete slab)
      props.push(box('platform', 0, 0, 0, W, 0.3, D, '#888888', 'rough'));

      // Walls
      props.push(box('wall_north', 0, 0.3, -(half - 1), W, H, 0.4, '#6a6a7a', 'rough'));
      props.push(box('wall_south', 0, 0.3, (half - 1), W, H, 0.4, '#6a6a7a', 'rough'));
      props.push(box('wall_east',  (half - 1), 0.3, 0, 0.4, H, D, '#6a6a7a', 'rough'));
      props.push(box('wall_west', -(half - 1), 0.3, 0, 0.4, H, D, '#6a6a7a', 'rough'));

      // Ceiling
      props.push(box('ceiling', 0, 0.3 + H - 0.2, 0, W, 0.3, D, '#555566', 'rough', { collidable: false }));

      // Pillars down the centre aisle
      const pillarSpacing = 4;
      const pillarCount = Math.floor((W * 0.7) / pillarSpacing);
      for (let i = -pillarCount; i <= pillarCount; i++) {
        const px = i * pillarSpacing;
        props.push(cyl('pillar', px, 0.3, -4, 0.3, H, '#aaaaaa', 'rough'));
        props.push(cyl('pillar', px, 0.3,  4, 0.3, H, '#aaaaaa', 'rough'));
      }

      // Neon strip lights along the ceiling
      const stripCount = Math.ceil(W / 5);
      for (let i = 0; i < stripCount; i++) {
        const lx = -W / 2 + 2.5 + i * 5;
        props.push(box('light_strip', lx, 0.3 + H - 0.4, 0, 1.5, 0.15, 0.15, '#fffde0', 'emissive', { collidable: false, emissive_intensity: 4 }));
      }

      // Benches
      for (let i = -2; i <= 2; i++) {
        props.push(box('bench', i * 5, 0.3, -6, 2.5, 0.5, 0.5, '#555555', 'rough'));
        props.push(box('bench', i * 5, 0.3,  6, 2.5, 0.5, 0.5, '#555555', 'rough'));
      }

      // Sign boards on walls
      props.push(box('sign_n', 0, 0.3 + 2.5, -(half - 1.3), 5, 1, 0.1, '#001144', 'emissive', { collidable: false, emissive_intensity: 1.5 }));
      props.push(box('sign_s', 0, 0.3 + 2.5, (half - 1.3), 5, 1, 0.1, '#001144', 'emissive', { collidable: false, emissive_intensity: 1.5 }));

      // Yellow safety edge strip
      props.push(box('edge_n', 0, 0.3, -(half / 2), W * 0.5, 0.05, 0.4, '#ffdd00', 'emissive', { collidable: false, emissive_intensity: 2 }));
      props.push(box('edge_s', 0, 0.3, (half / 2), W * 0.5, 0.05, 0.4, '#ffdd00', 'emissive', { collidable: false, emissive_intensity: 2 }));

      return props;
    },
  };
}

/** Neon city street. */
function neonCityTheme(): ThemePreset {
  return {
    name: 'The Neon Boulevard',
    time: 'night',
    fog: 0.45,
    ambient: '#1a0a2a',
    build(size, rand) {
      const half = FLOOR_HALF_EXTENT[size];
      const props: GeneratedProp[] = [];
      const neonColors = ['#ff0077', '#00ffcc', '#ffcc00', '#8844ff', '#00aaff', '#ff4400'];
      const pick = (arr: string[]) => arr[Math.floor(rand() * arr.length)]!;

      // Road surface
      props.push(box('road', 0, -0.01, 0, half * 2 - 2, 0.05, 8, '#222233', 'rough', { collidable: false }));

      // Pavements
      props.push(box('pavement_l', 0, 0, -8, half * 2 - 2, 0.15, 4, '#333344', 'rough'));
      props.push(box('pavement_r', 0, 0, 8, half * 2 - 2, 0.15, 4, '#333344', 'rough'));

      // Building facades on each side
      const buildingCount = Math.floor(half / 5);
      for (let i = 0; i < buildingCount; i++) {
        const bx = -half + 4 + i * (half * 1.8 / buildingCount);
        const bh = 6 + rand() * 8;
        const bw = 3 + rand() * 2;
        props.push(box('building', bx, 0.15, -(half - 2), bw, bh, 2, '#1a1a2a', 'rough'));
        props.push(box('building', bx, 0.15,  (half - 2), bw, bh, 2, '#1a1a2a', 'rough'));
        // Neon signs on buildings
        const sc = pick(neonColors);
        props.push(box('sign', bx, 0.15 + bh * 0.6, -(half - 2.1), bw * 0.6, 0.6, 0.1, sc, 'emissive', { collidable: false, emissive_intensity: 5 }));
        props.push(box('sign', bx, 0.15 + bh * 0.6,  (half - 2.1), bw * 0.6, 0.6, 0.1, sc, 'emissive', { collidable: false, emissive_intensity: 5 }));
        // Windows
        for (let j = 1; j <= 3; j++) {
          const wc = rand() > 0.6 ? pick(neonColors) : '#fffde0';
          props.push(box('window', bx, 0.15 + j * 1.5, -(half - 1.9), 0.6, 0.6, 0.05, wc, 'glass', { collidable: false }));
          props.push(box('window', bx, 0.15 + j * 1.5,  (half - 1.9), 0.6, 0.6, 0.05, wc, 'glass', { collidable: false }));
        }
      }

      // Lamp posts
      const lampCount = Math.floor(half / 4);
      for (let i = 0; i < lampCount; i++) {
        const lx = -half + 3 + i * ((half * 1.8) / lampCount);
        props.push(cyl('lamppost', lx, 0.15, -10, 0.08, 4, '#888888', 'metal'));
        props.push(box('lamp_l', lx, 0.15 + 4, -10, 0.4, 0.3, 0.3, '#ffffcc', 'emissive', { collidable: false, emissive_intensity: 4 }));
        props.push(cyl('lamppost', lx, 0.15, 10, 0.08, 4, '#888888', 'metal'));
        props.push(box('lamp_r', lx, 0.15 + 4, 10, 0.4, 0.3, 0.3, '#ffffcc', 'emissive', { collidable: false, emissive_intensity: 4 }));
      }

      return props;
    },
  };
}

/** Sci-fi corridor / space station. */
function scifiTheme(): ThemePreset {
  return {
    name: 'The Orbital Corridor',
    time: 'night',
    fog: 0.2,
    ambient: '#0a1a2a',
    build(size, rand) {
      const half = FLOOR_HALF_EXTENT[size];
      const W = half * 2 - 2;
      const H = 4.5;
      const props: GeneratedProp[] = [];

      // Metal floor
      props.push(box('floor', 0, -0.1, 0, W, 0.2, W, '#1a2a3a', 'metal', { collidable: false }));

      // Walls
      props.push(box('wall_n', 0, 0, -(half - 1), W, H, 0.5, '#1e2e3e', 'metal'));
      props.push(box('wall_s', 0, 0,  (half - 1), W, H, 0.5, '#1e2e3e', 'metal'));
      props.push(box('wall_e',  (half - 1), 0, 0, 0.5, H, W, '#1e2e3e', 'metal'));
      props.push(box('wall_w', -(half - 1), 0, 0, 0.5, H, W, '#1e2e3e', 'metal'));

      // Ceiling panels
      props.push(box('ceiling', 0, H - 0.2, 0, W, 0.3, W, '#151f2f', 'metal', { collidable: false }));

      // Ceiling light strips
      const stripCount = Math.ceil(W / 5);
      for (let i = 0; i < stripCount; i++) {
        const lx = -W / 2 + 2 + i * (W / stripCount);
        const lc = rand() > 0.8 ? '#ff4422' : '#44aaff';
        props.push(box('ceiling_light', lx, H - 0.1, 0, 2, 0.1, 0.2, lc, 'emissive', { collidable: false, emissive_intensity: 3 }));
      }

      // Consoles / terminals along walls
      const consoleCount = Math.floor(half / 4);
      for (let i = 0; i < consoleCount; i++) {
        const cx = -half + 3 + i * ((W * 0.8) / consoleCount);
        props.push(box('console', cx, 0, -(half - 1.5), 1.2, 1.2, 0.5, '#112233', 'metal'));
        props.push(box('screen', cx, 0, -(half - 1.3), 0.9, 0.7, 0.05, rand() > 0.5 ? '#00ffcc' : '#ff4422', 'emissive', { collidable: false, emissive_intensity: 2 }));
      }

      // Pillars with glowing bands
      const pillarPositions = [[-half * 0.5, -half * 0.4], [-half * 0.5, half * 0.4], [half * 0.5, -half * 0.4], [half * 0.5, half * 0.4]] as const;
      for (const [px, pz] of pillarPositions) {
        props.push(box('pillar', px, 0, pz, 0.6, H, 0.6, '#1e2e3e', 'metal'));
        props.push(box('pillar_band', px, 0, pz, 0.65, 0.2, 0.65, '#44aaff', 'emissive', { collidable: false, emissive_intensity: 3, y: H * 0.4 + 0.1 }));
      }

      // Crates / cover
      for (let i = 0; i < 6; i++) {
        const cr = rand() * 0.5 + 0.4;
        const angle = rand() * Math.PI * 2;
        const dist = 5 + rand() * (half - 8);
        props.push(box('crate', Math.cos(angle) * dist, 0, Math.sin(angle) * dist, cr * 1.5, cr * 1.5, cr * 1.5, '#334455', 'metal'));
      }

      return props;
    },
  };
}

/** Library / archive. */
function libraryTheme(): ThemePreset {
  return {
    name: 'The Vast Archive',
    time: 'dusk',
    fog: 0.2,
    ambient: '#7a6a4a',
    build(size, rand) {
      const half = FLOOR_HALF_EXTENT[size];
      const H = 6;
      const props: GeneratedProp[] = [];

      // Wooden floor
      props.push(box('floor', 0, -0.05, 0, half * 2 - 2, 0.1, half * 2 - 2, '#8b6b3a', 'rough', { collidable: false }));

      // Walls
      props.push(box('wall_n', 0, 0, -(half - 1), half * 2 - 2, H, 0.5, '#7a5a2a', 'rough'));
      props.push(box('wall_s', 0, 0,  (half - 1), half * 2 - 2, H, 0.5, '#7a5a2a', 'rough'));
      props.push(box('wall_e',  (half - 1), 0, 0, 0.5, H, half * 2 - 2, '#7a5a2a', 'rough'));
      props.push(box('wall_w', -(half - 1), 0, 0, 0.5, H, half * 2 - 2, '#7a5a2a', 'rough'));

      // Ceiling
      props.push(box('ceiling', 0, H - 0.15, 0, half * 2 - 2, 0.3, half * 2 - 2, '#6a4a1a', 'rough', { collidable: false }));

      // Warm overhead lanterns
      const lanternCount = Math.ceil((half * 2) / 6);
      for (let i = 0; i < lanternCount; i++) {
        for (let j = 0; j < lanternCount; j++) {
          const lx = -half + 3 + i * ((half * 2 - 4) / (lanternCount - 1 || 1));
          const lz = -half + 3 + j * ((half * 2 - 4) / (lanternCount - 1 || 1));
          props.push(cyl('lantern', lx, H - 0.6, lz, 0.15, 0.4, '#ffcc88', 'emissive', { collidable: false, emissive_intensity: 3 }));
        }
      }

      // Bookshelves as tall boxes in rows
      const shelfRows = Math.floor(half / 4);
      for (let i = 0; i < shelfRows; i++) {
        const sx = -half + 4 + i * ((half * 1.6) / shelfRows);
        props.push(box('shelf', sx, 0, -4, 1, H * 0.7, 4, '#5a3a1a', 'rough'));
        props.push(box('shelf', sx, 0,  4, 1, H * 0.7, 4, '#5a3a1a', 'rough'));
        // Books: colorful blocks on shelves
        const bookColors = ['#8b2222', '#1a4a8b', '#2a7a2a', '#8b6b1a', '#6a1a8b'];
        for (let k = 0; k < 4; k++) {
          const bc = bookColors[Math.floor(rand() * bookColors.length)]!;
          const bh = 0.25 + rand() * 0.15;
          props.push(box('book', sx, 0, -4 - 1.5 + k * 0.6 + 0.3, 0.9, bh, 0.5, bc, 'solid', { collidable: false }));
          props.push(box('book', sx, 0, 4 - 1.5 + k * 0.6 + 0.3, 0.9, bh, 0.5, bc, 'solid', { collidable: false }));
        }
      }

      // Reading tables
      for (let i = -1; i <= 1; i++) {
        props.push(box('table', i * 5, 0, 0, 2.5, 0.8, 1.2, '#7a5a2a', 'rough'));
        props.push(box('chair', i * 5 - 1.5, 0, 0.9, 0.6, 1.0, 0.6, '#5a3a1a', 'rough'));
        props.push(box('chair', i * 5 + 1.5, 0, 0.9, 0.6, 1.0, 0.6, '#5a3a1a', 'rough'));
        // Candle on table
        props.push(cyl('candle', i * 5, 0.8, 0.2, 0.05, 0.25, '#ffe8aa', 'emissive', { collidable: false, emissive_intensity: 4 }));
      }

      return props;
    },
  };
}

/** Urban / city street. */
function streetTheme(): ThemePreset {
  return {
    name: 'The Crumbling Street',
    time: 'dusk',
    fog: 0.3,
    ambient: '#6a5a4a',
    build(size, rand) {
      const half = FLOOR_HALF_EXTENT[size];
      const props: GeneratedProp[] = [];

      // Pavement
      props.push(box('pavement', 0, 0, 0, half * 2 - 2, 0.15, half * 2 - 2, '#888888', 'rough', { collidable: false }));

      // Buildings
      const buildingCount = Math.floor(half / 4);
      for (let i = 0; i < buildingCount; i++) {
        const bx = -half + 4 + i * ((half * 1.8) / buildingCount);
        const bh = 5 + rand() * 6;
        const bw = 3 + rand() * 2;
        props.push(box('building', bx, 0.15, -(half - 2), bw, bh, 2, '#888878', 'rough'));
        props.push(box('building', bx, 0.15,  (half - 2), bw, bh, 2, '#888878', 'rough'));
        // Windows
        for (let j = 1; j <= Math.floor(bh / 1.5); j++) {
          if (rand() > 0.3) props.push(box('window', bx, 0.15 + j * 1.4, -(half - 1.9), 0.7, 0.7, 0.05, rand() > 0.5 ? '#fffde0' : '#888888', rand() > 0.5 ? 'emissive' : 'glass', { collidable: false, emissive_intensity: 1.5 }));
          if (rand() > 0.3) props.push(box('window', bx, 0.15 + j * 1.4,  (half - 1.9), 0.7, 0.7, 0.05, rand() > 0.5 ? '#fffde0' : '#888888', rand() > 0.5 ? 'emissive' : 'glass', { collidable: false, emissive_intensity: 1.5 }));
        }
      }

      // Lamp posts
      const lampCount = Math.floor(half / 5);
      for (let i = 0; i < lampCount; i++) {
        const lx = -half + 4 + i * ((half * 1.8) / lampCount);
        props.push(cyl('lamppost', lx, 0.15, -8, 0.1, 4.5, '#666666', 'metal'));
        props.push(box('lamp', lx, 0.15 + 4.5, -8, 0.5, 0.3, 0.3, '#fffde0', 'emissive', { collidable: false, emissive_intensity: 3 }));
        props.push(cyl('lamppost', lx, 0.15,  8, 0.1, 4.5, '#666666', 'metal'));
        props.push(box('lamp', lx, 0.15 + 4.5, 8, 0.5, 0.3, 0.3, '#fffde0', 'emissive', { collidable: false, emissive_intensity: 3 }));
      }

      // Fire hydrant
      for (let i = 0; i < 2; i++) {
        const hx = (rand() - 0.5) * half;
        props.push(cyl('hydrant', hx, 0.15, -9, 0.2, 0.7, '#cc2222', 'rough'));
      }

      // Rubbish / crates as cover
      for (let i = 0; i < 5; i++) {
        const cr = 0.5 + rand() * 0.5;
        const angle = rand() * Math.PI * 2;
        const dist = 5 + rand() * (half - 8);
        props.push(box('crate', Math.cos(angle) * dist, 0.15, Math.sin(angle) * dist, cr * 1.5, cr, cr * 1.5, '#6a5a4a', 'rough'));
      }

      return props;
    },
  };
}

type ThemeKeywords = readonly string[];
const THEME_MAP: ReadonlyArray<[ThemeKeywords, () => ThemePreset]> = [
  [['subway', 'metro', 'underground station', 'tube', 'station*'], subwayTheme],
  [['neon*', 'cyberpunk*', 'cyber city', 'neon city', 'neon district'], neonCityTheme],
  [['sci-fi', 'scifi', 'space station', 'spacecraft', 'starship', 'spaceship', 'corridor*', 'orbital*', 'galactic*'], scifiTheme],
  [['library*', 'archive*', 'bookshelf', 'bookshelv*', 'reading room'], libraryTheme],
  [['street*', 'city*', 'urban*', 'town square', 'alley*', 'market*', 'bazaar*', 'plaza*', 'mall', 'office*', 'modern*'], streetTheme],
];

function detectTheme(words: readonly string[]): ThemePreset | null {
  for (const [keywords, builder] of THEME_MAP) {
    if (hasAny(words, keywords)) return builder();
  }
  return null;
}

export interface FloorSignals {
  biome?: Biome;
  softBiome?: Biome;
  place: boolean;
  time?: TimeOfDay;
}

export function readFloorSignals(words: readonly string[]): FloorSignals {
  const biome = findKeyword(words, BIOME_WORDS);
  const softBiome = findKeyword(words, SOFT_BIOME_WORDS);
  const time = findKeyword(words, TIME_WORDS);
  return {
    ...(biome ? { biome } : {}),
    ...(softBiome ? { softBiome } : {}),
    place: hasAny(words, PLACE_NOUNS),
    ...(time ? { time } : {}),
  };
}

/** Build a FloorSpec from keywords. Layout is deterministic for the same words. */
export function floorFromWords(text: string, words: readonly string[], forcedBiome?: Biome): RawFloor {
  const sig = readFloorSignals(words);
  const biome: Biome = forcedBiome ?? sig.biome ?? sig.softBiome ?? 'ruins';
  const rand = seededRandom(text.toLowerCase());
  const size: FloorSize = hasAny(words, ['huge', 'large', 'big', 'vast', 'massive', 'enormous', 'wide'])
    ? 'large'
    : hasAny(words, ['small', 'tiny', 'little', 'cozy', 'narrow'])
      ? 'small'
      : 'medium';
  const time = sig.time ?? DEFAULT_TIME[biome];
  const fog = hasAny(words, ['fog*', 'mist*', 'haz*', 'murky', 'smok*'])
    ? 0.75
    : hasAny(words, ['clear', 'bright', 'open'])
      ? 0.1
      : biome === 'cavern' || biome === 'void'
        ? 0.5
        : 0.3;

  const settlement = hasAny(words, SETTLEMENT_WORDS);
  const [adjs, nouns] = settlement ? SETTLEMENT_NAMES : NAMES[biome];
  const name = `The ${pick(adjs, rand)} ${pick(nouns, rand)}`;
  // "cozy", "warm": a warmer ambient light.
  const ambient = hasAny(words, ['cozy', 'cosy', 'warm*', 'homely']) ? '#ffc890' : AMBIENT[biome];

  const theme = detectTheme(words);

  return {
    name: theme ? theme.name : name,
    biome,
    lighting: theme
      ? { time_of_day: theme.time, fog_density: theme.fog, ambient_color: theme.ambient }
      : { time_of_day: time, fog_density: fog, ambient_color: ambient },
    size,
    props: theme ? [] : layoutProps(settlement ? SETTLEMENT_PALETTE : PALETTES[biome], size, rand),
    generated_props: theme ? theme.build(size, rand) : [],
    spawns: spawnsFromWords(words, biome),
  };
}

function layoutProps(palette: readonly PropRule[], size: FloorSize, rand: () => number): RawFloor['props'] {
  const total = palette.reduce((a, r) => a + r.weight, 0);
  const half = FLOOR_HALF_EXTENT[size] - 2;
  const count = PROP_COUNT[size];
  const out: RawFloor['props'] = [];
  for (let i = 0; i < count; i++) {
    let roll = rand() * total;
    const rule = palette.find((r) => (roll -= r.weight) < 0) ?? palette[0]!;
    // Polar placement, denser towards the edges so the middle stays open for fights.
    const r = 5 + Math.sqrt(rand()) * (half - 5);
    const a = rand() * Math.PI * 2;
    const scale = rule.scale[0] + rand() * (rule.scale[1] - rule.scale[0]);
    out.push({
      model: rule.model,
      x: Math.round(Math.sin(a) * r * 10) / 10,
      z: Math.round(-Math.cos(a) * r * 10) / 10,
      rotation: Math.round(rand() * 360),
      scale: Math.round(scale * 100) / 100,
      ...(rule.tint ? { tint: rule.tint } : {}),
    });
  }
  return out;
}

function spawnsFromWords(words: readonly string[], biome: Biome): RawFloor['spawns'] {
  if (hasAny(words, ['peaceful', 'empty', 'safe', 'calm', 'quiet']) || (hasAny(words, ['no']) && hasAny(words, ['enem*', 'monster*']))) {
    return [];
  }
  const adj = ENEMY_ADJ[biome];
  const many = hasAny(words, ['horde', 'swarm', 'army', 'many', 'dangerous', 'deadly', 'hard']);
  const enemy = (archetype: EnemySpec['archetype'], noun: string, model: string, hp: number, speed: number, damage: number, aggro: number, flee: number) => ({
    id: `${adj.toLowerCase()}_${noun.toLowerCase()}`,
    archetype,
    model,
    hp,
    speed,
    damage,
    aggro_range: aggro,
    flee_threshold: flee,
    attack_pattern: archetype === 'ranged' ? 'bolt' : archetype === 'melee' ? 'slash' : 'slam',
    phases: [] as [],
  });
  const archers = countFor(words, ['archer', 'ranger', 'shooter', 'caster', 'mage']);
  const warriors = countFor(words, ['warrior', 'knight', 'soldier', 'sentinel', 'bandit', 'goblin', 'skeleton', 'enemy', 'enemie', 'monster']);
  const tanks = countFor(words, ['golem', 'guardian', 'brute', 'giant', 'warden', 'ogre', 'troll']);
  const wantsTank = tanks !== undefined || hasAny(words, ['golem*', 'guardian*', 'brute*', 'warden*', 'ogre*', 'troll*']);
  const wantsArchers = archers !== undefined || hasAny(words, ['archer*', 'ranger*', 'shooter*']);

  // A creature the player named ("skeletons", "ghosts") leads the floor; otherwise the biome's own.
  const named = findKeyword(words, CREATURE_WORDS);
  const boss = findKeyword(words, BOSS_WORDS);
  const bossModel = boss && named && named !== 'rpg.rogue' && named !== 'rpg.ranger' ? named : monsterFor(biome, 'boss');
  const meleeModel = named && !(boss && named === bossModel) && named !== 'rpg.ranger' ? named : monsterFor(biome, 'melee');
  const rangedModel = wantsArchers && hasAny(words, ['archer*', 'ranger*']) ? 'rpg.ranger' : monsterFor(biome, 'ranged');
  const spawns: RawFloor['spawns'] = [
    { enemy: enemy('melee', 'Sentinel', meleeModel, 60, 3.6, 8, 11, 0.2), count: warriors ?? (many ? 4 : 2) },
  ];
  if (wantsArchers || !wantsTank) {
    spawns.push({ enemy: enemy('ranged', 'Archer', rangedModel, 40, 3, 7, 14, 0.3), count: archers ?? (many ? 3 : 1) });
  }
  if (wantsTank || many) {
    spawns.push({ enemy: enemy('tank', 'Warden', monsterFor(biome, 'tank'), 160, 2, 18, 9, 0), count: tanks ?? 1 });
  }
  if (boss) spawns.push({ enemy: enemy('boss', boss, bossModel, 420, 2.2, 24, 14, 0), count: 1 });
  return spawns;
}

/** Refine a floor: time / fog / size / biome / enemies changes on top of the previous one. */
export function refineFloor(text: string, words: readonly string[], base: RawFloor): RawFloor {
  const sig = readFloorSignals(words);
  const newBiome = sig.biome ?? sig.softBiome;
  if (newBiome && newBiome !== base.biome) return floorFromWords(text, words, newBiome);
  const next: RawFloor = structuredClone(base);
  if (sig.time) next.lighting.time_of_day = sig.time;
  if (hasAny(words, ['fog*', 'mist*', 'haz*'])) next.lighting.fog_density = 0.75;
  if (hasAny(words, ['clear', 'clearer', 'brighter'])) next.lighting.fog_density = 0.1;
  if (hasAny(words, ['bigger', 'larger', 'huge', 'wider'])) next.size = base.size === 'small' ? 'medium' : 'large';
  if (hasAny(words, ['smaller', 'tighter'])) next.size = base.size === 'large' ? 'medium' : 'small';
  if (hasAny(words, ['enem*', 'monster*', 'archer*', 'golem*', 'guardian*', 'horde', 'peaceful', 'empty'])) {
    next.spawns = spawnsFromWords(words, base.biome);
  }
  return next;
}
