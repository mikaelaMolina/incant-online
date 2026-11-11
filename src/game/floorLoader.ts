import * as THREE from 'three';
import { RAPIER } from './physics';
import { BIOMES, TIMES, fogDensity } from './biomes';
import { loadModel, type ModelIndex, type ModelTemplate } from './assets';
import { FLOOR_HALF_EXTENT, type FloorSpec, type GeneratedProp, type PropPlacement } from '../schemas/floorSpec';

/** Props closer than this to the spawn point (with colliders) are pushed out, so the Incanter never spawns stuck. */
const SPAWN_CLEAR_RADIUS = 3;
/** Draw-call budget for props: instanced parts (each also drawn in the shadow pass). */
const MAX_PROP_PARTS = 60;
const WALL_HEIGHT = 6;

export interface Floor {
  spec: FloorSpec;
  group: THREE.Group;
  sun: THREE.DirectionalLight;
  spawn: THREE.Vector3;
  halfExtent: number;
  /** Props that were dropped or moved, for logging / Arbiter narration. */
  warnings: string[];
  dispose(): void;
}

export interface FloorContext {
  scene: THREE.Scene;
  world: RAPIER.World;
  models: ModelIndex;
}

/**
 * Build a floor from a (validated) FloorSpec: lighting, fog, ground, boundary walls and instanced props
 * with colliders. Never throws for bad props or missing models: they are skipped and listed in `warnings`.
 */
