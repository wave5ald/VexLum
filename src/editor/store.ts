import { create } from 'zustand';
import {
  DEFAULT_CAMERA,
  DEFAULT_MATERIAL,
  DEFAULT_VIDEO,
  CameraAimMode,
  EffectKind,
  EnvironmentPreset,
  Interpolation,
  Keyframe,
  KeyframeValue,
  LightKind,
  NUMERIC_PROPERTIES,
  PrimitiveType,
  ProjectState,
  SceneEffect,
  SceneObject,
  SceneSettings,
  TimelineSettings,
  Track,
  Vec3,
  VideoSettings,
  clamp,
  isBooleanProperty,
  isColorProperty,
  uid
} from './types';
import {
  applyFormation,
  createDefaultProject,
  createEmptyProject,
  makeCamera,
  makeLight,
  makePrimitive,
  setWhiteMannequin,
  FormationType
} from './defaultScene';
import { getBasePropertyValue, setNestedValue } from './animation';
import { lookAtRotation, targetFromRotation } from './cameraMath';
import { DEFAULT_SCRIPT } from './scripts';
import { clearModelCaches } from './loaders';
import { isDescendant, reparentPreservingWorld, unparentChildrenOf } from './hierarchy';
import { normalizeEffect, makeEffect } from './effects';
import { environmentSettings } from './environments';
import type { GraphClipboard } from './graphClipboard';
import type { TransformMode, ViewMode } from './SceneEngine';

export const GRAPH_ZOOM_MIN = 0.25;
export const GRAPH_ZOOM_MAX = 12;

export type EditorMode = 'scene' | 'animation' | 'render';
export type DockTab = 'timeline' | 'curves' | 'effects' | 'world' | 'render';
export type CameraMoveKind = 'dolly' | 'orbit' | 'crane' | 'reveal' | 'orbit180';

export interface SelectedKey {
  trackId: string;
  keyId: string;
}

export interface ToastMessage {
  id: number;
  text: string;
  tone: 'info' | 'success' | 'error';
}

export interface NewProjectOptions {
  name?: string;
  duration?: number;
  fps?: number;
  path?: string | null;
}

export interface EditorState {
  project: ProjectState;
  selectedId: string | null;
  selectedKey: SelectedKey | null;
  selectedKeys: SelectedKey[];
  scriptErrors: Record<string, string>;
  scriptEditorId: string | null;
  time: number;
  playing: boolean;
  autoKey: boolean;
  defaultInterp: Interpolation;
  transformMode: TransformMode;
  transformSpace: 'world' | 'local';
  snap: boolean;
  viewMode: ViewMode;
  mode: EditorMode;
  dockTab: DockTab;
  /** Horizontal zoom of the graph dock, where 1 fits the whole timeline. */
  graphZoom: number;
  /** Bumped when the workspace slider asks the graph to re-zoom. */
  graphZoomSeq: number;
  history: ProjectState[];
  future: ProjectState[];
  lastHistoryAt: number;
  /** Project snapshot captured when a continuous drag begins. */
  interactionStart: ProjectState | null;
  dirty: boolean;
  toast: ToastMessage | null;
  showHelp: boolean;
  showAbout: boolean;
  projectPath: string | null;

  setProject: (project: ProjectState, path?: string | null) => void;
  newProject: (options?: NewProjectOptions) => void;
  setProjectPath: (path: string | null) => void;
  setProjectName: (name: string) => void;
  setSelected: (id: string | null) => void;
  setSelectedKey: (key: SelectedKey | null) => void;
  selectKeys: (keys: SelectedKey[], mode?: 'replace' | 'add' | 'toggle') => void;
  clearKeySelection: () => void;
  selectAllKeys: (objectId?: string | null) => void;
  removeSelectedKeys: () => void;
  setKeyTimes: (moves: Array<{ trackId: string; keyId: string; time: number }>, record?: boolean) => void;
  pasteGraphClipboard: (
    objectId: string,
    clipboard: GraphClipboard,
    atTime: number
  ) => SelectedKey[];
  setKeyTangent: (
    trackId: string,
    keyId: string,
    side: 'in' | 'out',
    slope: number,
    record?: boolean
  ) => void;
  setKeyInfluence: (
    trackId: string,
    keyId: string,
    side: 'in' | 'out',
    influence: number,
    record?: boolean
  ) => void;
  resetKeyTangent: (trackId: string, keyId: string, side?: 'in' | 'out') => void;
  beginInteraction: () => void;
  endInteraction: () => void;
  seek: (time: number) => void;
  setPlaying: (playing: boolean) => void;
  togglePlaying: () => void;
  setAutoKey: (enabled: boolean) => void;
  setDefaultInterp: (interp: Interpolation) => void;
  setTransformMode: (mode: TransformMode) => void;
  setTransformSpace: (space: 'world' | 'local') => void;
  setSnap: (enabled: boolean) => void;
  setViewMode: (mode: ViewMode) => void;
  setMode: (mode: EditorMode) => void;
  setDockTab: (tab: DockTab) => void;
  setGraphZoom: (zoom: number) => void;
  reportGraphZoom: (zoom: number) => void;
  setToast: (text: string, tone?: ToastMessage['tone']) => void;
  clearToast: () => void;
  setShowHelp: (open: boolean) => void;
  setShowAbout: (open: boolean) => void;

  updateObject: (id: string, patch: Partial<SceneObject>, options?: { record?: boolean }) => void;
  updateObjectProperty: (id: string, property: string, value: KeyframeValue, keyframe?: boolean) => void;
  autoKeyTransform: (
    id: string,
    transform: { position: Vec3; rotation: Vec3; scale: Vec3 },
    time: number
  ) => void;
  renameObject: (id: string, name: string) => void;
  toggleObjectVisibility: (id: string) => void;
  toggleObjectLock: (id: string) => void;
  addObject: (object: SceneObject) => void;
  addPrimitive: (type: PrimitiveType) => void;
  addLight: (kind: LightKind) => void;
  addCamera: () => void;
  addScriptObject: () => void;
  addNull: () => void;
  setObjectParent: (id: string, parentId: string | null) => void;
  createParentNull: (id: string) => void;
  addEffect: (objectId: string, kind: EffectKind, start?: number) => string | null;
  updateEffect: (objectId: string, effectId: string, patch: Partial<SceneEffect>) => void;
  removeEffect: (objectId: string, effectId: string) => void;
  triggerEffect: (objectId: string, effectId: string, time?: number) => void;
  updateScript: (id: string, source: string) => void;
  setScriptError: (id: string, message: string | null) => void;
  openScriptEditor: (id: string) => void;
  closeScriptEditor: () => void;
  duplicateObject: (id: string) => void;
  removeObject: (id: string) => void;

