import { BUILDING_TYPES, TEAM, UNIT_TYPES } from '../config.js';

export const COMMAND_CAPACITY_SCHEMA_VERSION = 1;
export const COMMAND_CAPACITY_WARNING_RATIO = 0.85;
export const COMMAND_CAPACITY_EVENT_LIMIT = 32;

export const COMMAND_CAPACITY_STATES = Object.freeze({
  NORMAL: 'normal',
  NEAR: 'near',
  FULL: 'full',
  OVER: 'over',
});

export const COMMAND_CAPACITY_AI_ACTIONS = Object.freeze({
  MAINTAIN: 'maintain',
  PREPARE: 'prepare-capacity',
  EXPAND: 'expand-capacity',
  RESTORE: 'restore-capacity',
});

function assertGameCollections(game) {
  if (!game || !Array.isArray(game.units) || !Array.isArray(game.buildings)) {
    throw new TypeError('Command capacity requires game units and buildings collections.');
  }
}

function boundedNonNegative(value, label) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new RangeError(`${label} must be a non-negative finite number.`);
  }
  return numeric;
}

function stableId(value, fallback) {
  if (Number.isFinite(value)) return `n:${String(Math.trunc(value)).padStart(16, '0')}`;
  if (typeof value === 'string' && value) return `s:${value}`;
  return fallback;
}

function unitCapacityCost(unit) {
  if (Number.isFinite(unit?.commandCapacityCost)) return Math.max(0, unit.commandCapacityCost);
  return Math.max(0, UNIT_TYPES[unit?.type]?.pop || 0);
}

function sourceCapacity(building) {
  if (Number.isFinite(building?.commandCapacity)) return Math.max(0, building.commandCapacity);
  return Math.max(0, BUILDING_TYPES[building?.type]?.pop || 0);
}

function reservationCost(item) {
  if (Number.isFinite(item?.pop)) return Math.max(0, item.pop);
  return Math.max(0, UNIT_TYPES[item?.type]?.pop || 0);
}

function playerUnitsIncludingPassengers(game) {
  const byKey = new Map();
  const visit = (unit, fallback) => {
    if (!unit || unit.team !== TEAM.UA || unit.hp <= 0) return;
    const key = stableId(unit.id, fallback);
    if (!byKey.has(key)) byKey.set(key, unit);
    for (const [index, passenger] of (unit.passengers || []).entries()) {
      visit(passenger, `${key}:passenger:${index}`);
    }
  };
  for (const [index, unit] of game.units.entries()) visit(unit, `unit:${index}`);
  return [...byKey.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, unit]) => unit);
}

export function commandCapacitySources(game) {
  assertGameCollections(game);
  return Object.freeze(
    game.buildings
      .filter((building) =>
        building?.team === TEAM.UA &&
        building.hp > 0 &&
        !building.underConstruction &&
        building.capacityGranted !== false &&
        sourceCapacity(building) > 0,
      )
      .map((building, index) => Object.freeze({
        buildingId: building.id ?? null,
        type: building.type,
        capacity: sourceCapacity(building),
        sortKey: stableId(building.id, `building:${index}`),
      }))
      .sort((left, right) => left.sortKey.localeCompare(right.sortKey))
      .map(({ sortKey: _sortKey, ...source }) => Object.freeze(source)),
  );
}

export function commandCapacityFielded(game) {
  assertGameCollections(game);
  return Object.freeze(
    playerUnitsIncludingPassengers(game).map((unit) => Object.freeze({
      unitId: unit.id ?? null,
      type: unit.type,
      cost: unitCapacityCost(unit),
      embarkedIn: unit.embarkedIn ?? null,
    })),
  );
}

export function commandCapacityReservations(game) {
  assertGameCollections(game);
  const entries = [];
  for (const [buildingIndex, building] of game.buildings.entries()) {
    if (building?.team !== TEAM.UA || building.hp <= 0) continue;
    for (const [queueIndex, item] of (building.queue || []).entries()) {
      if (!item || item.reserved === false) continue;
      const cost = reservationCost(item);
      if (cost <= 0) continue;
      entries.push({
        buildingId: building.id ?? null,
        itemId: item.id ?? null,
        type: item.type,
        cost,
        sortKey: `${stableId(building.id, `building:${buildingIndex}`)}:${stableId(item.id, `queue:${queueIndex}`)}`,
      });
    }
  }
  return Object.freeze(
    entries
      .sort((left, right) => left.sortKey.localeCompare(right.sortKey))
      .map(({ sortKey: _sortKey, ...entry }) => Object.freeze(entry)),
  );
}

export function inferCommandCapacityBase(game) {
  assertGameCollections(game);
  const explicit = game.commandCapacityBase ?? game.player?.commandCapacityBase;
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;
  const sourceTotal = commandCapacitySources(game).reduce((sum, source) => sum + source.capacity, 0);
  const projected = Number(game.player?.cap);
  if (!Number.isFinite(projected)) return 0;
  return Math.max(0, projected - sourceTotal);
}