export async function buildFloor(spec: FloorSpec, ctx: FloorContext): Promise<Floor> {
  const { scene, world } = ctx;
  const group = new THREE.Group();
  group.name = `floor:${spec.name}`;
  const colliders: RAPIER.Collider[] = [];
  const disposables: { dispose(): void }[] = [];
  const warnings: string[] = [];
  const half = FLOOR_HALF_EXTENT[spec.size];
  const biome = BIOMES[spec.biome];
  const time = TIMES[spec.lighting.time_of_day];

  // --- Sky, fog, lights --------------------------------------------------------------------
  const sky = new THREE.Color(biome.sky).multiply(new THREE.Color(time.skyTint));
  scene.background = sky;
  scene.fog = new THREE.FogExp2(sky.getHex(), fogDensity(spec.lighting.fog_density));

  // The floor's ambient colour (often chosen by the LLM) steers the mood, blended half-way with the
  // biome's own sky so a muddy pick can't grey out the whole floor.
  const ambient = new THREE.Color(spec.lighting.ambient_color).lerp(sky, 0.5);
  const hemi = new THREE.HemisphereLight(ambient, biome.bounce, time.hemiIntensity);
  const sun = new THREE.DirectionalLight(time.sunColor, time.sunIntensity);
  const elev = THREE.MathUtils.degToRad(time.sunElevation);
  sun.position.set(Math.cos(elev) * 0.6, Math.sin(elev), Math.cos(elev) * 0.8).multiplyScalar(20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.05;
  sun.shadow.radius = 3; // softer shadow edges (PCF filtering)
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 60 });
  // Cool back light from the opposite side: outlines the Incanter and enemies against the ground.
  const rim = new THREE.DirectionalLight(time.rimColor, time.rimIntensity);
  rim.position.set(-sun.position.x, sun.position.y * 0.6, -sun.position.z);
  group.add(hemi, sun, sun.target, rim);

  // --- Ground + boundary ---------------------------------------------------------------------
  const ground = makeGround(half, biome.ground, biome.groundVariation, spec.name);
  disposables.push(ground.geometry, ground.material as THREE.Material);
  group.add(ground);
  colliders.push(
    world.createCollider(RAPIER.ColliderDesc.cuboid(half + 2, 0.5, half + 2).setTranslation(0, -0.5, 0)),
  );
  for (const [x, z, hx, hz] of [
    [half + 0.5, 0, 0.5, half + 1],
    [-half - 0.5, 0, 0.5, half + 1],
    [0, half + 0.5, half + 1, 0.5],
    [0, -half - 0.5, half + 1, 0.5],
  ] as const) {
    colliders.push(
      world.createCollider(RAPIER.ColliderDesc.cuboid(hx, WALL_HEIGHT / 2, hz).setTranslation(x, WALL_HEIGHT / 2, z)),
    );
  }

  // --- Props ---------------------------------------------------------------------------------
  const groups = new Map<string, { template: Promise<ModelTemplate>; placements: PropPlacement[] }>();
  for (const p of spec.props) {
    const entry = ctx.models.resolve(p.model, 'prop');
    if (!entry) {
      warnings.push(`unknown model "${p.model}" skipped`);
      continue;
    }
    if (entry.id !== p.model) warnings.push(`"${p.model}" → ${entry.id}`);
    let g = groups.get(entry.id);
    if (!g) {
      g = { template: loadModel(entry), placements: [] };
      groups.set(entry.id, g);
    }
    g.placements.push(p);
  }

  const loaded = await Promise.allSettled([...groups.values()].map(async (g) => ({ ...g, template: await g.template })));
  const ready = loaded.flatMap((r, i) => {
    if (r.status === 'fulfilled') return [r.value];
    warnings.push(`model ${[...groups.keys()][i]} failed to load`);
    console.warn(r.reason);
    return [];
  });

  // Most-used models first, so the draw-call budget drops rare ones.
  ready.sort((a, b) => b.placements.length - a.placements.length);
  let partBudget = MAX_PROP_PARTS;
  const matrix = new THREE.Matrix4();
  const propMatrix = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const white = new THREE.Color(1, 1, 1);
  const tint = new THREE.Color();

  for (const { template, placements } of ready) {
    if (template.parts.length > partBudget) {
      warnings.push(`${template.entry.id} dropped (draw-call budget)`);
      continue;
    }
    partBudget -= template.parts.length;

    const transforms = placements.map((p) => placementTransform(p, template, warnings));
    const tinted = placements.some((p) => p.tint);

    for (const part of template.parts) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, placements.length);
      // Small decor (grass, flowers…) skips shadows: avoids acne on thin blades and halves its draw calls.
      const decor = template.entry.collider === 'none';
      mesh.castShadow = !decor;
      mesh.receiveShadow = !decor;
      placements.forEach((p, i) => {
        const t = transforms[i];
        if (!t) return;
        propMatrix.compose(t.position, q.setFromAxisAngle(up, t.yaw), t.scale);
        mesh.setMatrixAt(i, matrix.multiplyMatrices(propMatrix, part.matrix));
        if (tinted) mesh.setColorAt(i, p.tint ? tint.set(p.tint) : white);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.name = template.entry.id;
      disposables.push(mesh);
      group.add(mesh);
    }

    for (const t of transforms) {
      const c = createPropCollider(world, template, t);
      if (c) colliders.push(c);
    }
  }

  // --- Generated props (procedural primitives for themes without manifest models) --------
  if (spec.generated_props.length > 0) {
    const { meshes, genColliders } = buildGeneratedProps(spec.generated_props, world);
    for (const m of meshes) {
      // Dispose the unique geometry per mesh; materials are shared and cached.
      disposables.push(m.geometry);
      group.add(m);
    }
    for (const c of genColliders) colliders.push(c);
  }

  scene.add(group);

  return {
    spec,
    group,
    sun,
    spawn: new THREE.Vector3(0, 0, 0),
    halfExtent: half,
    warnings,
    dispose() {
      scene.remove(group);
      for (const d of disposables) d.dispose();
      for (const c of colliders) world.removeCollider(c, false);
    },
  };
}

interface PropTransform {
  position: THREE.Vector3;
  yaw: number;
  scale: THREE.Vector3;
}

function placementTransform(p: PropPlacement, template: ModelTemplate, warnings: string[]): PropTransform {
  const position = new THREE.Vector3(p.x, 0, p.z);
  const s = p.scale;
  if (template.entry.collider !== 'none') {
    // Push solid props out of the spawn circle.
    const size = template.bounds.getSize(new THREE.Vector3());
    const footprint = (Math.max(size.x, size.z) * s) / 2;
    const minDist = SPAWN_CLEAR_RADIUS + footprint;
    const dist = Math.hypot(p.x, p.z);
    if (dist < minDist) {
      const dir = dist > 0.01 ? position.clone().divideScalar(dist) : new THREE.Vector3(1, 0, 0);
      position.copy(dir.multiplyScalar(minDist));
      warnings.push(`${template.entry.id} moved out of the spawn area`);
    }
  }
  return { position, yaw: THREE.MathUtils.degToRad(p.rotation), scale: new THREE.Vector3(s, s, s) };
}

