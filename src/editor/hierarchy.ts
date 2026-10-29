import * as THREE from 'three';
import { ProjectState, SceneObject, Vec3 } from './types';

function localMatrix(object: SceneObject): THREE.Matrix4 {
  const position = new THREE.Vector3(...object.position);
  const quaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(object.rotation[0]),
      THREE.MathUtils.degToRad(object.rotation[1]),
      THREE.MathUtils.degToRad(object.rotation[2]),
      'XYZ'
    )
  );
  const scale = new THREE.Vector3(...object.scale);
  return new THREE.Matrix4().compose(position, quaternion, scale);
}

export function objectWorldMatrix(
  project: ProjectState,
  objectId: string,
  seen = new Set<string>()
): THREE.Matrix4 {
  const object = project.objects.find((item) => item.id === objectId);
  if (!object || seen.has(objectId)) return new THREE.Matrix4();
  seen.add(objectId);
  const parent = object.parentId
    ? project.objects.find((item) => item.id === object.parentId)
    : undefined;
  if (!parent) return localMatrix(object);
  return objectWorldMatrix(project, parent.id, seen).multiply(localMatrix(object));
}

export function parentWorldMatrix(project: ProjectState, parentId?: string | null): THREE.Matrix4 {
  return parentId ? objectWorldMatrix(project, parentId) : new THREE.Matrix4();
}

export function isDescendant(project: ProjectState, objectId: string, potentialAncestorId: string): boolean {
  let cursor = project.objects.find((item) => item.id === objectId);
  const seen = new Set<string>();
  while (cursor?.parentId && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    if (cursor.parentId === potentialAncestorId) return true;
    cursor = project.objects.find((item) => item.id === cursor?.parentId);
  }
  return false;
}

export function reparentPreservingWorld(
  project: ProjectState,
  objectId: string,
  newParentId: string | null
): boolean {
  const object = project.objects.find((item) => item.id === objectId);
  if (!object) return false;
  if (newParentId === objectId) return false;
  if (newParentId && isDescendant(project, newParentId, objectId)) return false;

  const world = objectWorldMatrix(project, objectId);
  const parentWorld = parentWorldMatrix(project, newParentId);
  const local = parentWorld.clone().invert().multiply(world);
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  local.decompose(position, quaternion, scale);
  const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');

  object.parentId = newParentId;
  object.position = [position.x, position.y, position.z].map((value) => Number(value.toFixed(5))) as Vec3;
  object.rotation = [
    THREE.MathUtils.radToDeg(euler.x),
    THREE.MathUtils.radToDeg(euler.y),
    THREE.MathUtils.radToDeg(euler.z)
  ].map((value) => Number(value.toFixed(3))) as Vec3;
  object.scale = [scale.x, scale.y, scale.z].map((value) => Number(value.toFixed(5))) as Vec3;
  return true;
}

/** Reparent direct children before deleting a Null so their world pose survives. */
export function unparentChildrenOf(project: ProjectState, objectId: string): void {
  const object = project.objects.find((item) => item.id === objectId);
  if (!object) return;
  const children = project.objects.filter((item) => item.parentId === objectId);
  for (const child of children) {
    reparentPreservingWorld(project, child.id, object.parentId ?? null);
  }
}
