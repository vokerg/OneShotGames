import { BUILDING_TYPES, TEAM, WORLD } from '../config.js';
import { distance } from '../core/math.js';
import { MOVEMENT_LAYERS } from '../navigation/navigation-grid.js';
import { findPath, PATH_STATUSES } from '../navigation/pathfinder.js';

export const RESOURCE_DROPOFF_CAPABILITY_VERSION = 1;
export const RESOURCE_DROPOFF_KINDS = Object.freeze(['metal', 'fuel', 'intel']);
export const RESOURCE_DROPOFF_INTERACTION_RANGE = 70;

const RESOURCE_KIND_SET = new Set(RESOURCE_DROPOFF_KINDS);
const EPSILON = 1e-9;

export const RESOURCE_DROPOFF_BUILDING_CAPABILITIES = Object.freeze({
  hq: Object.freeze({
    version: RESOURCE_DROPOFF_CAPABILITY_VERSION,
    resourceKinds: RESOURCE_DROPOFF_KINDS,
  }),
  depot: Object.freeze({
    version: RESOURCE_DROPOFF_CAPABILITY_VERSION,
    resourceKinds: RESOURCE_DROPOFF_KINDS,
  }),
});

function stableEntityKey(entity, fallbackIndex) {
  if (Number.isInteger(entity?.id)) return entity.id;
  if (typeof entity?.id === 'string' && entity.id) return entity.id;
  return fallbackIndex;
}

function compareStableEntities(collection, left, right) {
  const leftIndex = collection.indexOf(left);
  const rightIndex = collection.indexOf(right);
  const leftKey = stableEntityKey(left, leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex);
  const rightKey = stableEntityKey(right, rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex);
  if (typeof leftKey === 'number' && typeof rightKey === 'number') {
    return leftKey - rightKey || leftIndex - rightIndex;
  }
  return String(leftKey).localeCompare(String(rightKey)) || leftIndex - rightIndex;
}

function canonicalResourceKinds(resourceKinds, label = 'Drop-off resource kinds') {
  if (!Array.isArray(resourceKinds)) throw new TypeError(`${label} must be an array.`);
  const requested = new Set();
  for (const resourceKind of resourceKinds) {
    if (!RESOURCE_KIND_SET.has(resourceKind)) {
      throw new RangeError(`${label} contains unknown resource kind: ${resourceKind}`);
    }
    requested.add(resourceKind);
  }
  return Object.freeze(RESOURCE_DROPOFF_KINDS.filter((kind) => requested.has(kind)));
}

export function validateResourceDropOffCapabilities(
  registry = RESOURCE_DROPOFF_BUILDING_CAPABILITIES,
) {
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    throw new TypeError('Resource drop-off capability registry must be an object.');
  }
  const result = {};
  for (const type of Object.keys(registry).sort()) {
    const capability = registry[type];
    if (!capability || typeof capability !== 'object' || Array.isArray(capability)) {
      throw new TypeError(`Drop-off capability for ${type} must be an object.`);
    }
    if (capability.version !== RESOURCE_DROPOFF_CAPABILITY_VERSION) {
      throw new RangeError(`Unsupported drop-off capability version for ${type}: ${capability.version}`);
    }
    result[type] = Object.freeze({
      version: RESOURCE_DROPOFF_CAPABILITY_VERSION,
      resourceKinds: canonicalResourceKinds(
        capability.resourceKinds,
        `Drop-off resource kinds for ${type}`,
      ),
    });
  }
  return Object.freeze(result);
}

export function resourceDropOffKindsForBuilding(
  building,
  registry = RESOURCE_DROPOFF_BUILDING_CAPABILITIES,
) {
  if (!building) return Object.freeze([]);
  if (building.dropOffKinds !== undefined) {
    return canonicalResourceKinds(building.dropOffKinds, `Drop-off resource kinds for building ${building.id ?? building.type}`);
  }
  return validateResourceDropOffCapabilities(registry)[building.type]?.resourceKinds ?? Object.freeze([]);
}

export function applyResourceDropOffCapabilities(
  building,
  registry = RESOURCE_DROPOFF_BUILDING_CAPABILITIES,
) {
  if (!building || typeof building !== 'object') {
    throw new TypeError('Resource drop-off capability materialization requires a building object.');
  }
  building.dropOffKinds = resourceDropOffKindsForBuilding(building, registry);
  building.dropOffCapabilityVersion = RESOURCE_DROPOFF_CAPABILITY_VERSION;
  return building;
}