function createPropCollider(world: RAPIER.World, template: ModelTemplate, t: PropTransform): RAPIER.Collider | undefined {
  const kind = template.entry.collider;
  if (kind === 'none') return undefined;
  const s = t.scale.x;
  const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.yaw);
  const size = template.bounds.getSize(new THREE.Vector3()).multiplyScalar(s);
  const centre = template.bounds.getCenter(new THREE.Vector3()).multiplyScalar(s).applyQuaternion(rot).add(t.position);
  const r = { x: rot.x, y: rot.y, z: rot.z, w: rot.w };

  if (kind === 'box') {
    if (size.y < 0.25) return undefined; // flat decor: walk over it
    return world.createCollider(
      RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2).setTranslation(centre.x, centre.y, centre.z).setRotation(r),
    );
  }
  if (kind === 'trunk') {
    const radius = Math.max(0.15, Math.min(size.x, size.z) * 0.15);
    const height = size.y;
    return world.createCollider(
      RAPIER.ColliderDesc.cylinder(height / 2, radius).setTranslation(centre.x, t.position.y + height / 2, centre.z),
    );
  }
  // 'mesh': bake scale into vertices, rotation/translation into the collider.
  const { vertices, indices } = template.collisionMesh();
  if (indices.length < 3) return undefined;
  const scaled = new Float32Array(vertices.length);
  for (let i = 0; i < vertices.length; i++) scaled[i] = (vertices[i] ?? 0) * s;
  return world.createCollider(
    RAPIER.ColliderDesc.trimesh(scaled, indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)
      .setTranslation(t.position.x, t.position.y, t.position.z)
      .setRotation(r),
  );
}

// ─── Generated props (procedural primitives) ────────────────────────────────

/** Material cache: keyed by "material:color" so identical descriptions share one material. */
const genMatCache = new Map<string, THREE.MeshStandardMaterial>();

function genMaterial(color: string, material: GeneratedProp['material'], emissiveIntensity: number): THREE.MeshStandardMaterial {
  const key = `${material}:${color}:${emissiveIntensity}`;
  let mat = genMatCache.get(key);
  if (mat) return mat;
  const c = new THREE.Color(color);
  switch (material) {
    case 'metal':
      mat = new THREE.MeshStandardMaterial({ color: c, metalness: 0.85, roughness: 0.25 });
      break;
    case 'glass':
      mat = new THREE.MeshStandardMaterial({ color: c, metalness: 0.0, roughness: 0.05, transparent: true, opacity: 0.45 });
      break;
    case 'emissive':
      mat = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity, roughness: 1 });
      break;
    case 'rough':
      mat = new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, metalness: 0 });
      break;
    default: // 'solid'
      mat = new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, metalness: 0 });
  }
  genMatCache.set(key, mat);
  return mat;
}

