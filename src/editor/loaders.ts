import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const modelSourceCache = new Map<string, string>();
const parsedModelCache = new Map<string, THREE.Object3D>();

export const MODEL_EXTENSIONS = ['glb', 'gltf', 'obj', 'stl', 'ply', 'fbx'];

export function setModelSource(objectId: string, base64: string): void {
  modelSourceCache.set(objectId, base64);
}

export function getModelSource(objectId: string): string | undefined {
  return modelSourceCache.get(objectId);
}

export function removeModelSource(objectId: string): void {
  modelSourceCache.delete(objectId);
  parsedModelCache.delete(objectId);
}

export function cacheParsedModel(objectId: string, object: THREE.Object3D): void {
  parsedModelCache.set(objectId, object);
}

export function getParsedModel(objectId: string): THREE.Object3D | undefined {
  return parsedModelCache.get(objectId);
}

export function clearModelCaches(): void {
  parsedModelCache.clear();
}

export function serializeModelSources(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of modelSourceCache) result[key] = value;
  return result;
}

export function loadModelSources(models: Record<string, string> | undefined): void {
  modelSourceCache.clear();
  parsedModelCache.clear();
  if (!models) return;
  for (const [key, value] of Object.entries(models)) modelSourceCache.set(key, value);
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function cloneAndPrepareMaterials(root: THREE.Object3D): void {
  const seen = new Set<THREE.Material>();
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh && !(child as any).isSkinnedMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const material = mesh.material;
    const apply = (mat: THREE.Material): THREE.Material => {
      if (seen.has(mat)) return mat;
      const copy = mat.clone();
      if ('side' in copy) (copy as any).side = THREE.DoubleSide;
      seen.add(mat);
      return copy;
    };
    if (Array.isArray(material)) {
      mesh.material = material.map(apply);
    } else if (material) {
      // Each mesh needs its own material so per-object tinting is isolated.
      const copy = material.clone();
      if ('side' in copy) (copy as any).side = THREE.DoubleSide;
      mesh.material = copy;
    }
  });
}

function normalizeModel(model: THREE.Object3D, targetHeight: number): THREE.Object3D {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) throw new Error('The model does not contain visible geometry.');

  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = targetHeight / maxDim;
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(model);
  const center = scaledBox.getCenter(new THREE.Vector3());

  const wrapper = new THREE.Group();
  wrapper.name = 'NormalizedModel';
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= scaledBox.min.y;
  wrapper.add(model);
  wrapper.updateMatrixWorld(true);
  return wrapper;
}

function prepareResult(model: THREE.Object3D, height: number): THREE.Object3D {
  cloneAndPrepareMaterials(model);
  return normalizeModel(model, height);
}

export interface ImportedFile {
  name: string;
  ext: string;
  buffer: ArrayBuffer;
}

export async function parseModelFile(
  buffer: ArrayBuffer,
  ext: string,
  targetHeight = 2
): Promise<THREE.Object3D> {
  const normalizedExt = ext.toLowerCase().replace('.', '');
  switch (normalizedExt) {
    case 'glb':
    case 'gltf': {
      const loader = new GLTFLoader();
      const gltf = await loader.parseAsync(buffer, '');
      if (!gltf.scene) throw new Error('glTF file contained no scene.');
      return prepareResult(gltf.scene, targetHeight);
    }
    case 'obj': {
      const text = new TextDecoder().decode(buffer);
      const object = new OBJLoader().parse(text);
      return prepareResult(object, targetHeight);
    }
    case 'stl': {
      const geometry = new STLLoader().parse(buffer);
      geometry.computeVertexNormals();
      const material = new THREE.MeshStandardMaterial({
        color: 0xd6d9de,
        roughness: 0.45,
        metalness: 0.15
      });
      return prepareResult(new THREE.Mesh(geometry, material), targetHeight);
    }
    case 'ply': {
      const geometry = new PLYLoader().parse(buffer);
      geometry.computeVertexNormals();
      const material = new THREE.MeshStandardMaterial({
        color: 0xd6d9de,
        roughness: 0.5,
        metalness: 0.1,
        vertexColors: Boolean(geometry.getAttribute('color'))
      });
      return prepareResult(new THREE.Mesh(geometry, material), targetHeight);
    }
    case 'fbx': {
      const object = new FBXLoader().parse(buffer, '');
      return prepareResult(object, targetHeight);
    }
    default:
      throw new Error(
        `Unsupported format ".${normalizedExt}". Use GLB, GLTF, OBJ, STL, PLY or FBX. For Blender, export as GLB.`
      );
  }
}

export async function loadModelForObject(
  objectId: string,
  ext: string,
  targetHeight: number,
  onLoaded?: () => void
): Promise<THREE.Object3D | null> {
  const cached = parsedModelCache.get(objectId);
  if (cached) return cached;
  const source = modelSourceCache.get(objectId);
  if (!source) return null;
  const object = await parseModelFile(base64ToArrayBuffer(source), ext, targetHeight);
  parsedModelCache.set(objectId, object);
  onLoaded?.();
  return object;
}
