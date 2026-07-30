const clamp = (value, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, value));

export const GARRISON_KINDS = Object.freeze({
  BUILDING: 'building',
  TRENCH: 'trench',
  FOXHOLE: 'foxhole',
});

export const GARRISON_RESULTS = Object.freeze({
  ENTERED: 'entered',
  EXITED: 'exited',
  CLEARED: 'cleared',
  DESTROYED: 'destroyed',
  INVALID_STATE: 'invalid-state',
  INVALID_UNIT: 'invalid-unit',
  WRONG_TEAM: 'wrong-team',
  HOSTILE_OCCUPANCY: 'hostile-occupancy',
  ALREADY_GARRISONED: 'already-garrisoned',
  NOT_GARRISONED: 'not-garrisoned',
  OUT_OF_RANGE: 'out-of-range',
  CAPACITY_EXCEEDED: 'capacity-exceeded',
  TRANSPORT_MISMATCH: 'transport-mismatch',
  EXIT_BLOCKED: 'exit-blocked',
  NO_ATTACKERS: 'no-attackers',
  NO_DEFENDERS: 'no-defenders',
});

export const DEFAULT_GARRISON_PROFILES = Object.freeze({
  [GARRISON_KINDS.BUILDING]: Object.freeze({
    capacity: 6,
    entryRange: 76,
    exitRange: 110,
    terrain: 'building',
    clearanceDefense: 0.18,
    destructionSurvival: 0.55,
  }),
  [GARRISON_KINDS.TRENCH]: Object.freeze({
    capacity: 4,
    entryRange: 58,
    exitRange: 86,
    terrain: 'trench',
    clearanceDefense: 0.12,
    destructionSurvival: 0.72,
  }),
  [GARRISON_KINDS.FOXHOLE]: Object.freeze({
    capacity: 2,
    entryRange: 48,
    exitRange: 72,
    terrain: 'trench',
    clearanceDefense: 0.08,
    destructionSurvival: 0.66,
  }),
});

function frozenResult(ok, status, message, details = {}) {
  return Object.freeze({ ok, status, message, ...details });
}

function assertPoint(point, label) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new TypeError(`${label} must contain finite x and y coordinates.`);
  }
}

function assertState(state) {
  if (!state || !Array.isArray(state.occupants) || !Number.isInteger(state.nextSequence)) {
    throw new TypeError('Garrison state must be created by createGarrisonState.');
  }
}

function stableId(entity, label = 'Entity') {
  if (entity?.id === undefined || entity?.id === null || entity.id === '') {
    throw new TypeError(`${label} requires a stable id.`);
  }
  return String(entity.id);
}

