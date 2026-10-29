import { Vec3 } from './types';

/**
 * The render camera uses a YXZ Euler order (yaw, pitch, roll) when it is in
 * "free aim" mode. These helpers convert between a look-at target and that
 * Euler representation so switching modes never snaps the framing.
 */

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;

export function lookAtRotation(position: Vec3, target: Vec3): Vec3 {
  const dx = target[0] - position[0];
  const dy = target[1] - position[1];
  const dz = target[2] - position[2];
  const length = Math.hypot(dx, dy, dz);
  if (length < 1e-6) return [0, 0, 0];
  const yaw = Math.atan2(-dx, -dz);
  const pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  return [Number((pitch * DEG).toFixed(3)), Number((yaw * DEG).toFixed(3)), 0];
}

export function forwardFromRotation(rotation: Vec3): Vec3 {
  const pitch = rotation[0] * RAD;
  const yaw = rotation[1] * RAD;
  const cp = Math.cos(pitch);
  return [
    -cp * Math.sin(yaw),
    Math.sin(pitch),
    -cp * Math.cos(yaw)
  ];
}

export function targetFromRotation(position: Vec3, rotation: Vec3, distance = 6): Vec3 {
  const forward = forwardFromRotation(rotation);
  return [
    Number((position[0] + forward[0] * distance).toFixed(3)),
    Number((position[1] + forward[1] * distance).toFixed(3)),
    Number((position[2] + forward[2] * distance).toFixed(3))
  ];
}
