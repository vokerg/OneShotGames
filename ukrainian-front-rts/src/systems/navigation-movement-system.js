import { BUILDING_TYPES, TEAM, UNIT_TYPES, WORLD } from '../config.js';
import {
  formationRouteDestination,
  resolveFormationWaypoint,
} from '../core/formation.js';
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
import { buildingNavigationBlocker } from './construction-placement-system.js';
import {
  RUNTIME_TERRAIN_RULES,
  runtimeNavigationTerrainData,
  updateUnitWithTerrainMovement,
} from './terrain-movement-system.js';
import { resolveUnitOverlaps } from './unit-collision-system.js';

const NAVIGATION_ORDER_KINDS = new Set(['move', 'attackMove']);

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
  return stats.movementLayer ?? (stats.air ? MOVEMENT_LAYERS.AIR : MOVEMENT_LAYERS.GROUND);
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

function ensureNavigationRoute(game, unit, order, state) {
  if (order.navigationRoute && order.navigationRevision === state.revision) return order.navigationRoute;

  const destination = order.navigationDestination ?? formationRouteDestination(order);
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
    updateUnitWithTerrainMovement(game, unit, stepSeconds, state.grid);
    return;
  }

  const route = ensureNavigationRoute(game, unit, order, state);
  if (unit.order !== order || route.status !== PATH_STATUSES.FOUND) return;

  const waypoint = currentWaypoint(route);
  if (!waypoint) {
    unit.order = null;
    return;
  }

  const formationWaypoint = resolveFormationWaypoint(state.grid, waypoint, order, {
    layer: unitNavigationLayer(stats),
  });
  order.x = formationWaypoint.x;
  order.y = formationWaypoint.y;
  if (order.formation) {
    order.formationCompression = formationWaypoint.compression;
    order.formationState = formationWaypoint.state;
  }
  updateUnitWithTerrainMovement(game, unit, stepSeconds, state.grid);

  if (unit.order === null) {
    route.nextIndex += 1;
    const next = currentWaypoint(route);
    if (next) {
      const nextFormationWaypoint = resolveFormationWaypoint(state.grid, next, order, {
        layer: unitNavigationLayer(stats),
      });
      order.x = nextFormationWaypoint.x;
      order.y = nextFormationWaypoint.y;
      if (order.formation) {
        order.formationCompression = nextFormationWaypoint.compression;
        order.formationState = nextFormationWaypoint.state;
      }
      unit.order = order;
    }
  }
}

export function updateUnitsWithNavigation(game, stepSeconds) {
  const state = synchronizeNavigationGrid(game);
  for (const unit of game.units) updateUnitWithNavigation(game, unit, stepSeconds, state);
  return resolveUnitOverlaps(
    game.units,
    (unit) => unitRuntimeStats(game, unit),
    { worldWidth: WORLD.w, worldHeight: WORLD.h },
  );
}
