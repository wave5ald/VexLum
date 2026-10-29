import * as THREE from 'three';

/**
 * Tiny scripting layer for procedural objects.
 *
 * Each script runs with `THREE`, an optional `material` (the object's material
 * state) and `helpers` in scope, and must return a THREE.Object3D. Scripts are
 * plain functions — no imports, no DOM access — so they evaluate the same way
 * in the editor viewport and in the offscreen video renderer.
 */

/** Shown in the script editor and forwarded to external AI prompt builders. */
export const SCRIPT_LANGUAGE = 'JavaScript (ES2020)';

export const SCRIPT_RUNTIME =
  'The source runs as a single function body: new Function("THREE", "material", "helpers", source) inside the Electron renderer. No modules, no build step, no DOM.';

export interface ScriptTemplate {
  id: string;
  name: string;
  hint: string;
  source: string;
}

export const SCRIPT_TEMPLATES: ScriptTemplate[] = [
  {
    id: 'tower',
    name: 'Parametric tower',
    hint: 'A twisting stack of plates.',
    source: `// Parametric tower — return any THREE.Object3D.
const group = new THREE.Group();
const mat = material || new THREE.MeshStandardMaterial({
  color: '#c02626', roughness: 0.34, metalness: 0.18
});

const floors = 22;
for (let i = 0; i < floors; i++) {
  const t = i / (floors - 1);
  const radius = 0.5 + Math.sin(t * Math.PI) * 0.62;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.075, 1.05), mat);
  const angle = t * Math.PI * 3.6;
  plate.position.set(Math.cos(angle) * radius, t * 2.5, Math.sin(angle) * radius);
  plate.rotation.y = -angle;
  plate.castShadow = true;
  plate.receiveShadow = true;
  group.add(plate);
}

return group;`
  },
  {
    id: 'mobius',
    name: 'Möbius ribbon',
    hint: 'A woven band with a twisting strip.',
    source: `// Möbius ribbon — great for keyed rotations.
const group = new THREE.Group();
const mat = new THREE.MeshStandardMaterial({
  color: '#c02626', roughness: 0.3, metalness: 0.55, side: THREE.DoubleSide
});

const segments = 160;
for (let i = 0; i < segments; i++) {
  const u = (i / segments) * Math.PI * 2;
  const half = u / 2;
  const width = 0.55;
  const a = new THREE.Vector3(
    Math.cos(u) * (1 + half * 0.16),
    Math.sin(u) * (1 + half * 0.16),
    0
  );
  const b = new THREE.Vector3(
    Math.cos(u + Math.PI) * (1 + half * 0.16),
    Math.sin(u + Math.PI) * (1 + half * 0.16),
    0
  );
  const centre = a.clone().add(b).multiplyScalar(0.5);
  const dir = b.clone().sub(a).normalize().multiplyScalar(width);
  const next = dir
    .clone()
    .multiplyScalar(Math.cos(half))
    .addScaledVector(new THREE.Vector3(0, 0, 1), Math.sin(half) * width);
  const seg = new THREE.Mesh(new THREE.BoxGeometry(next.length(), 0.035, 0.09), mat);
  seg.position.copy(centre);
  seg.position.y += 1.25;
  seg.lookAt(centre.clone().add(next));
  seg.castShadow = seg.receiveShadow = true;
  group.add(seg);
}

return group;`
  },
  {
    id: 'tree',
    name: 'L-system tree',
    hint: 'Recursive branches with random leaves.',
    source: `// Recursive L-system tree.
const group = new THREE.Group();
const bark = new THREE.MeshStandardMaterial({ color: '#6b3a2a', roughness: 0.85 });
const leaf = new THREE.MeshStandardMaterial({ color: '#c02626', roughness: 0.5, metalness: 0.1 });

// Deterministic pseudo-random so the object never changes between frames.
let seed = 7;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

function branch(from, dir, length, radius, depth) {
  if (depth <= 0) return;
  const to = from.clone().addScaledVector(dir, length);
  const geo = new THREE.CylinderGeometry(radius * 0.68, radius, length, 7);
  const mesh = new THREE.Mesh(geo, bark);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  mesh.castShadow = mesh.receiveShadow = true;
  group.add(mesh);

  if (depth === 1) {
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13 + rand() * 0.09, 0), leaf);
    crown.position.copy(to);
    crown.castShadow = true;
    group.add(crown);
  }

  const children = depth > 3 ? 2 : 3;
  for (let i = 0; i < children; i++) {
    const spread = 0.42 + rand() * 0.34;
    const around = (i / children) * Math.PI * 2 + rand() * 0.8;
    const nextDir = dir.clone()
      .addScaledVector(new THREE.Vector3(Math.cos(around), 0, Math.sin(around)), spread)
      .addScaledVector(dir, 0.35)
      .normalize();
    branch(to, nextDir, length * (0.66 + rand() * 0.1), radius * 0.66, depth - 1);
  }
}

branch(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), 1.5, 0.14, 6);
return group;`
  },
  {
    id: 'terrain',
    name: 'Voxel terrain',
    hint: 'A stepped height-field made of cubes.',
    source: `// Voxel terrain — deterministic height field.
const group = new THREE.Group();
const mat = new THREE.MeshStandardMaterial({
  color: '#c02626', roughness: 0.55, metalness: 0.12, flatShading: true
});

const size = 22;
const cell = 0.16;
for (let x = 0; x < size; x++) {
  for (let z = 0; z < size; z++) {
    const nx = (x / size - 0.5) * 2;
    const nz = (z / size - 0.5) * 2;
    const d = Math.sqrt(nx * nx + nz * nz);
    const h = Math.max(0, Math.sin(nx * 3.1) * Math.cos(nz * 2.7) + (1 - d) * 0.9);
    if (h < 0.12) continue;
    const cube = new THREE.Mesh(new THREE.BoxGeometry(cell, cell, cell), mat);
    cube.position.set(
      (x - size / 2) * cell,
      Math.round(h * 7) * cell - 0.35,
      (z - size / 2) * cell
    );
    cube.castShadow = cube.receiveShadow = true;
    group.add(cube);
  }
}

return group;`
  }
];

