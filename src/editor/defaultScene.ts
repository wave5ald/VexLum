import {
  DEFAULT_CAMERA,
  DEFAULT_MATERIAL,
  DEFAULT_VIDEO,
  LightKind,
  LightState,
  PrimitiveType,
  ProjectState,
  SceneObject,
  Vec3
} from './types';
import { uid } from './types';

export type FormationType = 'grid3x3' | 'line' | 'v_shape' | 'circle' | 'arch';

export const MANNEQUIN_COUNT = 9;
export const RED_COLOR = '#c02626';
export const WHITE_COLOR = '#f8fafc';

export function mannequinPositions(formation: FormationType): Array<{ position: Vec3; rotationY: number }> {
  const list: Array<{ position: Vec3; rotationY: number }> = [];
  for (let i = 0; i < MANNEQUIN_COUNT; i++) {
    let x = 0;
    let z = 0;
    let rotationY = 0;
    switch (formation) {
      case 'grid3x3': {
        const row = Math.floor(i / 3);
        const col = i % 3;
        // Checkerboard stagger: the back and front rows sit half a cell to the
        // side, which leaves clear sight lines to the centre of the grid.
        const staggerOffset = row === 1 ? 0 : row === 0 ? -0.8 : 0.8;
        x = (col - 1) * 1.6 + staggerOffset;
        z = (row - 1) * 1.4;
        break;
      }
      case 'line':
        x = (i - 4) * 1.18;
        z = 0;
        break;
      case 'v_shape': {
        const side = i % 2 === 0 ? 1 : -1;
        const step = Math.ceil(i / 2);
        x = i === 0 ? 0 : side * step * 1.1;
        z = i === 0 ? 0 : step * 0.9;
        rotationY = i === 0 ? 0 : -side * 0.25;
        break;
      }
      case 'circle': {
        const angle = (i / MANNEQUIN_COUNT) * Math.PI * 2;
        x = Math.sin(angle) * 2.4;
        z = Math.cos(angle) * 2.4;
        rotationY = angle + Math.PI;
        break;
      }
      case 'arch': {
        const angle = ((i - 4) / 4) * (Math.PI / 3);
        x = Math.sin(angle) * 3.6;
        z = -Math.cos(angle) * 3.6 + 3.2;
        rotationY = -angle;
        break;
      }
    }
    list.push({
      position: [Number(x.toFixed(3)), 0, Number(z.toFixed(3))],
      rotationY: Number(rotationY.toFixed(3))
    });
  }
  return list;
}

export function makeMannequin(index: number, position: Vec3, rotationY = 0, isWhite = false): SceneObject {
  return {
    id: `mannequin-${index + 1}`,
    name: `Mannequin ${String(index + 1).padStart(2, '0')}${isWhite ? ' · White' : ''}`,
    kind: 'mannequin',
    position,
    rotation: [0, rotationY, 0],
    scale: [1, 1, 1],
    visible: true,
    locked: false,
    castShadow: true,
    receiveShadow: true,
    mannequinIndex: index,
    material: { ...DEFAULT_MATERIAL, color: isWhite ? WHITE_COLOR : RED_COLOR, roughness: 0.36 }
  };
}

export function makeLight(
  kind: LightKind,
  name: string,
  position: Vec3,
  overrides: Partial<LightState> = {}
): SceneObject {
  const base: LightState = {
    kind,
    color: '#fff4e6',
    groundColor: '#1b2430',
    intensity: kind === 'ambient' ? 0.35 : kind === 'directional' ? 2.2 : 40,
    distance: 20,
    decay: 2,
    angle: Math.PI / 5,
    penumbra: 0.5,
    width: 3,
    height: 2,
    castShadow: kind === 'directional' || kind === 'spot',
    target: [0, 1.1, 0]
  };
  return {
    id: uid('light'),
    name,
    kind: 'light',
    position,
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    visible: true,
    locked: false,
    castShadow: true,
    receiveShadow: false,
    light: { ...base, ...overrides }
  };
}

export function makeCamera(): SceneObject {
  return {
    id: 'camera-main',
    name: 'Cinema Camera',
    kind: 'camera',
    position: [0, 1.7, 6.9],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    visible: true,
    locked: false,
    castShadow: false,
    receiveShadow: false,
    camera: { ...DEFAULT_CAMERA, fov: 38, target: [0, 1.15, 0] }  };
}

const PRIMITIVE_DIMENSIONS: Record<PrimitiveType, [number, number, number]> = {
  box: [1, 1, 1],
  sphere: [1.2, 1.2, 1.2],
  cylinder: [1, 1.5, 1],
  cone: [1.2, 1.4, 1.2],
  torus: [1.6, 1.6, 0.4],
  torusKnot: [1.6, 1.6, 0.5],
  plane: [2.4, 0.02, 2.4],
  icosahedron: [1.4, 1.4, 1.4],
  gear: [1.6, 0.4, 1.6],
  suzanne: [1.4, 1.2, 1.1],
  monolith: [1.2, 3.2, 0.5]
};