  addKey: (
    objectId: string,
    property: string,
    time: number,
    value?: KeyframeValue,
    interp?: Interpolation
  ) => void;
  addTransformKeys: (objectId: string, time: number) => void;
  addAllMaterialKeys: (objectId: string, time: number) => void;
  addAllLightKeys: (objectId: string, time: number) => void;
  addAllCameraKeys: (objectId: string, time: number) => void;
  removeKey: (trackId: string, keyId: string) => void;
  updateKey: (
    trackId: string,
    keyId: string,
    patch: { time?: number; value?: KeyframeValue; interp?: Interpolation },
    record?: boolean
  ) => void;
  setKeyInterp: (trackId: string, keyId: string, interp: Interpolation) => void;
  removeTrack: (trackId: string) => void;
  clearObjectAnimation: (objectId: string) => void;
  addCameraMove: (kind: CameraMoveKind, duration?: number) => void;

  applyFormation: (formation: FormationType) => void;
  setWhiteSubject: (index: number) => void;
  setSceneCameraView: (view: { position: Vec3; target: Vec3; fov: number }) => void;
  setCameraAimMode: (id: string, mode: CameraAimMode) => void;
  setCameraTarget: (id: string, target: Vec3, record?: boolean) => void;
  setSettings: (patch: Partial<SceneSettings>) => void;
  setEnvironment: (preset: EnvironmentPreset) => void;
  reorderObject: (id: string, toIndex: number) => void;
  setTimeline: (patch: Partial<TimelineSettings>) => void;
  setVideo: (patch: Partial<VideoSettings>) => void;
  undo: () => void;
  redo: () => void;
  markSaved: (path?: string | null) => void;
}

function withHistory(state: EditorState, project: ProjectState): Partial<EditorState> {
  const now = Date.now();
  const shouldRecord = now - state.lastHistoryAt > 450;
  const history = shouldRecord
    ? [...state.history, structuredClone(state.project)].slice(-80)
    : state.history;
  return {
    project,
    history,
    future: [],
    lastHistoryAt: now,
    dirty: true
  };
}

function mutate(state: EditorState, fn: (project: ProjectState) => void): Partial<EditorState> {
  const project = structuredClone(state.project);
  fn(project);
  return withHistory(state, project);
}

function findObject(project: ProjectState, id: string): SceneObject | undefined {
  return project.objects.find((object) => object.id === id);
}

function upsertKey(
  project: ProjectState,
  objectId: string,
  property: string,
  time: number,
  value: KeyframeValue,
  interp: Interpolation,
  tolerance = 0.03
): void {
  let track = project.tracks.find((item) => item.objectId === objectId && item.property === property);
  if (!track) {
    track = { id: uid('track'), objectId, property, keys: [] };
    project.tracks.push(track);
  }
  const existing = track.keys.find((key) => Math.abs(key.time - time) <= tolerance);
  if (existing) {
    existing.value = value;
    existing.interp = interp;
    existing.time = Number(time.toFixed(4));
  } else {
    track.keys.push({
      id: uid('key'),
      time: Number(time.toFixed(4)),
      value,
      interp
    });
  }
  track.keys.sort((a, b) => a.time - b.time);
}

function valueForProperty(object: SceneObject, property: string): KeyframeValue {
  return getBasePropertyValue(object, property);
}

function pickLightPosition(kind: LightKind): Vec3 {
  switch (kind) {
    case 'directional':
      return [4, 6.5, 4];
    case 'spot':
      return [0, 5.4, -2.6];
    case 'point':
      return [-3, 2.6, 2.5];
    case 'hemisphere':
      return [0, 6, 0];
    case 'rect':
      return [-2, 3, 2];
    default:
      return [0, 4, 0];
  }
}