export function applyResourceDropOffCapabilitiesToGame(
  game,
  registry = RESOURCE_DROPOFF_BUILDING_CAPABILITIES,
) {
  if (!game || !Array.isArray(game.buildings)) {
    throw new TypeError('Resource drop-off capability materialization requires game.buildings.');
  }
  game.buildings.forEach((building) => applyResourceDropOffCapabilities(building, registry));
  return game.buildings;
}

export function isOperationalResourceDropOff(
  game,
  building,
  resourceKind,
  team = TEAM.UA,
) {
  return Boolean(
    RESOURCE_KIND_SET.has(resourceKind) &&
      building &&
      Array.isArray(game?.buildings) &&
      game.buildings.includes(building) &&
      building.team === team &&
      Number.isFinite(building.hp) &&
      building.hp > 0 &&
      !building.underConstruction &&
      resourceDropOffKindsForBuilding(building).includes(resourceKind),
  );
}

function buildingFootprint(building, grid, buildingTypes = BUILDING_TYPES) {
  const placement = building?.placement;
  if (
    placement?.origin &&
    Number.isInteger(placement.origin.x) &&
    Number.isInteger(placement.origin.y) &&
    placement?.footprint &&
    Number.isInteger(placement.footprint.width) &&
    Number.isInteger(placement.footprint.height)
  ) {
    return {
      origin: { x: placement.origin.x, y: placement.origin.y },
      footprint: {
        width: placement.footprint.width,
        height: placement.footprint.height,
      },
    };
  }

  const stats = buildingTypes[building?.type];
  if (!stats || !Number.isFinite(stats.w) || !Number.isFinite(stats.h)) return null;
  const tileSize = grid?.tileSize ?? WORLD.tile;
  const left = Math.max(0, Math.floor((building.x - stats.w / 2) / tileSize));
  const top = Math.max(0, Math.floor((building.y - stats.h / 2) / tileSize));
  const right = Math.min(grid.width, Math.ceil((building.x + stats.w / 2) / tileSize));
  const bottom = Math.min(grid.height, Math.ceil((building.y + stats.h / 2) / tileSize));
  if (right <= left || bottom <= top) return null;
  return {
    origin: { x: left, y: top },
    footprint: { width: right - left, height: bottom - top },
  };
}

function cellKey(cell) {
  return `${cell.x},${cell.y}`;
}

export function resourceDropOffApproachCells(
  grid,
  building,
  { buildingTypes = BUILDING_TYPES, interactionRange = RESOURCE_DROPOFF_INTERACTION_RANGE } = {},
) {
  if (
    !grid ||
    !Number.isInteger(grid.width) ||
    !Number.isInteger(grid.height) ||
    typeof grid.isPassable !== 'function' ||
    typeof grid.cellToWorldCenter !== 'function'
  ) {
    throw new TypeError('Drop-off approach selection requires a navigation-grid compatible object.');
  }
  if (!Number.isFinite(interactionRange) || interactionRange <= 0) {
    throw new TypeError('Drop-off interaction range must be a positive finite number.');
  }
  const geometry = buildingFootprint(building, grid, buildingTypes);
  if (!geometry) return Object.freeze([]);
  const { origin, footprint } = geometry;
  const cells = [];
  for (let x = origin.x - 1; x <= origin.x + footprint.width; x += 1) {
    cells.push({ x, y: origin.y - 1 });
    cells.push({ x, y: origin.y + footprint.height });
  }
  for (let y = origin.y; y < origin.y + footprint.height; y += 1) {
    cells.push({ x: origin.x - 1, y });
    cells.push({ x: origin.x + footprint.width, y });
  }

  const unique = new Map();
  for (const cell of cells) {
    if (cell.x < 0 || cell.y < 0 || cell.x >= grid.width || cell.y >= grid.height) continue;
    if (!grid.isPassable(cell.x, cell.y, { layer: MOVEMENT_LAYERS.GROUND })) continue;
    const point = grid.cellToWorldCenter(cell.x, cell.y);
    if (distance(point, building) > interactionRange + EPSILON) continue;
    unique.set(cellKey(cell), Object.freeze({
      cell: Object.freeze({ x: cell.x, y: cell.y }),
      point: Object.freeze({ x: point.x, y: point.y }),
    }));
  }
  return Object.freeze(
    [...unique.values()].sort((left, right) =>
      left.cell.y - right.cell.y || left.cell.x - right.cell.x,
    ),
  );
}