export function makePrimitive(type: PrimitiveType, position?: Vec3, color = '#c02626'): SceneObject {
  const dims = PRIMITIVE_DIMENSIONS[type];
  const baseY = position && position[1] > 0 ? position[1] : dims[1] / 2;
  return {
    id: uid('prim'),
    name: PRIMITIVE_NAMES[type],
    kind: 'primitive',
    position: position ? [position[0], baseY, position[2]] : [0, baseY, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    visible: true,
    locked: false,
    castShadow: true,
    receiveShadow: true,
    primitive: { type, size: 1 },
    material: { ...DEFAULT_MATERIAL, color, roughness: 0.35, metalness: 0.2 }
  };
}

export const PRIMITIVE_NAMES: Record<PrimitiveType, string> = {
  box: 'Monolith Cube',
  sphere: 'Sphere',
  cylinder: 'Column',
  cone: 'Cone',
  torus: 'Torus',
  torusKnot: 'Torus Knot',
  plane: 'Plane',
  icosahedron: 'Icosahedron',
  gear: 'Gear',
  suzanne: 'Suzanne',
  monolith: 'Slab'
};

export function createDefaultProject(): ProjectState {
  const positions = mannequinPositions('grid3x3');
  // Herd of crimson mannequins with a single white one in the centre of the
  // grid — the checkerboard stagger keeps it visible from the cinema camera.
  const whiteIndex = 4;
  const mannequins = positions.map((p, i) =>
    makeMannequin(i, p.position, p.rotationY, i === whiteIndex)
  );

  const lights: SceneObject[] = [
    makeLight('ambient', 'Ambient', [0, 4, 0], { color: '#cfd8e3', intensity: 0.28 }),
    makeLight('hemisphere', 'Sky Bounce', [0, 6, 0], {
      color: '#b8d4ff',
      groundColor: '#2a1c18',
      intensity: 0.5
    }),
    makeLight('directional', 'Key Sun', [4.5, 7, 5], {
      color: '#fff1dc',
      intensity: 2.6,
      target: [0, 1.1, 0],
      castShadow: true
    }),
    makeLight('point', 'Fill Blue', [-4, 3.2, 3], {
      color: '#9dc5e8',
      intensity: 28,
      distance: 16,
      decay: 2
    }),
    makeLight('spot', 'Rim Spotlight', [0, 5.4, -4], {
      color: '#b7ccff',
      intensity: 130,
      angle: 0.72,
      penumbra: 0.65,
      distance: 22,
      decay: 1.6,
      target: [0, 1.35, 0],
      castShadow: true
    })
  ];

  return {
    version: 1,
    name: 'Vexlum — 9 Mannequins',
    objects: [...mannequins, makeCamera(), ...lights],
    tracks: [],
    settings: {
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
    },
    timeline: {
      duration: 8,
      fps: 30,
      loop: true
    },
    video: { ...DEFAULT_VIDEO, end: 8 }
  };
}

/**
 * A brand-new project starts with an empty stage: no mannequins, lights or
 * props — only the scene settings and timeline defaults. The sample mannequin
 * scene stays available from the welcome screen.
 */
export function createEmptyProject(): ProjectState {
  const base = createDefaultProject();
  // No geometry, props or mannequins — but keep a camera and a minimal light
  // rig so the stage is visible and anything you add renders with shading.
  const lights: SceneObject[] = [
    makeLight('ambient', 'Ambient', [0, 4, 0], { color: '#cfd8e3', intensity: 0.35 }),
    makeLight('directional', 'Key Sun', [4.5, 7, 5], {
      color: '#fff1dc',
      intensity: 2.4,
      target: [0, 1.1, 0],
      castShadow: true
    }),
    makeLight('point', 'Fill Blue', [-4, 3.2, 3], {
      color: '#9dc5e8',
      intensity: 26,
      distance: 16,
      decay: 2
    })
  ];
  return {
    ...base,
    name: 'Untitled Scene',
    objects: [makeCamera(), ...lights],
    tracks: []
  };
}

export function applyFormation(objects: SceneObject[], formation: FormationType): SceneObject[] {
  const positions = mannequinPositions(formation);
  return objects.map((object) => {
    if (object.kind !== 'mannequin' || object.mannequinIndex == null) return object;
    const target = positions[object.mannequinIndex];
    if (!target) return object;
    return {
      ...object,
      position: [...target.position] as Vec3,
      rotation: [object.rotation[0], target.rotationY, object.rotation[2]] as Vec3
    };
  });
}

export function setWhiteMannequin(objects: SceneObject[], whiteIndex: number): SceneObject[] {
  return objects.map((object) => {
    if (object.kind !== 'mannequin' || object.mannequinIndex == null || !object.material) return object;
    const isWhite = object.mannequinIndex === whiteIndex;
    return {
      ...object,
      name: `Mannequin ${String((object.mannequinIndex ?? 0) + 1).padStart(2, '0')}${isWhite ? ' · White' : ''}`,
      material: { ...object.material, color: isWhite ? WHITE_COLOR : RED_COLOR }
    };
  });
}
