import { EffectKind, PhysicsMaterial, SceneEffect, Vec3, clamp, uid } from './types';

export interface EffectDefinition {
  label: string;
  hint: string;
  defaults: Partial<SceneEffect>;
}

export const EFFECT_DEFINITIONS: Record<EffectKind, EffectDefinition> = {
  physics: {
    label: 'Physics drop',
    hint: 'Gravity, impacts and material response starting at a frame.',
    defaults: { material: 'sponge', amount: 0.2, speed: 1, ground: 0 }
  },
  spin: {
    label: 'Spin',
    hint: 'Constant rotation around an axis.',
    defaults: { amount: 90, speed: 1, axis: 'y' }
  },
  float: {
    label: 'Float / bob',
    hint: 'Soft vertical hover for products and titles.',
    defaults: { amount: 0.22, speed: 0.55 }
  },
  orbit: {
    label: 'Orbit',
    hint: 'Move the object around a circle from its start point.',
    defaults: { amount: 0.7, speed: 0.25, axis: 'y' }
  },
  shake: {
    label: 'Camera shake',
    hint: 'Fast, deterministic hand-held jitter for impact shots.',
    defaults: { amount: 0.05, speed: 14 }
  },
  glow: {
    label: 'Glow pulse',
    hint: 'Animated emissive glow on standard materials.',
    defaults: { amount: 2.4, speed: 1.5, color: '#38bdf8' }
  },
  fade: {
    label: 'Fade out',
    hint: 'Fades the object opacity over a duration in seconds.',
    defaults: { amount: 1.2, speed: 1 }
  },
  pulse: {
    label: 'Scale pulse',
    hint: 'Breathing scale pulse, useful for logos and pickups.',
    defaults: { amount: 0.12, speed: 1.4 }
  },
  lookAt: {
    label: 'Look at camera',
    hint: 'Keeps the object facing the render camera.',
    defaults: {}
  },
  colorCycle: {
    label: 'Colour cycle',
    hint: 'Slowly cycles the material hue.',
    defaults: { amount: 1, speed: 0.08 }
  }
};

export const EFFECT_ORDER: EffectKind[] = [
  'physics',
  'spin',
  'float',
  'orbit',
  'shake',
  'pulse',
  'glow',
  'colorCycle',
  'fade',
  'lookAt'
];

export interface PhysicsPreset {
  label: string;
  hint: string;
  color: string;
  gravity: number;
  bounce: number;
  airDrag: number;
  friction: number;
  squash: number;
  spin: number;
  drift: number;
}

export const PHYSICS_PRESETS: Record<PhysicsMaterial, PhysicsPreset> = {
  glass: {
    label: 'Glass',
    hint: 'Heavy and fast. Sharp, almost dead landing.',
    color: '#7dd3fc',
    gravity: 23,
    bounce: 0.16,
    airDrag: 0.015,
    friction: 0.52,
    squash: 0.015,
    spin: 150,
    drift: 0.08
  },
  paper: {
    label: 'Paper',
    hint: 'Slow flutter with sideways drift and a soft landing.',
    color: '#fde68a',
    gravity: 3.1,
    bounce: 0.02,
    airDrag: 0.85,
    friction: 0.82,
    squash: 0,
    spin: 58,
    drift: 0.85
  },
  sponge: {
    label: 'Sponge',
    hint: 'Light, springy bounces and a visible squash.',
    color: '#fbbf24',
    gravity: 15,
    bounce: 0.64,
    airDrag: 0.08,
    friction: 0.32,
    squash: 0.3,
    spin: 55,
    drift: 0.24
  },
  slime: {
    label: 'Slime',
    hint: 'Sticks on contact with a heavy, slow squash.',
    color: '#86efac',
    gravity: 20,
    bounce: 0.012,
    airDrag: 0.2,
    friction: 0.78,
    squash: 0.4,
    spin: 7,
    drift: 0.05
  }
};

export function makeEffect(kind: EffectKind, start: number): SceneEffect {
  const definition = EFFECT_DEFINITIONS[kind];
  return {
    id: uid('fx'),
    kind,
    enabled: true,
    start: Number(Math.max(0, start).toFixed(4)),
    ...definition.defaults
  };
}

