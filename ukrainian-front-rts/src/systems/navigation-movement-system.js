import { BUILDING_TYPES, TEAM, UNIT_TYPES, WORLD } from '../config.js';
import {
  formationRouteDestination,
  resolveFormationWaypoint,
} from '../core/formation.js';
import {
  MOVEMENT_RECOVERY_DEFAULTS,
  MOVEMENT_RECOVERY_STATUSES,
  activateLocalDetour,
  chooseLocalDetour,
  clearMovementRecoveryState,
  ensureMovementRecoveryState,
  finishLocalDetour,
  recordMovementProgress,
  retargetMovementRecoveryState,
} from '../navigation/movement-recovery.js';
import {
  MOVEMENT_LAYERS,
  TERRAIN_TYPES,
  createNavigationGridFromMapData,
} from '../navigation/navigation-grid.js';
import {
  PATH_REQUEST_RESULTS,
  createNavigationPathService,
} from '../navigation/path-service.js';
import { PATH_STATUSES } from '../navigation/pathfinder.js';
import { currentWaypoint } from '../navigation/waypoint-route.js';
import { buildingNavigationBlocker } from './construction-placement-system.js';
import {
  RUNTIME_TERRAIN_RULES,
  runtimeNavigationTerrainData,
  updateUnitWithTerrainMovement,
} from './terrain-movement-system.js';
import { resolveUnitOverlaps } from './unit-collision-system.js';

const NAVIGATION_ORDER_KINDS = new Set(['move', 'attackMove']);
const STUCK_ORDER_MESSAGE = 'Unit is blocked and cannot reach the destination.';
const BLOCKED_START_ESCAPE_RADIUS = 8;
const DIRECT_MOVEMENT_ARRIVAL_DISTANCE = 5;
const MAX_GROUND_UNIT_RADIUS = Math.max(
  ...Object.values(UNIT_TYPES)
    .filter((stats) => stats && !stats.air)
    .map((stats) => Math.max(0, Number(stats.size) || 0)),
);

function placementSignature(building) {
  const placement = building.placement;
  if (!placement?.origin || !placement?.footprint) return '';
  return [
    placement.rotation ?? 0,
    placement.origin.x,
    placement.origin.y,
    placement.footprint.width,
    placement.footprint.height,
  ].join(':');
}

function navigationSignature(game) {
  const buildings = game.buildings
    .filter((building) => building.hp > 0)
    .map(
      (building) =>
        `${building.id}:${building.type}:${building.x}:${building.y}:${placementSignature(building)}`,
    )
    .sort()
    .join('|');
  return `${game.missionIndex}:${game.terrain.length}:${buildings}`;
}

function createRuntimeNavigationGrid(game) {
  const blockers = game.buildings
    .filter((building) => building.hp > 0)
    .map(buildingNavigationBlocker)
    .filter(Boolean);
  const terrainData = runtimeNavigationTerrainData(game);

  return createNavigationGridFromMapData({
    width: WORLD.w / WORLD.tile,
    height: WORLD.h / WORLD.tile,
    tileSize: WORLD.tile,
    defaultTerrain: TERRAIN_TYPES.OPEN,
    terrain: terrainData.terrain,
    shelterbelts: terrainData.shelterbelts,
    roads: terrainData.roads,
    bridges: terrainData.bridges,
    blockers,
  }, { terrainRules: RUNTIME_TERRAIN_RULES });
}

