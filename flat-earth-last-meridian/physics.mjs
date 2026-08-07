export const TAU = Math.PI * 2;
export const WORLD_RADIUS = 1;
export const ICE_WALL_RADIUS = 0.97;
export const SUN_TRACK_RADIUS = 0.46;
export const SUN_PERIOD_SECONDS = 150;
export const FIRMAMENT_PERIOD_SECONDS = 118;
export const DAYLIGHT_RADIUS = 0.72;

export function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function normalizeAngle(angle) {
  let result = angle % TAU;
  if (result < 0) result += TAU;
  return result;
}

export function sunPosition(elapsedSeconds) {
  const angle = normalizeAngle(-Math.PI / 2 + (elapsedSeconds / SUN_PERIOD_SECONDS) * TAU);
  return {
    x: Math.cos(angle) * SUN_TRACK_RADIUS,
    y: Math.sin(angle) * SUN_TRACK_RADIUS,
    angle,
  };
}

export function daylightAt(x, y, elapsedSeconds) {
  const sun = sunPosition(elapsedSeconds);
  const distance = Math.hypot(x - sun.x, y - sun.y);
  const raw = clamp(1 - distance / DAYLIGHT_RADIUS);
  return Math.pow(raw, 0.72);
}

export function edgePressureAt(x, y) {
  return smoothstep(0.60, ICE_WALL_RADIUS, Math.hypot(x, y));
}

export function ambientTemperatureAt(x, y, elapsedSeconds) {
  const daylight = daylightAt(x, y, elapsedSeconds);
  const edge = edgePressureAt(x, y);
  return -31 + daylight * 48 - edge * 18;
}

export function firmamentRotation(elapsedSeconds) {
  return normalizeAngle((elapsedSeconds / FIRMAMENT_PERIOD_SECONDS) * TAU);
}

export function windVectorAt(x, y, elapsedSeconds, starLockSeconds = 0) {
  const radius = Math.hypot(x, y);
  if (radius < 0.001) return { x: 0, y: 0, strength: 0 };

  const daylight = daylightAt(x, y, elapsedSeconds);
  const edge = edgePressureAt(x, y);
  const outward = { x: x / radius, y: y / radius };
  const tangent = { x: -outward.y, y: outward.x };
  const base = edge * (0.016 + (1 - daylight) * 0.026);
  const lockFactor = starLockSeconds > 0 ? 0.34 : 1;
  const strength = base * lockFactor;

  return {
    x: (outward.x + tangent.x * 0.28) * strength,
    y: (outward.y + tangent.y * 0.28) * strength,
    strength,
  };
}

export function laneStateAt(x, y, elapsedSeconds) {
  const radius = Math.hypot(x, y);
  const angle = normalizeAngle(Math.atan2(y, x));
  const daylight = daylightAt(x, y, elapsedSeconds);

  const annulus = radius > 0.33 && radius < 0.82;
  const spoke = Math.abs(Math.sin(angle * 3 + 0.45)) < 0.19;
  const inLane = annulus && spoke;

  if (!inLane) return { inLane: false, frozen: false, speedFactor: 1 };
  if (daylight < 0.3) return { inLane: true, frozen: true, speedFactor: 1.28 };
  if (daylight > 0.56) return { inLane: true, frozen: false, speedFactor: 0.72 };
  return { inLane: true, frozen: false, speedFactor: 0.9 };
}

export function gnomonDirectionAt(x, y, elapsedSeconds) {
  const sun = sunPosition(elapsedSeconds);
  const dx = x - sun.x;
  const dy = y - sun.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length };
}

export function environmentAt(x, y, elapsedSeconds, starLockSeconds = 0) {
  return {
    daylight: daylightAt(x, y, elapsedSeconds),
    edgePressure: edgePressureAt(x, y),
    temperature: ambientTemperatureAt(x, y, elapsedSeconds),
    wind: windVectorAt(x, y, elapsedSeconds, starLockSeconds),
    lane: laneStateAt(x, y, elapsedSeconds),
    gnomon: gnomonDirectionAt(x, y, elapsedSeconds),
  };
}
