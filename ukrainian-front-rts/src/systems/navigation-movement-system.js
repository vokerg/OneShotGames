import { BUILDING_TYPES, TEAM, UNIT_TYPES, WORLD } from '../config.js';
import {
  MOVEMENT_LAYERS,
  TERRAIN_TYPES,
  createNavigationGridFromMapData,
} from '../navigation/navigation-grid.js';
import { PATH_STATUSES } from '../navigation/pathfinder.js';
import {
  currentWaypoint,
  requestWaypointRoute,
} from '../navigation/waypoint-route.js';

const NAVIGATION_ORDER_KINDS = new Set(['move', 'attackMove']);
const TERRAIN_BY_RUNTIME_VALUE = Object.freeze({
  1: TERRAIN_TYPES.MUD,
  2: TERRAIN_TYPES.RUBBLE,
});

function buildingBlocker(building) {
  const stats = BUILDING_TYPES[building.type];
  if (!stats) return null;

  const left = Math.max(0, Math.floor((building.x - stats.w / 2) / WORLD.tile));
  const top = Math.max(0, Math.floor((building.y - stats.h / 2) / WORLD.tile));
  const right = Math.min(WORLD.w / WORLD.tile, Math.ceil((building.x + stats.w / 2) / WORLD.tile));
  const bottom = Math.min(WORLD.h / WORLD.tile, Math.ceil((building.y + stats.h / 2) / WORLD.tile));
  if (right <= left || bottom <= top) return null;

  return {
    id: `building:${building.id}`,
    origin: { x: left, y: top },
    footprint: { width: right - left, height: bottom - top },
    layers: [MOVEMENT_LAYERS.GROUND, MOVEMENT_LAYERS.AMPHIBIOUS],
  };
}

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

function navigationSignature(game) {
  const buildings = game.buildings
    .filter((building) => building.hp > 0)
    .map((building) => `${building.id}:${building.type}:${building.x}:${building.y}`)
    .sort()
    .join('|');
  return `${game.missionIndex}:${game.terrain.length}:${buildings}`;
}

function createRuntimeNavigationGrid(game) {
  const blockers = game.buildings
    .filter((building) => building.hp > 0)
    .map(buildingBlocker)
    .filter(Boolean);

  return createNavigationGridFromMapData({
    width: WORLD.w / WORLD.tile,
    height: WORLD.h / WORLD.tile,
    tileSize: WORLD.tile,
    defaultTerrain: TERRAIN_TYPES.OPEN,
    terrain: terrainEntries(game),
    bridges: [],
    blockers,
  });
}

export function synchronizeNavigationGrid(game) {
  if (!game || !Array.isArray(game.terrain) || !Array.isArray(game.buildings)) {
    throw new TypeError('Navigation synchronization requires game terrain and building arrays.');
  }

  const signature = navigationSignature(game);
  if (!game.navigationState || game.navigationState.signature !== signature) {
    const revision = (game.navigationState?.revision ?? 0) + 1;
    game.navigationState = {
      grid: createRuntimeNavigationGrid(game),
      signature,
      revision,
    };
  }
  return game.navigationState;
}

function unitNavigationLayer(stats) {
  return stats.air ? MOVEMENT_LAYERS.AIR : MOVEMENT_LAYERS.GROUND;
}

function routeFailureMessage(status) {
  if (status === PATH_STATUSES.GOAL_BLOCKED) return 'Destination is blocked.';
  if (status === PATH_STATUSES.START_BLOCKED) return 'Unit cannot leave its current position.';
  if (status === PATH_STATUSES.SEARCH_LIMIT) return 'No route was found within the search limit.';
  return 'Destination is unreachable.';
}

function ensureNavigationRoute(game, unit, order, state) {
  if (order.navigationRoute && order.navigationRevision === state.revision) return order.navigationRoute;

  const destination = order.navigationDestination ?? { x: order.x, y: order.y };
  order.navigationDestination = Object.freeze({ x: destination.x, y: destination.y });
  order.navigationRoute = requestWaypointRoute(
    state.grid,
    { x: unit.x, y: unit.y },
    order.navigationDestination,
    { layer: unitNavigationLayer(UNIT_TYPES[unit.type]) },
  );
  order.navigationRevision = state.revision;

  if (order.navigationRoute.status !== PATH_STATUSES.FOUND) {
    if (unit.team === TEAM.UA) game.lastError = routeFailureMessage(order.navigationRoute.status);
    unit.order = null;
    unit.target = null;
  }
  return order.navigationRoute;
}

export function updateUnitWithNavigation(game, unit, stepSeconds, state = synchronizeNavigationGrid(game)) {
  const order = unit.order;
  const stats = UNIT_TYPES[unit.type];
  if (!order || !NAVIGATION_ORDER_KINDS.has(order.kind) || stats?.air) {
    game.updateUnit(unit, stepSeconds);
    return;
  }

  const route = ensureNavigationRoute(game, unit, order, state);
  if (unit.order !== order || route.status !== PATH_STATUSES.FOUND) return;

  const waypoint = currentWaypoint(route);
  if (!waypoint) {
    unit.order = null;
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
    }
  }
}

export function updateUnitsWithNavigation(game, stepSeconds) {
  const state = synchronizeNavigationGrid(game);
  for (const unit of game.units) updateUnitWithNavigation(game, unit, stepSeconds, state);
}
