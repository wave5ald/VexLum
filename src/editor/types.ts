export type Vec3 = [number, number, number];

export type Interpolation = 'linear' | 'step' | 'ease' | 'bezier';

export type KeyframeValue = number | string | boolean;

export interface Keyframe {
  id: string;
  time: number;
  value: KeyframeValue;
  interp: Interpolation;
  /** Incoming tangent slope, in value units per second (bezier only). */
  tangentIn?: number;
  /** Outgoing tangent slope, in value units per second (bezier only). */
  tangentOut?: number;
  /** Incoming handle length as a fraction of the span to the previous key. */
  influenceIn?: number;
  /** Outgoing handle length as a fraction of the span to the next key. */
  influenceOut?: number;
}

export interface Track {
  id: string;
  objectId: string;
  property: string;
  keys: Keyframe[];
}

export type ObjectKind =
  | 'mannequin'
  | 'primitive'
  | 'model'
  | 'light'
  | 'camera'
  | 'script'
  | 'null';

/** How a camera derives its orientation. */
export type CameraAimMode = 'target' | 'free';

export type PhysicsMaterial = 'glass' | 'paper' | 'sponge' | 'slime';

export type EffectKind =
  | 'physics'
  | 'spin'
  | 'float'
  | 'orbit'
  | 'shake'
  | 'glow'
  | 'fade'
  | 'pulse'
  | 'lookAt'
  | 'colorCycle';

/** A procedural, time-based effect applied on top of an object's keyframes. */
export interface SceneEffect {
  id: string;
  kind: EffectKind;
  enabled: boolean;
  /** Seconds on the timeline where the effect starts. */
  start: number;
  /** Physics surface behaviour. */
  material?: PhysicsMaterial;
  /** Meaning depends on kind: height, radius, amplitude, intensity, degrees/sec. */
  amount?: number;
  /** Cycles per second (or physics tumble scale). */
  speed?: number;
  axis?: 'x' | 'y' | 'z';
  /** Physics floor height in world metres. */
  ground?: number;
  /** 0…1 impact restitution override. */
  bounce?: number;
  /** Downward acceleration override (m/s²). */
  gravity?: number;
  /** Accent colour for glow / colour-cycle effects. */
  color?: string;
}

export type PrimitiveType =
  | 'box'
  | 'sphere'
  | 'cylinder'
  | 'cone'
  | 'torus'
  | 'torusKnot'
  | 'plane'
  | 'icosahedron'
  | 'gear'
  | 'suzanne'
  | 'monolith';

export type LightKind = 'ambient' | 'hemisphere' | 'directional' | 'point' | 'spot' | 'rect';

export interface MaterialState {
  color: string;
  roughness: number;
  metalness: number;
  emissive: string;
  emissiveIntensity: number;
  opacity: number;
  wireframe: boolean;
  flatShading: boolean;
}

export interface LightState {
  kind: LightKind;
  color: string;
  groundColor: string;
  intensity: number;
  distance: number;
  decay: number;
  angle: number;
  penumbra: number;
  width: number;
  height: number;
  castShadow: boolean;
  target: Vec3;
}

export interface CameraState {
  fov: number;
  near: number;
  far: number;
  target: Vec3;
  /** 'target' = look-at rig (target drives rotation). 'free' = keyable Euler rotation. */
  aimMode: CameraAimMode;
}

export interface ScriptState {
  source: string;
  /** Changes on every run so the engine rebuilds even for identical source. */
  runId?: string;
}

export interface ModelState {
  fileName: string;
  ext: string;
  height: number;
}

export interface PrimitiveState {
  type: PrimitiveType;
  size: number;
}

export interface SceneObject {
  id: string;
  name: string;
  kind: ObjectKind;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  visible: boolean;
  locked: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
  material?: MaterialState;
  light?: LightState;
  camera?: CameraState;
  primitive?: PrimitiveState;
  model?: ModelState;
  script?: ScriptState;
  mannequinIndex?: number;
  /** Parent transform (normally a Null). Local transforms animate under it. */
  parentId?: string | null;
  /** Stack of procedural effects applied after keyframe evaluation. */
  effects?: SceneEffect[];
  /** Last runtime error from a script object (not persisted). */
  scriptError?: string;
}

export type EnvironmentPreset = 'studio' | 'garden' | 'street' | 'void' | 'sunset';

export interface SceneSettings {
  /** Procedural surroundings preset built by the scene engine. */
  environment: EnvironmentPreset;
  background: string;
  fogEnabled: boolean;
  fogColor: string;
  fogDensity: number;
  floorColor: string;
  wallColor: string;
  exposure: number;
  environmentIntensity: number;
  gridVisible: boolean;
  schematicsVisible: boolean;
  contactShadows: boolean;
}

export interface TimelineSettings {
  duration: number;
  fps: number;
  loop: boolean;
}

export type VideoFormat = 'mp4' | 'webm';

