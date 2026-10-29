import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { buildTrackIndex, evaluateObject, TrackIndex } from './animation';
import {
  applyMaterialState,
  buildEngineeringSchematics,
  buildEnvironment,
  buildLight,
  buildMannequin,
  buildPrimitive,
  createCameraRig,
  disposeObject,
  updateLightState,
  EnvironmentBuild
} from './builders';
import { getParsedModel, loadModelForObject } from './loaders';
import { evaluateScript } from './scripts';
import { simulatePhysics } from './effects';
import { ProjectState, SceneEffect, SceneObject, SceneSettings, Vec3, clamp } from './types';

export type TransformMode = 'translate' | 'rotate' | 'scale';
export type ViewMode = 'editor' | 'camera';

export interface EditorCameraPreset {
  id: string;
  name: string;
  position: Vec3;
  target: Vec3;
  fov: number;
}

export const EDITOR_CAMERA_PRESETS: EditorCameraPreset[] = [
  { id: 'cinema', name: 'Cinema Wide', position: [0.8, 1.65, 5.8], target: [0, 1.1, 0], fov: 40 },
  { id: 'hero', name: 'Hero Low', position: [0.7, 0.45, 5.1], target: [0, 1.3, 0], fov: 42 },
  { id: 'front', name: 'Front Elevation', position: [0, 1.35, 6.2], target: [0, 1.1, 0], fov: 34 },
  { id: 'iso', name: 'Isometric', position: [4.8, 4.0, 5.6], target: [0, 1.0, 0], fov: 38 },
  { id: 'top', name: 'Overhead', position: [0, 8.2, 0.3], target: [0, 0, 0], fov: 46 },
  { id: 'close', name: 'Close Detail', position: [0.4, 1.5, 2.9], target: [0, 1.45, 0], fov: 40 }
];

export interface EngineCallbacks {
  onSelect: (id: string | null) => void;
  onTransform: (
    id: string,
    transform: { position: Vec3; rotation: Vec3; scale: Vec3 }
  ) => void;
  onTime: (time: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onStats: (fps: number) => void;
  onModelReady: (id: string) => void;
  /** Dragged aim target of the selected look-at camera (final = commit history). */
  onAimTarget?: (id: string, target: Vec3, final: boolean) => void;
  onScriptError?: (id: string, message: string | null) => void;
  /** Right-click (without dragging) on the viewport. Coordinates are client space. */
  onContextMenu?: (x: number, y: number) => void;
}

interface ObjectEntry {
  root: THREE.Object3D;
  signature: string;
  kind: SceneObject['kind'];
  light?: THREE.Light;
  lightTarget?: THREE.Object3D;
  helper?: THREE.Group;
  helperLine?: THREE.Line;
  helperIcon?: THREE.Mesh;
  pendingModel?: boolean;
  /** Last evaluated aim point for camera rigs. */
  lastTarget?: THREE.Vector3;
  /** Cached bounds/effect values so physics does not remeasure every frame. */
  effectMeta?: Map<string, { bottom: number; height: number; key: string }>;
  nullHelper?: THREE.Group;
}

interface CaptureContext {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  width: number;
  height: number;
}

interface CaptureOptions {
  antialias?: boolean;
  shadows?: boolean;
}

export class SceneEngine {
  readonly scene = new THREE.Scene();
  readonly editorCamera = new THREE.PerspectiveCamera(40, 16 / 9, 0.03, 600);
  readonly sceneCamera = new THREE.PerspectiveCamera(34, 16 / 9, 0.05, 250);
  readonly renderer: THREE.WebGLRenderer;
  readonly orbit: OrbitControls;
  readonly transform: TransformControls;
  readonly container: HTMLElement;
  readonly callbacks: EngineCallbacks;

  private objectsGroup = new THREE.Group();
  private helpersGroup = new THREE.Group();
  private architectureGroup = new THREE.Group();
  private grid: THREE.GridHelper;
  private schematics: THREE.Group;
  private environment: EnvironmentBuild | null = null;
  private environmentPreset: string | null = null;
  private registry = new Map<string, ObjectEntry>();
  private project: ProjectState | null = null;
  private selectedId: string | null = null;
  private selectionBox: THREE.BoxHelper | null = null;
  private currentTime = 0;
  private playing = false;
  private viewMode: ViewMode = 'editor';
  private transformMode: TransformMode = 'translate';
  private dragging = false;
  private captureMode = false;
  private projectDirty = false;

  private resizeObserver: ResizeObserver;
  private rafId = 0;
  private lastFrame = performance.now();
  private fpsAccumulator = 0;
  private fpsFrames = 0;
  private lastStatsAt = performance.now();
  private disposed = false;

  private pointerDown = { x: 0, y: 0, time: 0 };
  private rightStart: { x: number; y: number } | null = null;
  private rightMoved = false;
  private raycaster = new THREE.Raycaster();
  private scratch = new THREE.Vector3();
  private aimMarker: THREE.Group | null = null;
  private aimDrag: { id: string; plane: THREE.Plane; point: THREE.Vector3 } | null = null;

