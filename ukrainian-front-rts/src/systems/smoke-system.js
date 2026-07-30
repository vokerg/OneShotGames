import { SMOKE_POLICY, combineSmokeDensity, normalizeSmokeDensity } from '../core/smoke-policy.js';

export const DEFAULT_SMOKE_PROFILE = Object.freeze({
  radius: 72,
  duration: 8,
  density: 0.85,
  maxDriftSpeed: 24,
  sampleSpacing: 24,
});

function assertPoint(point, label) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new TypeError(`${label} must contain finite x and y coordinates.`);
  }
}

function assertPositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(`${label} must be positive.`);
}

function normalizeDrift(drift = { x: 0, y: 0 }) {
  assertPoint(drift, 'Smoke drift');
  const speed = Math.hypot(drift.x, drift.y);
  if (speed <= DEFAULT_SMOKE_PROFILE.maxDriftSpeed || speed === 0) {
    return Object.freeze({ x: drift.x, y: drift.y });
  }
  const scale = DEFAULT_SMOKE_PROFILE.maxDriftSpeed / speed;
  return Object.freeze({ x: drift.x * scale, y: drift.y * scale });
}

function cloudList(stateOrClouds) {
  if (Array.isArray(stateOrClouds)) return stateOrClouds;
  return stateOrClouds?.clouds || [];
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
}

export function createSmokeState({ nextId = 1, clouds = [] } = {}) {
  if (!Number.isInteger(nextId) || nextId <= 0) throw new TypeError('Smoke nextId must be a positive integer.');
  if (!Array.isArray(clouds)) throw new TypeError('Smoke clouds must be an array.');
  return { nextId, clouds: [...clouds] };
}

export function ensureSmokeState(game) {
  if (!game || typeof game !== 'object') throw new TypeError('Game state is required.');
  if (!game.smokeState) game.smokeState = createSmokeState();
  return game.smokeState;
}

export function deploySmoke(
  state,
  {
    x,
    y,
    radius = DEFAULT_SMOKE_PROFILE.radius,
    duration = DEFAULT_SMOKE_PROFILE.duration,
    density = DEFAULT_SMOKE_PROFILE.density,
    drift = { x: 0, y: 0 },
    team = null,
    sourceId = null,
    kind = 'screen',
  },
) {
  if (!state || !Array.isArray(state.clouds) || !Number.isInteger(state.nextId)) {
    throw new TypeError('A smoke state created by createSmokeState is required.');
  }
  assertPoint({ x, y }, 'Smoke deployment');
  assertPositive(radius, 'Smoke radius');
  assertPositive(duration, 'Smoke duration');
  const normalizedDensity = normalizeSmokeDensity(density);
  if (normalizedDensity <= 0) throw new TypeError('Smoke density must be greater than zero.');
  const normalizedDrift = normalizeDrift(drift);
  const cloud = {
    id: `smoke-${state.nextId++}`,
    kind,
    team,
    sourceId,
    x,
    y,
    radius,
    density: normalizedDensity,
    duration,
    remaining: duration,
    driftX: normalizedDrift.x,
    driftY: normalizedDrift.y,
  };
  state.clouds.push(cloud);
  return cloud;
}

export function deployGameSmoke(game, specification) {
  return deploySmoke(ensureSmokeState(game), specification);
}

export function effectiveSmokeDensity(cloud) {
  if (!cloud || !Number.isFinite(cloud.remaining) || cloud.remaining <= 0) return 0;
  const duration = Number.isFinite(cloud.duration) && cloud.duration > 0 ? cloud.duration : cloud.remaining;
  const fadeDuration = duration * SMOKE_POLICY.fadeFraction;
  const fadeMultiplier = fadeDuration > 0 && cloud.remaining < fadeDuration ? cloud.remaining / fadeDuration : 1;
  return normalizeSmokeDensity(cloud.density * fadeMultiplier);
}

export function updateSmokeState(state, dt) {
  if (!state || !Array.isArray(state.clouds)) throw new TypeError('Smoke state is required.');
  if (!Number.isFinite(dt) || dt < 0) throw new TypeError('Smoke update dt must be non-negative.');
  for (let index = state.clouds.length - 1; index >= 0; index -= 1) {
    const cloud = state.clouds[index];
    cloud.x += Number(cloud.driftX || 0) * dt;
    cloud.y += Number(cloud.driftY || 0) * dt;
    cloud.remaining -= dt;
    if (cloud.remaining <= 0) state.clouds.splice(index, 1);
  }
  return state.clouds;
}