export const useEditorStore = create<EditorState>((set, get) => ({
  project: createDefaultProject(),
  selectedId: null,
  selectedKey: null,
  selectedKeys: [],
  scriptErrors: {},
  scriptEditorId: null,
  time: 0,
  playing: false,
  autoKey: true,
  defaultInterp: 'bezier',
  transformMode: 'translate',
  transformSpace: 'world',
  snap: false,
  viewMode: 'editor',
  mode: 'scene',
  dockTab: 'timeline',
  graphZoom: 1,
  graphZoomSeq: 0,
  history: [],
  future: [],
  lastHistoryAt: 0,
  interactionStart: null,
  dirty: false,
  toast: null,
  showHelp: false,
  showAbout: false,
  projectPath: null,

  setProject: (project, path = null) =>
    set({
      project,
      selectedId: null,
      selectedKey: null,
      selectedKeys: [],
      scriptErrors: {},
      scriptEditorId: null,
      time: 0,
      playing: false,
      history: [],
      future: [],
      lastHistoryAt: 0,
      interactionStart: null,
      dirty: false,
      projectPath: path
    }),

  newProject: (options = {}) => {
    clearModelCaches();
    const project = createEmptyProject();
    if (options.name?.trim()) project.name = options.name.trim();
    if (Number.isFinite(options.duration) && Number(options.duration) > 0) {
      const duration = Math.max(1, Math.min(3600, Number(options.duration)));
      project.timeline.duration = duration;
      project.video.end = duration;
      project.video.start = 0;
    }
    if (Number.isFinite(options.fps) && Number(options.fps) > 0) {
      project.timeline.fps = Math.max(1, Math.min(120, Number(options.fps)));
      project.video.fps = project.timeline.fps;
    }
    get().setProject(project, options.path ?? null);
    get().setToast('New scene created', 'success');
  },

  setProjectPath: (path) => set({ projectPath: path }),

  setProjectName: (name) => set((state) => mutate(state, (project) => {
    project.name = name.trim() || 'Untitled Scene';
  })),

  setSelected: (id) => set({ selectedId: id, selectedKey: null, selectedKeys: [] }),
  setSelectedKey: (key) =>
    set({ selectedKey: key, selectedKeys: key ? [key] : [] }),

  selectKeys: (keys, mode = 'replace') =>
    set((state) => {
      const signature = (key: SelectedKey) => `${key.trackId}:${key.keyId}`;
      const incoming = new Map(keys.map((key) => [signature(key), key]));
      let next: SelectedKey[] = [];
      if (mode === 'replace') {
        next = [...incoming.values()];
      } else {
        const existing = new Map(state.selectedKeys.map((key) => [signature(key), key]));
        if (mode === 'add') {
          for (const [id, key] of incoming) existing.set(id, key);
          next = [...existing.values()];
        } else {
          for (const [id, key] of incoming) {
            if (existing.has(id)) existing.delete(id);
            else existing.set(id, key);
          }
          next = [...existing.values()];
        }
      }
      return {
        selectedKeys: next,
        selectedKey: next.length ? next[next.length - 1] : null
      };
    }),

  clearKeySelection: () => set({ selectedKey: null, selectedKeys: [] }),

  selectAllKeys: (objectId) =>
    set((state) => {
      const tracks = objectId
        ? state.project.tracks.filter((track) => track.objectId === objectId)
        : state.project.tracks;
      const keys = tracks.flatMap((track) =>
        track.keys.map((key) => ({ trackId: track.id, keyId: key.id }))
      );
      return {
        selectedKeys: keys,
        selectedKey: keys.length ? keys[keys.length - 1] : null
      };
    }),

  removeSelectedKeys: () =>
    set((state) => {
      if (!state.selectedKeys.length) return {};
      const doomed = new Set(
        state.selectedKeys.map((key) => `${key.trackId}:${key.keyId}`)
      );
      const project = structuredClone(state.project);
      for (const track of project.tracks) {
        track.keys = track.keys.filter((key) => !doomed.has(`${track.id}:${key.id}`));
      }
      project.tracks = project.tracks.filter((track) => track.keys.length > 0);
      return {
        ...withHistory(state, project),
        selectedKey: null,
        selectedKeys: []
      };
    }),

  setKeyTimes: (moves, record = false) =>
    set((state) => {
      if (!moves.length) return {};
      const project = structuredClone(state.project);
      const byId = new Map(project.tracks.map((track) => [track.id, track]));
      for (const move of moves) {
        const track = byId.get(move.trackId);
        const key = track?.keys.find((item) => item.id === move.keyId);
        if (!key) continue;
        key.time = clamp(Number(move.time.toFixed(4)), 0, project.timeline.duration);
      }
      for (const track of project.tracks) track.keys.sort((a, b) => a.time - b.time);
      if (record) return withHistory(state, project);
      return { project, dirty: true };
    }),

  pasteGraphClipboard: (objectId, clipboard, atTime) => {
    const state = get();
    const object = findObject(state.project, objectId);
    if (!object || !clipboard.keys.length) return [];
    const project = structuredClone(state.project);
    const pasted: SelectedKey[] = [];
    const endTime = project.timeline.duration;

    for (const item of clipboard.keys) {
      const time = clamp(atTime + item.offset, 0, endTime);
      let track = project.tracks.find(
        (entry) => entry.objectId === objectId && entry.property === item.property
      );
      if (!track) {
        track = { id: uid('track'), objectId, property: item.property, keys: [] };
        project.tracks.push(track);
      }
      let key = track.keys.find((entry) => Math.abs(entry.time - time) <= 0.0015);
      if (key) {
        key.value = item.value;
        key.interp = item.interp;
      } else {
        key = {
          id: uid('key'),
          time: Number(time.toFixed(4)),
          value: item.value,
          interp: item.interp
        };
        track.keys.push(key);
      }
      if (item.tangentIn !== undefined) key.tangentIn = item.tangentIn;
      else delete key.tangentIn;
      if (item.tangentOut !== undefined) key.tangentOut = item.tangentOut;
      else delete key.tangentOut;
      if (item.influenceIn !== undefined) key.influenceIn = item.influenceIn;
      else delete key.influenceIn;
      if (item.influenceOut !== undefined) key.influenceOut = item.influenceOut;
      else delete key.influenceOut;
      pasted.push({ trackId: track.id, keyId: key.id });
    }

    for (const track of project.tracks) track.keys.sort((a, b) => a.time - b.time);
    const unique = [...new Map(pasted.map((item) => [`${item.trackId}:${item.keyId}`, item])).values()];
    set({
      ...withHistory(state, project),
      selectedKeys: unique,
      selectedKey: unique.length ? unique[unique.length - 1] : null
    });
    return unique;
  },

  setKeyTangent: (trackId, keyId, side, slope, record = true) =>
    set((state) => {
      const project = structuredClone(state.project);
      const track = project.tracks.find((item) => item.id === trackId);
      const key = track?.keys.find((item) => item.id === keyId);
      if (!key) return {};
      if (side === 'in') key.tangentIn = Number(slope.toFixed(4));
      else key.tangentOut = Number(slope.toFixed(4));
      if (record) return withHistory(state, project);
      return { project, dirty: true };
    }),

  setKeyInfluence: (trackId, keyId, side, influence, record = true) =>
    set((state) => {
      const project = structuredClone(state.project);
      const track = project.tracks.find((item) => item.id === trackId);
      const key = track?.keys.find((item) => item.id === keyId);
      if (!key) return {};
      const value = Math.min(0.93, Math.max(0.02, influence));
      if (side === 'in') key.influenceIn = Number(value.toFixed(4));
      else key.influenceOut = Number(value.toFixed(4));
      if (record) return withHistory(state, project);
      return { project, dirty: true };
    }),

  resetKeyTangent: (trackId, keyId, side) =>
    set((state) => {
      const project = structuredClone(state.project);
      const track = project.tracks.find((item) => item.id === trackId);
      const key = track?.keys.find((item) => item.id === keyId);
      if (!key) return {};
      if (side === 'in' || side === undefined) {
        delete key.tangentIn;
        delete key.influenceIn;
      }
      if (side === 'out' || side === undefined) {
        delete key.tangentOut;
        delete key.influenceOut;
      }
      return withHistory(state, project);
    }),

  beginInteraction: () => set((state) => ({ interactionStart: structuredClone(state.project) })),

  endInteraction: () =>
    set((state) => {
      if (!state.interactionStart) return {};
      return {
        history: [...state.history, state.interactionStart].slice(-80),
        future: [],
        interactionStart: null,
        lastHistoryAt: 0,
        dirty: true
      };
    }),


  seek: (time) => {
    const duration = get().project.timeline.duration;
    set({ time: clamp(time, 0, duration), playing: false });
  },

  setPlaying: (playing) => set({ playing }),
  togglePlaying: () => set((state) => ({ playing: !state.playing })),
  setAutoKey: (autoKey) => set({ autoKey }),
  setDefaultInterp: (defaultInterp) => set({ defaultInterp }),
  setTransformMode: (transformMode) => set({ transformMode }),
  setTransformSpace: (transformSpace) => set({ transformSpace }),
  setSnap: (snap) => set({ snap }),
  setViewMode: (viewMode) => set({ viewMode }),
  setMode: (mode) =>
    set((state) => ({
      mode,
      // Leaving the render studio always returns to the free editor camera so
      // the scene does not stay stuck inside the render camera.
      ...(state.mode === 'render' && mode !== 'render'
        ? { viewMode: 'editor' as ViewMode, playing: false }
        : {})
    })),
  setDockTab: (dockTab) => set({ dockTab }),
  setGraphZoom: (zoom) =>
    set((state) => ({
      graphZoom: clamp(zoom, GRAPH_ZOOM_MIN, GRAPH_ZOOM_MAX),
      graphZoomSeq: state.graphZoomSeq + 1
    })),
  reportGraphZoom: (zoom) =>
    set({ graphZoom: clamp(zoom, GRAPH_ZOOM_MIN, GRAPH_ZOOM_MAX) }),

  setToast: (text, tone = 'info') =>
    set({ toast: { id: Date.now(), text, tone } }),
  clearToast: () => set({ toast: null }),
  setShowHelp: (showHelp) => set({ showHelp }),
  setShowAbout: (showAbout) => set({ showAbout }),

  updateObject: (id, patch, options) =>
    set((state) =>
      mutate(state, (project) => {
        const object = findObject(project, id);
        if (!object) return;
        Object.assign(object, structuredClone(patch));
      })
    ),

  updateObjectProperty: (id, property, value, keyframe = false) =>
    set((state) => {
      const project = structuredClone(state.project);
      const object = findObject(project, id);
      if (!object) return {};
      if (property === 'visible') object.visible = Boolean(value);
      else setNestedValue(object, property, value);
      if (keyframe || (state.autoKey && hasAnyTrack(project, id) && isAnimatableProperty(property))) {
        upsertKey(project, id, property, state.time, value, state.defaultInterp);
      }
      return withHistory(state, project);
    }),

  autoKeyTransform: (id, transform, time) =>
    set((state) => {
      const base = findObject(state.project, id);
      if (!base) return {};
      const lookAtCamera = base.kind === 'camera' && base.camera?.aimMode !== 'free';
      const changes: Array<[string, KeyframeValue]> = [];
      const axes: Array<keyof typeof transform> = lookAtCamera
        ? ['position', 'scale']
        : ['position', 'rotation', 'scale'];
      for (const axis of axes) {
        for (let i = 0; i < 3; i++) {
          const property = `${axis}.${['x', 'y', 'z'][i]}`;
          const next = transform[axis][i];
          const previous = base[axis][i];
          if (Math.abs(next - previous) > 0.0001) changes.push([property, next]);
        }
      }
      if (!changes.length) return {};

      const project = structuredClone(state.project);
      const object = findObject(project, id);
      if (!object) return {};
      object.position = [...transform.position];
      if (!lookAtCamera) object.rotation = [...transform.rotation];
      object.scale = [...transform.scale];
      if (state.autoKey) {
        for (const [property, value] of changes) {
          upsertKey(project, id, property, time, value, state.defaultInterp);
        }
      }
      return withHistory(state, project);
    }),

  renameObject: (id, name) =>
    set((state) => mutate(state, (project) => {
      const object = findObject(project, id);
      if (object) object.name = name;
    })),

  toggleObjectVisibility: (id) =>
    set((state) => mutate(state, (project) => {
      const object = findObject(project, id);
      if (object) object.visible = !object.visible;
    })),

  toggleObjectLock: (id) =>
    set((state) => mutate(state, (project) => {
      const object = findObject(project, id);
      if (object) object.locked = !object.locked;
    })),

  addObject: (object) =>
    set((state) => {
      const project = structuredClone(state.project);
      project.objects.push(structuredClone(object));
      const next = withHistory(state, project);
      return { ...next, selectedId: object.id };
    }),

  addPrimitive: (type) => {
    get().addObject(makePrimitive(type, [2.6, 0, 2.6]));
    get().setToast(`${type} added to scene`, 'success');
  },

  addLight: (kind) => {
    const names: Record<LightKind, string> = {
      ambient: 'Ambient Light',
      hemisphere: 'Hemisphere Light',
      directional: 'Directional Light',
      point: 'Point Light',
      spot: 'Spot Light',
      rect: 'Rect Area Light'
    };
    const light = makeLight(kind, names[kind], pickLightPosition(kind));
    get().addObject(light);
    get().setToast(`${names[kind]} added`, 'success');
  },

  addCamera: () => {
    if (get().project.objects.some((object) => object.kind === 'camera')) {
      get().setToast('This project already has a render camera', 'info');
      return;
    }
    get().addObject(makeCamera());
    get().setToast('Camera added', 'success');
  },

  addScriptObject: () => {
    const object: SceneObject = {
      id: uid('script'),
      name: 'Script Object',
      kind: 'script',
      position: [3.2, 0, -0.8],
      rotation: [0, 0, 0],
      scale: [0.6, 0.6, 0.6],
      visible: true,
      locked: false,
      castShadow: true,
      receiveShadow: true,
      script: { source: DEFAULT_SCRIPT },
      material: { ...DEFAULT_MATERIAL, color: '#c02626' }
    };
    get().addObject(object);
    set({ scriptEditorId: object.id });
    get().setToast('Script object created — edit the code to build geometry', 'success');
  },

  addNull: () => {
    const existing = get().project.objects.filter((object) => object.kind === 'null').length;
    const object: SceneObject = {
      id: uid('null'),
      name: `Null ${String(existing + 1).padStart(2, '0')}`,
      kind: 'null',
      position: [0, 1.2, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      visible: true,
      locked: false,
      castShadow: false,
      receiveShadow: false,
      parentId: null
    };
    get().addObject(object);
    get().setToast('Null added — parent objects to it for free group control', 'success');
  },

  setObjectParent: (id, parentId) =>
    set((state) => {
      const project = structuredClone(state.project);
      const object = findObject(project, id);
      const parent = parentId ? findObject(project, parentId) : null;
      if (!object || (parentId && !parent)) return {};
      if (parentId && parent?.kind !== 'null') {
        state.setToast('Only Nulls can act as parent controls', 'error');
        return {};
      }
      if (parentId && (parentId === id || isDescendant(project, parentId, id))) {
        state.setToast('A parent cannot be inside its own child', 'error');
        return {};
      }
      if (!reparentPreservingWorld(project, id, parentId)) return {};
      return withHistory(state, project);
    }),

  createParentNull: (id) =>
    set((state) => {
      const project = structuredClone(state.project);
      const object = findObject(project, id);
      if (!object) return {};
      if (object.kind === 'light' || object.kind === 'camera') {
        state.setToast('Lights and cameras cannot be parented to a Null', 'error');
        return {};
      }
      const existing = project.objects.filter((item) => item.kind === 'null').length;
      const nullObject: SceneObject = {
        id: uid('null'),
        name: `${object.name} Control`,
        kind: 'null',
        position: [...object.position],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        visible: true,
        locked: false,
        castShadow: false,
        receiveShadow: false,
        parentId: object.parentId ?? null
      };
      project.objects.push(nullObject);
      object.parentId = nullObject.id;
      object.position = [0, 0, 0];
      // Shift position curves into the new parent's local space so existing
      // movement keeps its world placement.
      for (const track of project.tracks) {
        if (track.objectId !== id) continue;
        if (!track.property.startsWith('position.')) continue;
        const axis = track.property.endsWith('.x') ? 0 : track.property.endsWith('.y') ? 1 : 2;
        for (const key of track.keys) {
          if (typeof key.value === 'number') {
            key.value = Number((key.value - nullObject.position[axis]).toFixed(4));
          }
        }
      }
      return {
        ...withHistory(state, project),
        selectedId: nullObject.id,
        selectedKey: null,
        selectedKeys: []
      };
    }),

  addEffect: (objectId, kind, start) => {
    const object = findObject(get().project, objectId);
    if (!object) return null;
    const effect = makeEffect(kind, start ?? get().time);
    set((state) => {
      const project = structuredClone(state.project);
      const target = findObject(project, objectId);
      if (!target) return {};
      target.effects = [...(target.effects || []), effect];
      return withHistory(state, project);
    });
    get().setToast(`${kind === 'physics' ? 'Physics drop' : kind} effect added at the playhead`, 'success');
    return effect.id;
  },

  updateEffect: (objectId, effectId, patch) =>
    set((state) => {
      const project = structuredClone(state.project);
      const object = findObject(project, objectId);
      const effect = object?.effects?.find((item) => item.id === effectId);
      if (!object || !effect) return {};
      Object.assign(effect, patch, { id: effect.id, kind: effect.kind });
      return withHistory(state, project);
    }),

  removeEffect: (objectId, effectId) =>
    set((state) => {
      const project = structuredClone(state.project);
      const object = findObject(project, objectId);
      if (!object?.effects) return {};
      object.effects = object.effects.filter((effect) => effect.id !== effectId);
      return withHistory(state, project);
    }),

  triggerEffect: (objectId, effectId, time) =>
    set((state) => {
      const project = structuredClone(state.project);
      const object = findObject(project, objectId);
      const effect = object?.effects?.find((item) => item.id === effectId);
      if (!object || !effect) return {};
      effect.enabled = true;
      effect.start = Number(clamp(time ?? state.time, 0, project.timeline.duration).toFixed(4));
      return withHistory(state, project);
    }),

  updateScript: (id, source) =>
    set((state) => {
      const project = structuredClone(state.project);
      const object = findObject(project, id);
      if (!object) return {};
      object.script = { source, runId: uid('run') };
      delete object.scriptError;
      const scriptErrors = { ...state.scriptErrors };
      delete scriptErrors[id];
      return { ...withHistory(state, project), scriptErrors };
    }),

  setScriptError: (id, message) =>
    set((state) => {
      const scriptErrors = { ...state.scriptErrors };
      if (message) scriptErrors[id] = message;
      else delete scriptErrors[id];
      return { scriptErrors };
    }),

  openScriptEditor: (id) => set({ scriptEditorId: id }),
  closeScriptEditor: () => set({ scriptEditorId: null }),

  duplicateObject: (id) => {
    const state = get();
    const source = state.project.objects.find((object) => object.id === id);
    if (!source) return;
    const copy: SceneObject = structuredClone(source);
    copy.id = uid(source.kind);
    copy.name = `${source.name} Copy`;
    copy.position = [copy.position[0] + 0.6, copy.position[1], copy.position[2] + 0.3];
    const project = structuredClone(state.project);
    project.objects.push(copy);
    const sourceTracks = project.tracks.filter((track) => track.objectId === id);
    for (const track of sourceTracks) {
      project.tracks.push({
        id: uid('track'),
        objectId: copy.id,
        property: track.property,
        keys: track.keys.map((key) => ({ ...key, id: uid('key') }))
      });
    }
    set({ ...withHistory(state, project), selectedId: copy.id, selectedKey: null, selectedKeys: [] });
    get().setToast('Object duplicated', 'success');
  },

  removeObject: (id) => {
    const state = get();
    const object = state.project.objects.find((item) => item.id === id);
    if (!object) return;
    const project = structuredClone(state.project);
    if (object.kind === 'null') unparentChildrenOf(project, id);
    project.objects = project.objects.filter((item) => item.id !== id);
    project.tracks = project.tracks.filter((track) => track.objectId !== id);
    const scriptErrors = { ...state.scriptErrors };
    delete scriptErrors[id];
    // Keep the model source cached so undo / redo can restore the object.
    set({
      ...withHistory(state, project),
      selectedId: state.selectedId === id ? null : state.selectedId,
      selectedKey: null,
      selectedKeys: [],
      scriptErrors
    });
    get().setToast(
      object.kind === 'null' && object.parentId !== undefined
        ? `${object.name} removed — children kept in place`
        : `${object.name} removed`,
      'info'
    );
  },

  addKey: (objectId, property, time, value, interp) =>
    set((state) => {
      const object = findObject(state.project, objectId);
      if (!object) return {};
      const project = structuredClone(state.project);
      const resolved =
        value !== undefined
          ? value
          : isBooleanProperty(property)
            ? Boolean(getBasePropertyValue(object, property))
            : valueForProperty(object, property);
      upsertKey(
        project,
        objectId,
        property,
        clamp(time, 0, project.timeline.duration),
        resolved,
        interp || state.defaultInterp
      );
      return withHistory(state, project);
    }),

  addTransformKeys: (objectId, time) => {
    const object = findObject(get().project, objectId);
    if (!object) return;
    const lookAtCamera = object.kind === 'camera' && object.camera?.aimMode !== 'free';
    const groups = lookAtCamera
      ? (['position', 'scale'] as const)
      : (['position', 'rotation', 'scale'] as const);
    for (const property of groups) {
      for (const axis of ['x', 'y', 'z'] as const) {
        get().addKey(objectId, `${property}.${axis}`, time);
      }
    }
    get().setToast(
      lookAtCamera ? 'Camera position + scale keyed (aim is driven by target)' : 'Transform keyed at playhead',
      'success'
    );
  },

  addAllMaterialKeys: (objectId, time) => {
    const object = findObject(get().project, objectId);
    if (!object?.material) return;
    const keys: Array<[string, KeyframeValue]> = [
      ['material.color', object.material.color],
      ['material.roughness', object.material.roughness],
      ['material.metalness', object.material.metalness],
      ['material.emissive', object.material.emissive],
      ['material.emissiveIntensity', object.material.emissiveIntensity],
      ['material.opacity', object.material.opacity]
    ];
    for (const [property, value] of keys) get().addKey(objectId, property, time, value);
    get().setToast('Material keyed at playhead', 'success');
  },

  addAllLightKeys: (objectId, time) => {
    const object = findObject(get().project, objectId);
    if (!object?.light) return;
    const keys: Array<[string, KeyframeValue]> = [
      ['light.color', object.light.color],
      ['light.intensity', object.light.intensity],
      ['light.target.x', object.light.target[0]],
      ['light.target.y', object.light.target[1]],
      ['light.target.z', object.light.target[2]]
    ];
    for (const [property, value] of keys) get().addKey(objectId, property, time, value);
    get().setToast('Light keyed at playhead', 'success');
  },

  addAllCameraKeys: (objectId, time) => {
    const object = findObject(get().project, objectId);
    if (!object?.camera) return;
    const keys: Array<[string, KeyframeValue]> = [
      ['position.x', object.position[0]],
      ['position.y', object.position[1]],
      ['position.z', object.position[2]],
      ['camera.target.x', object.camera.target[0]],
      ['camera.target.y', object.camera.target[1]],
      ['camera.target.z', object.camera.target[2]],
      ['camera.fov', object.camera.fov]
    ];
    for (const [property, value] of keys) get().addKey(objectId, property, time, value);
    get().setToast('Camera keyed at playhead', 'success');
  },

  removeKey: (trackId, keyId) =>
    set((state) => {
      const project = structuredClone(state.project);
      const track = project.tracks.find((item) => item.id === trackId);
      if (!track) return {};
      track.keys = track.keys.filter((key) => key.id !== keyId);
      if (!track.keys.length) project.tracks = project.tracks.filter((item) => item.id !== trackId);
      return {
        ...withHistory(state, project),
        selectedKey: state.selectedKey?.keyId === keyId ? null : state.selectedKey,
        selectedKeys: state.selectedKeys.filter((key) => key.keyId !== keyId || key.trackId !== trackId)
      };
    }),

  updateKey: (trackId, keyId, patch, record = false) =>
    set((state) => {
      const project = structuredClone(state.project);
      const track = project.tracks.find((item) => item.id === trackId);
      if (!track) return {};
      const key = track.keys.find((item) => item.id === keyId);
      if (!key) return {};
      if (patch.time !== undefined) key.time = clamp(patch.time, 0, project.timeline.duration);
      if (patch.value !== undefined) key.value = patch.value;
      if (patch.interp !== undefined) key.interp = patch.interp;
      track.keys.sort((a, b) => a.time - b.time);
      if (record) return withHistory(state, project);
      return { project, dirty: true };
    }),

  setKeyInterp: (trackId, keyId, interp) => get().updateKey(trackId, keyId, { interp }),

  removeTrack: (trackId) =>
    set((state) => {
      const project = structuredClone(state.project);
      project.tracks = project.tracks.filter((track) => track.id !== trackId);
      return withHistory(state, project);
    }),

  clearObjectAnimation: (objectId) =>
    set((state) => {
      const project = structuredClone(state.project);
      project.tracks = project.tracks.filter((track) => track.objectId !== objectId);
      return { ...withHistory(state, project), selectedKey: null, selectedKeys: [] };
    }),

  addCameraMove: (kind, duration) => {
    const state = get();
    const camera = state.project.objects.find((object) => object.kind === 'camera');
    if (!camera?.camera) {
      get().setToast('No camera in scene', 'error');
      return;
    }
    const total = clamp(duration || state.project.timeline.duration, 0.5, state.project.timeline.duration);
    const project = structuredClone(state.project);
    project.tracks = project.tracks.filter(
      (track) =>
        !(
          track.objectId === camera.id &&
          ['position.x', 'position.y', 'position.z', 'camera.target.x', 'camera.target.y', 'camera.target.z', 'camera.fov'].includes(
            track.property
          )
        )
    );

    const [px, py, pz] = camera.position;
    const target = camera.camera.target;
    const dx = px - target[0];
    const dz = pz - target[2];
    const radius = Math.max(1.2, Math.hypot(dx, dz));
    const angle = Math.atan2(dx, dz);
    const samples: Array<{ t: number; position: Vec3; target: Vec3; fov: number }> = [];

    if (kind === 'orbit' || kind === 'orbit180') {
      const sweep = kind === 'orbit' ? Math.PI / 2 : Math.PI;
      const steps = kind === 'orbit' ? 9 : 17;
      const direction = dx >= 0 ? 1 : -1;
      for (let i = 0; i < steps; i++) {
        const p = i / (steps - 1);
        const a = angle + direction * sweep * p;
        samples.push({
          t: total * p,
          position: [target[0] + Math.sin(a) * radius, py + Math.sin(p * Math.PI) * 0.35, target[2] + Math.cos(a) * radius],
          target: [...target] as Vec3,
          fov: camera.camera.fov
        });
      }
    } else if (kind === 'crane') {
      const start: Vec3 = [px, Math.max(0.45, py - 1.1), pz + 0.6];
      const end: Vec3 = [px, py + 1.5, pz - 0.9];
      samples.push({ t: 0, position: start, target: [...target] as Vec3, fov: camera.camera.fov });
      samples.push({
        t: total * 0.5,
        position: [px * 1.08, py + 0.2, pz - 0.2],
        target: [...target] as Vec3,
        fov: camera.camera.fov
      });
      samples.push({ t: total, position: end, target: [...target] as Vec3, fov: camera.camera.fov });
    } else if (kind === 'reveal') {
      const side = radius * 0.55;
      samples.push({
        t: 0,
        position: [px + side, Math.max(0.55, py - 0.8), pz + radius * 0.25],
        target: [...target] as Vec3,
        fov: Math.max(20, camera.camera.fov - 6)
      });
      samples.push({
        t: total * 0.6,
        position: [px + side * 0.3, py - 0.15, pz - 0.4],
        target: [...target] as Vec3,
        fov: camera.camera.fov
      });
      samples.push({
        t: total,
        position: [px - side * 0.15, py + 0.25, pz - 0.9],
        target: [...target] as Vec3,
        fov: camera.camera.fov + 2
      });
    } else {
      const distance = Math.max(0.9, radius - Math.max(1, radius * 0.35));
      const end: Vec3 = [
        target[0] + (dx / radius) * distance,
        py - 0.15,
        target[2] + (dz / radius) * distance
      ];
      samples.push({ t: 0, position: [px, py, pz], target: [...target] as Vec3, fov: camera.camera.fov });
      samples.push({ t: total, position: end, target: [...target] as Vec3, fov: camera.camera.fov - 1 });
    }

    const properties = ['position.x', 'position.y', 'position.z', 'camera.target.x', 'camera.target.y', 'camera.target.z', 'camera.fov'];
    for (const property of properties) {
      const track: Track = { id: uid('track'), objectId: camera.id, property, keys: [] };
      for (const sample of samples) {
        let value: number;
        if (property === 'position.x') value = sample.position[0];
        else if (property === 'position.y') value = sample.position[1];
        else if (property === 'position.z') value = sample.position[2];
        else if (property === 'camera.target.x') value = sample.target[0];
        else if (property === 'camera.target.y') value = sample.target[1];
        else if (property === 'camera.target.z') value = sample.target[2];
        else value = sample.fov;
        track.keys.push({
          id: uid('key'),
          time: Number(sample.t.toFixed(4)),
          value: Number(value.toFixed(4)),
          interp: 'ease'
        });
      }
      project.tracks.push(track);
    }

    set({
      ...withHistory(state, project),
      selectedId: camera.id,
      dockTab: 'curves',
      mode: 'animation',
      time: 0
    });
    get().setToast(`Camera move created — ${kind}`, 'success');
  },

  applyFormation: (formation) =>
    set((state) => mutate(state, (project) => {
      project.objects = applyFormation(project.objects, formation);
    })),

  setWhiteSubject: (index) =>
    set((state) => mutate(state, (project) => {
      project.objects = setWhiteMannequin(project.objects, index);
    })),

  setSceneCameraView: (view) =>
    set((state) => mutate(state, (project) => {
      const camera = project.objects.find((object) => object.kind === 'camera');
      if (!camera) return;
      camera.position = [...view.position];
      if (camera.camera) {
        camera.camera.target = [...view.target];
        camera.camera.fov = view.fov;
      }
    })),

  setCameraAimMode: (id, mode) =>
    set((state) => {
      const project = structuredClone(state.project);
      const object = findObject(project, id);
      if (!object?.camera || object.camera.aimMode === mode) return {};
      if (mode === 'free') {
        object.camera.aimMode = 'free';
        object.rotation = lookAtRotation(object.position, object.camera.target);
      } else {
        const distance = Math.max(
          2,
          Math.hypot(
            object.camera.target[0] - object.position[0],
            object.camera.target[1] - object.position[1],
            object.camera.target[2] - object.position[2]
          )
        );
        object.camera.aimMode = 'target';
        object.camera.target = targetFromRotation(object.position, object.rotation, distance);
      }
      return withHistory(state, project);
    }),

  setCameraTarget: (id, target, record = false) =>
    set((state) => {
      const project = structuredClone(state.project);
      const object = findObject(project, id);
      if (!object?.camera) return {};
      object.camera.target = [
        Number(target[0].toFixed(4)),
        Number(target[1].toFixed(4)),
        Number(target[2].toFixed(4))
      ];
      if (record) return withHistory(state, project);
      return { project, dirty: true };
    }),

  setSettings: (patch) =>
    set((state) => mutate(state, (project) => {
      project.settings = { ...project.settings, ...patch };
    })),

  setEnvironment: (preset) =>
    set((state) => mutate(state, (project) => {
      project.settings = { ...project.settings, ...environmentSettings(preset) };
    })),

  reorderObject: (id, toIndex) =>
    set((state) =>
      mutate(state, (project) => {
        const from = project.objects.findIndex((object) => object.id === id);
        if (from < 0) return;
        const target = Math.max(0, Math.min(project.objects.length - 1, Math.round(toIndex)));
        if (target === from) return;
        const [item] = project.objects.splice(from, 1);
        project.objects.splice(target, 0, item);
      })
    ),

  setTimeline: (patch) =>
    set((state) => mutate(state, (project) => {
      project.timeline = { ...project.timeline, ...patch };
      const duration = project.timeline.duration;
      project.video.end = Math.min(project.video.end, duration);
      project.video.start = Math.min(project.video.start, project.video.end - 0.1);
      for (const track of project.tracks) {
        track.keys = track.keys.filter((key) => key.time <= duration);
      }
    })),

  setVideo: (patch) =>
    set((state) => mutate(state, (project) => {
      project.video = { ...project.video, ...patch };
    })),

  undo: () =>
    set((state) => {
      if (!state.history.length) return {};
      const previous = state.history[state.history.length - 1];
      return {
        project: previous,
        history: state.history.slice(0, -1),
        future: [structuredClone(state.project), ...state.future].slice(0, 80),
        selectedKey: null,
        selectedKeys: [],
        interactionStart: null,
        dirty: true,
        lastHistoryAt: 0
      };
    }),

  redo: () =>
    set((state) => {
      if (!state.future.length) return {};
      const next = state.future[0];
      return {
        project: next,
        history: [...state.history, structuredClone(state.project)].slice(-80),
        future: state.future.slice(1),
        selectedKey: null,
        selectedKeys: [],
        interactionStart: null,
        dirty: true,
        lastHistoryAt: 0
      };
    }),

  markSaved: (path) => set({ dirty: false, projectPath: path ?? get().projectPath })
}));

function hasAnyTrack(project: ProjectState, objectId: string): boolean {
  return project.tracks.some((track) => track.objectId === objectId && track.keys.length > 0);
}

function isAnimatableProperty(property: string): boolean {
  return (
    (NUMERIC_PROPERTIES as readonly string[]).includes(property) ||
    isColorProperty(property) ||
    isBooleanProperty(property)
  );
}

export function normalizeProject(input: any): ProjectState {
  const base = createDefaultProject();
  if (!input || typeof input !== 'object') return base;
  const timeline = { ...base.timeline, ...(input.timeline || {}) };
  const video = { ...DEFAULT_VIDEO, ...(input.video || {}) };
  video.end = Math.min(Math.max(0.1, video.end), Math.max(0.1, timeline.duration));
  video.start = Math.min(Math.max(0, video.start), video.end - 0.05);
  const objects: SceneObject[] = (
    Array.isArray(input.objects) ? input.objects : base.objects
  ).map(
    (raw: any, index: number): SceneObject => {
      const object = { ...raw } as SceneObject;
      delete object.scriptError;
      if (object.camera) {
        object.camera = {
          ...DEFAULT_CAMERA,
          ...object.camera,
          target:
            Array.isArray(object.camera.target) && object.camera.target.length === 3
              ? (object.camera.target.map((value: unknown) => Number(value)) as Vec3)
              : ([...DEFAULT_CAMERA.target] as Vec3),
          aimMode: object.camera.aimMode === 'free' ? 'free' : 'target'
        };
      }
      if (object.kind === 'script' && (!object.script || typeof object.script.source !== 'string')) {
        object.script = { source: DEFAULT_SCRIPT };
      }
      object.parentId = typeof object.parentId === 'string' && object.parentId ? object.parentId : null;
      object.effects = Array.isArray(object.effects)
        ? object.effects
            .map((effect: any, effectIndex: number) => normalizeEffect(effect, effectIndex))
            .filter((effect): effect is SceneEffect => Boolean(effect))
        : [];
      if (!Array.isArray(object.effects) || !object.effects.length) delete object.effects;
      return object;
    }
  );

  const ids = new Set(objects.map((object) => object.id));
  for (const object of objects) {
    if (!object.parentId) continue;
    if (object.parentId === object.id || !ids.has(object.parentId)) {
      object.parentId = null;
      continue;
    }
    const parentObject = objects.find((item) => item.id === object.parentId);
    if (!parentObject || parentObject.kind !== 'null' || object.kind === 'camera' || object.kind === 'light') {
      object.parentId = null;
      continue;
    }
    const seen = new Set<string>([object.id]);
    let cursor: SceneObject | undefined = object;
    while (cursor?.parentId) {
      if (seen.has(cursor.parentId)) {
        object.parentId = null;
        break;
      }
      seen.add(cursor.parentId);
      cursor = objects.find((item) => item.id === cursor?.parentId);
    }
  }

  return {
    version: 1,
    name: typeof input.name === 'string' ? input.name : base.name,
    settings: { ...base.settings, ...(input.settings || {}) },
    timeline,
    video,
    objects,
    tracks: Array.isArray(input.tracks)
      ? input.tracks
          .filter((track: any) => track && track.objectId && track.property)
          .map((track: any) => ({
            id: track.id || uid('track'),
            objectId: track.objectId,
            property: track.property,
            keys: Array.isArray(track.keys)
              ? track.keys.map((key: any) => ({
                  id: key.id || uid('key'),
                  time: Number(key.time) || 0,
                  value: key.value,
                  interp: key.interp || 'bezier',
                  tangentIn:
                    typeof key.tangentIn === 'number' && Number.isFinite(key.tangentIn)
                      ? key.tangentIn
                      : undefined,
                  tangentOut:
                    typeof key.tangentOut === 'number' && Number.isFinite(key.tangentOut)
                      ? key.tangentOut
                      : undefined
                }))
              : []
          }))
      : []
  };
}
