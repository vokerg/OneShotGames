import { BUILDING_TYPES, TEAM, UNIT_TYPES, WORLD } from '../config.js';
import { clamp, distance } from '../core/math.js';

export const TRANSPORT_RESULTS = Object.freeze({
  EMBARKED: 'embarked',
  DISEMBARKED: 'disembarked',
  INVALID_TRANSPORT: 'invalid-transport',
  NO_PASSENGERS: 'no-passengers',
  WRONG_TEAM: 'wrong-team',
  OUT_OF_RANGE: 'out-of-range',
  INELIGIBLE_PASSENGER: 'ineligible-passenger',
  CAPACITY_EXCEEDED: 'capacity-exceeded',
  NAVIGATION_UNAVAILABLE: 'navigation-unavailable',
  EXIT_BLOCKED: 'exit-blocked',
});

export const TRANSPORT_DESTRUCTION_POLICY = Object.freeze({
  id: 'catastrophic-loss',
  passengerOutcome: 'all-passengers-lost',
});

const IFV_COMPATIBILITY_CAPACITY = 4;
const DEFAULT_EMBARK_RANGE = 78;
const DISEMBARK_ANGLES = 16;
const DISEMBARK_RINGS = 5;
const DISEMBARK_RING_STEP = 30;

function frozenResult(ok, status, message, details = {}) {
  return Object.freeze({ ok, status, message, ...details });
}

function unitStats(game, unit) {
  if (!unit) return null;
  if (unit.team === TEAM.UA && typeof game?.unitStats === 'function') return game.unitStats(unit.type);
  return UNIT_TYPES[unit.type] ?? null;
}

function requireGameCollections(game) {
  if (!game || !Array.isArray(game.units) || !Array.isArray(game.buildings) || !(game.selected instanceof Set)) {
    throw new TypeError('Transport operations require game units, buildings, and selected collections.');
  }
}

export function transportCapacity(game, transport) {
  const stats = unitStats(game, transport);
  if (!stats) return 0;
  if (Number.isInteger(stats.transportCapacity) && stats.transportCapacity >= 0) return stats.transportCapacity;
  return stats.vehicleClass === 'ifv' ? IFV_COMPATIBILITY_CAPACITY : 0;
}

export function transportSlotCost(game, passenger) {
  const stats = unitStats(game, passenger);
  if (!stats) return 0;
  return Number.isInteger(stats.transportSlots) && stats.transportSlots > 0 ? stats.transportSlots : 1;
}

export function initializeTransport(game, transport) {
  if (transportCapacity(game, transport) <= 0) return transport;
  if (!Array.isArray(transport.passengers)) transport.passengers = [];
  transport.passengers.sort((left, right) => left.id - right.id);
  return transport;
}

export function transportSnapshot(game, transport) {
  const capacity = transportCapacity(game, transport);
  const passengers = Array.isArray(transport?.passengers) ? [...transport.passengers].sort((a, b) => a.id - b.id) : [];
  const used = passengers.reduce((sum, passenger) => sum + transportSlotCost(game, passenger), 0);
  return Object.freeze({
    transportId: transport?.id ?? null,
    capacity,
    used,
    available: Math.max(0, capacity - used),
    passengerIds: Object.freeze(passengers.map((passenger) => passenger.id)),
  });
}

export function unitsIncludingPassengers(game) {
  requireGameCollections(game);
  const active = [...game.units];
  const cargo = active.flatMap((unit) => (Array.isArray(unit.passengers) ? unit.passengers : []));
  return Object.freeze([...active, ...cargo].sort((left, right) => left.id - right.id));
}

function passengerEligibility(game, transport, passenger, range) {
  if (!passenger || !game.units.includes(passenger) || passenger.hp <= 0 || passenger.id === transport.id) {
    return frozenResult(false, TRANSPORT_RESULTS.INELIGIBLE_PASSENGER, 'Only active living squads can embark.');
  }
  if (passenger.team !== transport.team) {
    return frozenResult(false, TRANSPORT_RESULTS.WRONG_TEAM, 'Only friendly squads can embark this transport.');
  }
  const stats = unitStats(game, passenger);
  if (!stats || stats.air || stats.armor || transportCapacity(game, passenger) > 0 || stats.transportable === false) {
    return frozenResult(false, TRANSPORT_RESULTS.INELIGIBLE_PASSENGER, 'That unit cannot embark a transport.');
  }
  if (distance(passenger, transport) > range) {
    return frozenResult(false, TRANSPORT_RESULTS.OUT_OF_RANGE, 'Move the squad closer to the transport before embarking.');
  }
  return frozenResult(true, TRANSPORT_RESULTS.EMBARKED, 'Passenger is eligible.');
}