export function sampleSmokeDensity(stateOrClouds, point) {
  assertPoint(point, 'Smoke sample point');
  const contributions = [];
  for (const cloud of cloudList(stateOrClouds)) {
    const radius = Number(cloud.radius || 0);
    if (radius <= 0 || cloud.remaining <= 0) continue;
    const distance = Math.hypot(point.x - cloud.x, point.y - cloud.y);
    if (distance >= radius) continue;
    contributions.push(effectiveSmokeDensity(cloud) * (1 - distance / radius));
  }
  return combineSmokeDensity(contributions);
}

export function sampleSmokeLineDensity(
  stateOrClouds,
  origin,
  target,
  { spacing = DEFAULT_SMOKE_PROFILE.sampleSpacing } = {},
) {
  assertPoint(origin, 'Smoke line origin');
  assertPoint(target, 'Smoke line target');
  assertPositive(spacing, 'Smoke sample spacing');
  const distance = Math.hypot(target.x - origin.x, target.y - origin.y);
  const steps = Math.max(1, Math.ceil(distance / spacing));
  let peakDensity = 0;
  for (let index = 0; index <= steps; index += 1) {
    const progress = index / steps;
    peakDensity = Math.max(
      peakDensity,
      sampleSmokeDensity(stateOrClouds, {
        x: origin.x + (target.x - origin.x) * progress,
        y: origin.y + (target.y - origin.y) * progress,
      }),
    );
  }
  return normalizeSmokeDensity(peakDensity);
}

export function smokeCellsForVisibility(stateOrClouds, { width, height, tileSize = 32 } = {}) {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new TypeError('Visibility width and height must be positive integers.');
  }
  assertPositive(tileSize, 'Visibility tile size');
  const cells = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const density = sampleSmokeDensity(stateOrClouds, {
        x: x * tileSize + tileSize / 2,
        y: y * tileSize + tileSize / 2,
      });
      if (density > 0) cells.push(Object.freeze({ x, y, density }));
    }
  }
  return Object.freeze(cells);
}

export function snapshotSmokeClouds(stateOrClouds) {
  return Object.freeze(
    cloudList(stateOrClouds).map((cloud) => Object.freeze({
      id: cloud.id,
      kind: cloud.kind,
      team: cloud.team,
      sourceId: cloud.sourceId,
      x: cloud.x,
      y: cloud.y,
      radius: cloud.radius,
      remaining: cloud.remaining,
      duration: cloud.duration,
      density: effectiveSmokeDensity(cloud),
    })),
  );
}

export function scoreSmokeDeployment(candidate, { friendlies = [], threats = [], clouds = [] } = {}) {
  assertPoint(candidate, 'Smoke candidate');
  const radius = Number(candidate.radius || DEFAULT_SMOKE_PROFILE.radius);
  assertPositive(radius, 'Smoke candidate radius');
  let score = 0;
  for (const friendly of friendlies) {
    assertPoint(friendly, 'Friendly unit');
    if (Math.hypot(candidate.x - friendly.x, candidate.y - friendly.y) <= radius) score += 2;
    for (const threat of threats) {
      assertPoint(threat, 'Threat unit');
      if (distanceToSegment(candidate, threat, friendly) <= radius * 0.75) score += 3;
    }
  }
  for (const threat of threats) {
    if (Math.hypot(candidate.x - threat.x, candidate.y - threat.y) <= radius) score -= 2;
  }
  score -= sampleSmokeDensity(clouds, candidate) * 5;
  return score;
}

export function chooseSmokeDeployment(candidates, context = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const choice = candidates
    .map((candidate, index) => ({ candidate, index, score: scoreSmokeDeployment(candidate, context) }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.candidate.x - right.candidate.x ||
        left.candidate.y - right.candidate.y ||
        left.index - right.index,
    )[0];
  return Object.freeze({ candidate: choice.candidate, score: choice.score });
}
