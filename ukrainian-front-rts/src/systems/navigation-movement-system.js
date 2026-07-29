import { BUILDING_TYPES, TEAM, UNIT_TYPES, WORLD } from '../config.js';
import {
  DEFAULT_TERRAIN_RULES,
  MOVEMENT_LAYERS,
  TERRAIN_TYPES,
  createNavigationGridFromMapData,
} from '../navigation/navigation-grid.js';
import {
  PATH_REQUEST_RESULTS,
  createNavigationPathService,
} from '../navigation/path-service.js';
import { PATH_STATUSES } from '../navigation/pathfinder.js';
import {
  currentWaypoint,
} from '../navigation/waypoint-route.js';
import { buildingNavigationBlocker } from './construction-placement-system.js';
import { resolveUnitOverlaps } from './unit-collision-system.js';

const NAVIGATION_ORDER_KINDS = new Set(['move', 'attackMove']);
const TERRAIN_BY_RUNTIME_VALUE = Object.freeze({
  1: TERRAIN_TYPES.MUD,
  2: TERRAIN_TYPES.RUBBLE,
});
const RUNTIME_TERRAIN_RULES = Object.freeze({
  [TERRAIN_TYPES.OPEN]: DEFAULT_TERRAIN_RULES[TERRAIN_TYPES.OPEN],
  [TERRAIN_TYPES.MUD]: DEFAULT_TERRAIN_RULES[TERRAIN_TYPES.MUD],
  [TERRAIN_TYPES.RUBBLE]: DEFAULT_TERRAIN_RULES[TERRAIN_TYPES.RUBBLE],
});

function terrainEntries(game) {
  const entries = [];
  for (let index = 0; index < game.terrain.length; index += 1) {
    const type = TERRAIN_BY_RUNTIME_VALUE[game.terrain[index]];
    if (!type) continue;
    entries.push({
      x: index % (WORLD.w / WORLD.tile),
      y: Math.floor(index / (WORLD.w / WORLD.tile)),
      type,
    });
  }
  return entries;
}

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

  return createNavigationGridFromMapData({
    width: WORLD.w / WORLD.tile,
    height: WORLD.h / WORLD.tile,
    tileSize: WORLD.tile,
    defaultTerrain: TERRAIN_TYPES.OPEN,
    terrain: terrainEntries(game),
    bridges: [],
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
    game.navigationState.pathService.setGrid(game.navigationState.grid, game.navigationState.revision);
    game.navigationState.tick ??= 0;
  }
  return game.navigationState;
}

function unitNavigationLayer(stats) {
  return stats.air ? MOVEMENT_LAYERS.AIR : MOVEMENT_LAYERS.GROUND;
}

function unitRuntimeStats(game, unit) {
  if (unit.team === TEAM.UA && typeof game.unitStats === 'function') return game.unitStats(unit.type);
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

function ensureNavigationRoute(game, unit, order, state) {
  if (order.navigationRoute && order.navigationRevision === state.revision) return order.navigationRoute;

  const destination = order.navigationDestination ?? { x: order.x, y: order.y };
  order.navigationDestination = Object.freeze({ x: destination.x, y: destination.y });
  const request = state.pathService.requestRoute(
    { x: unit.x, y: unit.y },
    order.navigationDestination,
    { layer: unitNavigationLayer(UNIT_TYPES[unit.type]) },
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

  if (order.navigationRoute.status !== PATH_STATUSES.FOUND) {
    if (unit.team === TEAM.UA) game.lastError = routeFailureMessage(order.navigationRoute.status);
    state.pathService.releaseRequest(navigationRequestId(unit));
    unit.order = null;
    unit.target = null;
  }
  return order.navigationRoute;
}

export function updateUnitWithNavigation(game, unit, stepSeconds, state = synchronizeNavigationGrid(game)) {
  const order = unit.order;
  const stats = UNIT_TYPES[unit.type];
  const requestId = navigationRequestId(unit);
  if (!order || !NAVIGATION_ORDER_KINDS.has(order.kind) || stats?.air) {
    state.pathService.releaseRequest(requestId);
    game.updateUnit(unit, stepSeconds);
    return;
  }

  const route = ensureNavigationRoute(game, unit, order, state);
  if (!route || unit.order !== order || route.status !== PATH_STATUSES.FOUND) return;

  const waypoint = currentWaypoint(route);
  if (!waypoint) {
    unit.order = null;
    state.pathService.releaseRequest(requestId);
    return;
  }

  order.x = waypoint.x;
  order.y = waypoint.y;
  game.updateUnit(unit, stepSeconds);

  if (unit.order === null) {
    route.nextIndex += 1;
    const next = currentWaypoint(route);
    if (next) {
      order.x = next.x;
      order.y = next.y;
      unit.order = order;
    } else {
      state.pathService.releaseRequest(requestId);
    }
  }
}

export function updateUnitsWithNavigation(game, stepSeconds) {
  const state = synchronizeNavigationGrid(game);
  state.tick += 1;
  for (const unit of game.units) updateUnitWithNavigation(game, unit, stepSeconds, state);
  return resolveUnitOverlaps(
    game.units,
    (unit) => unitRuntimeStats(game, unit),
    { worldWidth: WORLD.w, worldHeight: WORLD.h },
  );
}