export const DEFAULT_SCRIPT = SCRIPT_TEMPLATES[0].source;

export interface ScriptResult {
  root?: THREE.Object3D;
  error?: string;
}

const HELPERS_DOC = `
Available: THREE, material, helpers.mesh(geometry, options),
helpers.group(), helpers.color('#c02626').
Return a THREE.Object3D (Mesh, Group, Points, Line…).
`.trim();

export function scriptHelpersDoc(): string {
  return HELPERS_DOC;
}

export function evaluateScript(
  source: string,
  material?: THREE.Material
): ScriptResult {
  const trimmed = (source || '').trim();
  if (!trimmed) return { error: 'Script is empty.' };
  if (trimmed.length > 200_000) return { error: 'Script is too large (200 KB limit).' };

  const helpers = {
    group: () => new THREE.Group(),
    mesh: (geometry: THREE.BufferGeometry, options: Record<string, unknown> = {}) =>
      new THREE.Mesh(geometry, new THREE.MeshStandardMaterial(options as any)),
    color: (value: string) => new THREE.Color(value)
  };

  try {
    const factory = new Function(
      'THREE',
      'material',
      'helpers',
      `"use strict";\n${trimmed}`
    ) as (three: typeof THREE, mat: THREE.Material | undefined, help: typeof helpers) => unknown;

    const result = factory(THREE, material, helpers);
    if (!result || typeof result !== 'object' || !(result as THREE.Object3D).isObject3D) {
      return {
        error: 'The script must return a THREE.Object3D (for example a Mesh or Group).'
      };
    }
    return { root: result as THREE.Object3D };
  } catch (error: any) {
    return { error: error?.message ? String(error.message) : String(error) };
  }
}
