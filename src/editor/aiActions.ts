import { useEditorStore } from './store';
import type { CameraMoveKind } from './store';
import { EFFECT_ORDER } from './effects';
import { makeLight, makePrimitive } from './defaultScene';
import {
  DEFAULT_MATERIAL,
  EffectKind,
  LightKind,
  PhysicsMaterial,
  PrimitiveType,
  SceneObject,
  Vec3,
  clamp,
  uid
} from './types';

export interface AIAction {
  type: string;
  [key: string]: any;
}

export interface ParsedAIResponse {
  text: string;
  actions: AIAction[];
}

const ACTION_BLOCK = /<monolith-actions>([\s\S]*?)<\/monolith-actions>/i;

export function parseAIResponse(raw: string): ParsedAIResponse {
  const match = raw.match(ACTION_BLOCK);
  if (!match) return { text: raw.trim(), actions: [] };
  let json = match[1].trim();
  if (json.startsWith('```')) {
    json = json.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  }
  let actions: AIAction[] = [];
  try {
    const parsed = JSON.parse(json);
    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.actions) ? parsed.actions : [];
    actions = list.filter((action: any) => action && typeof action.type === 'string');
  } catch {
    // Keep the prose; an invalid action block is shown as a warning below.
  }
  const text = raw.replace(ACTION_BLOCK, '').trim();
  return { text, actions };
}

function vector(value: any, fallback: Vec3): Vec3 {
  if (!Array.isArray(value) || value.length !== 3) return fallback;
  const numbers = value.map((item) => Number(item));
  if (numbers.some((item) => !Number.isFinite(item))) return fallback;
  return numbers as Vec3;
}

function refName(action: AIAction): string {
  return String(action.object ?? action.name ?? action.target ?? 'selected');
}

function findObjectRef(reference: string): SceneObject | null {
  const state = useEditorStore.getState();
  if (!reference || reference === 'selected' || reference === 'selection') {
    return state.project.objects.find((object) => object.id === state.selectedId) || null;
  }
  const clean = reference.trim().toLowerCase();
  return (
    state.project.objects.find((object) => object.id === reference) ||
    state.project.objects.find((object) => object.id.toLowerCase() === clean) ||
    state.project.objects.find((object) => object.name.toLowerCase() === clean) ||
    state.project.objects.find((object) => object.name.toLowerCase().includes(clean)) ||
    null
  );
}

function validKind(value: string): EffectKind | null {
  return (EFFECT_ORDER as string[]).includes(value) ? (value as EffectKind) : null;
}

function validPhysics(value: unknown): PhysicsMaterial | undefined {
  return value === 'glass' || value === 'paper' || value === 'sponge' || value === 'slime'
    ? value
    : undefined;
}

function addScriptObject(action: AIAction): string {
  const code = typeof action.code === 'string' ? action.code.trim() : '';
  if (!code) throw new Error('add_script needs code');
  const object: SceneObject = {
    id: uid('script'),
    name: String(action.name || 'AI Script Object'),
    kind: 'script',
    position: vector(action.position, [3.2, 0.5, -0.8]),
    rotation: vector(action.rotation, [0, 0, 0]),
    scale: vector(action.scale, [1, 1, 1]),
    visible: true,
    locked: false,
    castShadow: true,
    receiveShadow: true,
    script: { source: code, runId: uid('run') },
    material: { ...DEFAULT_MATERIAL, color: '#c02626' }
  };
  useEditorStore.getState().addObject(object);
  return `created script object "${object.name}"`;
}