function stateFor(used, capacity) {
  if (used > capacity) return COMMAND_CAPACITY_STATES.OVER;
  if (capacity > 0 && used === capacity) return COMMAND_CAPACITY_STATES.FULL;
  if (capacity > 0 && used / capacity >= COMMAND_CAPACITY_WARNING_RATIO) {
    return COMMAND_CAPACITY_STATES.NEAR;
  }
  return COMMAND_CAPACITY_STATES.NORMAL;
}

function warningFor(state, { used, capacity, available, overBy, fielded, reserved }) {
  if (state === COMMAND_CAPACITY_STATES.OVER) {
    return Object.freeze({
      id: 'command-capacity-over',
      severity: 'critical',
      message: `Command capacity exceeded by ${overBy}. Existing forces remain active; new deployments are blocked.`,
      used,
      capacity,
      fielded,
      reserved,
    });
  }
  if (state === COMMAND_CAPACITY_STATES.FULL) {
    return Object.freeze({
      id: 'command-capacity-full',
      severity: 'warning',
      message: 'Command capacity is full. Add an operational capacity source before reserving more units.',
      used,
      capacity,
      fielded,
      reserved,
    });
  }
  if (state === COMMAND_CAPACITY_STATES.NEAR) {
    return Object.freeze({
      id: 'command-capacity-near',
      severity: 'caution',
      message: `Command capacity is nearly full: ${available} remaining.`,
      used,
      capacity,
      fielded,
      reserved,
    });
  }
  return null;
}

function aiDirectiveFor(state, { capacity, used, available, overBy }) {
  if (state === COMMAND_CAPACITY_STATES.OVER) {
    return Object.freeze({
      action: COMMAND_CAPACITY_AI_ACTIONS.RESTORE,
      priority: 'critical',
      requestedAdditionalCapacity: Math.max(1, overBy),
      haltNewReservations: true,
      preserveExistingQueues: true,
      protectCapacitySources: true,
    });
  }
  if (state === COMMAND_CAPACITY_STATES.FULL) {
    return Object.freeze({
      action: COMMAND_CAPACITY_AI_ACTIONS.EXPAND,
      priority: 'high',
      requestedAdditionalCapacity: 1,
      haltNewReservations: true,
      preserveExistingQueues: true,
      protectCapacitySources: true,
    });
  }
  if (state === COMMAND_CAPACITY_STATES.NEAR) {
    return Object.freeze({
      action: COMMAND_CAPACITY_AI_ACTIONS.PREPARE,
      priority: 'medium',
      requestedAdditionalCapacity: Math.max(1, Math.ceil(Math.max(capacity, used) * 0.15 - available)),
      haltNewReservations: false,
      preserveExistingQueues: true,
      protectCapacitySources: false,
    });
  }
  return Object.freeze({
    action: COMMAND_CAPACITY_AI_ACTIONS.MAINTAIN,
    priority: 'normal',
    requestedAdditionalCapacity: 0,
    haltNewReservations: false,
    preserveExistingQueues: true,
    protectCapacitySources: false,
  });
}

export function createCommandCapacitySnapshot(game, { baseCapacity = inferCommandCapacityBase(game) } = {}) {
  assertGameCollections(game);
  const base = boundedNonNegative(baseCapacity, 'Base command capacity');
  const sources = commandCapacitySources(game);
  const fieldedUnits = commandCapacityFielded(game);
  const reservations = commandCapacityReservations(game);
  const sourceTotal = sources.reduce((sum, source) => sum + source.capacity, 0);
  const fielded = fieldedUnits.reduce((sum, unit) => sum + unit.cost, 0);
  const reserved = reservations.reduce((sum, item) => sum + item.cost, 0);
  const capacity = base + sourceTotal;
  const used = fielded + reserved;
  const rawAvailable = capacity - used;
  const available = Math.max(0, rawAvailable);
  const overBy = Math.max(0, -rawAvailable);
  const state = stateFor(used, capacity);
  const utilization = capacity > 0 ? used / capacity : used > 0 ? 1 : 0;
  const details = { used, capacity, available, overBy, fielded, reserved };

  return Object.freeze({
    version: COMMAND_CAPACITY_SCHEMA_VERSION,
    baseCapacity: base,
    sourceCapacity: sourceTotal,
    capacity,
    fielded,
    reserved,
    used,
    available,
    overBy,
    utilization,
    state,
    blocksNewReservations: state === COMMAND_CAPACITY_STATES.FULL || state === COMMAND_CAPACITY_STATES.OVER,
    preservesExistingForces: true,
    preservesExistingReservations: true,
    sources,
    fieldedUnits,
    reservations,
    warning: warningFor(state, details),
    ai: aiDirectiveFor(state, details),
  });
}

export function canReserveCommandCapacity(game, amount, options = {}) {
  const requested = boundedNonNegative(amount, 'Requested command capacity');
  const snapshot = createCommandCapacitySnapshot(game, options);
  const ok = snapshot.used + requested <= snapshot.capacity;
  return Object.freeze({
    ok,
    requested,
    used: snapshot.used,
    capacity: snapshot.capacity,
    available: snapshot.available,
    overBy: snapshot.overBy,
    reason: ok
      ? ''
      : snapshot.overBy > 0
        ? `Command capacity exceeded by ${snapshot.overBy}; restore capacity before adding units.`
        : `Command capacity exceeded: ${requested} requested, ${snapshot.available} available.`,
  });
}