export interface VideoSettings {
  width: number;
  height: number;
  fps: number;
  format: VideoFormat;
  bitrateMbps: number;
  start: number;
  end: number;
  antialias: boolean;
  shadows: boolean;
  keyframeInterval: number;
  motionBlur: boolean;
}

export interface ProjectState {
  version: number;
  name: string;
  objects: SceneObject[];
  tracks: Track[];
  settings: SceneSettings;
  timeline: TimelineSettings;
  video: VideoSettings;
}

export interface ProjectFile {
  app: 'vexlum' | 'monolith-studio';
  version: number;
  savedAt: string;
  project: ProjectState;
  models: Record<string, string>;
}

export const NUMERIC_PROPERTIES = [
  'position.x',
  'position.y',
  'position.z',
  'rotation.x',
  'rotation.y',
  'rotation.z',
  'scale.x',
  'scale.y',
  'scale.z',
  'material.roughness',
  'material.metalness',
  'material.emissiveIntensity',
  'material.opacity',
  'light.intensity',
  'light.distance',
  'light.decay',
  'light.angle',
  'light.penumbra',
  'light.target.x',
  'light.target.y',
  'light.target.z',
  'camera.fov',
  'camera.target.x',
  'camera.target.y',
  'camera.target.z'
] as const;

export const COLOR_PROPERTIES = [
  'material.color',
  'material.emissive',
  'light.color',
  'light.groundColor'
] as const;

export const BOOLEAN_PROPERTIES = ['visible', 'material.wireframe'] as const;

export function isColorProperty(property: string): boolean {
  return (COLOR_PROPERTIES as readonly string[]).includes(property);
}

export function isBooleanProperty(property: string): boolean {
  return (BOOLEAN_PROPERTIES as readonly string[]).includes(property);
}

export const PROPERTY_LABELS: Record<string, string> = {
  'position.x': 'Position X',
  'position.y': 'Position Y',
  'position.z': 'Position Z',
  'rotation.x': 'Rotation X',
  'rotation.y': 'Rotation Y',
  'rotation.z': 'Rotation Z',
  'scale.x': 'Scale X',
  'scale.y': 'Scale Y',
  'scale.z': 'Scale Z',
  'material.color': 'Base Color',
  'material.roughness': 'Roughness',
  'material.metalness': 'Metalness',
  'material.emissive': 'Emissive',
  'material.emissiveIntensity': 'Emissive Intensity',
  'material.opacity': 'Opacity',
  'material.wireframe': 'Wireframe',
  'light.color': 'Light Color',
  'light.groundColor': 'Ground Color',
  'light.intensity': 'Intensity',
  'light.distance': 'Distance',
  'light.decay': 'Decay',
  'light.angle': 'Cone Angle',
  'light.penumbra': 'Penumbra',
  'light.target.x': 'Target X',
  'light.target.y': 'Target Y',
  'light.target.z': 'Target Z',
  'camera.fov': 'Field of View',
  'camera.target.x': 'Target X',
  'camera.target.y': 'Target Y',
  'camera.target.z': 'Target Z',
  visible: 'Visibility'
};

export const PROPERTY_COLORS: Record<string, string> = {
  'position.x': '#f87171',
  'position.y': '#4ade80',
  'position.z': '#60a5fa',
  'rotation.x': '#fb923c',
  'rotation.y': '#a3e635',
  'rotation.z': '#38bdf8',
  'scale.x': '#f472b6',
  'scale.y': '#34d399',
  'scale.z': '#818cf8',
  'material.roughness': '#fbbf24',
  'material.metalness': '#e879f9',
  'material.emissiveIntensity': '#facc15',
  'material.opacity': '#c084fc',
  'light.intensity': '#fde047',
  'light.distance': '#fb7185',
  'light.decay': '#fdba74',
  'light.angle': '#f59e0b',
  'light.penumbra': '#fcd34d',
  'light.target.x': '#fca5a5',
  'light.target.y': '#86efac',
  'light.target.z': '#93c5fd',
  'camera.fov': '#22d3ee',
  'camera.target.x': '#67e8f9',
  'camera.target.y': '#2dd4bf',
  'camera.target.z': '#38bdf8',
  visible: '#94a3b8'
};

export const DEFAULT_MATERIAL: MaterialState = {
  color: '#c02626',
  roughness: 0.4,
  metalness: 0.12,
  emissive: '#000000',
  emissiveIntensity: 0,
  opacity: 1,
  wireframe: false,
  flatShading: false
};

export const DEFAULT_CAMERA: CameraState = {
  fov: 34,
  near: 0.05,
  far: 250,
  target: [0, 1.1, 0],
  aimMode: 'target'
};

export const DEFAULT_VIDEO: VideoSettings = {
  width: 1920,
  height: 1080,
  fps: 30,
  format: 'mp4',
  bitrateMbps: 24,
  start: 0,
  end: 8,
  antialias: true,
  shadows: true,
  keyframeInterval: 60,
  motionBlur: false
};

export function uid(prefix = 'id'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36).slice(-4)}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
