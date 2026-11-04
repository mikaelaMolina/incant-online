#!/usr/bin/env node
// Scans public/assets and writes public/assets/manifest.json.
// Run with: npm run manifest
//
// - Only packs listed in PACKS are scanned, and each pack's License.txt must say CC0,
//   otherwise the script fails (CLAUDE.md hard rule 4).
// - GLB sizes come from the files' accessor bounds composed with the node transforms.
// - baseScale converts each pack's units to metres (Incanter = 1.7 m tall).

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';

const ROOT = new URL('..', import.meta.url).pathname;
const ASSETS = join(ROOT, 'public/assets');

/** @type {Array<{ id: string; dir: string; models: string; format: 'glb' | 'fbx'; license: string; author: string; source: string; baseScale: number; type: (name: string) => 'prop' | 'enemy' | 'character'; collider: (name: string) => 'none' | 'box' | 'trunk' | 'mesh' }>} */
const PACKS = [
  {
    id: 'nature',
    dir: 'kenney/Nature Kit (2.1)',
    models: 'Models/GLTF format',
    format: 'glb',
    license: 'License.txt',
    author: 'Kenney',
    source: 'https://kenney.nl/assets/nature-kit',
    baseScale: 4, // 1-unit tiles → 4 m
    type: () => 'prop',
    collider: natureCollider,
  },
  {
    id: 'castle',
    dir: 'kenney/kenney_castle-kit',
    models: 'Models/GLB format',
    format: 'glb',
    license: 'License.txt',
    author: 'Kenney',
    source: 'https://kenney.nl/assets/castle-kit',
    baseScale: 4, // 1-unit tiles → 4 m (wall ≈ 5.2 m tall)
    type: () => 'prop',
    collider: castleCollider,
  },
  {
    id: 'dungeon',
    dir: 'kenney/kenney_modular-dungeon-kit_1.0',
    models: 'Models/GLB format',
    format: 'glb',
    license: 'License.txt',
    author: 'Kenney',
    source: 'https://kenney.nl',
    baseScale: 1, // already in metres (corridor tile = 4 m)
    type: () => 'prop',
    collider: () => 'mesh', // rooms/corridors are hollow: need real geometry
  },
  {
    id: 'rpg',
    dir: 'quaternius/rpg_characters_-_nov_2020/RPG Characters - Nov 2020',
    models: 'FBX',
    format: 'fbx',
    license: 'License.txt',
    author: 'Quaternius',
    source: 'https://quaternius.com',
    baseScale: 1, // measured on load by the character loader
    // Wizard is the Incanter; the other classes stand in as humanoid enemies until a monster pack is added.
    type: (name) => (name === 'wizard' ? 'character' : 'enemy'),
    collider: () => 'none', // characters get capsules from gameplay code
  },
];

const DECOR = /^(flower|grass|crop|crops|lily|hanging_moss|plant_flat|mushroom|path_|ground_|bed|canoe_paddle)/;

function natureCollider(name) {
  if (DECOR.test(name)) return 'none';
  if (/^tree_/.test(name)) return 'trunk';
  if (/^(bridge|cliff_.*cave|cliff_.*(slope|steps|diagonal)|platform_|tent_detailedOpen|tent_smallOpen)/.test(name)) return 'mesh';
  return 'box';
}

function castleCollider(name) {
  if (/^flag/.test(name)) return 'box';
  if (/^tree-(large|small)$/.test(name)) return 'trunk';
  if (/^(rocks|tree-log|tree-trunk)/.test(name)) return 'box';
  if (/^ground/.test(name)) return 'mesh';
  return 'mesh'; // walls with doorways, towers with arches, stairs, bridges, siege engines
}

function readLicense(pack) {
  const file = join(ASSETS, pack.dir, pack.license);
  if (!existsSync(file)) throw new Error(`${pack.id}: missing ${pack.license}`);
  const text = readFileSync(file, 'utf8');
  if (!/Creative Commons Zero|CC0/i.test(text)) throw new Error(`${pack.id}: licence is not CC0, refusing to list it`);
  return 'CC0-1.0';
}

/** Bounding box of a GLB in its own units, with node transforms applied. */
function glbBounds(file) {
  const buf = readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: not a GLB`);
  const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
  const nodes = json.nodes ?? [];
  const box = new Box3();
  const local = new Box3();

  const visit = (index, parent) => {
    const n = nodes[index];
    const m = new Matrix4();
    if (n.matrix) m.fromArray(n.matrix);
    else
      m.compose(
        new Vector3(...(n.translation ?? [0, 0, 0])),
        new Quaternion(...(n.rotation ?? [0, 0, 0, 1])),
        new Vector3(...(n.scale ?? [1, 1, 1])),
      );
    const world = parent.clone().multiply(m);
    if (n.mesh !== undefined) {
      for (const prim of json.meshes[n.mesh].primitives) {
        const acc = json.accessors[prim.attributes.POSITION];
        local.set(new Vector3(...acc.min), new Vector3(...acc.max)).applyMatrix4(world);
        box.union(local);
      }
    }
    for (const c of n.children ?? []) visit(c, world);
  };

  const scene = json.scenes?.[json.scene ?? 0];
  const roots = scene?.nodes ?? nodes.map((_, i) => i);
  for (const r of roots) visit(r, new Matrix4());
  return box;
}

const round = (v) => Math.round(v * 100) / 100;
const slug = (s) => s.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase();

const packs = {};
const models = [];

for (const pack of PACKS) {
  const licence = readLicense(pack);
  packs[pack.id] = {
    author: pack.author,
    source: pack.source,
    licence,
    licenceFile: relative(join(ROOT, 'public'), join(ASSETS, pack.dir, pack.license)),
  };

  const dir = join(ASSETS, pack.dir, pack.models);
  const files = readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(`.${pack.format}`))
    .sort();

  for (const f of files) {
    const name = slug(f);
    const entry = {
      id: `${pack.id}.${name}`,
      path: relative(join(ROOT, 'public'), join(dir, f)),
      type: pack.type(name),
      licence,
      pack: pack.id,
      format: pack.format,
      baseScale: pack.baseScale,
      collider: pack.collider(name),
    };
    if (pack.format === 'glb') {
      const b = glbBounds(join(dir, f));
      const size = b.getSize(new Vector3()).multiplyScalar(pack.baseScale);
      entry.size = [round(size.x), round(size.y), round(size.z)];
    }
    models.push(entry);
  }
}

const ids = new Set();
for (const m of models) {
  if (ids.has(m.id)) throw new Error(`duplicate id ${m.id}`);
  ids.add(m.id);
}

const manifest = {
  version: 1,
  note: 'Generated by scripts/build-manifest.mjs. Do not edit by hand. Sizes are metres after baseScale.',
  packs,
  models,
};

writeFileSync(join(ASSETS, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
const count = (t) => models.filter((m) => m.type === t).length;
console.log(
  `manifest.json: ${models.length} models (${count('prop')} props, ${count('enemy')} enemies, ${count('character')} characters) from ${PACKS.length} packs`,
);