export function applyAIActions(actions: AIAction[]): string[] {
  const logs: string[] = [];
  const store = useEditorStore.getState();

  for (const action of actions) {
    try {
      const type = action.type;
      if (type === 'add_null') {
        store.addNull();
        const state = useEditorStore.getState();
        const object = state.project.objects.find((item) => item.id === state.selectedId);
        if (object) {
          const patch: Partial<SceneObject> = {};
          if (action.name) patch.name = String(action.name);
          patch.position = vector(action.position, object.position);
          state.updateObject(object.id, patch, { record: true });
          if (action.parent) {
            const parent = findObjectRef(String(action.parent));
            if (parent) state.setObjectParent(object.id, parent.id);
          }
          logs.push(`created Null "${patch.name || object.name}"`);
        }
      } else if (type === 'add_primitive') {
        const primitive = String(action.primitive || action.kind || 'sphere') as PrimitiveType;
        const allowed: PrimitiveType[] = [
          'box',
          'sphere',
          'cylinder',
          'cone',
          'torus',
          'torusKnot',
          'plane',
          'icosahedron',
          'gear',
          'suzanne',
          'monolith'
        ];
        const object = makePrimitive(
          allowed.includes(primitive) ? primitive : 'sphere',
          vector(action.position, [2.6, 0, 2.6]),
          String(action.color || '#c02626')
        );
        if (action.name) object.name = String(action.name);
        if (action.scale) object.scale = vector(action.scale, object.scale);
        if (action.rotation) object.rotation = vector(action.rotation, object.rotation);
        if (action.material && typeof action.material === 'object') {
          object.material = { ...(object.material || DEFAULT_MATERIAL), ...action.material };
        }
        store.addObject(object);
        logs.push(`added ${object.primitive?.type} "${object.name}"`);
      } else if (type === 'add_script') {
        logs.push(addScriptObject(action));
      } else if (type === 'add_light') {
        const kind = String(action.kind || 'point') as LightKind;
        const allowed: LightKind[] = ['ambient', 'hemisphere', 'directional', 'point', 'spot', 'rect'];
        const light = makeLight(
          allowed.includes(kind) ? kind : 'point',
          String(action.name || `${kind} light`),
          vector(action.position, kind === 'directional' ? [4, 6.5, 4] : [-2, 3, 2]),
          {
            ...(action.color ? { color: String(action.color) } : {}),
            ...(Number.isFinite(Number(action.intensity)) ? { intensity: Number(action.intensity) } : {})
          }
        );
        if (action.target) light.light!.target = vector(action.target, light.light!.target);
        store.addObject(light);
        logs.push(`added ${kind} light "${light.name}"`);
      } else if (type === 'add_effect' || type === 'trigger_physics') {
        const object = findObjectRef(refName(action));
        if (!object) {
          logs.push(`skipped ${type}: object "${refName(action)}" not found`);
          continue;
        }
        const requested =
          type === 'trigger_physics' ? 'physics' : String(action.effect || action.kind || 'physics');
        const kind = validKind(requested);
        if (!kind) {
          logs.push(`skipped effect: unknown kind "${requested}"`);
          continue;
        }
        let effectId: string | null = null;
        const requestedStart = Number.isFinite(Number(action.start)) ? Number(action.start) : store.time;
        if (kind === 'physics') {
          effectId =
            object.effects?.find((effect) => effect.kind === 'physics')?.id ||
            store.addEffect(object.id, 'physics', requestedStart);
        } else {
          effectId = store.addEffect(object.id, kind, requestedStart);
        }
        if (!effectId) continue;
        const update: Record<string, unknown> = {};
        if (action.material) update.material = validPhysics(action.material);
        if (Number.isFinite(Number(action.amount))) update.amount = Number(action.amount);
        if (Number.isFinite(Number(action.speed))) update.speed = Number(action.speed);
        if (action.axis === 'x' || action.axis === 'y' || action.axis === 'z') update.axis = action.axis;
        if (typeof action.color === 'string') update.color = action.color;
        if (kind === 'physics') {
          update.start = clamp(requestedStart, 0, store.project.timeline.duration);
        }
        if (Object.keys(update).length) store.updateEffect(object.id, effectId, update);
        if (kind === 'physics') store.triggerEffect(object.id, effectId, update.start as number);
        logs.push(
          `${kind === 'physics' ? 'enabled physics' : `added ${kind}`} on "${object.name}"${
            action.material ? ` (${action.material})` : ''
          }`
        );
      } else if (type === 'set_transform') {
        const object = findObjectRef(refName(action));
        if (!object) {
          logs.push(`skipped transform: object "${refName(action)}" not found`);
          continue;
        }
        const patch: Partial<SceneObject> = {};
        if (action.position) patch.position = vector(action.position, object.position);
        if (action.rotation) patch.rotation = vector(action.rotation, object.rotation);
        if (action.scale) patch.scale = vector(action.scale, object.scale);
        useEditorStore.getState().updateObject(object.id, patch, { record: true });
        logs.push(`moved "${object.name}"`);
      } else if (type === 'set_parent') {
        const object = findObjectRef(refName(action));
        if (!object) {
          logs.push(`skipped parent: object "${refName(action)}" not found`);
          continue;
        }
        if (!action.parent || action.parent === 'none' || action.parent === 'scene') {
          store.setObjectParent(object.id, null);
          logs.push(`unparented "${object.name}"`);
        } else {
          const parent = findObjectRef(String(action.parent));
          if (!parent) {
            logs.push(`skipped parent: Null "${action.parent}" not found`);
            continue;
          }
          store.setObjectParent(object.id, parent.id);
          logs.push(`parented "${object.name}" to "${parent.name}"`);
        }
      } else if (type === 'set_material') {
        const object = findObjectRef(refName(action));
        if (!object || !object.material) {
          logs.push(`skipped material: "${refName(action)}" has no editable material`);
          continue;
        }
        const material = { ...object.material };
        if (typeof action.color === 'string') material.color = action.color;
        if (typeof action.emissive === 'string') material.emissive = action.emissive;
        for (const key of ['roughness', 'metalness', 'emissiveIntensity', 'opacity'] as const) {
          if (Number.isFinite(Number(action[key]))) material[key] = Number(action[key]);
        }
        if (typeof action.wireframe === 'boolean') material.wireframe = action.wireframe;
        useEditorStore.getState().updateObject(object.id, { material }, { record: true });
        logs.push(`styled "${object.name}"`);
      } else if (type === 'set_camera') {
        const object =
          findObjectRef(refName(action))?.kind === 'camera'
            ? findObjectRef(refName(action))
            : useEditorStore.getState().project.objects.find((item) => item.kind === 'camera') || null;
        if (!object?.camera) {
          logs.push('skipped camera: no render camera in scene');
          continue;
        }
        if (action.aimMode === 'free' || action.aimMode === 'target') {
          store.setCameraAimMode(object.id, action.aimMode);
        }
        if (action.fov !== undefined) store.updateObjectProperty(object.id, 'camera.fov', Number(action.fov));
        if (action.target) store.setCameraTarget(object.id, vector(action.target, object.camera.target), true);
        logs.push(`updated camera "${object.name}"`);
      } else if (type === 'add_key') {
        const object = findObjectRef(refName(action));
        if (!object || typeof action.property !== 'string') {
          logs.push('skipped key: object or property missing');
          continue;
        }
        const time = clamp(Number(action.time ?? useEditorStore.getState().time), 0, store.project.timeline.duration);
        store.addKey(object.id, action.property, time, action.value, action.interp);
        logs.push(`keyed ${action.property} on "${object.name}" at ${time.toFixed(2)}s`);
      } else if (type === 'key_transform') {
        const object = findObjectRef(refName(action));
        if (!object) {
          logs.push(`skipped key_transform: "${refName(action)}" not found`);
          continue;
        }
        store.addTransformKeys(object.id, Number(action.time ?? useEditorStore.getState().time));
        logs.push(`keyed transform of "${object.name}"`);
      } else if (type === 'add_camera_move') {
        const requested = String(action.kind || 'dolly') as CameraMoveKind;
        const allowed: CameraMoveKind[] = ['dolly', 'orbit', 'crane', 'reveal', 'orbit180'];
        store.addCameraMove(allowed.includes(requested) ? requested : 'dolly');
        logs.push(`added ${action.kind || 'dolly'} camera move`);
      } else if (type === 'select') {
        const object = findObjectRef(refName(action));
        if (!object) {
          logs.push(`select: "${refName(action)}" not found`);
          continue;
        }
        store.setSelected(object.id);
        logs.push(`selected "${object.name}"`);
      } else if (type === 'remove') {
        const object = findObjectRef(refName(action));
        if (!object) {
          logs.push(`remove: "${refName(action)}" not found`);
          continue;
        }
        store.removeObject(object.id);
        logs.push(`removed "${object.name}"`);
      } else if (type === 'rename') {
        const object = findObjectRef(refName(action));
        if (!object || !action.name) {
          logs.push('rename: object or name missing');
          continue;
        }
        store.renameObject(object.id, String(action.name));
        logs.push(`renamed to "${action.name}"`);
      } else if (type === 'seek') {
        store.seek(clamp(Number(action.time ?? 0), 0, store.project.timeline.duration));
        logs.push(`moved playhead to ${Number(action.time ?? 0).toFixed(2)}s`);
      } else if (type === 'set_timeline') {
        const patch: Record<string, unknown> = {};
        if (Number.isFinite(Number(action.duration))) patch.duration = Math.max(0.5, Number(action.duration));
        if (Number.isFinite(Number(action.fps))) patch.fps = clamp(Number(action.fps), 1, 120);
        if (typeof action.loop === 'boolean') patch.loop = action.loop;
        store.setTimeline(patch);
        logs.push('updated timeline settings');
      } else if (type === 'set_settings') {
        const allowed = [
          'environment',
          'background',
          'exposure',
          'floorColor',
          'wallColor',
          'fogEnabled',
          'fogColor',
          'fogDensity',
          'gridVisible',
          'schematicsVisible',
          'contactShadows'
        ];
        const patch: Record<string, unknown> = {};
        for (const key of allowed) {
          if (action[key] !== undefined) patch[key] = action[key];
        }
        useEditorStore.getState().setSettings(patch);
        logs.push('updated scene settings');
      } else if (type === 'set_project_name') {
        useEditorStore.getState().setProjectName(String(action.name || 'Untitled Scene'));
        logs.push('renamed the scene');
      } else if (type === 'clear_effects') {
        const object = findObjectRef(refName(action));
        if (!object) {
          logs.push('clear_effects: object not found');
          continue;
        }
        useEditorStore.getState().updateObject(object.id, { effects: [] }, { record: true });
        logs.push(`cleared effects on "${object.name}"`);
      } else if (type === 'play') {
        useEditorStore.getState().setPlaying(Boolean(action.playing));
        logs.push(action.playing ? 'started playback' : 'paused playback');
      } else {
        logs.push(`ignored unknown action "${type}"`);
      }
    } catch (error: any) {
      logs.push(`action ${action.type} failed: ${error?.message || error}`);
    }
  }
  return logs;
}
