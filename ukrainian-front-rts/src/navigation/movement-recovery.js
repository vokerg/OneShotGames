export const MOVEMENT_RECOVERY_DEFAULTS = Object.freeze({
  minimumProgress: 1,
  stuckSeconds: 0.75,
  progressWindowSeconds: 3,
  minimumWindowProgress: 12,
  maxDetours: 3,
  maxReplans: 3,
  retargetDistance: 8,
});

export const MOVEMENT_RECOVERY_STATUSES = Object.freeze({
  PROGRESSING: 'progressing',
  STALLED: 'stalled',
  STUCK: 'stuck',
});

const NEIGHBOR_OFFSETS = Object.freeze(
  [-1, 0, 1].flatMap((y) => [-1, 0, 1]
    .filter((x) => x !== 0 || y !== 0)
    .map((x) => Object.freeze({ x, y }))),
);

function assertPoint(point, label) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new TypeError(`${label} must contain finite x and y coordinates.`);
  }
}

function assertRecoveryState(state) {
  if (!state || !Number.isInteger(state.waypointIndex) || !Array.isArray(state.attemptedCellKeys)) {
    throw new TypeError('Movement recovery requires state returned by ensureMovementRecoveryState().');
  }
}

function distance(left, right) {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function freezePoint(point) {
  return Object.freeze({ x: point.x, y: point.y });
}

function cellKey(cell) {
  return `${cell.x},${cell.y}`;
}

function resetProgressTarget(state, unit, target) {
  const remaining = distance(unit, target);
  state.target = freezePoint(target);
  state.bestDistance = remaining;
  state.stalledSeconds = 0;
  state.progressWindowSeconds = 0;
  state.progressWindowDistance = remaining;
  state.madeProgress = false;
}

export function ensureMovementRecoveryState(order, route, unit, target) {
  if (!order || !route || !Number.isInteger(route.nextIndex)) {
    throw new TypeError('Movement recovery requires an order and waypoint route.');
  }
  assertPoint(unit, 'Recovery unit');
  assertPoint(target, 'Recovery target');

  const existing = order.navigationRecovery;
  if (existing?.route === route && existing.waypointIndex === route.nextIndex) return existing;

  const initialDistance = distance(unit, target);
  const state = {
    route,
    waypointIndex: route.nextIndex,
    target: freezePoint(target),
    bestDistance: initialDistance,
    stalledSeconds: 0,
    progressWindowSeconds: 0,
    progressWindowDistance: initialDistance,
    madeProgress: false,
    madeWaypointProgress: false,
    detour: null,
    detourAttempts: 0,
    attemptedCellKeys: [],
  };
  order.navigationRecovery = state;
  return state;
}

export function retargetMovementRecoveryState(
  state,
  unit,
  target,
  { retargetDistance = MOVEMENT_RECOVERY_DEFAULTS.retargetDistance } = {},
) {
  assertRecoveryState(state);
  assertPoint(unit, 'Recovery unit');
  assertPoint(target, 'Recovery target');
  if (!Number.isFinite(retargetDistance) || retargetDistance < 0) {
    throw new TypeError('Recovery retarget distance must be a non-negative finite number.');
  }
  if (state.detour || distance(state.target, target) < retargetDistance) return false;
  const remaining = distance(unit, target);
  state.target = freezePoint(target);
  state.bestDistance = remaining;
  state.progressWindowSeconds = 0;
  state.progressWindowDistance = remaining;
  return true;
}

export function recordMovementProgress(
  state,
  unit,
  stepSeconds,
  {
    minimumProgress = MOVEMENT_RECOVERY_DEFAULTS.minimumProgress,
    stuckSeconds = MOVEMENT_RECOVERY_DEFAULTS.stuckSeconds,
    progressWindowSeconds = MOVEMENT_RECOVERY_DEFAULTS.progressWindowSeconds,
    minimumWindowProgress = MOVEMENT_RECOVERY_DEFAULTS.minimumWindowProgress,
  } = {},
) {
  assertRecoveryState(state);
  assertPoint(unit, 'Recovery unit');
  if (!Number.isFinite(stepSeconds) || stepSeconds < 0) {
    throw new TypeError('Recovery step duration must be a non-negative finite number.');
  }
  if (!Number.isFinite(minimumProgress) || minimumProgress < 0) {
    throw new TypeError('Minimum recovery progress must be a non-negative finite number.');
  }
  if (!Number.isFinite(stuckSeconds) || stuckSeconds <= 0) {
    throw new TypeError('Recovery stuck duration must be a positive finite number.');
  }
  if (!Number.isFinite(progressWindowSeconds) || progressWindowSeconds <= 0) {
    throw new TypeError('Recovery progress-window duration must be a positive finite number.');
  }
  if (!Number.isFinite(minimumWindowProgress) || minimumWindowProgress < 0) {
    throw new TypeError('Minimum recovery window progress must be a non-negative finite number.');
  }

  const remaining = distance(unit, state.target);
  const progressed = remaining <= state.bestDistance - minimumProgress;
  if (progressed) {
    state.bestDistance = remaining;
    state.stalledSeconds = 0;
    state.madeProgress = true;
    if (!state.detour) state.madeWaypointProgress = true;
  } else {
    state.stalledSeconds += stepSeconds;
  }

  state.progressWindowSeconds += stepSeconds;
  if (state.progressWindowSeconds >= progressWindowSeconds) {
    const windowProgress = state.progressWindowDistance - remaining;
    if (windowProgress < minimumWindowProgress) {
      return Object.freeze({
        status: MOVEMENT_RECOVERY_STATUSES.STUCK,
        remaining,
        stalledSeconds: state.stalledSeconds,
      });
    }
    state.progressWindowSeconds = 0;
    state.progressWindowDistance = remaining;
  }

  return Object.freeze({
    status: progressed
      ? MOVEMENT_RECOVERY_STATUSES.PROGRESSING
      : state.stalledSeconds >= stuckSeconds
        ? MOVEMENT_RECOVERY_STATUSES.STUCK
        : MOVEMENT_RECOVERY_STATUSES.STALLED,
    remaining,
    stalledSeconds: state.stalledSeconds,
  });
}

function passableCell(grid, x, y, options) {
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return false;
  try {
    return grid.isPassable(x, y, options);
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}

export function chooseLocalDetour(
  grid,
  unit,
  destination,
  {
    layer,
    footprint,
    ignoreBlockerIds,
    attemptedCellKeys = [],
  } = {},
) {
  if (
    !grid ||
    typeof grid.worldToCell !== 'function' ||
    typeof grid.cellToWorldCenter !== 'function' ||
    typeof grid.isPassable !== 'function'
  ) {
    throw new TypeError('Local detours require a navigation-grid compatible object.');
  }
  assertPoint(unit, 'Detour unit');
  assertPoint(destination, 'Detour destination');
  if (!Array.isArray(attemptedCellKeys)) throw new TypeError('Attempted detour cells must be an array.');

  let origin;
  try {
    origin = grid.worldToCell(unit.x, unit.y);
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }

  const passability = {};
  if (layer !== undefined) passability.layer = layer;
  if (footprint !== undefined) passability.footprint = footprint;
  if (ignoreBlockerIds !== undefined) passability.ignoreBlockerIds = ignoreBlockerIds;
  const attempted = new Set(attemptedCellKeys);
  const currentDistance = distance(unit, destination);
  const directionX = destination.x - unit.x;
  const directionY = destination.y - unit.y;
  const directionLength = Math.hypot(directionX, directionY);
  const candidates = [];

  for (const offset of NEIGHBOR_OFFSETS) {
    const cell = { x: origin.x + offset.x, y: origin.y + offset.y };
    const key = cellKey(cell);
    if (attempted.has(key) || !passableCell(grid, cell.x, cell.y, passability)) continue;
    if (
      offset.x !== 0 &&
      offset.y !== 0 &&
      (!passableCell(grid, origin.x + offset.x, origin.y, passability) ||
        !passableCell(grid, origin.x, origin.y + offset.y, passability))
    ) {
      continue;
    }

    const point = grid.cellToWorldCenter(cell.x, cell.y);
    const candidateDistance = distance(point, destination);
    const movementX = point.x - unit.x;
    const movementY = point.y - unit.y;
    const movementLength = Math.hypot(movementX, movementY);
    const lateral = directionLength === 0 || movementLength === 0
      ? 1
      : Math.abs(directionX * movementY - directionY * movementX) / (directionLength * movementLength);
    const progress = currentDistance - candidateDistance;
    if (directionLength > 0 && lateral < 0.35) continue;
    candidates.push({
      cell,
      key,
      point,
      backwardRank: progress < -grid.tileSize * 0.25 ? 1 : 0,
      lateralRank: lateral >= 0.35 ? 0 : 1,
      candidateDistance,
    });
  }

  candidates.sort((left, right) =>
    left.backwardRank - right.backwardRank ||
    left.lateralRank - right.lateralRank ||
    left.candidateDistance - right.candidateDistance ||
    left.cell.y - right.cell.y ||
    left.cell.x - right.cell.x,
  );
  const selected = candidates[0];
  if (!selected) return null;
  return Object.freeze({
    cell: Object.freeze({ ...selected.cell }),
    cellKey: selected.key,
    point: freezePoint(selected.point),
  });
}

export function activateLocalDetour(state, detour, unit) {
  assertRecoveryState(state);
  assertPoint(unit, 'Recovery unit');
  if (!detour?.cellKey || !detour.point) throw new TypeError('Recovery detour must come from chooseLocalDetour().');
  state.detour = detour;
  state.detourAttempts += 1;
  state.attemptedCellKeys.push(detour.cellKey);
  resetProgressTarget(state, unit, detour.point);
  return state;
}

export function finishLocalDetour(state, unit, resumeTarget) {
  assertRecoveryState(state);
  assertPoint(unit, 'Recovery unit');
  assertPoint(resumeTarget, 'Recovery resume target');
  state.detour = null;
  resetProgressTarget(state, unit, resumeTarget);
  return state;
}

export function clearMovementRecoveryState(order) {
  if (order && Object.hasOwn(order, 'navigationRecovery')) delete order.navigationRecovery;
}