function normalizeTravelMeasurement(measurement, building) {
  if (Number.isFinite(measurement)) {
    if (measurement < 0) throw new RangeError('Injected drop-off travel cost must be non-negative.');
    return Object.freeze({
      reachable: true,
      cost: measurement,
      approachCell: null,
      approach: Object.freeze({ x: building.x, y: building.y }),
      visited: 0,
      method: 'injected',
      revision: null,
    });
  }
  if (!measurement || measurement.reachable === false || !Number.isFinite(measurement.cost)) {
    return Object.freeze({
      reachable: false,
      cost: Infinity,
      approachCell: null,
      approach: null,
      visited: measurement?.visited ?? 0,
      method: measurement?.method ?? 'unreachable',
      revision: measurement?.revision ?? null,
    });
  }
  if (measurement.cost < 0) throw new RangeError('Injected drop-off travel cost must be non-negative.');
  const approach = measurement.approach ?? building;
  return Object.freeze({
    reachable: true,
    cost: measurement.cost,
    approachCell: measurement.approachCell
      ? Object.freeze({ ...measurement.approachCell })
      : null,
    approach: Object.freeze({ x: approach.x, y: approach.y }),
    visited: measurement.visited ?? 0,
    method: measurement.method ?? 'injected',
    revision: measurement.revision ?? null,
  });
}

export function measureResourceDropOffTravelCost(
  game,
  origin,
  building,
  {
    navigationState = null,
    synchronizeNavigation = null,
    travelCost = null,
    maxVisited = null,
    buildingTypes = BUILDING_TYPES,
  } = {},
) {
  if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.y)) {
    throw new TypeError('Drop-off travel-cost origin must contain finite x and y coordinates.');
  }
  if (typeof travelCost === 'function') {
    return normalizeTravelMeasurement(travelCost({ game, origin, building }), building);
  }

  let state = navigationState;
  if (!state && typeof synchronizeNavigation === 'function') state = synchronizeNavigation(game);
  const grid = state?.grid;
  if (!grid) {
    return Object.freeze({
      reachable: true,
      cost: distance(origin, building),
      approachCell: null,
      approach: Object.freeze({ x: building.x, y: building.y }),
      visited: 0,
      method: 'distance-fallback',
      revision: state?.revision ?? null,
    });
  }

  let start;
  try {
    start = grid.worldToCell(origin.x, origin.y);
  } catch {
    return Object.freeze({
      reachable: false,
      cost: Infinity,
      approachCell: null,
      approach: null,
      visited: 0,
      method: 'navigation',
      revision: state?.revision ?? null,
    });
  }

  const approaches = resourceDropOffApproachCells(grid, building, { buildingTypes });
  let best = null;
  let visited = 0;
  for (const approach of approaches) {
    const result = findPath(grid, start, approach.cell, {
      layer: MOVEMENT_LAYERS.GROUND,
      maxVisited: maxVisited ?? grid.width * grid.height,
    });
    visited += result.visited;
    if (result.status !== PATH_STATUSES.FOUND || !Number.isFinite(result.cost)) continue;
    if (
      !best ||
      result.cost < best.cost - EPSILON ||
      (Math.abs(result.cost - best.cost) <= EPSILON &&
        (approach.cell.y < best.approachCell.y ||
          (approach.cell.y === best.approachCell.y && approach.cell.x < best.approachCell.x)))
    ) {
      best = {
        cost: result.cost,
        approachCell: approach.cell,
        approach: approach.point,
      };
    }
  }

  if (!best) {
    return Object.freeze({
      reachable: false,
      cost: Infinity,
      approachCell: null,
      approach: null,
      visited,
      method: 'navigation',
      revision: state?.revision ?? null,
    });
  }
  return Object.freeze({
    reachable: true,
    cost: best.cost,
    approachCell: best.approachCell,
    approach: best.approach,
    visited,
    method: 'navigation',
    revision: state?.revision ?? null,
  });
}

