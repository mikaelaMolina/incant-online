import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AssetManifest, type ManifestModel, type ModelType } from '../schemas/manifest';
import { closest } from '../schemas/fuzzy';

const EMPTY_MANIFEST: AssetManifest = { version: 1, packs: {}, models: [] };

/** Site-root-relative asset path → URL (paths contain spaces and brackets). */
export function assetUrl(path: string): string {
  return import.meta.env.BASE_URL + path.split('/').map(encodeURIComponent).join('/');
}

/** Fetch and validate the manifest. Never throws: on failure the game runs with no props. */
export async function loadManifest(): Promise<AssetManifest> {
  try {
    const res = await fetch(assetUrl('assets/manifest.json'));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = AssetManifest.safeParse(await res.json());
    if (!parsed.success) throw new Error(parsed.error.message);
    return parsed.data;
  } catch (err) {
    console.warn('Asset manifest unavailable; continuing without props.', err);
    return EMPTY_MANIFEST;
  }
}

export class ModelIndex {
  private readonly byId = new Map<string, ManifestModel>();
  private readonly idsByType = new Map<ModelType, string[]>();

  constructor(manifest: AssetManifest) {
    for (const m of manifest.models) {
      this.byId.set(m.id, m);
      const list = this.idsByType.get(m.type) ?? [];
      list.push(m.id);
      this.idsByType.set(m.type, list);
    }
  }

  /**
   * Exact id, else the closest id of that type ("tree oak" → nature.tree_oak,
   * "oak_tree" won't match but "nature.treeoak" will). Undefined if nothing is close.
   */
  resolve(id: string, type: ModelType): ManifestModel | undefined {
    const exact = this.byId.get(id);
    if (exact?.type === type) return exact;
    const ids = this.idsByType.get(type) ?? [];
    // Allow ids without the pack prefix.
    const match =
      closest(id, ids, { maxRatio: 0.25 }) ??
      closest(
        id,
        ids.map((i) => i.slice(i.indexOf('.') + 1)),
        { maxRatio: 0.25 },
      );
    if (!match) return undefined;
    return this.byId.get(match) ?? this.byId.get(ids.find((i) => i.endsWith('.' + match)) ?? '');
  }
}

/** One drawable part of a model: geometry + material + its transform inside the model (metres). */
export interface ModelPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  matrix: THREE.Matrix4;
}

export interface ModelTemplate {
  entry: ManifestModel;
  parts: ModelPart[];
  /** Bounds in metres (baseScale applied), model space. */
  bounds: THREE.Box3;
  /** Merged triangle soup in model space (metres), for trimesh colliders. */
  collisionMesh(): { vertices: Float32Array; indices: Uint32Array };
}

const loader = new GLTFLoader();
const cache = new Map<string, Promise<ModelTemplate>>();

/** Load a GLB once; later calls share geometry and materials (never dispose them per floor). */
export function loadModel(entry: ManifestModel): Promise<ModelTemplate> {
  let p = cache.get(entry.id);
  if (!p) {
    p = loadTemplate(entry);
    p.catch(() => cache.delete(entry.id)); // allow a retry on a later floor
    cache.set(entry.id, p);
  }
  return p;
}

async function loadTemplate(entry: ManifestModel): Promise<ModelTemplate> {
  if (entry.format !== 'glb') throw new Error(`${entry.id}: only GLB props are supported`);
  const gltf = await loader.loadAsync(assetUrl(entry.path));
  const root = gltf.scene;
  root.updateMatrixWorld(true);

  const base = new THREE.Matrix4().makeScale(entry.baseScale, entry.baseScale, entry.baseScale);
  const parts: ModelPart[] = [];
  const bounds = new THREE.Box3();
  const tmp = new THREE.Box3();

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const geometry = obj.geometry as THREE.BufferGeometry;
    const matrix = base.clone().multiply(obj.matrixWorld);
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (geometry.boundingBox) bounds.union(tmp.copy(geometry.boundingBox).applyMatrix4(matrix));
    parts.push({ geometry, material: obj.material as THREE.Material | THREE.Material[], matrix });
  });

  let collision: { vertices: Float32Array; indices: Uint32Array } | undefined;
  return {
    entry,
    parts,
    bounds,
    collisionMesh() {
      collision ??= buildCollisionMesh(parts);
      return collision;
    },
  };
}

function buildCollisionMesh(parts: ModelPart[]): { vertices: Float32Array; indices: Uint32Array } {
  const verts: number[] = [];
  const idx: number[] = [];
  const v = new THREE.Vector3();
  for (const part of parts) {
    const pos = part.geometry.getAttribute('position');
    if (!pos) continue;
    const offset = verts.length / 3;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(part.matrix);
      verts.push(v.x, v.y, v.z);
    }
    const index = part.geometry.getIndex();
    if (index) for (let i = 0; i < index.count; i++) idx.push(offset + index.getX(i));
    else for (let i = 0; i < pos.count; i++) idx.push(offset + i);
  }
  return { vertices: new Float32Array(verts), indices: new Uint32Array(idx) };
}