export function synchronizeNavigationGrid(game) {
  if (!game || !Array.isArray(game.terrain) || !Array.isArray(game.buildings)) {
    throw new TypeError('Navigation synchronization requires game terrain and building arrays.');
  }

  const signature = navigationSignature(game);
  if (!game.navigationState || game.navigationState.signature !== signature) {
    const previous = game.navigationState;
    const revision = (previous?.revision ?? 0) + 1;
    const grid = createRuntimeNavigationGrid(game);
    const pathService = previous?.pathService ?? createNavigationPathService();
    pathService.setGrid(grid, revision);
    game.navigationState = {
      grid,
      signature,
      revision,
      tick: previous?.tick ?? 0,
      pathService,
    };
  } else if (!game.navigationState.pathService) {
    game.navigationState.pathService = createNavigationPathService();
    game.navigationState.pathService.setGrid(
      game.navigationState.grid,
      game.navigationState.revision,
    );
    game.navigationState.tick ??= 0;
  }
  return game.navigationState;
}

function unitNavigationLayer(stats) {
  return stats.movementLayer ?? (stats.air ? MOVEMENT_LAYERS.AIR : MOVEMENT_LAYERS.GROUND);
}

function unitRuntimeStats(game, unit) {
  if (unit.team === TEAM.UA && typeof game.unitStats === 'function') {
    return game.unitStats(unit.type);
  }
  return UNIT_TYPES[unit.type];
}

function routeFailureMessage(status) {
  if (status === PATH_STATUSES.GOAL_BLOCKED) return 'Destination is blocked.';
  if (status === PATH_STATUSES.START_BLOCKED) return 'Unit cannot leave its current position.';
  if (status === PATH_STATUSES.SEARCH_LIMIT) return 'No route was found within the search limit.';
  return 'Destination is unreachable.';
}

function navigationRequestId(unit) {
  return `unit:${unit.id}`;
}

function intermediateWaypointReached(unit, formationWaypoint, recovery, stats) {
  const route = recovery.route;
  if (recovery.detour || route.nextIndex >= route.waypoints.length - 1) return false;
  const remaining = Math.hypot(
    formationWaypoint.x - unit.x,
    formationWaypoint.y - unit.y,
  );
  const unitRadius = Math.max(0, Number(stats?.size) || 0);
  const clearance = DIRECT_MOVEMENT_ARRIVAL_DISTANCE + unitRadius + MAX_GROUND_UNIT_RADIUS;
  return remaining < recovery.bestDistance && remaining <= clearance;
}

function clearRecoveryReplanState(order) {
  if (order && Object.hasOwn(order, 'navigationRecoveryReplans')) {
    delete order.navigationRecoveryReplans;
  }
}

function clearBlockedStartRecoveryState(order) {
  if (order && Object.hasOwn(order, 'navigationBlockedStartRecovery')) {
    delete order.navigationBlockedStartRecovery;
  }
}

function cancelNavigationOrder(game, unit, order, message, state) {
  if (unit.team === TEAM.UA) game.lastError = message;
  if (unit.order === order) unit.order = null;
  unit.target = null;
  clearMovementRecoveryState(order);
  clearRecoveryReplanState(order);
  clearBlockedStartRecoveryState(order);
  state.pathService.releaseRequest(navigationRequestId(unit));
}

function ensureNavigationDestination(order) {
  if (!order.navigationDestination) {
    const destination = formationRouteDestination(order);
    order.navigationDestination = Object.freeze({ x: destination.x, y: destination.y });
  }
  return order.navigationDestination;
}