function distance(left, right) {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function profileFor(state, config = {}) {
  const base = DEFAULT_GARRISON_PROFILES[state.kind];
  return {
    ...base,
    ...(config.profile || {}),
    capacity: config.capacity ?? state.capacity ?? base.capacity,
    entryRange: config.entryRange ?? base.entryRange,
    exitRange: config.exitRange ?? base.exitRange,
  };
}

function isLivingInfantry(unit) {
  return Boolean(
    unit &&
    !unit.destroyed &&
    (unit.hp === undefined || unit.hp > 0) &&
    unit.garrisonable !== false &&
    !unit.air &&
    !unit.armor &&
    !unit.vehicle &&
    (unit.infantry === true || unit.domain === 'infantry' || unit.role === 'infantry'),
  );
}

function slotCost(unit) {
  const value = unit?.garrisonSlots ?? 1;
  if (!Number.isInteger(value) || value <= 0) throw new TypeError('Garrison slot cost must be a positive integer.');
  return value;
}

function occupiedSlots(state) {
  return state.occupants.reduce((total, occupant) => total + occupant.slotCost, 0);
}

function occupantRecord(unit, sequence, sourceTransportId = null) {
  return Object.freeze({
    id: stableId(unit, 'Garrison occupant'),
    team: unit.team ?? null,
    type: unit.type ?? null,
    slotCost: slotCost(unit),
    hp: Number.isFinite(unit.hp) ? unit.hp : null,
    maxHp: Number.isFinite(unit.maxHp) ? unit.maxHp : null,
    defense: Math.max(0, Number(unit.garrisonDefense ?? unit.defense ?? 1)),
    sourceTransportId: sourceTransportId === null ? null : String(sourceTransportId),
    enteredSequence: sequence,
  });
}

function copyState(state, overrides = {}) {
  const occupants = overrides.occupants ?? state.occupants;
  return Object.freeze({
    ...state,
    ...overrides,
    occupants: Object.freeze([...occupants]),
  });
}

export function createGarrisonState(host, config = {}) {
  assertPoint(host, 'Garrison host');
  const kind = config.kind ?? host.garrisonKind ?? GARRISON_KINDS.BUILDING;
  const profile = DEFAULT_GARRISON_PROFILES[kind];
  if (!profile) throw new TypeError(`Unknown garrison kind: ${kind}`);
  const capacity = config.capacity ?? host.garrisonCapacity ?? profile.capacity;
  if (!Number.isInteger(capacity) || capacity < 0) {
    throw new TypeError('Garrison capacity must be a non-negative integer.');
  }
  return Object.freeze({
    hostId: stableId(host, 'Garrison host'),
    kind,
    team: config.team ?? host.team ?? null,
    x: host.x,
    y: host.y,
    capacity,
    occupants: Object.freeze([]),
    nextSequence: 1,
    destroyed: Boolean(host.destroyed || (Number.isFinite(host.hp) && host.hp <= 0)),
  });
}

export function garrisonSnapshot(state, config = {}) {
  assertState(state);
  const profile = profileFor(state, config);
  const used = occupiedSlots(state);
  return Object.freeze({
    hostId: state.hostId,
    kind: state.kind,
    team: state.team,
    capacity: profile.capacity,
    used,
    available: Math.max(0, profile.capacity - used),
    occupantIds: Object.freeze(state.occupants.map((occupant) => occupant.id)),
    terrain: profile.terrain,
    destroyed: state.destroyed,
    contested: new Set(state.occupants.map((occupant) => occupant.team)).size > 1,
  });
}

export function canEnterGarrison(state, unit, context = {}, config = {}) {
  assertState(state);
  if (state.destroyed) return frozenResult(false, GARRISON_RESULTS.INVALID_STATE, 'The position is destroyed.');
  if (!isLivingInfantry(unit)) {
    return frozenResult(false, GARRISON_RESULTS.INVALID_UNIT, 'Only living garrison-capable infantry may enter.');
  }
  const id = stableId(unit, 'Garrison unit');
  if (state.occupants.some((occupant) => occupant.id === id)) {
    return frozenResult(false, GARRISON_RESULTS.ALREADY_GARRISONED, 'The unit is already inside this position.');
  }
  if (state.occupants.length && state.occupants.some((occupant) => occupant.team !== unit.team)) {
    return frozenResult(false, GARRISON_RESULTS.HOSTILE_OCCUPANCY, 'Hostile occupants must be cleared before entry.');
  }
  if (state.team !== null && unit.team !== state.team && !context.allowCaptureEmpty) {
    return frozenResult(false, GARRISON_RESULTS.WRONG_TEAM, 'The position is not controlled by this unit.');
  }
  const profile = profileFor(state, config);
  if (!context.ignoreRange) {
    assertPoint(unit, 'Garrison unit');
    if (distance(state, unit) > profile.entryRange) {
      return frozenResult(false, GARRISON_RESULTS.OUT_OF_RANGE, 'Move the infantry closer to the entry point.');
    }
  }
  const dismountFrom = context.dismountFromTransportId;
  if (unit.embarkedIn !== undefined && unit.embarkedIn !== null) {
    if (dismountFrom === undefined || String(unit.embarkedIn) !== String(dismountFrom)) {
      return frozenResult(false, GARRISON_RESULTS.TRANSPORT_MISMATCH, 'The unit must dismount from its current transport first.');
    }
    const passengers = context.transportPassengers;
    if (Array.isArray(passengers) && !passengers.some((passenger) => stableId(passenger) === id)) {
      return frozenResult(false, GARRISON_RESULTS.TRANSPORT_MISMATCH, 'The transport does not contain this passenger.');
    }
  }
  const requested = slotCost(unit);
  const available = Math.max(0, profile.capacity - occupiedSlots(state));
  if (requested > available) {
    return frozenResult(false, GARRISON_RESULTS.CAPACITY_EXCEEDED, 'The position has insufficient occupancy capacity.', {
      requested,
      available,
    });
  }
  return frozenResult(true, GARRISON_RESULTS.ENTERED, 'The unit may enter.', { requested, available });
}

export function enterGarrison(state, units, context = {}, config = {}) {
  assertState(state);
  const uniqueUnits = [...new Map((units ?? []).map((unit) => [stableId(unit, 'Garrison unit'), unit])).values()]
    .sort((left, right) => stableId(left).localeCompare(stableId(right)));
  if (!uniqueUnits.length) {
    return frozenResult(false, GARRISON_RESULTS.INVALID_UNIT, 'Select at least one infantry unit to enter.');
  }

  let working = state;
  const transitions = [];
  for (const unit of uniqueUnits) {
    const verdict = canEnterGarrison(working, unit, context, config);
    if (!verdict.ok) return frozenResult(false, verdict.status, verdict.message, { verdict, state });
    const record = occupantRecord(unit, working.nextSequence, context.dismountFromTransportId ?? null);
    working = copyState(working, {
      team: working.team ?? unit.team ?? null,
      occupants: [...working.occupants, record].sort((a, b) => a.enteredSequence - b.enteredSequence || a.id.localeCompare(b.id)),
      nextSequence: working.nextSequence + 1,
    });
    transitions.push(Object.freeze({
      unitId: record.id,
      garrisonedIn: working.hostId,
      removeFromWorld: true,
      clearEmbarkedIn: unit.embarkedIn !== undefined && unit.embarkedIn !== null,
    }));
  }

  const transportId = context.dismountFromTransportId;
  return frozenResult(true, GARRISON_RESULTS.ENTERED, `${uniqueUnits.length} unit${uniqueUnits.length === 1 ? '' : 's'} entered.`, {
    state: working,
    unitTransitions: Object.freeze(transitions),
    transportTransition: transportId === undefined
      ? null
      : Object.freeze({
        transportId: String(transportId),
        removePassengerIds: Object.freeze(transitions.map((transition) => transition.unitId)),
      }),
  });
}

function candidateKey(candidate) {
  const x = Number.isFinite(candidate?.x) ? candidate.x.toFixed(4) : 'invalid-x';
  const y = Number.isFinite(candidate?.y) ? candidate.y.toFixed(4) : 'invalid-y';
  return `${candidate?.id ?? ''}|${x}|${y}`;
}

function eligibleExitCandidates(state, candidates, options = {}, config = {}) {
  const profile = profileFor(state, config);
  const preferred = options.preferredPoint;
  if (preferred) assertPoint(preferred, 'Preferred exit point');
  return [...new Map((candidates ?? []).map((candidate) => [candidateKey(candidate), candidate])).values()]
    .filter((candidate) => {
      try {
        assertPoint(candidate, 'Exit candidate');
      } catch {
        return false;
      }
      return candidate.passable !== false && !candidate.blocked && candidate.safe !== false && distance(state, candidate) <= profile.exitRange;
    })
    .sort((left, right) => {
      const priorityDelta = (right.priority ?? 0) - (left.priority ?? 0);
      if (priorityDelta) return priorityDelta;
      const preferredDelta = preferred ? distance(preferred, left) - distance(preferred, right) : 0;
      if (preferredDelta) return preferredDelta;
      const hostDelta = distance(state, left) - distance(state, right);
      return hostDelta || candidateKey(left).localeCompare(candidateKey(right));
    });
}

export function planGarrisonExit(state, occupantIds, candidates, options = {}, config = {}) {
  assertState(state);
  const requestedIds = [...new Set((occupantIds ?? state.occupants.map((occupant) => occupant.id)).map(String))].sort();
  const occupants = requestedIds.map((id) => state.occupants.find((occupant) => occupant.id === id));
  if (!occupants.length || occupants.some((occupant) => !occupant)) {
    return frozenResult(false, GARRISON_RESULTS.NOT_GARRISONED, 'Every requested unit must occupy this position.');
  }
  const available = eligibleExitCandidates(state, candidates, options, config);
  if (available.length < occupants.length) {
    return frozenResult(false, GARRISON_RESULTS.EXIT_BLOCKED, 'No safe exit placement is available for every occupant.', {
      requested: occupants.length,
      available: available.length,
    });
  }
  const placements = occupants.map((occupant, index) => Object.freeze({
    unitId: occupant.id,
    position: Object.freeze({ x: available[index].x, y: available[index].y }),
    exitId: available[index].id ?? null,
  }));
  return frozenResult(true, GARRISON_RESULTS.EXITED, 'Exit placements resolved.', {
    placements: Object.freeze(placements),
  });
}

export function exitGarrison(state, occupantIds, candidates, options = {}, config = {}) {
  const plan = planGarrisonExit(state, occupantIds, candidates, options, config);
  if (!plan.ok) return frozenResult(false, plan.status, plan.message, { ...plan, state });
  const exiting = new Set(plan.placements.map((placement) => placement.unitId));
  const next = copyState(state, { occupants: state.occupants.filter((occupant) => !exiting.has(occupant.id)) });
  return frozenResult(true, GARRISON_RESULTS.EXITED, `${exiting.size} occupant${exiting.size === 1 ? '' : 's'} exited.`, {
    state: next,
    placements: plan.placements,
    unitTransitions: Object.freeze(plan.placements.map((placement) => Object.freeze({
      unitId: placement.unitId,
      position: placement.position,
      removeGarrisonedIn: true,
      restoreToWorld: true,
    }))),
  });
}

export function resolveGarrisonClearance(state, attackers, random, config = {}) {
  assertState(state);
  if (typeof random !== 'function') throw new TypeError('Garrison clearing requires an injected random source.');
  if (!state.occupants.length) return frozenResult(false, GARRISON_RESULTS.NO_DEFENDERS, 'The position has no occupants.', { state });
  const eligibleAttackers = (attackers ?? [])
    .filter(isLivingInfantry)
    .filter((attacker) => attacker.team !== state.occupants[0].team)
    .sort((left, right) => stableId(left).localeCompare(stableId(right)));
  if (!eligibleAttackers.length) return frozenResult(false, GARRISON_RESULTS.NO_ATTACKERS, 'No hostile infantry can clear the position.', { state });

  const profile = profileFor(state, config);
  const defenders = [...state.occupants].sort((left, right) => left.id.localeCompare(right.id));
  const eliminatedDefenders = [];
  const attackerCasualties = [];
  const exchanges = [];
  const attempts = Math.min(eligibleAttackers.length, defenders.length);

  for (let index = 0; index < attempts; index += 1) {
    const attacker = eligibleAttackers[index];
    const defender = defenders[index];
    const attackPower = Math.max(0, Number(attacker.clearingPower ?? 1));
    const breachBonus = clamp(attacker.breachBonus ?? config.breachBonus ?? 0, 0, 0.4);
    const probability = clamp(
      (config.baseClearChance ?? 0.42) + attackPower * 0.08 + breachBonus - profile.clearanceDefense - defender.defense * 0.035,
      0.05,
      0.95,
    );
    const attackRoll = random();
    const defenderEliminated = attackRoll < probability;
    if (defenderEliminated) eliminatedDefenders.push(defender.id);

    let retaliationRoll = null;
    let attackerLost = false;
    if (!defenderEliminated) {
      const retaliationChance = clamp((config.retaliationChance ?? 0.24) + defender.defense * 0.025 - attackPower * 0.02, 0.02, 0.75);
      retaliationRoll = random();
      attackerLost = retaliationRoll < retaliationChance;
      if (attackerLost) attackerCasualties.push(stableId(attacker));
    }
    exchanges.push(Object.freeze({
      attackerId: stableId(attacker),
      defenderId: defender.id,
      probability,
      attackRoll,
      defenderEliminated,
      retaliationRoll,
      attackerLost,
    }));
  }

  const eliminated = new Set(eliminatedDefenders);
  const remaining = state.occupants.filter((occupant) => !eliminated.has(occupant.id));
  const cleared = remaining.length === 0;
  const next = copyState(state, {
    occupants: remaining,
    team: cleared && (config.captureOnClear ?? true) ? eligibleAttackers[0].team ?? state.team : state.team,
  });
  return frozenResult(true, GARRISON_RESULTS.CLEARED, cleared ? 'The position was cleared.' : 'The clearing action reduced the defenders.', {
    state: next,
    cleared,
    eliminatedDefenderIds: Object.freeze(eliminatedDefenders),
    attackerCasualtyIds: Object.freeze(attackerCasualties),
    exchanges: Object.freeze(exchanges),
  });
}

export function resolveGarrisonDestruction(state, candidates, random, options = {}, config = {}) {
  assertState(state);
  if (typeof random !== 'function') throw new TypeError('Garrison destruction requires an injected random source.');
  const profile = profileFor(state, config);
  const survivors = [];
  const casualties = [];
  const rolls = [];
  const survivalChance = clamp(profile.destructionSurvival + (options.evacuationBonus ?? 0), 0, 1);

  for (const occupant of [...state.occupants].sort((left, right) => left.id.localeCompare(right.id))) {
    const roll = random();
    const survived = roll < survivalChance;
    rolls.push(Object.freeze({ unitId: occupant.id, roll, survivalChance, survived }));
    if (survived) survivors.push(occupant);
    else casualties.push(occupant.id);
  }

  const available = eligibleExitCandidates(state, candidates, options, config);
  const placements = [];
  survivors.forEach((occupant, index) => {
    const candidate = available[index];
    if (!candidate) {
      casualties.push(occupant.id);
      return;
    }
    placements.push(Object.freeze({
      unitId: occupant.id,
      position: Object.freeze({ x: candidate.x, y: candidate.y }),
      exitId: candidate.id ?? null,
    }));
  });

  const casualtySet = new Set(casualties);
  const next = copyState(state, { occupants: [], destroyed: true });
  return frozenResult(true, GARRISON_RESULTS.DESTROYED, 'The destroyed position resolved occupant evacuation.', {
    state: next,
    casualtyIds: Object.freeze([...casualtySet].sort()),
    survivorIds: Object.freeze(placements.map((placement) => placement.unitId)),
    placements: Object.freeze(placements),
    rolls: Object.freeze(rolls),
    unitTransitions: Object.freeze(placements.map((placement) => Object.freeze({
      unitId: placement.unitId,
      position: placement.position,
      removeGarrisonedIn: true,
      restoreToWorld: true,
    }))),
  });
}
