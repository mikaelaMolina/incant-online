#!/usr/bin/env node
// Converts the NPC characters from Quaternius' "Ultimate Animated Character Pack" (CC0, raw .gltf in
// git-ignored assets-src/) into slim binary .glb files in public/assets/, keeping only the
// animations NPCs use (Idle, Walk, Victory) and dropping the rest (~half of each file).
// No dependencies: the glTF is parsed, pruned and re-packed by hand.
//
//   node scripts/pack-npc-models.mjs && npm run manifest

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PACK = 'quaternius/ultimate_animated_characters_-_nov_2019';
const SRC = join(ROOT, 'assets-src', PACK);
const OUT = join(ROOT, 'public/assets', PACK);
const MODELS = [
  'Casual_Male', 'Casual_Female', 'Casual2_Female', 'Chef_Male', 'OldClassy_Male',
  'OldClassy_Female', 'Worker_Male', 'Knight_Male', 'Elf', 'Witch',
];
const KEEP_ANIMATIONS = new Set(['Idle', 'Walk', 'Victory']);

function decodeBuffer(gltf) {
  const uri = gltf.buffers[0].uri;
  const m = /^data:[^;]*;base64,(.*)$/.exec(uri ?? '');
  if (!m) throw new Error('expected one embedded base64 buffer');
  return Buffer.from(m[1], 'base64');
}

/** Keep only the listed animations and the data they, the meshes and the skins use. */
function prune(gltf, bin) {
  gltf.animations = (gltf.animations ?? []).filter((a) => KEEP_ANIMATIONS.has(a.name));

  const used = new Set();
  for (const mesh of gltf.meshes ?? []) {
    for (const p of mesh.primitives) {
      for (const i of Object.values(p.attributes)) used.add(i);
      if (p.indices !== undefined) used.add(p.indices);
      for (const t of p.targets ?? []) for (const i of Object.values(t)) used.add(i);
    }
  }
  for (const s of gltf.skins ?? []) if (s.inverseBindMatrices !== undefined) used.add(s.inverseBindMatrices);
  for (const a of gltf.animations) for (const s of a.samplers) used.add(s.input).add(s.output);

  const accMap = new Map();
  const accessors = [];
  for (const i of [...used].sort((a, b) => a - b)) {
    if (gltf.accessors[i].sparse) throw new Error('sparse accessors are not supported');
    accMap.set(i, accessors.length);
    accessors.push(gltf.accessors[i]);
  }

  const bvMap = new Map();
  const bufferViews = [];
  const chunks = [];
  let offset = 0;
  for (const bvIndex of [...new Set(accessors.map((a) => a.bufferView))].sort((a, b) => a - b)) {
    const bv = gltf.bufferViews[bvIndex];
    const pad = (4 - (offset % 4)) % 4;
    if (pad) chunks.push(Buffer.alloc(pad));
    offset += pad;
    const start = bv.byteOffset ?? 0;
    chunks.push(bin.subarray(start, start + bv.byteLength));
    bvMap.set(bvIndex, bufferViews.length);
    bufferViews.push({ ...bv, buffer: 0, byteOffset: offset });
    offset += bv.byteLength;
  }
  for (const a of accessors) a.bufferView = bvMap.get(a.bufferView);

  const remap = (i) => accMap.get(i);
  for (const mesh of gltf.meshes ?? []) {
    for (const p of mesh.primitives) {
      for (const k of Object.keys(p.attributes)) p.attributes[k] = remap(p.attributes[k]);
      if (p.indices !== undefined) p.indices = remap(p.indices);
      for (const t of p.targets ?? []) for (const k of Object.keys(t)) t[k] = remap(t[k]);
    }
  }
  for (const s of gltf.skins ?? []) if (s.inverseBindMatrices !== undefined) s.inverseBindMatrices = remap(s.inverseBindMatrices);
  for (const a of gltf.animations) for (const s of a.samplers) Object.assign(s, { input: remap(s.input), output: remap(s.output) });

  gltf.accessors = accessors;
  gltf.bufferViews = bufferViews;
  const out = Buffer.concat(chunks);
  gltf.buffers = [{ byteLength: out.length }];
  return out;
}

function toGlb(gltf, bin) {
  let json = Buffer.from(JSON.stringify(gltf), 'utf8');
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const body = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // "glTF"
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + json.length + 8 + body.length, 8);
  const chunk = (data, type) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(data.length, 0);
    h.writeUInt32LE(type, 4);
    return Buffer.concat([h, data]);
  };
  return Buffer.concat([header, chunk(json, 0x4e4f534a), chunk(body, 0x004e4942)]);
}

const licence = join(SRC, 'License.txt');
if (!existsSync(licence) || !/CC0/.test(readFileSync(licence, 'utf8'))) throw new Error(`${licence}: missing or not CC0`);
mkdirSync(join(OUT, 'GLB'), { recursive: true });
copyFileSync(licence, join(OUT, 'License.txt'));

let total = 0;
for (const name of MODELS) {
  const gltf = JSON.parse(readFileSync(join(SRC, `${name}.gltf`), 'utf8'));
  const bin = prune(gltf, decodeBuffer(gltf));
  const glb = toGlb(gltf, bin);
  writeFileSync(join(OUT, 'GLB', `${name}.glb`), glb);
  total += glb.length;
  console.log(`${name}.glb  ${(glb.length / 1024).toFixed(0)} KB  (${gltf.animations.map((a) => a.name).join(', ')})`);
}
console.log(`npc models: ${MODELS.length} files, ${(total / 1024 / 1024).toFixed(2)} MB → public/assets/${PACK}/GLB`);