function genGeometry(g: GeneratedProp): THREE.BufferGeometry {
  const { shape, width, height, depth } = g;
  switch (shape) {
    case 'cylinder':
      return new THREE.CylinderGeometry(width, width, height, 12, 1);
    case 'sphere':
      return new THREE.SphereGeometry(width / 2, 10, 8);
    case 'plane':
      return new THREE.PlaneGeometry(width, depth);
    case 'arch': {
      // An arch: a torus segment standing upright (a half-torus). We approximate it with
      // a bent tube: TorusGeometry(radius, tube, radialSeg, tubularSeg, arc).
      const radius = width / 2;
      const tube = Math.max(0.05, Math.min(depth / 2, radius * 0.25));
      const geo = new THREE.TorusGeometry(radius, tube, 6, 12, Math.PI);
      geo.rotateZ(Math.PI); // open end at the bottom
      return geo;
    }
    case 'ramp': {
      // A ramp: a right-angled triangle prism. Build via custom geometry.
      const geo = new THREE.BufferGeometry();
      const w = width / 2;
      const h = height;
      const d = depth / 2;
      // 6 faces, 12 triangles. Vertices (position only; normals auto-computed).
      const verts = new Float32Array([
        // Bottom face
        -w, 0, -d,  w, 0, -d,  w, 0,  d,
        -w, 0, -d,  w, 0,  d, -w, 0,  d,
        // Top-back edge → front base: slope face
        -w, 0, -d,  w, h, -d,  w, 0, -d,
        -w, 0, -d, -w, h, -d,  w, h, -d,
        // Back wall
        -w, 0, -d,  w, h, -d, -w, h, -d,
        // Front base wall (vertical)
        -w, 0,  d,  w, 0,  d,  w, h, -d, // degenerate but won't crash
        // Left side
        -w, 0, -d, -w, 0,  d, -w, h, -d,
        // Right side
         w, 0, -d,  w, h, -d,  w, 0,  d,
      ]);
      geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      geo.computeVertexNormals();
      return geo;
    }
    default: // 'box'
      return new THREE.BoxGeometry(width, height, depth);
  }
}

/**
 * Build Three.js meshes and Rapier colliders for all GeneratedProps.
 * Returns them without adding to scene (caller inserts into the floor group).
 */
function buildGeneratedProps(
  props: GeneratedProp[],
  world: RAPIER.World,
): { meshes: THREE.Mesh[]; genColliders: RAPIER.Collider[] } {
  const meshes: THREE.Mesh[] = [];
  const genColliders: RAPIER.Collider[] = [];
  const up = new THREE.Vector3(0, 1, 0);

  for (const g of props) {
    const geo = genGeometry(g);
    const mat = genMaterial(g.color, g.material, g.emissive_intensity);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(g.x, g.y, g.z);
    mesh.quaternion.setFromAxisAngle(up, THREE.MathUtils.degToRad(g.rotation_y));
    mesh.castShadow = g.material !== 'glass';
    mesh.receiveShadow = true;
    if (g.label) mesh.name = g.label;
    meshes.push(mesh);

    if (!g.collidable) continue;

    const rot = { x: mesh.quaternion.x, y: mesh.quaternion.y, z: mesh.quaternion.z, w: mesh.quaternion.w };
    switch (g.shape) {
      case 'cylinder':
      case 'arch':
        genColliders.push(
          world.createCollider(
            RAPIER.ColliderDesc.cylinder(g.height / 2, g.width)
              .setTranslation(g.x, g.y, g.z)
              .setRotation(rot),
          ),
        );
        break;
      case 'sphere':
        genColliders.push(
          world.createCollider(
            RAPIER.ColliderDesc.ball(g.width / 2).setTranslation(g.x, g.y, g.z),
          ),
        );
        break;
      case 'plane':
        // Planes are thin; use a flat cuboid (5 cm).
        genColliders.push(
          world.createCollider(
            RAPIER.ColliderDesc.cuboid(g.width / 2, 0.025, g.depth / 2)
              .setTranslation(g.x, g.y, g.z)
              .setRotation(rot),
          ),
        );
        break;
      default: // box, ramp
        genColliders.push(
          world.createCollider(
            RAPIER.ColliderDesc.cuboid(g.width / 2, g.height / 2, g.depth / 2)
              .setTranslation(g.x, g.y, g.z)
              .setRotation(rot),
          ),
        );
    }
  }
  return { meshes, genColliders };
}

/** Square ground plane with subtle deterministic colour variation (one draw call). */
function makeGround(half: number, color: string, variation: number, seedText: string): THREE.Mesh {
  const segments = Math.round(half);
  const geo = new THREE.PlaneGeometry(half * 2 + 4, half * 2 + 4, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const base = new THREE.Color(color);
  const colors = new Float32Array(geo.attributes.position!.count * 3);
  let seed = [...seedText].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 2166136261);
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const c = new THREE.Color();
  for (let i = 0; i < colors.length / 3; i++) {
    const k = 1 + (rand() - 0.5) * 2 * variation;
    c.copy(base).multiplyScalar(k);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  mesh.receiveShadow = true;
  mesh.name = 'ground';
  return mesh;
}
