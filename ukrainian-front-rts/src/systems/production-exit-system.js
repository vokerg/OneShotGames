import { BUILDING_TYPES, TEAM, UNIT_TYPES, WORLD } from '../config.js';

export const MAX_RALLY_WAYPOINTS = 8;
export const DEFAULT_EXIT_SEARCH_RINGS = 6;

const GROUND_LAYER = 'ground';
const AIR_LAYER = 'air';
const SIDE_ORDER = Object.freeze(['south', 'east', 'north', 'west']);
const SIDE_RANK = new Map(SIDE_ORDER.map((side, index) => [side, index]));

function finitePoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function freezePoint(point) {
  return Object.freeze({ x: point.x, y: point.y });
}

function isProductionType(type) {
  return Array.isArray(BUILDING_TYPES[type]?.produces) && BUILDING_TYPES[type].produces.length > 0;
}

function productionBuilding(game, building = null) {
  if (building) return building;
  return game.selectedEntities?.().find((entity) => isProductionType(entity.type)) ?? null;
}

function validProductionBuilding(game, building) {
  return Boolean(
    building &&
    building.team === TEAM.UA &&
    (game.buildings || []).includes(building) &&
    isProductionType(building.type),
  );
}

export function ensureProductionExitState(building) {
  if (!building || typeof building !== 'object') {
    throw new TypeError('Production exit state requires a building object.');
  }
  if (!Array.isArray(building.rallyWaypoints)) building.rallyWaypoints = [];
  building.rallyWaypoints = Object.freeze(
    building.rallyWaypoints
      .filter(finitePoint)
      .slice(0, MAX_RALLY_WAYPOINTS)
      .map(freezePoint),
  );
  if (typeof building.productionExitBlocked !== 'string') building.productionExitBlocked = '';
  return building;
}

export function setProductionRally(game, x, y, { append = false, building = null } = {}) {
  const target = productionBuilding(game, building);
  game.lastError = '';
  if (!validProductionBuilding(game, target)) {
    game.lastError = 'Select a Ukrainian production building before setting its rally point.';
    return false;
  }
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > WORLD.w || y > WORLD.h) {
    game.lastError = 'Rally point must be inside the battlefield.';
    return false;
  }
  ensureProductionExitState(target);
  if (append && target.rallyWaypoints.length >= MAX_RALLY_WAYPOINTS) {
    game.lastError = `Rally queue is limited to ${MAX_RALLY_WAYPOINTS} waypoints.`;
    return false;
  }
  const point = freezePoint({ x, y });
  target.rallyWaypoints = Object.freeze(
    append ? [...target.rallyWaypoints, point] : [point],
  );
  target.productionExitBlocked = '';
  return true;
}

export function clearProductionRally(game, building = null) {
  const target = productionBuilding(game, building);
  game.lastError = '';
  if (!validProductionBuilding(game, target)) {
    game.lastError = 'Select a Ukrainian production building before clearing its rally queue.';
    return false;
  }
  ensureProductionExitState(target);
  const changed = target.rallyWaypoints.length > 0;
  target.rallyWaypoints = Object.freeze([]);
  target.productionExitBlocked = '';
  return changed;
}

export function productionRallySnapshot(building) {
  ensureProductionExitState(building);
  return Object.freeze({
    buildingId: building.id,
    blocked: Boolean(building.productionExitBlocked),
    blockedReason: building.productionExitBlocked,
    waypoints: Object.freeze(building.rallyWaypoints.map(freezePoint)),
  });
}

function buildingFootprint(grid, building) {
  const placement = building.placement;
  if (
    placement?.origin &&
    Number.isInteger(placement.origin.x) &&
    Number.isInteger(placement.origin.y) &&
    placement?.footprint &&
    Number.isInteger(placement.footprint.width) &&
    Number.isInteger(placement.footprint.height)
  ) {
    return {
      origin: { ...placement.origin },
      footprint: { ...placement.footprint },
    };
  }
  const stats = BUILDING_TYPES[building.type];
  const footprint = {
    width: Math.max(1, Math.ceil(stats.w / grid.tileSize)),
    height: Math.max(1, Math.ceil(stats.h / grid.tileSize)),
  };
  return {
    origin: {
      x: Math.round(building.x / grid.tileSize - footprint.width / 2),
      y: Math.round(building.y / grid.tileSize - footprint.height / 2),
    },
    footprint,
  };
}