  constructor(container: HTMLElement, callbacks: EngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
      alpha: false
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    this.editorCamera.position.set(0.8, 1.65, 5.8);
    this.sceneCamera.position.set(0.8, 1.65, 5.8);

    this.orbit = new OrbitControls(this.editorCamera, this.renderer.domElement);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.075;
    this.orbit.target.set(0, 1.1, 0);
    this.orbit.minDistance = 0.6;
    this.orbit.maxDistance = 45;
    this.orbit.maxPolarAngle = Math.PI * 0.495;
    this.orbit.screenSpacePanning = true;
    this.orbit.update();

    this.transform = new TransformControls(this.editorCamera, this.renderer.domElement);
    this.transform.setSize(0.9);
    this.transform.setSpace('world');
    this.transform.setMode('translate');
    const gizmo = this.transform.getHelper();
    (gizmo as any).renderOrder = 999;
    this.scene.add(gizmo);

    this.transform.addEventListener('dragging-changed', (event: any) => {
      this.dragging = Boolean(event.value);
      this.orbit.enabled = !this.dragging && this.viewMode === 'editor';
    });

    this.transform.addEventListener('objectChange', () => {
      if (!this.selectedId || !this.project) return;
      const entry = this.registry.get(this.selectedId);
      if (!entry) return;
      const position = entry.root.position;
      const rotation = entry.root.rotation;
      const scale = entry.root.scale;
      this.callbacks.onTransform(this.selectedId, {
        position: [Number(position.x.toFixed(4)), Number(position.y.toFixed(4)), Number(position.z.toFixed(4))],
        rotation: [
          Number(THREE.MathUtils.radToDeg(rotation.x).toFixed(2)),
          Number(THREE.MathUtils.radToDeg(rotation.y).toFixed(2)),
          Number(THREE.MathUtils.radToDeg(rotation.z).toFixed(2))
        ],
        scale: [Number(scale.x.toFixed(4)), Number(scale.y.toFixed(4)), Number(scale.z.toFixed(4))]
      });
    });

    this.objectsGroup.name = 'SceneObjects';
    this.helpersGroup.name = 'EditorHelpers';
    this.scene.add(this.objectsGroup, this.helpersGroup);
    this.aimMarker = this.createAimMarker();
    this.sceneCamera.rotation.order = 'YXZ';

    this.grid = new THREE.GridHelper(60, 60, 0x3b4654, 0x252c36);
    this.grid.position.y = 0.001;
    (this.grid.material as THREE.Material).transparent = true;
    (this.grid.material as THREE.Material).opacity = 0.4;
    this.grid.visible = false;
    this.scene.add(this.grid);

    this.schematics = buildEngineeringSchematics();
    this.scene.add(this.schematics);

    const initialSettings: SceneSettings = {
      environment: 'studio',
      background: '#111216',
      fogEnabled: true,
      fogColor: '#141519',
      fogDensity: 0.028,
      floorColor: '#2b2d31',
      wallColor: '#33363b',
      exposure: 1.05,
      environmentIntensity: 0.55,
      gridVisible: false,
      schematicsVisible: true,
      contactShadows: true
    };
    this.scene.background = new THREE.Color(initialSettings.background);
    this.scene.fog = new THREE.FogExp2(initialSettings.fogColor, initialSettings.fogDensity);
    this.environment = buildEnvironment(initialSettings);
    this.environmentPreset = initialSettings.environment;
    this.architectureGroup.add(this.environment.group);
    this.scene.add(this.architectureGroup);

    this.renderer.domElement.addEventListener('pointerdown', this.handleAimPointerDown, {
      capture: true
    });
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.addEventListener('pointerdown', this.handleRightPointerDown);
    this.renderer.domElement.addEventListener('pointermove', this.handleRightPointerMove);
    this.renderer.domElement.addEventListener('pointerup', this.handleRightPointerUp);
    this.renderer.domElement.addEventListener('contextmenu', this.handleContextMenu);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    this.rafId = requestAnimationFrame(this.animate);
  }

  getCanvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  setProject(project: ProjectState): void {
    const previous = this.project;
    this.project = project;
    if (previous && previous.settings !== project.settings) {
      this.applyEnvironment(project.settings);
    } else if (!previous) {
      this.applyEnvironment(project.settings);
    }
    this.syncObjects();
    this.applyTime(this.currentTime);
  }

  syncObjects(): void {
    if (!this.project) return;
    const seen = new Set<string>();

    for (const object of this.project.objects) {
      seen.add(object.id);
      let entry = this.registry.get(object.id);
      const signature = this.signatureFor(object);

      if (entry && entry.signature !== signature) {
        this.removeEntry(object.id, false);
        entry = undefined;
      }

      if (!entry) {
        entry = this.createEntry(object);
        this.registry.set(object.id, entry);
      }

      this.applyEntryBase(object, entry);
    }

    for (const id of [...this.registry.keys()]) {
      if (!seen.has(id)) this.removeEntry(id, true);
    }

    if (this.selectedId && !this.project.objects.some((o) => o.id === this.selectedId)) {
      this.setSelected(null, false);
    }
    this.syncHierarchy();
    this.projectDirty = false;
  }

  /** Rebuild the Object3D parenting graph from object.parentId. */
  private syncHierarchy(): void {
    if (!this.project) return;
    for (const object of this.project.objects) {
      const entry = this.registry.get(object.id);
      if (!entry) continue;
      let target: THREE.Object3D = this.objectsGroup;
      if (object.kind !== 'camera' && object.kind !== 'light' && object.parentId) {
        const parent = this.registry.get(object.parentId);
        const parentObject = this.project.objects.find((item) => item.id === object.parentId);
        if (parent && parentObject && parentObject.kind === 'null') target = parent.root;
      }
      if (entry.root === target || entry.root.parent === target) continue;
      let cursor: THREE.Object3D | null = target;
      let cycle = false;
      while (cursor) {
        if (cursor === entry.root) {
          cycle = true;
          break;
        }
        cursor = cursor.parent;
      }
      if (!cycle) target.add(entry.root);
    }
  }

  private removeEntry(id: string, dispose: boolean): void {
    const entry = this.registry.get(id);
    if (!entry) return;
    if (this.selectedId === id) {
      this.setSelected(null, false);
    }
    if (entry.helper) {
      entry.helper.removeFromParent();
      disposeObject(entry.helper);
    }
    if (entry.lightTarget) {
      entry.lightTarget.removeFromParent();
    }
    entry.root.removeFromParent();
    if (dispose && entry.kind !== 'model') {
      disposeObject(entry.root);
    }
    this.registry.delete(id);
  }

  private signatureFor(object: SceneObject): string {    if (object.kind === 'primitive') {
      return `primitive:${object.primitive?.type}:${object.primitive?.size}`;
    }
    if (object.kind === 'model') {
      return `model:${object.model?.fileName}`;
    }
    if (object.kind === 'mannequin') return 'mannequin';
    if (object.kind === 'script') return `script:${object.script?.runId ?? ''}:${object.script?.source ?? ''}`;
    return object.kind;
  }

