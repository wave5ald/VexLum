import {
  CameraState,
  Keyframe,
  KeyframeValue,
  LightState,
  MaterialState,
  ProjectState,
  SceneObject,
  Track,
  isBooleanProperty,
  isColorProperty
} from './types';

export interface TrackIndex {
  byObject: Map<string, Map<string, Track>>;
  byObjectAll: Map<string, Track[]>;
}

export function buildTrackIndex(tracks: Track[]): TrackIndex {
  const byObject = new Map<string, Map<string, Track>>();
  const byObjectAll = new Map<string, Track[]>();
  for (const track of tracks) {
    if (!track.keys.length) continue;
    let map = byObject.get(track.objectId);
    if (!map) {
      map = new Map();
      byObject.set(track.objectId, map);
    }
    map.set(track.property, track);
    const list = byObjectAll.get(track.objectId) || [];
    list.push(track);
    byObjectAll.set(track.objectId, list);
  }
  return { byObject, byObjectAll };
}

export function sortedKeys(track: Track): Keyframe[] {
  return [...track.keys].sort((a, b) => a.time - b.time);
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function applyEase(t: number, interp: Keyframe['interp']): number {
  switch (interp) {
    case 'step':
      return 0;
    case 'linear':
      return t;
    case 'ease':
      return t * t * (3 - 2 * t);
    case 'bezier':
    default:
      return easeInOutCubic(t);
  }
}

function numericValue(key: Keyframe): number {
  return typeof key.value === 'number' ? key.value : parseFloat(String(key.value)) || 0;
}

/** Automatic Catmull-Rom style slope through a key, in value units / second. */
function autoSlope(keys: Keyframe[], index: number): number {
  if (index <= 0 || index >= keys.length - 1) return 0;
  const previous = keys[index - 1];
  const next = keys[index + 1];
  const span = next.time - previous.time;
  if (span <= 1e-6) return 0;
  return (numericValue(next) - numericValue(previous)) / span;
}

export function keyTangent(
  key: Keyframe,
  keys: Keyframe[],
  index: number,
  side: 'in' | 'out'
): number {
  const explicit = side === 'in' ? key.tangentIn : key.tangentOut;
  if (explicit !== undefined && Number.isFinite(explicit)) return explicit;
  return autoSlope(keys, index);
}

/** Default bezier handle length, as a fraction of the gap to the next key. */
export const DEFAULT_INFLUENCE = 1 / 3;
export const MIN_INFLUENCE = 0.02;
export const MAX_INFLUENCE = 0.93;

/** Handle length for one side of a key, clamped to a usable fraction. */
export function keyInfluence(key: Keyframe, side: 'in' | 'out'): number {
  const raw = side === 'in' ? key.influenceIn : key.influenceOut;
  if (raw === undefined || !Number.isFinite(raw)) return DEFAULT_INFLUENCE;
  return Math.min(MAX_INFLUENCE, Math.max(MIN_INFLUENCE, raw));
}

function cubicAt(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

/** Inverts the time axis of a cubic bezier so a time can be mapped to its curve step. */
function solveBezierT(c1: number, c2: number, x: number): number {
  let t = x;
  for (let i = 0; i < 8; i++) {
    const current = cubicAt(0, c1, c2, 1, t);
    const error = current - x;
    if (Math.abs(error) < 1e-6) return t;
    const mt = 1 - t;
    const slope =
      3 * mt * mt * c1 + 6 * mt * t * (c2 - c1) + 3 * t * t * (1 - c2);
    if (Math.abs(slope) < 1e-6) break;
    t -= error / slope;
    if (t < 0 || t > 1) {
      t = Math.min(1, Math.max(0, t));
      break;
    }
  }
  let low = 0;
  let high = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (cubicAt(0, c1, c2, 1, mid) < x) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/**
 * Bezier segment with draggable handles. The default handle length (1/3 of the
 * gap) reproduces a Hermite segment exactly, so old animations are unchanged.
 */
function bezierSegment(
  v0: number,
  v1: number,
  m0: number,
  m1: number,
  span: number,
  raw: number,
  outInfluence: number,
  inInfluence: number
): number {
  let o = Math.min(MAX_INFLUENCE, Math.max(MIN_INFLUENCE, outInfluence));
  let i = Math.min(MAX_INFLUENCE, Math.max(MIN_INFLUENCE, inInfluence));
  if (o + i > 0.98) {
    const scale = 0.98 / (o + i);
    o *= scale;
    i *= scale;
  }
  const t = solveBezierT(o, 1 - i, raw);
  return cubicAt(v0, v0 + m0 * o * span, v1 - m1 * i * span, v1, t);
}

export function sampleTrack(track: Track, time: number, fallback: KeyframeValue): KeyframeValue {
  const keys = sortedKeys(track);
  if (keys.length === 0) return fallback;
  if (time <= keys[0].time) return keys[0].value;
  if (time >= keys[keys.length - 1].time) return keys[keys.length - 1].value;

  let index = 0;
  for (let i = 0; i < keys.length - 1; i++) {
    if (time >= keys[i].time && time <= keys[i + 1].time) {
      index = i;
      break;
    }
  }

  const a = keys[index];
  const b = keys[index + 1];
  const span = Math.max(0.000001, b.time - a.time);
  const raw = Math.min(1, Math.max(0, (time - a.time) / span));

  if (isColorProperty(track.property)) {
    return lerpHexColor(String(a.value), String(b.value), applyEase(raw, a.interp));
  }

  if (isBooleanProperty(track.property) || typeof a.value === 'boolean') {
    return raw >= 1 ? b.value : a.value;
  }

  const av = numericValue(a);
  const bv = numericValue(b);

  if (a.interp === 'bezier') {
    const m0 = keyTangent(a, keys, index, 'out');
    const m1 = keyTangent(b, keys, index + 1, 'in');
    return bezierSegment(
      av,
      bv,
      m0,
      m1,
      span,
      raw,
      keyInfluence(a, 'out'),
      keyInfluence(b, 'in')
    );
  }

  return av + (bv - av) * applyEase(raw, a.interp);
}

/** Numeric derivative of a track at `time`, used by the speed graph. */
export function sampleSpeed(track: Track, time: number, fallback: KeyframeValue = 0): number {
  if (isColorProperty(track.property) || isBooleanProperty(track.property)) return 0;
  const eps = 0.002;
  const before = Number(sampleTrack(track, Math.max(0, time - eps), fallback));
  const after = Number(sampleTrack(track, time + eps, fallback));
  if (!Number.isFinite(before) || !Number.isFinite(after)) return 0;
  return (after - before) / (eps * 2);
}


export function lerpHexColor(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  if (!ca || !cb) return t < 0.5 ? a : b;
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
  return rgbToHex(r, g, bl);
}

export function hexToRgb(hex: string): [number, number, number] | null {
  let value = (hex || '').trim();
  if (!value.startsWith('#')) value = `#${value}`;
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    return [
      parseInt(value[1] + value[1], 16),
      parseInt(value[2] + value[2], 16),
      parseInt(value[3] + value[3], 16)
    ];
  }
  if (/^#[0-9a-f]{6}$/i.test(value)) {
    return [
      parseInt(value.slice(1, 3), 16),
      parseInt(value.slice(3, 5), 16),
      parseInt(value.slice(5, 7), 16)
    ];
  }
  return null;
}

export function rgbToHex(r: number, g: number, b: number): string {
  const to = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function getNestedValue(target: unknown, path: string): unknown {
  const parts = path.split('.');
  let cursor: any = target;
  for (let i = 0; i < parts.length; i++) {
    if (cursor == null) return undefined;
    const part = parts[i];
    if (Array.isArray(cursor) && (part === 'x' || part === 'y' || part === 'z')) {
      cursor = cursor[part === 'x' ? 0 : part === 'y' ? 1 : 2];
    } else {
      cursor = cursor[part];
    }
  }
  return cursor;
}

export function setNestedValue(target: any, path: string, value: unknown): void {
  const parts = path.split('.');
  let cursor: any = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (Array.isArray(cursor) && (part === 'x' || part === 'y' || part === 'z')) {
      cursor = cursor[part === 'x' ? 0 : part === 'y' ? 1 : 2];
      continue;
    }
    if (cursor[part] == null || typeof cursor[part] !== 'object') cursor[part] = {};
    cursor = cursor[part];
  }
  const last = parts[parts.length - 1];
  if (Array.isArray(cursor) && (last === 'x' || last === 'y' || last === 'z')) {
    cursor[last === 'x' ? 0 : last === 'y' ? 1 : 2] = value;
  } else {
    cursor[last] = value;
  }
}

export function getBasePropertyValue(object: SceneObject, property: string): KeyframeValue {
  if (property === 'visible') return object.visible;
  const value = getNestedValue(object, property);
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  return 0;
}

export function cloneObjectState(object: SceneObject): SceneObject {
  return {
    ...object,
    position: [...object.position],
    rotation: [...object.rotation],
    scale: [...object.scale],
    material: object.material ? { ...object.material } : undefined,
    light: object.light
      ? { ...object.light, target: [...object.light.target] as [number, number, number] }
      : undefined,
    camera: object.camera
      ? { ...object.camera, target: [...object.camera.target] as [number, number, number] }
      : undefined,
    primitive: object.primitive ? { ...object.primitive } : undefined,
    model: object.model ? { ...object.model } : undefined
  };
}

export function evaluateObject(
  base: SceneObject,
  index: TrackIndex,
  time: number
): SceneObject {
  const object = cloneObjectState(base);
  const tracks = index.byObject.get(base.id);
  if (!tracks || tracks.size === 0) return object;

  if (object.light) object.light = { ...object.light, target: [...object.light.target] as [number, number, number] };
  if (object.camera) object.camera = { ...object.camera, target: [...object.camera.target] as [number, number, number] };

  for (const [property, track] of tracks) {
    if (!track.keys.length) continue;
    const fallback = getBasePropertyValue(base, property);
    const value = sampleTrack(track, time, fallback);
    setNestedValue(object, property, value);
  }
  return object;
}

export interface EvaluatedScene {
  objects: SceneObject[];
  byId: Map<string, SceneObject>;
  camera: SceneObject | undefined;
}

export function evaluateScene(project: ProjectState, time: number): EvaluatedScene {
  const index = buildTrackIndex(project.tracks);
  const objects = project.objects.map((object) => evaluateObject(object, index, time));
  const byId = new Map(objects.map((object) => [object.id, object]));
  const camera = objects.find((object) => object.kind === 'camera');
  return { objects, byId, camera };
}

export function ensureSortedKeys(track: Track): void {
  track.keys.sort((a, b) => a.time - b.time);
}

export function nearestKeyAt(track: Track, time: number, tolerance = 0.001): Keyframe | undefined {
  return track.keys.find((key) => Math.abs(key.time - time) <= tolerance);
}

export function formatValue(value: KeyframeValue, property: string): string {
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (typeof value === 'string') return value.toUpperCase();
  if (property.startsWith('rotation') || property.endsWith('angle')) return `${value.toFixed(1)}°`;
  if (property === 'camera.fov') return `${value.toFixed(1)}°`;
  return Number(value).toFixed(3).replace(/\.?0+$/, '') || '0';
}

export const KEYFRAME_MIME = 'application/x-monolith-keyframe';