function unitMovementProfile(grid, type) {
  const stats = UNIT_TYPES[type];
  if (!stats) throw new Error(`Unknown produced unit type: ${type}`);
  const diameter = Math.max(1, (stats.size || 12) * 2);
  return {
    stats,
    layer: stats.movementLayer ?? (stats.air ? AIR_LAYER : GROUND_LAYER),
    footprint: {
      width: Math.max(1, Math.ceil(diameter / grid.tileSize)),
      height: Math.max(1, Math.ceil(diameter / grid.tileSize)),
    },
  };
}

function ringCandidates(origin, buildingSize, unitSize, ring) {
  const offset = ring - 1;
  const candidates = [];
  let order = 0;
  const add = (side, x, y) => candidates.push({ side, x, y, ring, order: order++ });
  const minX = origin.x - unitSize.width + 1 - offset;
  const maxX = origin.x + buildingSize.width - 1 + offset;
  const northY = origin.y - unitSize.height - offset;
  const southY = origin.y + buildingSize.height + offset;
  for (let x = minX; x <= maxX; x += 1) add('south', x, southY);
  const minY = origin.y - unitSize.height + 1 - offset;
  const maxY = origin.y + buildingSize.height - 1 + offset;
  const eastX = origin.x + buildingSize.width + offset;
  for (let y = minY; y <= maxY; y += 1) add('east', eastX, y);
  for (let x = maxX; x >= minX; x -= 1) add('north', x, northY);
  const westX = origin.x - unitSize.width - offset;
  for (let y = maxY; y >= minY; y -= 1) add('west', westX, y);
  return candidates;
}

function inBounds(grid, candidate, footprint) {
  return (
    candidate.x >= 0 &&
    candidate.y >= 0 &&
    candidate.x + footprint.width <= grid.width &&
    candidate.y + footprint.height <= grid.height
  );
}

function worldCenter(grid, candidate, footprint) {
  return {
    x: (candidate.x + footprint.width / 2) * grid.tileSize,
    y: (candidate.y + footprint.height / 2) * grid.tileSize,
  };
}

function occupied(game, point, producedStats) {
  const producedRadius = producedStats.size || 12;
  return (game.units || []).some((unit) => {
    if (unit.hp <= 0 || !Number.isFinite(unit.x) || !Number.isFinite(unit.y)) return false;
    const radius = producedRadius + (UNIT_TYPES[unit.type]?.size || 12) + 4;
    return Math.hypot(unit.x - point.x, unit.y - point.y) < radius;
  });
}

function compareCandidates(left, right, rallyPoint) {
  if (left.ring !== right.ring) return left.ring - right.ring;
  if (rallyPoint) {
    const leftDistance = (left.point.x - rallyPoint.x) ** 2 + (left.point.y - rallyPoint.y) ** 2;
    const rightDistance = (right.point.x - rallyPoint.x) ** 2 + (right.point.y - rallyPoint.y) ** 2;
    if (leftDistance !== rightDistance) return leftDistance - rightDistance;
  }
  const sideDifference = SIDE_RANK.get(left.side) - SIDE_RANK.get(right.side);
  if (sideDifference) return sideDifference;
  return left.order - right.order || left.y - right.y || left.x - right.x;
}

export function resolveProductionExit(
  game,
  building,
  type,
  { navigationState, maxRings = DEFAULT_EXIT_SEARCH_RINGS } = {},
) {
  if (!navigationState?.grid) throw new TypeError('Production exit resolution requires synchronized navigation state.');
  if (!Number.isInteger(maxRings) || maxRings < 1) {
    throw new TypeError('Production exit search rings must be a positive integer.');
  }
  ensureProductionExitState(building);
  const grid = navigationState.grid;
  const profile = unitMovementProfile(grid, type);
  const buildingShape = buildingFootprint(grid, building);
  const rallyPoint = building.rallyWaypoints[0] ?? null;
  const candidates = [];

  for (let ring = 1; ring <= maxRings; ring += 1) {
    for (const candidate of ringCandidates(
      buildingShape.origin,
      buildingShape.footprint,
      profile.footprint,
      ring,
    )) {
      if (!inBounds(grid, candidate, profile.footprint)) continue;
      let passable = false;
      try {
        passable = grid.isPassable(candidate.x, candidate.y, {
          layer: profile.layer,
          footprint: profile.footprint,
          ignoreBlockerIds: [`building:${building.id}`],
        });
      } catch {
        passable = false;
      }
      if (!passable) continue;
      const point = worldCenter(grid, candidate, profile.footprint);
      if (occupied(game, point, profile.stats)) continue;
      candidates.push({ ...candidate, point });
    }
    if (candidates.length) break;
  }

  if (!candidates.length) return null;
  candidates.sort((left, right) => compareCandidates(left, right, rallyPoint));
  const chosen = candidates[0];
  return Object.freeze({
    x: chosen.point.x,
    y: chosen.point.y,
    cell: Object.freeze({ x: chosen.x, y: chosen.y }),
    footprint: Object.freeze({ ...profile.footprint }),
    layer: profile.layer,
    side: chosen.side,
    ring: chosen.ring,
    blockedFallback: chosen.ring > 1,
  });
}