function unitStartPassable(state, unit, stats) {
  try {
    const cell = state.grid.worldToCell(unit.x, unit.y);
    return state.grid.isPassable(cell.x, cell.y, {
      layer: unitNavigationLayer(stats),
    });
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}

function createBlockedStartRecovery(order, unit, state) {
  const existing = order.navigationBlockedStartRecovery;
  if (existing?.revision === state.revision) return existing;

  delete order.navigationRoute;
  delete order.navigationRevision;
  delete order.navigationRepathTick;
  clearMovementRecoveryState(order);
  state.pathService.releaseRequest(navigationRequestId(unit));
  const recovery = {
    revision: state.revision,
    waypointIndex: 0,
    attemptedCellKeys: [],
    detourAttempts: 0,
    detour: null,
    target: Object.freeze({ x: unit.x, y: unit.y }),
    bestDistance: 0,
    stalledSeconds: 0,
  };
  order.navigationBlockedStartRecovery = recovery;
  return recovery;
}

function blockedStartEscapeCandidate(order, recovery, unit, state, stats) {
  let origin;
  try {
    origin = state.grid.worldToCell(unit.x, unit.y);
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }

  const destination = ensureNavigationDestination(order);
  const attempted = new Set(recovery.attemptedCellKeys);
  const candidates = [];
  for (let radius = 1; radius <= BLOCKED_START_ESCAPE_RADIUS; radius += 1) {
    candidates.length = 0;
    for (let y = origin.y - radius; y <= origin.y + radius; y += 1) {
      for (let x = origin.x - radius; x <= origin.x + radius; x += 1) {
        if (Math.max(Math.abs(x - origin.x), Math.abs(y - origin.y)) !== radius) continue;
        if (x < 0 || y < 0 || x >= state.grid.width || y >= state.grid.height) continue;
        const cellKey = `${x},${y}`;
        if (attempted.has(cellKey)) continue;
        if (!state.grid.isPassable(x, y, { layer: unitNavigationLayer(stats) })) continue;
        const point = state.grid.cellToWorldCenter(x, y);
        candidates.push({
          cell: { x, y },
          cellKey,
          point,
          escapeDistance: Math.hypot(point.x - unit.x, point.y - unit.y),
          destinationDistance: Math.hypot(destination.x - point.x, destination.y - point.y),
        });
      }
    }
    candidates.sort((left, right) =>
      left.escapeDistance - right.escapeDistance ||
      left.destinationDistance - right.destinationDistance ||
      left.cell.y - right.cell.y ||
      left.cell.x - right.cell.x,
    );
    if (candidates.length) {
      const selected = candidates[0];
      return Object.freeze({
        cell: Object.freeze({ ...selected.cell }),
        cellKey: selected.cellKey,
        point: Object.freeze({ ...selected.point }),
      });
    }
  }
  return null;
}

function activateBlockedStartDetour(order, recovery, unit, state, stats) {
  const detour = blockedStartEscapeCandidate(order, recovery, unit, state, stats);
  if (!detour) return false;
  activateLocalDetour(recovery, detour, unit);
  order.x = detour.point.x;
  order.y = detour.point.y;
  return true;
}

function recoverBlockedStart(game, unit, order, state, stats, stepSeconds) {
  const recovery = createBlockedStartRecovery(order, unit, state);
  if (!recovery.detour && !activateBlockedStartDetour(order, recovery, unit, state, stats)) {
    cancelNavigationOrder(
      game,
      unit,
      order,
      routeFailureMessage(PATH_STATUSES.START_BLOCKED),
      state,
    );
    return;
  }

  order.x = recovery.detour.point.x;
  order.y = recovery.detour.point.y;
  game.updateUnit(unit, stepSeconds);

  if (unit.order === null) {
    unit.order = order;
    clearRecoveryReplanState(order);
    return;
  }

  const progress = recordMovementProgress(recovery, unit, stepSeconds);
  if (progress.status !== MOVEMENT_RECOVERY_STATUSES.STUCK) return;
  if (
    recovery.detourAttempts >= MOVEMENT_RECOVERY_DEFAULTS.maxDetours ||
    !activateBlockedStartDetour(order, recovery, unit, state, stats)
  ) {
    cancelNavigationOrder(
      game,
      unit,
      order,
      routeFailureMessage(PATH_STATUSES.START_BLOCKED),
      state,
    );
  }
}

function ensureNavigationRoute(game, unit, order, state, stats) {
  if (order.navigationRoute && order.navigationRevision === state.revision) {
    return order.navigationRoute;
  }

  const destination = ensureNavigationDestination(order);
  const request = state.pathService.requestRoute(
    { x: unit.x, y: unit.y },
    destination,
    { layer: unitNavigationLayer(stats) },
    {
      requestId: navigationRequestId(unit),
      tick: state.tick,
      force: !order.navigationRoute,
    },
  );

  if (request.status === PATH_REQUEST_RESULTS.THROTTLED) {
    order.navigationRepathTick = request.retryTick;
    return null;
  }

  order.navigationRoute = request.route;
  order.navigationRevision = state.revision;
  delete order.navigationRepathTick;
  clearMovementRecoveryState(order);

  if (order.navigationRoute.status !== PATH_STATUSES.FOUND) {
    cancelNavigationOrder(
      game,
      unit,
      order,
      routeFailureMessage(order.navigationRoute.status),
      state,
    );
  }
  return order.navigationRoute;
}

function applyFormationState(order, formationWaypoint) {
  if (!order.formation) return;
  order.formationCompression = formationWaypoint.compression;
  order.formationState = formationWaypoint.state;
}

function restoreRouteTarget(order, route, state, stats, unit) {
  const next = currentWaypoint(route);
  if (!next) return false;
  const nextFormationWaypoint = resolveFormationWaypoint(state.grid, next, order, {
    layer: unitNavigationLayer(stats),
    origin: unit,
  });
  order.x = nextFormationWaypoint.x;
  order.y = nextFormationWaypoint.y;
  applyFormationState(order, nextFormationWaypoint);
  clearRecoveryReplanState(order);
  return true;
}

function scheduleGlobalRecoveryReplan(unit, order, state) {
  const attempts = Number(order.navigationRecoveryReplans || 0);
  if (attempts >= MOVEMENT_RECOVERY_DEFAULTS.maxReplans) return false;
  order.navigationRecoveryReplans = attempts + 1;
  delete order.navigationRoute;
  delete order.navigationRevision;
  delete order.navigationRepathTick;
  clearMovementRecoveryState(order);
  state.pathService.releaseRequest(navigationRequestId(unit));
  return true;
}

function attemptMovementRecovery(game, unit, order, state, stats, formationWaypoint) {
  const recovery = order.navigationRecovery;
  if (recovery.detourAttempts >= MOVEMENT_RECOVERY_DEFAULTS.maxDetours) {
    if (scheduleGlobalRecoveryReplan(unit, order, state)) return true;
    cancelNavigationOrder(game, unit, order, STUCK_ORDER_MESSAGE, state);
    return false;
  }

  const detour = chooseLocalDetour(state.grid, unit, formationWaypoint, {
    layer: unitNavigationLayer(stats),
    attemptedCellKeys: recovery.attemptedCellKeys,
  });
  if (!detour) {
    if (scheduleGlobalRecoveryReplan(unit, order, state)) return true;
    cancelNavigationOrder(game, unit, order, STUCK_ORDER_MESSAGE, state);
    return false;
  }

  activateLocalDetour(recovery, detour, unit);
  order.x = detour.point.x;
  order.y = detour.point.y;
  return true;
}

function evaluateMovementProgress({
  game,
  unit,
  order,
  state,
  stats,
  formationWaypoint,
  recovery,
  stepSeconds,
}) {
  if (unit.order !== order) return;
  if (intermediateWaypointReached(unit, formationWaypoint, recovery, stats)) {
    recovery.route.nextIndex += 1;
    clearMovementRecoveryState(order);
    restoreRouteTarget(order, recovery.route, state, stats, unit);
    return;
  }
  const progress = recordMovementProgress(recovery, unit, stepSeconds);
  if (progress.status === MOVEMENT_RECOVERY_STATUSES.PROGRESSING) {
    if (!recovery.detour) clearRecoveryReplanState(order);
  } else if (progress.status === MOVEMENT_RECOVERY_STATUSES.STUCK) {
    attemptMovementRecovery(game, unit, order, state, stats, formationWaypoint);
  }
}

export function updateUnitWithNavigation(
  game,
  unit,
  stepSeconds,
  state = synchronizeNavigationGrid(game),
  { deferProgress = false } = {},
) {
  const order = unit.order;
  const stats = unitRuntimeStats(game, unit);
  const requestId = navigationRequestId(unit);
  if (!order || !NAVIGATION_ORDER_KINDS.has(order.kind) || stats?.air) {
    state.pathService.releaseRequest(requestId);
    updateUnitWithTerrainMovement(game, unit, stepSeconds, state.grid);
    return;
  }

  if (!unitStartPassable(state, unit, stats)) {
    recoverBlockedStart(game, unit, order, state, stats, stepSeconds);
    return;
  }

  const route = ensureNavigationRoute(game, unit, order, state, stats);
  if (!route || unit.order !== order || route.status !== PATH_STATUSES.FOUND) return;

  const waypoint = currentWaypoint(route);
  if (!waypoint) {
    clearMovementRecoveryState(order);
    clearRecoveryReplanState(order);
    clearBlockedStartRecoveryState(order);
    unit.order = null;
    state.pathService.releaseRequest(requestId);
    return;
  }

  const formationWaypoint = resolveFormationWaypoint(
    state.grid,
    waypoint,
    route.nextIndex === 0 ? null : order,
    {
      layer: unitNavigationLayer(stats),
      origin: unit,
    },
  );
  const recovery = ensureMovementRecoveryState(order, route, unit, formationWaypoint);
  retargetMovementRecoveryState(recovery, unit, formationWaypoint);
  const movementTarget = recovery.detour?.point ?? formationWaypoint;
  order.x = movementTarget.x;
  order.y = movementTarget.y;
  applyFormationState(order, formationWaypoint);
  const wasFollowingDetour = Boolean(recovery.detour);
  updateUnitWithTerrainMovement(game, unit, stepSeconds, state.grid);

  if (unit.order === null) {
    if (wasFollowingDetour) {
      finishLocalDetour(recovery, unit, formationWaypoint);
      order.x = formationWaypoint.x;
      order.y = formationWaypoint.y;
      unit.order = order;
      return;
    }

    route.nextIndex += 1;
    clearMovementRecoveryState(order);
    if (restoreRouteTarget(order, route, state, stats, unit)) {
      unit.order = order;
    } else {
      clearRecoveryReplanState(order);
      clearBlockedStartRecoveryState(order);
      state.pathService.releaseRequest(requestId);
    }
    return;
  }

  const progressContext = {
    game,
    unit,
    order,
    state,
    stats,
    formationWaypoint,
    recovery,
    stepSeconds,
  };
  if (deferProgress) return progressContext;
  evaluateMovementProgress(progressContext);
  return null;
}

export function updateUnitsWithNavigation(game, stepSeconds) {
  const state = synchronizeNavigationGrid(game);
  state.pathService.retainRequests(game.units.map(navigationRequestId));
  state.tick += 1;
  const progressContexts = [];
  for (const unit of game.units) {
    const progressContext = updateUnitWithNavigation(
      game,
      unit,
      stepSeconds,
      state,
      { deferProgress: true },
    );
    if (progressContext) progressContexts.push(progressContext);
  }

  const collisionUnits = game.units.filter(
    (unit) => !unit.order?.navigationBlockedStartRecovery,
  );
  const collisionResult = resolveUnitOverlaps(
    collisionUnits,
    (unit) => unitRuntimeStats(game, unit),
    { worldWidth: WORLD.w, worldHeight: WORLD.h },
  );
  for (const unit of game.units) {
    const order = unit.order;
    if (!order?.navigationBlockedStartRecovery) continue;
    const stats = unitRuntimeStats(game, unit);
    if (unitStartPassable(state, unit, stats)) clearBlockedStartRecoveryState(order);
  }
  for (const progressContext of progressContexts) {
    evaluateMovementProgress(progressContext);
  }
  return collisionResult;
}