export function normalizeEffect(raw: any, index = 0): SceneEffect | null {
  if (!raw || typeof raw !== 'object') return null;
  const kind = (EFFECT_ORDER as string[]).includes(raw.kind) ? (raw.kind as EffectKind) : null;
  if (!kind) return null;
  const defaults = EFFECT_DEFINITIONS[kind].defaults;
  const material: PhysicsMaterial =
    raw.material === 'glass' || raw.material === 'paper' || raw.material === 'slime'
      ? raw.material
      : raw.material === 'sponge'
        ? 'sponge'
        : (defaults.material as PhysicsMaterial) || 'sponge';
  const numeric = (value: unknown, fallback: number | undefined, min: number, max: number) =>
    typeof value === 'number' && Number.isFinite(value)
      ? clamp(value, min, max)
      : fallback;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid(`fx${index}`),
    kind,
    enabled: raw.enabled !== false,
    start: Math.max(0, Number(raw.start) || 0),
    material,
    amount: numeric(raw.amount, defaults.amount, -1000, 1000),
    speed: numeric(raw.speed, defaults.speed, -60, 600),
    axis: raw.axis === 'x' || raw.axis === 'z' ? raw.axis : 'y',
    ground: numeric(raw.ground, defaults.ground, -100, 100),
    bounce: numeric(raw.bounce, defaults.bounce, 0, 1),
    gravity: numeric(raw.gravity, defaults.gravity, 0, 100),
    color: typeof raw.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : defaults.color
  };
}

export interface PhysicsResult {
  offset: Vec3;
  rotation: Vec3;
  scale: Vec3;
  landed: boolean;
  impactSpeed: number;
}

const ZERO: PhysicsResult = {
  offset: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
  landed: false,
  impactSpeed: 0
};

/**
 * Deterministic material simulation. It re-runs from the start for any requested
 * time, so scrubbing and video export always match without baked physics keys.
 */
export function simulatePhysics(
  effect: SceneEffect,
  elapsed: number,
  startY: number,
  floorY: number
): PhysicsResult {
  if (elapsed <= 0) return ZERO;
  const material = effect.material || 'sponge';
  const preset = PHYSICS_PRESETS[material];
  const gravity = effect.gravity ?? preset.gravity;
  const restitution = clamp(effect.bounce ?? preset.bounce, 0, 1);
  const push = clamp(effect.amount ?? 0, -20, 20);
  const tumbleScale = effect.speed ?? 1;
  const simTime = clamp(elapsed, 0, 30);
  const ground = Math.min(floorY, startY + 0.001);

  let y = startY;
  let x = 0;
  let z = 0;
  let vy = 0;
  let vx = push;
  let vz = 0;
  let spin = 0;
  let lastImpact = -1;
  let impactSpeed = 0;
  let landed = false;

  const stepSize = 1 / 120;
  let t = 0;
  while (t < simTime - 0.000001) {
    const step = Math.min(stepSize, simTime - t);

    if (material === 'paper') {
      vy -= gravity * step;
      vy = Math.max(vy, -0.9);
      x += (Math.sin((t + 0.4) * 2.3) * preset.drift + push * 0.35) * step;
      z += Math.cos((t + 0.8) * 1.7) * preset.drift * 0.65 * step;
      spin += preset.spin * 0.35 * tumbleScale * step;
    } else {
      vy -= gravity * step;
      vy *= Math.max(0, 1 - preset.airDrag * step);
      x += vx * step;
      z += vz * step;
      const sideDrag = 1 - preset.airDrag * 0.5 * step;
      vx *= Math.max(0, sideDrag);
      vz *= Math.max(0, sideDrag);
      spin += preset.spin * tumbleScale * step;
    }

    y += vy * step;

    if (y <= ground) {
      y = ground;
      const speed = Math.max(0, -vy);
      if (speed > 0.04) {
        impactSpeed = Math.max(impactSpeed, speed);
        lastImpact = t;
        landed = true;
      }
      if (material === 'paper' || material === 'slime' || speed < 0.42 || restitution < 0.02) {
        vy = 0;
      } else {
        vy = speed * restitution;
      }
      vx *= preset.friction;
      vz *= preset.friction;
      if (material === 'slime') {
        vx = 0;
        vz = 0;
      }
    }
    t += step;
  }

  const sinceImpact = lastImpact >= 0 ? simTime - lastImpact : -1;
  let squash = 0;
  if (landed && sinceImpact >= 0 && (material === 'sponge' || material === 'slime')) {
    if (material === 'slime') {
      squash = preset.squash * Math.exp(-sinceImpact * 0.85) * (0.75 + 0.25 * Math.cos(sinceImpact * 9));
    } else {
      squash = preset.squash * Math.exp(-sinceImpact * 4.2) * Math.cos(sinceImpact * 17);
    }
  }

  const scale: Vec3 = [1 + squash * 0.55, 1 - squash, 1 + squash * 0.55];
  let rotation: Vec3 = [0, spin, 0];
  if (material === 'paper') {
    rotation = [
      Math.sin((simTime + 0.2) * 3.1) * 26,
      spin,
      Math.cos((simTime + 0.5) * 1.7) * 20
    ];
  } else if (material === 'glass') {
    rotation = [Math.sin(simTime * 2.2) * 5, spin, Math.cos(simTime * 1.8) * 3];
  }

  return {
    offset: [x, y - startY, z],
    rotation,
    scale,
    landed,
    impactSpeed
  };
}