export function embarkUnits(game, transport, passengers, { range = DEFAULT_EMBARK_RANGE } = {}) {
  requireGameCollections(game);
  if (!Number.isFinite(range) || range <= 0) throw new RangeError('Embark range must be a positive finite number.');
  if (!game.units.includes(transport) || transport?.hp <= 0 || transportCapacity(game, transport) <= 0) {
    return frozenResult(false, TRANSPORT_RESULTS.INVALID_TRANSPORT, 'Select a living transport vehicle.');
  }

  initializeTransport(game, transport);
  const uniquePassengers = [...new Map((passengers ?? []).map((passenger) => [passenger?.id, passenger])).values()]
    .filter(Boolean)
    .sort((left, right) => left.id - right.id);
  if (!uniquePassengers.length) {
    return frozenResult(false, TRANSPORT_RESULTS.NO_PASSENGERS, 'Select at least one nearby squad to embark.');
  }

  for (const passenger of uniquePassengers) {
    const eligibility = passengerEligibility(game, transport, passenger, range);
    if (!eligibility.ok) return eligibility;
  }

  const snapshot = transportSnapshot(game, transport);
  const requestedSlots = uniquePassengers.reduce((sum, passenger) => sum + transportSlotCost(game, passenger), 0);
  if (requestedSlots > snapshot.available) {
    return frozenResult(
      false,
      TRANSPORT_RESULTS.CAPACITY_EXCEEDED,
      `Transport capacity exceeded: ${snapshot.available} slot${snapshot.available === 1 ? '' : 's'} available.`,
      { available: snapshot.available, requested: requestedSlots },
    );
  }

  const passengerIds = new Set(uniquePassengers.map((passenger) => passenger.id));
  for (const passenger of uniquePassengers) {
    passenger.order = null;
    passenger.target = null;
    if (Array.isArray(passenger.orderQueue)) passenger.orderQueue.length = 0;
    passenger.selected = false;
    passenger.embarkedIn = transport.id;
    passenger.x = transport.x;
    passenger.y = transport.y;
    game.selected.delete(passenger.id);
    transport.passengers.push(passenger);
  }
  transport.passengers.sort((left, right) => left.id - right.id);
  game.units = game.units.filter((unit) => !passengerIds.has(unit.id));
  for (const unit of game.units) {
    if (passengerIds.has(unit.target?.id)) unit.target = null;
    if (unit.order?.kind === 'attack' && passengerIds.has(unit.order.target?.id)) unit.order = null;
    if (Array.isArray(unit.orderQueue)) {
      unit.orderQueue = unit.orderQueue.filter((order) => !(order?.kind === 'attack' && passengerIds.has(order.target?.id)));
    }
  }
  if (Array.isArray(game.projectiles)) {
    game.projectiles = game.projectiles.filter((projectile) => !passengerIds.has(projectile.target?.id));
  }

  const next = transportSnapshot(game, transport);
  return frozenResult(
    true,
    TRANSPORT_RESULTS.EMBARKED,
    `${uniquePassengers.length} squad${uniquePassengers.length === 1 ? '' : 's'} embarked.`,
    { transportId: transport.id, passengerIds: next.passengerIds, used: next.used, capacity: next.capacity },
  );
}

function movementLayer(game, passenger) {
  const stats = unitStats(game, passenger);
  return stats?.movementLayer ?? (stats?.air ? 'air' : 'ground');
}

function collisionRadius(entity) {
  const unit = UNIT_TYPES[entity?.type];
  if (unit) return unit.size ?? 12;
  const building = BUILDING_TYPES[entity?.type];
  if (building) return Math.max(building.w, building.h) * 0.52;
  return 16;
}