export function selectResourceDropOff(
  game,
  origin,
  resourceKind,
  team = TEAM.UA,
  options = {},
) {
  if (!RESOURCE_KIND_SET.has(resourceKind)) return null;
  const buildings = game?.buildings ?? [];
  let navigationState = options.navigationState ?? null;
  if (!navigationState && !options.travelCost && typeof options.synchronizeNavigation === 'function') {
    navigationState = options.synchronizeNavigation(game);
  }
  const candidates = buildings
    .filter((building) => isOperationalResourceDropOff(game, building, resourceKind, team))
    .map((building) => ({
      building,
      measurement: measureResourceDropOffTravelCost(game, origin, building, {
        ...options,
        navigationState,
      }),
    }))
    .filter(({ measurement }) => measurement.reachable)
    .sort((left, right) =>
      left.measurement.cost - right.measurement.cost ||
      compareStableEntities(buildings, left.building, right.building),
    );
  const selected = candidates[0];
  if (!selected) return null;
  return Object.freeze({
    building: selected.building,
    resourceKind,
    team,
    travelCost: selected.measurement.cost,
    approachCell: selected.measurement.approachCell,
    approach: selected.measurement.approach,
    method: selected.measurement.method,
    navigationRevision: selected.measurement.revision,
  });
}

function cachedReturnSelectionValid(game, order, resourceKind, team, revision) {
  return Boolean(
    order?.dropOffSelection &&
      order.dropOffNavigationRevision === revision &&
      order.dropOffSelection.building === order.target &&
      isOperationalResourceDropOff(game, order.target, resourceKind, team),
  );
}

export function createResourceDropOffController(
  game,
  {
    synchronizeNavigation,
    registry = RESOURCE_DROPOFF_BUILDING_CAPABILITIES,
  } = {},
) {
  for (const method of ['start', 'addBuilding', 'updateWorker', 'move']) {
    if (typeof game?.[method] !== 'function') {
      throw new TypeError(`Resource drop-off controller requires game.${method}().`);
    }
  }
  if (typeof synchronizeNavigation !== 'function') {
    throw new TypeError('Resource drop-off controller requires synchronizeNavigation(game).');
  }
  validateResourceDropOffCapabilities(registry);

  const originalStart = game.start;
  const originalAddBuilding = game.addBuilding;
  const originalUpdateWorker = game.updateWorker;
  const originalMove = game.move;

  const materialize = () => applyResourceDropOffCapabilitiesToGame(game, registry);
  materialize();

  game.start = (...args) => {
    const result = originalStart.apply(game, args);
    materialize();
    return result;
  };

  game.addBuilding = (...args) => {
    const building = originalAddBuilding.apply(game, args);
    if (building) applyResourceDropOffCapabilities(building, registry);
    return building;
  };

  game.selectResourceDropOff = (origin, resourceKind, team = TEAM.UA) =>
    selectResourceDropOff(game, origin, resourceKind, team, {
      synchronizeNavigation,
    });

  game.updateWorker = (unit, stats, dt) => {
    if (unit?.order?.kind === 'return' && RESOURCE_KIND_SET.has(unit.carryKind)) {
      const navigationState = synchronizeNavigation(game);
      if (
        !cachedReturnSelectionValid(
          game,
          unit.order,
          unit.carryKind,
          unit.team,
          navigationState?.revision ?? null,
        )
      ) {
        const selection = selectResourceDropOff(game, unit, unit.carryKind, unit.team, {
          navigationState,
          synchronizeNavigation,
        });
        if (!selection) {
          unit.order = null;
          unit.target = null;
          if (unit.team === TEAM.UA) game.lastError = `No reachable drop-off accepts ${unit.carryKind}.`;
          return;
        }
        unit.order.target = selection.building;
        unit.order.dropOffSelection = selection;
        unit.order.dropOffApproach = selection.approach;
        unit.order.dropOffNavigationRevision = selection.navigationRevision;
      }
    }
    originalUpdateWorker.call(game, unit, stats, dt);
  };

  game.move = (unit, x, y, dt) => {
    const order = unit?.order;
    if (
      order?.kind === 'return' &&
      order.target &&
      order.dropOffApproach &&
      x === order.target.x &&
      y === order.target.y
    ) {
      return originalMove.call(game, unit, order.dropOffApproach.x, order.dropOffApproach.y, dt);
    }
    return originalMove.call(game, unit, x, y, dt);
  };

  return () => {
    game.start = originalStart;
    game.addBuilding = originalAddBuilding;
    game.updateWorker = originalUpdateWorker;
    game.move = originalMove;
    delete game.selectResourceDropOff;
  };
}