  private createEntry(object: SceneObject): ObjectEntry {
    if (object.kind === 'mannequin' && object.material) {
      const built = buildMannequin(object.material.color, object.material.color.toLowerCase() === '#f8fafc');
      this.objectsGroup.add(built.group);
      return { root: built.group, signature: this.signatureFor(object), kind: object.kind };
    }

    if (object.kind === 'primitive') {
      const root = buildPrimitive(
        object.primitive?.type || 'box',
        object.primitive?.size || 1,
        object.material?.color || '#c02626'
      );
      this.objectsGroup.add(root);
      return { root, signature: this.signatureFor(object), kind: object.kind };
    }

    if (object.kind === 'model') {
      const cached = getParsedModel(object.id);
      if (cached) {
        this.objectsGroup.add(cached);
        return { root: cached, signature: this.signatureFor(object), kind: object.kind };
      }
      const placeholder = new THREE.Group();
      const wire = new THREE.Mesh(
        new THREE.BoxGeometry(1, 2, 1),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true, transparent: true, opacity: 0.55 })
      );
      wire.position.y = 1;
      placeholder.add(wire);
      this.objectsGroup.add(placeholder);
      const entry: ObjectEntry = {
        root: placeholder,
        signature: this.signatureFor(object),
        kind: object.kind,
        pendingModel: true
      };
      this.loadModel(object, entry);
      return entry;
    }

    if (object.kind === 'light' && object.light) {
      const light = buildLight(object.light);
      light.position.set(...object.position);
      light.castShadow = object.light.castShadow;
      light.name = object.name;
      this.objectsGroup.add(light);

      let lightTarget: THREE.Object3D | undefined;
      if (light instanceof THREE.DirectionalLight || light instanceof THREE.SpotLight) {
        lightTarget = light.target;
        lightTarget.position.set(...object.light.target);
        this.scene.add(lightTarget);
      }

      const helper = this.createLightHelper(object);
      this.helpersGroup.add(helper.group);

      return {
        root: light,
        signature: 'light',
        kind: 'light',
        light,
        lightTarget,
        helper: helper.group,
        helperLine: helper.line,
        helperIcon: helper.icon
      };
    }