export function applyProductionRally(unit, building) {
  ensureProductionExitState(building);
  const orders = building.rallyWaypoints.map((point) => ({
    kind: 'move',
    x: point.x,
    y: point.y,
    rally: true,
    rallyBuildingId: building.id,
  }));
  unit.orderQueue = orders.map((order) => ({ ...order }));
  unit.order = unit.orderQueue[0] ?? null;
  unit.target = null;
  return unit.orderQueue;
}

export function spawnProducedUnit(game, building, item, { synchronizeNavigation } = {}) {
  if (typeof synchronizeNavigation !== 'function') {
    throw new TypeError('Produced-unit spawning requires synchronizeNavigation(game).');
  }
  const exit = resolveProductionExit(game, building, item.type, {
    navigationState: synchronizeNavigation(game),
  });
  ensureProductionExitState(building);
  if (!exit) {
    building.productionExitBlocked = 'All production exits are blocked.';
    return null;
  }

  const unit = game.addUnit(item.type, building.team, exit.x, exit.y);
  applyProductionRally(unit, building);
  building.productionExitBlocked = '';
  if (!Array.isArray(game.productionAcknowledgements)) game.productionAcknowledgements = [];
  if (!Number.isInteger(game.productionAcknowledgementSequence) || game.productionAcknowledgementSequence < 1) {
    game.productionAcknowledgementSequence = 1;
  }
  const acknowledgement = Object.freeze({
    sequence: game.productionAcknowledgementSequence++,
    buildingId: building.id,
    unitId: unit.id,
    type: item.type,
    x: exit.x,
    y: exit.y,
    side: exit.side,
    blockedFallback: exit.blockedFallback,
    rallyWaypointCount: building.rallyWaypoints.length,
    time: Number.isFinite(game.time) ? game.time : 0,
  });
  building.lastProductionAcknowledgement = acknowledgement;
  game.productionAcknowledgements.push(acknowledgement);
  if (game.productionAcknowledgements.length > 32) game.productionAcknowledgements.shift();
  return unit;
}

export function createProductionExitController(game, { synchronizeNavigation } = {}) {
  if (typeof synchronizeNavigation !== 'function') {
    throw new TypeError('Production exit controller requires synchronizeNavigation(game).');
  }
  for (const method of ['start', 'addUnit', 'addBuilding', 'selectedEntities']) {
    if (typeof game?.[method] !== 'function') {
      throw new TypeError(`Production exit controller requires game.${method}().`);
    }
  }

  const originalStart = game.start.bind(game);
  const originalAddBuilding = game.addBuilding.bind(game);
  const originalSpawnProducedUnit = game.spawnProducedUnit;
  for (const building of game.buildings || []) ensureProductionExitState(building);

  game.start = (...args) => {
    game.productionAcknowledgements = [];
    game.productionAcknowledgementSequence = 1;
    return originalStart(...args);
  };
  game.addBuilding = (...args) => ensureProductionExitState(originalAddBuilding(...args));
  game.setProductionRally = (x, y, options) => setProductionRally(game, x, y, options);
  game.clearProductionRally = (building) => clearProductionRally(game, building);
  game.productionRallySnapshot = (building) => productionRallySnapshot(building);
  game.spawnProducedUnit = (building, item) => spawnProducedUnit(game, building, item, { synchronizeNavigation });

  return () => {
    game.start = originalStart;
    game.addBuilding = originalAddBuilding;
    if (originalSpawnProducedUnit) game.spawnProducedUnit = originalSpawnProducedUnit;
    else delete game.spawnProducedUnit;
    delete game.setProductionRally;
    delete game.clearProductionRally;
    delete game.productionRallySnapshot;
  };
}