export function reconcileCommandCapacity(game, options = {}) {
  if (!game?.player) throw new TypeError('Command capacity reconciliation requires player state.');
  const snapshot = createCommandCapacitySnapshot(game, options);
  game.player.commandCapacityBase = snapshot.baseCapacity;
  game.player.fieldedPop = snapshot.fielded;
  game.player.reservedPop = snapshot.reserved;
  game.player.pop = snapshot.used;
  game.player.cap = snapshot.capacity;
  game.commandCapacityState = snapshot;
  return snapshot;
}

function capacitySignature(snapshot) {
  return [snapshot.state, snapshot.capacity, snapshot.fielded, snapshot.reserved].join(':');
}

function transitionRecord(game, previous, snapshot, reason) {
  const nextSequence = Number.isInteger(game.commandCapacityNextEventId)
    ? game.commandCapacityNextEventId
    : 1;
  game.commandCapacityNextEventId = nextSequence + 1;
  return Object.freeze({
    sequence: nextSequence,
    time: Number.isFinite(game.time) ? game.time : 0,
    reason,
    previousState: previous?.state ?? null,
    state: snapshot.state,
    fielded: snapshot.fielded,
    reserved: snapshot.reserved,
    used: snapshot.used,
    capacity: snapshot.capacity,
    overBy: snapshot.overBy,
    warningId: snapshot.warning?.id ?? null,
  });
}

export function createCommandCapacityController(game, { baseCapacity = null } = {}) {
  if (!game || typeof game.start !== 'function' || typeof game.update !== 'function') {
    throw new TypeError('Command capacity controller requires game.start() and game.update().');
  }
  if (baseCapacity != null) boundedNonNegative(baseCapacity, 'Configured base command capacity');

  const originalStart = game.start.bind(game);
  const originalUpdate = game.update.bind(game);
  const previousSnapshot = game.commandCapacitySnapshot;
  const previousCanReserve = game.canReserveCommandCapacity;
  const previousReconcile = game.reconcileCommandCapacity;
  const previousAiDirective = game.commandCapacityAiDirective;
  let activeBase = baseCapacity;
  let lastSnapshot = null;
  let lastSignature = '';

  const reconcile = (reason = 'manual') => {
    if (!game.player) return null;
    if (activeBase == null) activeBase = inferCommandCapacityBase(game);
    game.commandCapacityBase = activeBase;
    const snapshot = reconcileCommandCapacity(game, { baseCapacity: activeBase });
    const signature = capacitySignature(snapshot);
    if (signature !== lastSignature) {
      if (!Array.isArray(game.commandCapacityEvents)) game.commandCapacityEvents = [];
      game.commandCapacityEvents.push(transitionRecord(game, lastSnapshot, snapshot, reason));
      if (game.commandCapacityEvents.length > COMMAND_CAPACITY_EVENT_LIMIT) {
        game.commandCapacityEvents.splice(0, game.commandCapacityEvents.length - COMMAND_CAPACITY_EVENT_LIMIT);
      }
      lastSignature = signature;
    }
    lastSnapshot = snapshot;
    return snapshot;
  };

  game.commandCapacitySnapshot = () =>
    game.player
      ? createCommandCapacitySnapshot(game, { baseCapacity: activeBase ?? inferCommandCapacityBase(game) })
      : null;
  game.canReserveCommandCapacity = (amount) =>
    canReserveCommandCapacity(game, amount, { baseCapacity: activeBase ?? inferCommandCapacityBase(game) });
  game.reconcileCommandCapacity = reconcile;
  game.commandCapacityAiDirective = () => game.commandCapacitySnapshot()?.ai ?? null;

  game.start = (...args) => {
    const result = originalStart(...args);
    activeBase = baseCapacity ?? inferCommandCapacityBase(game);
    game.commandCapacityBase = activeBase;
    game.commandCapacityEvents = [];
    game.commandCapacityNextEventId = 1;
    lastSnapshot = null;
    lastSignature = '';
    reconcile('mission-start');
    return result;
  };

  game.update = (stepSeconds) => {
    const result = originalUpdate(stepSeconds);
    reconcile('simulation-step');
    return result;
  };

  if (game.player) reconcile('controller-install');

  return () => {
    game.start = originalStart;
    game.update = originalUpdate;
    if (previousSnapshot === undefined) delete game.commandCapacitySnapshot;
    else game.commandCapacitySnapshot = previousSnapshot;
    if (previousCanReserve === undefined) delete game.canReserveCommandCapacity;
    else game.canReserveCommandCapacity = previousCanReserve;
    if (previousReconcile === undefined) delete game.reconcileCommandCapacity;
    else game.reconcileCommandCapacity = previousReconcile;
    if (previousAiDirective === undefined) delete game.commandCapacityAiDirective;
    else game.commandCapacityAiDirective = previousAiDirective;
    delete game.commandCapacityState;
  };
}