function candidatePositions(game, transport, passenger, target) {
  const stats = unitStats(game, passenger);
  const margin = Math.max(18, (stats?.size ?? 12) + 4);
  const baseRadius = collisionRadius(transport) + collisionRadius(passenger) + 8;
  const positions = [];
  const seen = new Set();
  for (let ring = 0; ring < DISEMBARK_RINGS; ring += 1) {
    const radius = baseRadius + ring * DISEMBARK_RING_STEP;
    for (let index = 0; index < DISEMBARK_ANGLES; index += 1) {
      const angle = (index / DISEMBARK_ANGLES) * Math.PI * 2;
      const x = clamp(target.x + Math.cos(angle) * radius, margin, WORLD.w - margin);
      const y = clamp(target.y + Math.sin(angle) * radius, margin, WORLD.h - margin);
      const key = `${x.toFixed(4)},${y.toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      positions.push(Object.freeze({ x, y }));
    }
  }
  return positions;
}

function placementIsClear(game, passenger, position, planned, transport, grid) {
  let cell;
  try {
    cell = grid.worldToCell(position.x, position.y);
    if (!grid.isPassable(cell.x, cell.y, { layer: movementLayer(game, passenger) })) return false;
  } catch {
    return false;
  }

  const radius = collisionRadius(passenger);
  const activeEntities = [...game.units, ...game.buildings].filter((entity) => entity !== transport && entity.hp > 0);
  if (activeEntities.some((entity) => distance(position, entity) < radius + collisionRadius(entity) + 4)) return false;
  if ((game.nodes ?? []).some((node) => distance(position, node) < radius + 28)) return false;
  if (planned.some((entry) => distance(position, entry.position) < radius + collisionRadius(entry.passenger) + 4)) return false;
  return true;
}

export function planDisembark(game, transport, passengers, { grid, target = transport } = {}) {
  requireGameCollections(game);
  if (!grid || typeof grid.worldToCell !== 'function' || typeof grid.isPassable !== 'function') {
    return frozenResult(false, TRANSPORT_RESULTS.NAVIGATION_UNAVAILABLE, 'Navigation data is not ready for disembarkation.');
  }

  const cargo = Array.isArray(transport?.passengers) ? transport.passengers : [];
  const cargoById = new Map(cargo.map((passenger) => [passenger.id, passenger]));
  const requested = [...new Map((passengers ?? cargo).map((passenger) => [passenger?.id, passenger])).values()]
    .filter((passenger) => passenger && cargoById.get(passenger.id) === passenger)
    .sort((left, right) => left.id - right.id);
  if (!requested.length) {
    return frozenResult(false, TRANSPORT_RESULTS.NO_PASSENGERS, 'The selected transport has no embarked squads.');
  }

  const planned = [];
  for (const passenger of requested) {
    const position = candidatePositions(game, transport, passenger, target)
      .find((candidate) => placementIsClear(game, passenger, candidate, planned, transport, grid));
    if (!position) {
      return frozenResult(false, TRANSPORT_RESULTS.EXIT_BLOCKED, 'No safe disembark position is available near the transport.');
    }
    planned.push(Object.freeze({ passenger, position }));
  }

  return frozenResult(true, TRANSPORT_RESULTS.DISEMBARKED, 'Disembark positions resolved.', {
    placements: Object.freeze(planned),
  });
}

export function disembarkUnits(game, transport, passengers, options = {}) {
  if (!game?.units?.includes(transport) || transport?.hp <= 0 || transportCapacity(game, transport) <= 0) {
    return frozenResult(false, TRANSPORT_RESULTS.INVALID_TRANSPORT, 'Select a living transport vehicle.');
  }
  const plan = planDisembark(game, transport, passengers, options);
  if (!plan.ok) return plan;

  const deployedIds = new Set(plan.placements.map(({ passenger }) => passenger.id));
  for (const { passenger, position } of plan.placements) {
    passenger.x = position.x;
    passenger.y = position.y;
    passenger.order = null;
    passenger.target = null;
    passenger.selected = false;
    delete passenger.embarkedIn;
    game.units.push(passenger);
  }
  game.units.sort((left, right) => left.id - right.id);
  transport.passengers = transport.passengers.filter((passenger) => !deployedIds.has(passenger.id));

  return frozenResult(
    true,
    TRANSPORT_RESULTS.DISEMBARKED,
    `${deployedIds.size} squad${deployedIds.size === 1 ? '' : 's'} disembarked.`,
    {
      transportId: transport.id,
      passengerIds: Object.freeze([...deployedIds].sort((a, b) => a - b)),
      placements: plan.placements,
    },
  );
}

export function resolveDestroyedTransportPassengers(game) {
  requireGameCollections(game);
  const casualties = [];
  for (const transport of [...game.units].sort((left, right) => left.id - right.id)) {
    if (transport.hp > 0 || !Array.isArray(transport.passengers) || !transport.passengers.length) continue;
    for (const passenger of [...transport.passengers].sort((left, right) => left.id - right.id)) {
      passenger.hp = 0;
      passenger.selected = false;
      delete passenger.embarkedIn;
      game.selected.delete(passenger.id);
      if (passenger.team === TEAM.UA && game.player) {
        game.player.pop = Math.max(0, game.player.pop - (UNIT_TYPES[passenger.type]?.pop ?? 0));
      }
      casualties.push(Object.freeze({ passengerId: passenger.id, transportId: transport.id }));
    }
    transport.passengers = [];
  }
  return Object.freeze({
    policy: TRANSPORT_DESTRUCTION_POLICY.id,
    casualties: Object.freeze(casualties),
  });
}

export function createTransportController(game, { synchronizeNavigation } = {}) {
  if (!game || typeof game.addUnit !== 'function' || typeof game.issue !== 'function' || typeof game.removeDestroyedEntities !== 'function') {
    throw new TypeError('Transport controller requires Game addUnit, issue, and removeDestroyedEntities methods.');
  }

  const originalAddUnit = game.addUnit;
  const originalIssue = game.issue;
  const originalCleanup = game.removeDestroyedEntities;
  const previousDisembark = game.disembarkSelected;
  const previousSnapshot = game.transportSnapshot;
  const originalHeroAlreadyFieldedOrQueued = game.heroAlreadyFieldedOrQueued;

  game.units.forEach((unit) => initializeTransport(game, unit));

  game.addUnit = function addTransportAwareUnit(...args) {
    return initializeTransport(this, originalAddUnit.apply(this, args));
  };

  game.issue = function issueTransportAwareOrder(x, y, target) {
    this.lastCommandMessage = '';
    if (target && target.team !== undefined && target.team === this.selectedUnits?.()[0]?.team && transportCapacity(this, target) > 0) {
      const passengers = this.selectedUnits().filter((unit) => unit !== target);
      const result = embarkUnits(this, target, passengers);
      if (!result.ok) {
        this.lastError = result.message;
        return false;
      }
      this.select?.(target);
      this.lastError = '';
      this.lastCommandMessage = result.message;
      return true;
    }
    return originalIssue.call(this, x, y, target);
  };

  game.disembarkSelected = function disembarkSelected() {
    this.lastCommandMessage = '';
    this.lastError = '';
    const transport = this.selectedUnits?.().find((unit) => transportCapacity(this, unit) > 0);
    if (!transport) {
      this.lastError = 'Select a transport vehicle to disembark its cargo.';
      return false;
    }
    let grid = this.navigationState?.grid;
    if (!grid && typeof synchronizeNavigation === 'function') grid = synchronizeNavigation(this)?.grid;
    const result = disembarkUnits(this, transport, transport.passengers, { grid, target: transport });
    if (!result.ok) {
      this.lastError = result.message;
      return false;
    }
    this.lastCommandMessage = result.message;
    return true;
  };

  game.transportSnapshot = function snapshotTransport(transport) {
    return transportSnapshot(this, transport);
  };

  if (typeof originalHeroAlreadyFieldedOrQueued === 'function') {
    game.heroAlreadyFieldedOrQueued = function transportAwareHeroPresence(type) {
      if (originalHeroAlreadyFieldedOrQueued.call(this, type)) return true;
      return unitsIncludingPassengers(this).some((unit) => !this.units.includes(unit) && unit.type === type);
    };
  }

  game.removeDestroyedEntities = function removeTransportAwareDestroyedEntities(...args) {
    const result = resolveDestroyedTransportPassengers(this);
    if (result.casualties.length) {
      this.lastCommandMessage = `${result.casualties.length} embarked squad${result.casualties.length === 1 ? '' : 's'} lost with a destroyed transport.`;
    }
    return originalCleanup.apply(this, args);
  };

  return () => {
    game.addUnit = originalAddUnit;
    game.issue = originalIssue;
    game.removeDestroyedEntities = originalCleanup;
    if (previousDisembark === undefined) delete game.disembarkSelected;
    else game.disembarkSelected = previousDisembark;
    if (previousSnapshot === undefined) delete game.transportSnapshot;
    else game.transportSnapshot = previousSnapshot;
    if (originalHeroAlreadyFieldedOrQueued === undefined) delete game.heroAlreadyFieldedOrQueued;
    else game.heroAlreadyFieldedOrQueued = originalHeroAlreadyFieldedOrQueued;
  };
}