    if (object.kind === 'script') {
      const fallbackMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(object.material?.color || '#c02626'),
        roughness: object.material?.roughness ?? 0.4,
        metalness: object.material?.metalness ?? 0.12
      });
      const result = evaluateScript(object.script?.source || '', fallbackMaterial);
      let root: THREE.Object3D;
      if (result.root) {
        root = result.root;
        this.callbacks.onScriptError?.(object.id, null);
      } else {
        const placeholder = new THREE.Group();
        const wire = new THREE.Mesh(
          new THREE.BoxGeometry(1.2, 1.2, 1.2),
          new THREE.MeshBasicMaterial({ color: 0xf43f5e, wireframe: true })
        );
        wire.position.y = 0.8;
        placeholder.add(wire);
        root = placeholder;
        this.callbacks.onScriptError?.(object.id, result.error || 'Script failed.');
      }
      root.name = object.name;
      this.objectsGroup.add(root);
      return { root, signature: this.signatureFor(object), kind: object.kind };
    }

    if (object.kind === 'camera') {
      const rig = createCameraRig();
      rig.rotation.order = 'YXZ';
      this.objectsGroup.add(rig);
      return { root: rig, signature: 'camera', kind: 'camera' };
    }

    if (object.kind === 'null') {
      const root = new THREE.Group();
      root.userData.objectId = object.id;
      const helper = new THREE.Group();
      helper.userData.isNullHelper = true;
      const axis = (end: [number, number, number], color: number) => {
        const geometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(...end)
        ]);
        const line = new THREE.Line(
          geometry,
          new THREE.LineBasicMaterial({
            color,
            transparent: true,
            opacity: 0.9,
            depthTest: false,
            depthWrite: false
          })
        );
        line.renderOrder = 30;
        return line;
      };
      helper.add(axis([0.55, 0, 0], 0xf87171));
      helper.add(axis([0, 0.55, 0], 0x4ade80));
      helper.add(axis([0, 0, 0.55], 0x60a5fa));
      const center = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xe2e8f0, depthTest: false, depthWrite: false })
      );
      center.renderOrder = 31;
      helper.add(center);
      const hit = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.22, 0.22),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
      );
      hit.userData.nullHit = true;
      helper.add(hit);
      root.add(helper);
      this.objectsGroup.add(root);
      return {
        root,
        signature: 'null',
        kind: 'null',
        nullHelper: helper
      };
    }

    const fallback = new THREE.Group();
    this.objectsGroup.add(fallback);
    return { root: fallback, signature: 'unknown', kind: object.kind };
  }

  private loadModel(object: SceneObject, entry: ObjectEntry): void {
    if (!object.model) return;
    loadModelForObject(object.id, object.model.ext, object.model.height, () => {
      if (this.disposed) return;
      const current = this.registry.get(object.id);
      if (!current || !current.pendingModel || !this.project) return;
      const parsed = getParsedModel(object.id);
      if (!parsed) return;
      const currentObject = this.project.objects.find((o) => o.id === object.id);
      if (!currentObject) return;
      this.replaceRoot(object.id, current, parsed);
      current.pendingModel = false;
      this.applyEntryBase(currentObject, current);
      this.applyTime(this.currentTime);
      this.callbacks.onModelReady(object.id);
    }).catch((error) => {
      console.error('[Vexlum] Failed to load model', error);
      const current = this.registry.get(object.id);
      if (current?.helperIcon) return;
    });
  }

  private replaceRoot(id: string, entry: ObjectEntry, next: THREE.Object3D): void {
    const previous = entry.root;
    const parent = previous.parent || this.objectsGroup;
    parent.add(next);
    next.userData.objectId = id;
    entry.root = next;
    entry.effectMeta = undefined;
    previous.removeFromParent();
    if (entry.kind !== 'model') disposeObject(previous);
    if (this.selectedId === id) {
      this.attachSelection();
    }
  }

  private applyEntryBase(object: SceneObject, entry: ObjectEntry): void {
    const root = entry.root;
    root.userData.objectId = object.id;
    root.name = object.name;
    root.position.set(...object.position);
    root.rotation.set(
      THREE.MathUtils.degToRad(object.rotation[0]),
      THREE.MathUtils.degToRad(object.rotation[1]),
      THREE.MathUtils.degToRad(object.rotation[2])
    );
    root.scale.set(...object.scale);
    root.visible = object.visible && !(this.captureMode && object.kind === 'camera');

    if (object.kind === 'light' && entry.light && object.light) {
      this.applyLight(object, entry);
      return;
    }

    if (object.kind === 'camera' && object.camera) {
      const rig = entry.root;
      const target = new THREE.Vector3(...object.camera.target);
      rig.position.set(...object.position);
      if (!entry.lastTarget) entry.lastTarget = new THREE.Vector3();
      entry.lastTarget.copy(target);
      if (object.camera.aimMode === 'free') {
        rig.rotation.set(
          THREE.MathUtils.degToRad(object.rotation[0]),
          THREE.MathUtils.degToRad(object.rotation[1]),
          THREE.MathUtils.degToRad(object.rotation[2])
        );
      } else {
        rig.lookAt(target);
      }
      return;
    }

    if (object.material && object.kind !== 'script') {
      applyMaterialState(root, object.material);
    }

    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = object.castShadow;
        mesh.receiveShadow = object.receiveShadow;
      }
    });
  }

  private applyLight(object: SceneObject, entry: ObjectEntry): void {
    const light = entry.light;
    if (!light || !object.light) return;
    updateLightState(light, object.light);
    light.position.set(...object.position);
    light.castShadow = object.light.castShadow;
    if (
      (light instanceof THREE.DirectionalLight || light instanceof THREE.SpotLight) &&
      entry.lightTarget
    ) {
      entry.lightTarget.position.set(...object.light.target);
      entry.lightTarget.updateMatrixWorld();
    }
    if (light instanceof THREE.DirectionalLight) {
      light.shadow.mapSize.set(2048, 2048);
      light.shadow.bias = -0.0002;
      light.shadow.normalBias = 0.02;
      const cam = light.shadow.camera;
      cam.left = -12;
      cam.right = 12;
      cam.top = 12;
      cam.bottom = -12;
      cam.near = 0.1;
      cam.far = 45;
      cam.updateProjectionMatrix();
    }
    if (light instanceof THREE.SpotLight) {
      light.shadow.mapSize.set(2048, 2048);
      light.shadow.bias = -0.0003;
      light.shadow.normalBias = 0.02;
      light.shadow.camera.near = 0.1;
      light.shadow.camera.far = Math.max(20, object.light.distance);
      light.shadow.camera.updateProjectionMatrix();
    }
    if (light instanceof THREE.PointLight) {
      light.castShadow = object.light.castShadow;
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.bias = -0.001;
    }
  }

  private createLightHelper(object: SceneObject): {
    group: THREE.Group;
    line?: THREE.Line;
    icon: THREE.Mesh;
  } {
    const group = new THREE.Group();
    group.userData.objectId = object.id;
    const color = new THREE.Color(object.light?.color || '#ffffff');
    const iconMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      depthTest: false
    });
    const iconGeometry =
      object.light?.kind === 'spot'
        ? new THREE.ConeGeometry(0.09, 0.18, 12)
        : object.light?.kind === 'directional'
          ? new THREE.OctahedronGeometry(0.11, 0)
          : new THREE.SphereGeometry(0.07, 12, 10);
    const icon = new THREE.Mesh(iconGeometry, iconMaterial);
    icon.renderOrder = 20;
    icon.userData.objectId = object.id;
    group.add(icon);

    let line: THREE.Line | undefined;
    if (object.light?.kind === 'directional' || object.light?.kind === 'spot') {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const lineMaterial = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.45,
        depthTest: false
      });
      line = new THREE.Line(geometry, lineMaterial);
      line.renderOrder = 19;
      line.userData.objectId = object.id;
      group.add(line);
    }
    return { group, line, icon };
  }

  setSelected(id: string | null, notify = true): void {
    this.selectedId = id;
    this.attachSelection();
    if (notify) this.callbacks.onSelect(id);
  }

  private attachSelection(): void {
    if (this.selectionBox) {
      this.selectionBox.removeFromParent();
      this.selectionBox.geometry?.dispose();
      (this.selectionBox.material as THREE.Material)?.dispose();
      this.selectionBox = null;
    }
    if (!this.selectedId) {
      this.transform.detach();
      return;
    }
    const entry = this.registry.get(this.selectedId);
    if (!entry) {
      this.transform.detach();
      return;
    }
    this.transform.attach(entry.root);
    if (entry.kind !== 'light') {
      const box = new THREE.BoxHelper(entry.root, 0x22d3ee);
      (box.material as THREE.LineBasicMaterial).transparent = true;
      (box.material as THREE.LineBasicMaterial).opacity = 0.8;
      box.renderOrder = 10;
      this.helpersGroup.add(box);
      this.selectionBox = box;
    }
  }

  setTransformMode(mode: TransformMode): void {
    this.transformMode = mode;
    this.transform.setMode(mode);
  }

  setTransformSpace(space: 'world' | 'local'): void {
    this.transform.setSpace(space);
  }

  setSnap(enabled: boolean): void {
    this.transform.setTranslationSnap(enabled ? 0.1 : null);
    this.transform.setRotationSnap(enabled ? THREE.MathUtils.degToRad(5) : null);
    this.transform.setScaleSnap(enabled ? 0.05 : null);
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode = mode;
    if (mode === 'editor') {
      this.orbit.enabled = true;
      (this.transform as any).camera = this.editorCamera;
    } else {
      this.orbit.enabled = false;
      (this.transform as any).camera = this.sceneCamera;
      this.sceneCamera.aspect = this.aspect();
      this.sceneCamera.updateProjectionMatrix();
    }
    if (mode === 'camera') this.applyTime(this.currentTime);
  }

  getViewMode(): ViewMode {
    return this.viewMode;
  }

  setEditorPreset(id: string): void {
    const preset = EDITOR_CAMERA_PRESETS.find((item) => item.id === id) || EDITOR_CAMERA_PRESETS[0];
    this.editorCamera.position.set(...preset.position);
    this.editorCamera.fov = preset.fov;
    this.editorCamera.updateProjectionMatrix();
    this.orbit.target.set(...preset.target);
    this.orbit.update();
  }

  getEditorView(): { position: Vec3; target: Vec3; fov: number } {
    return {
      position: [
        Number(this.editorCamera.position.x.toFixed(3)),
        Number(this.editorCamera.position.y.toFixed(3)),
        Number(this.editorCamera.position.z.toFixed(3))
      ],
      target: [
        Number(this.orbit.target.x.toFixed(3)),
        Number(this.orbit.target.y.toFixed(3)),
        Number(this.orbit.target.z.toFixed(3))
      ],
      fov: Number(this.editorCamera.fov.toFixed(1))
    };
  }

  alignSceneCameraToView(): { position: Vec3; target: Vec3; fov: number } {
    const view = this.getEditorView();
    this.sceneCamera.fov = view.fov;
    this.sceneCamera.updateProjectionMatrix();
    return view;
  }

  focusSelected(): void {
    if (!this.selectedId) return;
    const entry = this.registry.get(this.selectedId);
    if (!entry) return;
    const box = new THREE.Box3().setFromObject(entry.root);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(0.6, size.length() * 0.55);
    const direction = new THREE.Vector3()
      .subVectors(this.editorCamera.position, this.orbit.target)
      .normalize();
    const distance = radius / Math.tan(THREE.MathUtils.degToRad(this.editorCamera.fov * 0.5)) + radius;
    this.orbit.target.copy(center);
    this.editorCamera.position.copy(center).add(direction.multiplyScalar(distance));
    this.orbit.update();
  }

  applyTime(time: number): void {
    if (!this.project) return;
    this.currentTime = Math.max(0, Math.min(this.project.timeline.duration, time));
    const index = buildTrackIndex(this.project.tracks);
    for (const object of this.project.objects) {
      const entry = this.registry.get(object.id);
      if (!entry) continue;
      if (this.dragging && object.id === this.selectedId) continue;
      const evaluated = evaluateObject(object, index, this.currentTime);
      this.applyEntryBase(evaluated, entry);
      this.applyEffects(evaluated, entry, index);
      if (evaluated.kind === 'camera' && evaluated.camera) {
        this.sceneCamera.position.set(...evaluated.position);
        this.sceneCamera.fov = evaluated.camera.fov;
        this.sceneCamera.near = evaluated.camera.near;
        this.sceneCamera.far = evaluated.camera.far;
        if (evaluated.camera.aimMode === 'free') {
          this.sceneCamera.rotation.order = 'YXZ';
          this.sceneCamera.rotation.set(
            THREE.MathUtils.degToRad(evaluated.rotation[0]),
            THREE.MathUtils.degToRad(evaluated.rotation[1]),
            THREE.MathUtils.degToRad(evaluated.rotation[2])
          );
        } else {
          this.sceneCamera.lookAt(new THREE.Vector3(...evaluated.camera.target));
        }
        this.sceneCamera.updateProjectionMatrix();
      }
    }
    this.schematics.visible = this.project.settings.schematicsVisible && !this.captureMode;
  }

  /** Apply procedural effects on top of the evaluated keyframe transform. */
  private applyEffects(object: SceneObject, entry: ObjectEntry, index: TrackIndex): void {
    const effects = object.effects?.filter((effect) => effect.enabled);
    if (!effects?.length) return;
    if (object.kind === 'camera' || object.kind === 'light') return;
    const root = entry.root;
    const time = this.currentTime;

    for (const effect of effects) {
      const elapsed = time - effect.start;
      if (elapsed < 0) continue;
      const amount = effect.amount ?? 0;
      const speed = effect.speed ?? 1;

      if (effect.kind === 'physics') {
        const startEvaluated = evaluateObject(object, index, effect.start);
        if (!entry.effectMeta) entry.effectMeta = new Map();
        let meta = entry.effectMeta.get(effect.id);
        const metaKey = `${object.scale.join(',')}:${object.primitive?.size ?? ''}:${object.model?.fileName ?? ''}`;
        if (!meta || meta.key !== metaKey) {
          root.updateWorldMatrix(true, true);
          const box = new THREE.Box3().setFromObject(root);
          const worldRoot = root.getWorldPosition(new THREE.Vector3());
          meta = {
            bottom: Number.isFinite(box.min.y) ? box.min.y - worldRoot.y : 0,
            height: Number.isFinite(box.max.y - box.min.y) ? box.max.y - box.min.y : 1,
            key: metaKey
          };
          entry.effectMeta.set(effect.id, meta);
        }
        const floorY = (effect.ground ?? 0) - meta.bottom;
        const simulation = simulatePhysics(effect, elapsed, startEvaluated.position[1], floorY);
        root.position.set(
          startEvaluated.position[0] + simulation.offset[0],
          startEvaluated.position[1] + simulation.offset[1],
          startEvaluated.position[2] + simulation.offset[2]
        );
        root.rotation.set(
          THREE.MathUtils.degToRad(startEvaluated.rotation[0] + simulation.rotation[0]),
          THREE.MathUtils.degToRad(startEvaluated.rotation[1] + simulation.rotation[1]),
          THREE.MathUtils.degToRad(startEvaluated.rotation[2] + simulation.rotation[2])
        );
        root.scale.set(
          root.scale.x * simulation.scale[0],
          root.scale.y * simulation.scale[1],
          root.scale.z * simulation.scale[2]
        );
      } else if (effect.kind === 'spin') {
        const axis = effect.axis === 'x' ? 0 : effect.axis === 'z' ? 2 : 1;
        const rotation = [root.rotation.x, root.rotation.y, root.rotation.z];
        rotation[axis] += THREE.MathUtils.degToRad(amount * elapsed);
        root.rotation.set(rotation[0], rotation[1], rotation[2]);
      } else if (effect.kind === 'float') {
        root.position.y += amount * Math.sin(elapsed * Math.PI * 2 * speed);
      } else if (effect.kind === 'orbit') {
        const angle = elapsed * Math.PI * 2 * speed;
        root.position.x += Math.cos(angle) * amount;
        root.position.z += Math.sin(angle) * amount;
      } else if (effect.kind === 'shake') {
        const t = elapsed * Math.max(0.2, speed);
        root.position.x += Math.sin(t * 1.7 + 0.4) * amount;
        root.position.y += Math.sin(t * 2.3 + 1.1) * amount * 0.55;
        root.position.z += Math.cos(t * 1.9 + 2.1) * amount;
      } else if (effect.kind === 'pulse') {
        const pulse = 1 + amount * Math.sin(elapsed * Math.PI * 2 * speed);
        root.scale.multiplyScalar(pulse);
      } else if (effect.kind === 'lookAt') {
        root.lookAt(this.sceneCamera.position);
      } else if (object.kind !== 'script') {
        this.applyMaterialEffect(object, root, effect, elapsed);
      }
    }
  }

  private applyMaterialEffect(
    object: SceneObject,
    root: THREE.Object3D,
    effect: SceneEffect,
    elapsed: number
  ): void {
    const amount = effect.amount ?? 0;
    const speed = effect.speed ?? 1;
    const color = new THREE.Color(effect.color || '#38bdf8');
    root.traverse((child) => {
      if (child.userData.skipTint) return;
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh && !(child as any).isSkinnedMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!material) continue;
        const standard = material as THREE.MeshStandardMaterial;
        if (effect.kind === 'glow' && standard.emissive) {
          standard.emissive.copy(color);
          standard.emissiveIntensity =
            Math.max(0, amount) * (0.7 + 0.3 * Math.sin(elapsed * Math.PI * 2 * speed));
        } else if (effect.kind === 'colorCycle' && standard.color) {
          const hsl = { h: 0, s: 0, l: 0 };
          standard.color.getHSL(hsl);
          standard.color.setHSL(
            (hsl.h + elapsed * speed * Math.max(0.01, amount)) % 1,
            hsl.s,
            hsl.l
          );
        } else if (effect.kind === 'fade') {
          const alpha = clamp(1 - elapsed / Math.max(0.01, amount), 0, 1);
          standard.transparent = true;
          standard.opacity = Math.min(standard.opacity, alpha);
          standard.depthWrite = alpha > 0.98;
        }
      }
    });
  }

  setTime(time: number, notify = false): void {
    this.applyTime(time);
    if (notify) this.callbacks.onTime(this.currentTime);
  }

  getTime(): number {
    return this.currentTime;
  }

  setPlaying(playing: boolean): void {
    this.playing = playing;
    if (playing) {
      if (
        this.project &&
        this.currentTime >= this.project.timeline.duration - 0.0001
      ) {
        this.currentTime = 0;
      }
      this.lastFrame = performance.now();
    }
  }

  isPlaying(): boolean {
    return this.playing;
  }

  private animate = (now: number): void => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.animate);
    const dt = Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;

    if (this.playing && this.project && !this.dragging) {
      const duration = this.project.timeline.duration;
      let next = this.currentTime + dt;
      if (next >= duration) {
        if (this.project.timeline.loop) {
          next = next % Math.max(0.001, duration);
        } else {
          next = duration;
          this.playing = false;
          this.callbacks.onPlayingChange(false);
        }
      }
      this.currentTime = next;
      this.callbacks.onTime(next);
    }

    if (this.project) {
      if (!this.dragging) this.applyTime(this.currentTime);
      this.updateHelpers();
      this.updateSchematicPulse();
    }

    this.orbit.update();

    if (this.project) {
      if (this.viewMode === 'camera') {
        this.sceneCamera.aspect = this.aspect();
        this.sceneCamera.updateProjectionMatrix();
        this.renderer.render(this.scene, this.sceneCamera);
      } else {
        this.renderer.render(this.scene, this.editorCamera);
      }
    }

    this.fpsAccumulator += dt;
    this.fpsFrames++;
    if (now - this.lastStatsAt > 700) {
      const fps = this.fpsFrames / Math.max(0.001, this.fpsAccumulator);
      this.callbacks.onStats(Math.round(fps));
      this.fpsFrames = 0;
      this.fpsAccumulator = 0;
      this.lastStatsAt = now;
    }
  };

  private aspect(): number {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    return width / height;
  }

  private updateHelpers(): void {
    if (this.captureMode) return;
    if (!this.project) return;

    for (const object of this.project.objects) {
      const entry = this.registry.get(object.id);
      if (!entry) continue;
      if (object.kind === 'null' && entry.nullHelper) {
        entry.nullHelper.visible = object.visible;
        const selected = this.selectedId === object.id;
        entry.nullHelper.scale.setScalar(selected ? 1.18 : 1);
      }
      if (object.kind === 'light' && entry.helper) {
        entry.helper.visible = object.visible;
        const selected = this.selectedId === object.id;
        if (entry.helperLine && entry.helperIcon) {
          const position = entry.root.position;
          const target = entry.lightTarget
            ? entry.lightTarget.position
            : new THREE.Vector3(...(object.light?.target || [0, 0, 0]));
          const attribute = entry.helperLine.geometry.getAttribute('position') as THREE.BufferAttribute;
          attribute.setXYZ(0, position.x, position.y, position.z);
          attribute.setXYZ(1, target.x, target.y, target.z);
          attribute.needsUpdate = true;
          entry.helperIcon.position.set(position.x, position.y, position.z);
          const mat = entry.helperIcon.material as THREE.MeshBasicMaterial;
          mat.color.set(selected ? '#22d3ee' : object.light?.color || '#ffffff');
          mat.opacity = selected ? 1 : 0.8;
        }
        if (entry.helperLine) {
          const mat = entry.helperLine.material as THREE.LineBasicMaterial;
          mat.opacity = selected ? 0.9 : 0.35;
          mat.color.set(selected ? '#22d3ee' : object.light?.color || '#ffffff');
          // Aim lines only clutter the frame when nothing is being edited.
          entry.helperLine.visible = selected;
        }
      }
      if (object.kind === 'camera' && entry.root.visible && object.camera) {
        if (object.camera.aimMode !== 'free') {
          entry.root.lookAt(new THREE.Vector3(...object.camera.target));
        }

        // The editor camera often sits exactly on the render camera (e.g. the
        // "Cinema Wide" preset). The rig is only ~0.3 m wide, so from that
        // distance its wireframe covers the whole viewport and looks like a
        // burst of stray lines. Fade the rig out when the viewer is inside it.
        const activeCamera = this.viewMode === 'camera' ? this.sceneCamera : this.editorCamera;
        const rigPosition = entry.root.getWorldPosition(this.scratch);
        const tooClose = activeCamera.position.distanceTo(rigPosition) < 1.4;
        for (const child of entry.root.children) child.visible = !tooClose;
      }
    }

    this.updateAimMarker();

    if (this.selectionBox) this.selectionBox.update();
  }

  /** Draggable crosshair that shows where a look-at camera is aimed. */
  private updateAimMarker(): void {
    const marker = this.aimMarker;
    if (!marker) return;
    const selected = this.project?.objects.find((object) => object.id === this.selectedId);
    const entry = this.selectedId ? this.registry.get(this.selectedId) : undefined;
    const show =
      Boolean(selected && selected.kind === 'camera' && selected.camera?.aimMode !== 'free') &&
      Boolean(entry) &&
      !this.captureMode;
    marker.visible = show;
    if (!show || !entry) return;

    const point = entry.lastTarget
      ? entry.lastTarget
      : new THREE.Vector3(...(selected?.camera?.target || [0, 0, 0]));
    const activeCamera = this.viewMode === 'camera' ? this.sceneCamera : this.editorCamera;
    marker.position.copy(point);
    marker.quaternion.copy(activeCamera.quaternion);
    const distance = activeCamera.position.distanceTo(point);
    marker.scale.setScalar(Math.max(0.5, distance * 0.1));
  }

  private createAimMarker(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'AimTarget';
    group.visible = false;
    const material = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.085, 0.105, 40), material);
    ring.renderOrder = 40;
    group.add(ring);

    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.022, 16), material);
    dot.renderOrder = 41;
    group.add(dot);

    for (const rotation of [0, Math.PI / 2]) {
      const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.008), material);
      tick.rotation.z = rotation;
      tick.renderOrder = 40;
      group.add(tick);
    }

    // Larger invisible hit target: the visible ring is only a few pixels wide
    // at typical framing distances, which made it hard to grab.
    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 12, 10),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false
      })
    );
    hit.renderOrder = 39;
    group.add(hit);

    this.helpersGroup.add(group);
    return group;
  }

  private updateSchematicPulse(): void {
    if (!this.project?.settings.schematicsVisible || this.captureMode) return;
    const materials = this.schematics.userData.animatedMaterials as
      | { cyan: THREE.LineBasicMaterial; amber: THREE.LineBasicMaterial; white: THREE.LineBasicMaterial }
      | undefined;
    if (!materials) return;
    const time = this.currentTime;
    materials.cyan.opacity = 0.16 + Math.sin(time * 1.6) * 0.03;
    materials.amber.opacity = 0.13 + Math.sin(time * 2.1 + 1.2) * 0.025;
    materials.white.opacity = 0.09 + Math.sin(time * 1.2 + 2.4) * 0.02;
  }

  private applyEnvironment(settings: SceneSettings): void {
    this.scene.background = new THREE.Color(settings.background);
    if (settings.fogEnabled) {
      this.scene.fog = new THREE.FogExp2(settings.fogColor, settings.fogDensity);
    } else {
      this.scene.fog = null;
    }
    this.renderer.toneMappingExposure = settings.exposure;
    this.renderer.shadowMap.enabled = settings.contactShadows;
    this.grid.visible = settings.gridVisible;
    this.schematics.visible = settings.schematicsVisible;
    if (this.environment && this.environmentPreset !== settings.environment) {
      this.architectureGroup.remove(this.environment.group);
      disposeObject(this.environment.group);
      this.environment = null;
    }
    if (!this.environment) {
      this.environment = buildEnvironment(settings);
      this.environmentPreset = settings.environment;
      this.architectureGroup.add(this.environment.group);
    } else {
      this.environment.floorMaterial.color.set(settings.floorColor);
      this.environment.wallMaterial.color.set(settings.wallColor);
    }
  }

  resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    this.editorCamera.aspect = width / height;
    this.editorCamera.updateProjectionMatrix();
    if (this.viewMode === 'camera') {
      this.sceneCamera.aspect = width / height;
      this.sceneCamera.updateProjectionMatrix();
    }
  }

  private pointerRay(event: PointerEvent, camera: THREE.Camera): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(pointer, camera);
  }

  private handleAimPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !this.aimMarker?.visible || !this.selectedId) return;
    const camera = this.viewMode === 'camera' ? this.sceneCamera : this.editorCamera;
    this.pointerRay(event, camera);
    const hits = this.raycaster.intersectObject(this.aimMarker, true);
    if (!hits.length) return;

    const entry = this.registry.get(this.selectedId);
    const cameraObject = this.project?.objects.find((object) => object.id === this.selectedId);
    if (!entry || !cameraObject?.camera) return;

    const point = entry.lastTarget
      ? entry.lastTarget.clone()
      : new THREE.Vector3(...cameraObject.camera.target);
    const normal = camera.getWorldDirection(new THREE.Vector3()).negate();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);
    this.aimDrag = { id: this.selectedId, plane, point };
    this.orbit.enabled = false;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const move = (moveEvent: PointerEvent) => {
      if (!this.aimDrag) return;
      this.pointerRay(moveEvent, camera);
      const hit = this.raycaster.ray.intersectPlane(this.aimDrag.plane, new THREE.Vector3());
      if (!hit) return;
      this.aimDrag.point.copy(hit);
      this.aimMarker?.position.copy(hit);
      this.callbacks.onAimTarget?.(
        this.aimDrag.id,
        [
          Number(hit.x.toFixed(4)),
          Number(hit.y.toFixed(4)),
          Number(hit.z.toFixed(4))
        ],
        false
      );
    };

    const up = () => {
      if (this.aimDrag) {
        const p = this.aimDrag.point;
        this.callbacks.onAimTarget?.(
          this.aimDrag.id,
          [Number(p.x.toFixed(4)), Number(p.y.toFixed(4)), Number(p.z.toFixed(4))],
          true
        );
      }
      this.aimDrag = null;
      this.orbit.enabled = this.viewMode === 'editor';
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  private handleRightPointerDown = (event: PointerEvent): void => {
    if (event.button !== 2) return;
    this.rightStart = { x: event.clientX, y: event.clientY };
    this.rightMoved = false;
  };

  private handleRightPointerMove = (event: PointerEvent): void => {
    if (!this.rightStart) return;
    if (Math.hypot(event.clientX - this.rightStart.x, event.clientY - this.rightStart.y) > 5) {
      this.rightMoved = true;
    }
  };

  private handleRightPointerUp = (event: PointerEvent): void => {
    if (event.button !== 2) return;
    // Keep the movement flag for the contextmenu event that follows.
    window.setTimeout(() => {
      this.rightStart = null;
      this.rightMoved = false;
    }, 0);
  };

  private handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
    if (this.rightMoved) return;
    this.callbacks.onContextMenu?.(event.clientX, event.clientY);
  };

  private handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.pointerDown = { x: event.clientX, y: event.clientY, time: performance.now() };
  };

  private handlePointerUp = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    if (this.aimDrag) return;
    const moved = Math.hypot(event.clientX - this.pointerDown.x, event.clientY - this.pointerDown.y);
    const elapsed = performance.now() - this.pointerDown.time;
    if (moved > 5 || elapsed > 650 || this.dragging) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(pointer, this.viewMode === 'camera' ? this.sceneCamera : this.editorCamera);
    const targets: THREE.Object3D[] = [];
    this.objectsGroup.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh && !(child as THREE.Line) && !(child as THREE.Points)) return;
      if ((child as any).isTransformControlsRoot || child.userData.isTransformGizmo) return;
      targets.push(child);
    });
    this.helpersGroup.traverse((child) => {
      if ((child as any).isMesh || (child as any).isLine) targets.push(child);
    });

    const hits = this.raycaster.intersectObjects(targets, false);
    let found: string | null = null;
    for (const hit of hits) {
      let cursor: THREE.Object3D | null = hit.object;
      while (cursor) {
        if (cursor.userData?.objectId) {
          found = cursor.userData.objectId as string;
          break;
        }
        cursor = cursor.parent;
      }
      if (found) break;
    }

    if (found) {
      if (event.shiftKey && this.selectedId) {
        this.setSelected(found);
      } else {
        this.setSelected(found);
      }
    } else {
      this.setSelected(null);
    }
  };

  createCaptureContext(width: number, height: number, options: CaptureOptions = {}): CaptureContext {
    const renderer = new THREE.WebGLRenderer({
      antialias: options.antialias ?? true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
      alpha: false
    });
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    renderer.shadowMap.enabled = options.shadows ?? true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = this.project?.settings.exposure ?? 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(this.project?.settings.background || '#111216', 1);

    const camera = new THREE.PerspectiveCamera(34, width / height, 0.05, 250);
    return { renderer, camera, width, height };
  }

  beginCapture(): void {
    this.captureMode = true;
    this.helpersGroup.visible = false;
    this.grid.visible = false;
    this.transform.getHelper().visible = false;
    this.schematics.visible = false;
    if (this.aimMarker) this.aimMarker.visible = false;
    for (const object of this.project?.objects || []) {
      const entry = this.registry.get(object.id);
      if (object.kind === 'null' && entry?.nullHelper) entry.nullHelper.visible = false;
      if (object.kind !== 'camera') continue;
      if (entry) entry.root.visible = false;
    }
  }

  endCapture(): void {
    this.captureMode = false;
    this.helpersGroup.visible = true;
    this.grid.visible = this.project?.settings.gridVisible ?? false;
    this.transform.getHelper().visible = true;
    this.schematics.visible = this.project?.settings.schematicsVisible ?? true;
    if (this.project) {
      for (const object of this.project.objects) {
        const entry = this.registry.get(object.id);
        if (object.kind === 'null' && entry?.nullHelper) entry.nullHelper.visible = object.visible;
        if (object.kind !== 'camera') continue;
        if (entry) entry.root.visible = object.visible;
      }
    }
    this.applyTime(this.currentTime);
  }

  renderCapture(context: CaptureContext, time: number, hideSchematics = true): void {
    if (!this.project) return;
    this.applyTime(time);
    this.sceneCamera.aspect = context.width / context.height;
    this.sceneCamera.updateProjectionMatrix();

    context.camera.position.copy(this.sceneCamera.position);
    context.camera.quaternion.copy(this.sceneCamera.quaternion);
    context.camera.fov = this.sceneCamera.fov;
    context.camera.near = this.sceneCamera.near;
    context.camera.far = this.sceneCamera.far;
    context.camera.aspect = context.width / context.height;
    context.camera.updateProjectionMatrix();
    context.camera.updateMatrixWorld();

    if (hideSchematics) this.schematics.visible = false;
    context.renderer.render(this.scene, context.camera);
  }

  disposeCaptureContext(context: CaptureContext): void {
    context.renderer.dispose();
    context.renderer.forceContextLoss();
  }

  async captureSnapshot(width: number, height: number): Promise<Blob> {
    const context = this.createCaptureContext(width, height, { antialias: true, shadows: true });
    this.beginCapture();
    try {
      this.renderCapture(context, this.currentTime);
      const blob = await new Promise<Blob>((resolve, reject) => {
        context.renderer.domElement.toBlob(
          (result) => (result ? resolve(result) : reject(new Error('Snapshot encoding failed'))),
          'image/png',
          1
        );
      });
      return blob;
    } finally {
      this.endCapture();
      this.disposeCaptureContext(context);
    }
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener('pointerdown', this.handleAimPointerDown, {
      capture: true
    });
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.removeEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.removeEventListener('pointerdown', this.handleRightPointerDown);
    this.renderer.domElement.removeEventListener('pointermove', this.handleRightPointerMove);
    this.renderer.domElement.removeEventListener('pointerup', this.handleRightPointerUp);
    this.renderer.domElement.removeEventListener('contextmenu', this.handleContextMenu);
    this.transform.detach();
    this.transform.dispose();
    this.orbit.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
