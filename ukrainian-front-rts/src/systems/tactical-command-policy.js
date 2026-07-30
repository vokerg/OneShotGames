import { BUILDING_TYPES, TEAM, UNIT_TYPES, WORLD } from '../config.js';
import { createFormationAssignments } from '../core/formation.js';
import { clamp, distance } from '../core/math.js';
import { TACTICAL_COMMAND_KINDS } from '../core/tactical-command-contract.js';

export const TACTICAL_COMMAND_RESULTS = Object.freeze({
  ARMED: 'armed',
  ISSUED: 'issued',
  CANCELLED: 'cancelled',
  INVALID_SELECTION: 'invalid-selection',
  INVALID_POINT: 'invalid-point',
  INVALID_TARGET: 'invalid-target',
  NO_REPAIR_FACILITY: 'no-repair-facility',
  NO_DAMAGED_VEHICLES: 'no-damaged-vehicles',
});

export const TACTICAL_COMMAND_POLICY = Object.freeze({
  patrolArrivalRadius: 14,
  followDistance: 62,
  followRepathDistance: 24,
  guardDistance: 82,
  guardThreatRadius: 230,
  returnInteractionDistance: 86,
  facilityClearance: 28,
  slotCount: 16,
});

const TARGETED_COMMANDS = new Set([
  TACTICAL_COMMAND_KINDS.PATROL,
  TACTICAL_COMMAND_KINDS.GUARD,
  TACTICAL_COMMAND_KINDS.FOLLOW,
]);

function result(ok, status, message, details = {}) {
  return Object.freeze({ ok, status, message, ...details });
}

export function tacticalUnitStats(game, unit) {
  if (!unit) return null;
  if (unit.team === TEAM.UA && typeof game?.unitStats === 'function') return game.unitStats(unit.type);
  return UNIT_TYPES[unit.type] ?? null;
}

export function entityIdentity(entity, fallback = Number.MAX_SAFE_INTEGER) {
  return Number.isInteger(entity?.id) ? entity.id : fallback;
}

function compareDistanceThenId(origin, left, right) {
  const delta = distance(origin, left) - distance(origin, right);
  if (Math.abs(delta) > 1e-9) return delta;
  return entityIdentity(left) - entityIdentity(right);
}

export function selectedPlayerUnits(game) {
  return typeof game?.selectedUnits === 'function'
    ? [...game.selectedUnits()].sort((left, right) => entityIdentity(left) - entityIdentity(right))
    : [];
}

function activeEntity(game, entity) {
  return Boolean(
    entity &&
      entity.hp > 0 &&
      ((game.units || []).includes(entity) || (game.buildings || []).includes(entity)),
  );
}

export function activeEntityById(game, id, { unitsOnly = false } = {}) {
  const units = game.units || [];
  const unit = units.find((candidate) => candidate.id === id && candidate.hp > 0);
  if (unit || unitsOnly) return unit || null;
  return (game.buildings || []).find((candidate) => candidate.id === id && candidate.hp > 0) || null;
}

function clearProjectedOrder(unit, commandId = unit?.tacticalCommand?.id) {
  if (!unit) return;
  if (unit.order?.tacticalCommandId === commandId) unit.order = null;
  if (unit.target?.hp <= 0) unit.target = null;
}

export function clearTacticalCommand(unit, { clearOrders = true } = {}) {
  if (!unit) return false;
  const changed = Boolean(unit.tacticalCommand);
  const commandId = unit.tacticalCommand?.id;
  delete unit.tacticalCommand;
  delete unit.awaitingRepairAt;
  if (clearOrders) {
    clearProjectedOrder(unit, commandId);
    if (Array.isArray(unit.orderQueue)) unit.orderQueue.length = 0;
  }
  return changed;
}

function clearWorkerAssignment(unit) {
  if ('gatherKind' in unit) unit.gatherKind = null;
  if (['gather', 'return'].includes(unit.order?.kind)) unit.order = null;
  if (Array.isArray(unit.orderQueue)) unit.orderQueue.length = 0;
}

function nextCommandId(game) {
  const current = Number.isInteger(game.tacticalCommandSequence) && game.tacticalCommandSequence > 0
    ? game.tacticalCommandSequence
    : 1;
  game.tacticalCommandSequence = current + 1;
  return current;
}

function assignCommand(game, units, createCommand) {
  for (const unit of units) {
    clearTacticalCommand(unit);
    clearWorkerAssignment(unit);
    unit.order = null;
    unit.target = null;
    unit.tacticalCommand = createCommand(unit, nextCommandId(game));
  }
}

function validWorldPoint(point, world = WORLD) {
  return Boolean(
    point && Number.isFinite(point.x) && Number.isFinite(point.y) &&
      point.x >= 0 && point.y >= 0 && point.x <= world.w && point.y <= world.h,
  );
}

function friendlyTarget(game, units, target, { unitsOnly = false } = {}) {
  const team = units?.[0]?.team;
  if (team == null || units.some((unit) => unit.team !== team)) return false;
  if (!activeEntity(game, target) || target.team !== team) return false;
  if (unitsOnly && !(game.units || []).includes(target)) return false;
  return !units.some((unit) => unit.id === target.id);
}

export function isTargetedTacticalCommand(kind) {
  return TARGETED_COMMANDS.has(kind);
}

export function issuePatrolCommand(game, units, point) {
  if (!units?.length) {
    return result(false, TACTICAL_COMMAND_RESULTS.INVALID_SELECTION, 'Select at least one Ukrainian unit first.');
  }
  if (!validWorldPoint(point)) {
    return result(false, TACTICAL_COMMAND_RESULTS.INVALID_POINT, 'Patrol destination is outside the battlefield.');
  }
  if (units.every((unit) => distance(unit, point) <= TACTICAL_COMMAND_POLICY.patrolArrivalRadius)) {
    return result(false, TACTICAL_COMMAND_RESULTS.INVALID_POINT, 'Choose a patrol destination away from the selected group.');
  }
  const assignments = new Map(
    createFormationAssignments(units, point).map((assignment) => [assignment.unitId, assignment]),
  );
  assignCommand(game, units, (unit, id) => {
    const assignment = assignments.get(unit.id);
    return {
      id,
      kind: TACTICAL_COMMAND_KINDS.PATROL,
      originX: unit.x,
      originY: unit.y,
      destinationX: assignment.destination.x,
      destinationY: assignment.destination.y,
      formation: assignment.formation,
      leg: 'destination',
    };
  });
  return result(true, TACTICAL_COMMAND_RESULTS.ISSUED, `${units.length} unit${units.length === 1 ? '' : 's'} patrolling.`, {
    count: units.length,
  });
}

export function issueGuardCommand(game, units, target) {
  const guards = units || [];
  if (!guards.some((unit) => Number(tacticalUnitStats(game, unit)?.damage) > 0)) {
    return result(false, TACTICAL_COMMAND_RESULTS.INVALID_SELECTION, 'Select at least one armed Ukrainian unit to guard with.');
  }
  if (!friendlyTarget(game, guards, target)) {
    return result(false, TACTICAL_COMMAND_RESULTS.INVALID_TARGET, 'Guard requires another living friendly unit or structure.');
  }
  assignCommand(game, guards, (_unit, id) => ({ id, kind: TACTICAL_COMMAND_KINDS.GUARD, targetId: target.id }));
  return result(true, TACTICAL_COMMAND_RESULTS.ISSUED, `${guards.length} unit${guards.length === 1 ? '' : 's'} guarding target.`, {
    count: guards.length,
    targetId: target.id,
  });
}

export function issueFollowCommand(game, units, target) {
  if (!units?.length) {
    return result(false, TACTICAL_COMMAND_RESULTS.INVALID_SELECTION, 'Select at least one Ukrainian unit first.');
  }
  if (!friendlyTarget(game, units, target, { unitsOnly: true })) {
    return result(false, TACTICAL_COMMAND_RESULTS.INVALID_TARGET, 'Follow requires another living friendly unit.');
  }
  assignCommand(game, units, (_unit, id) => ({ id, kind: TACTICAL_COMMAND_KINDS.FOLLOW, targetId: target.id }));
  return result(true, TACTICAL_COMMAND_RESULTS.ISSUED, `${units.length} unit${units.length === 1 ? '' : 's'} following target.`, {
    count: units.length,
    targetId: target.id,
  });
}

export function issueHoldPositionCommand(game, units) {
  if (!units?.length) {
    return result(false, TACTICAL_COMMAND_RESULTS.INVALID_SELECTION, 'Select at least one Ukrainian unit first.');
  }
  assignCommand(game, units, (_unit, id) => ({ id, kind: TACTICAL_COMMAND_KINDS.HOLD_POSITION }));
  return result(true, TACTICAL_COMMAND_RESULTS.ISSUED, `${units.length} unit${units.length === 1 ? '' : 's'} holding position.`, {
    count: units.length,
  });
}

export function isRepairFacility(game, building, team = TEAM.UA) {
  if (!activeEntity(game, building) || building.team !== team || building.underConstruction) return false;
  const configured = building.repairFacility ?? BUILDING_TYPES[building.type]?.repairFacility;
  return configured === true || building.type === 'workshop';
}

export function findNearestRepairFacility(game, unit) {
  return (game.buildings || [])
    .filter((building) => isRepairFacility(game, building, unit.team))
    .sort((left, right) => compareDistanceThenId(unit, left, right))[0] || null;
}

export function isReturnForRepairEligible(game, unit) {
  const stats = tacticalUnitStats(game, unit);
  return Boolean(unit && unit.hp > 0 && unit.hp < unit.maxHp && (stats?.armor || stats?.vehicleClass));
}

export function issueReturnForRepairCommand(game, units) {
  const eligible = (units || []).filter((unit) => isReturnForRepairEligible(game, unit));
  if (!eligible.length) {
    return result(false, TACTICAL_COMMAND_RESULTS.NO_DAMAGED_VEHICLES, 'Select at least one damaged vehicle.');
  }
  const plans = eligible.map((unit) => ({ unit, facility: findNearestRepairFacility(game, unit) }));
  if (plans.some(({ facility }) => !facility)) {
    return result(false, TACTICAL_COMMAND_RESULTS.NO_REPAIR_FACILITY, 'No operational friendly repair workshop is available.');
  }
  for (const { unit, facility } of plans) {
    clearTacticalCommand(unit);
    clearWorkerAssignment(unit);
    unit.order = null;
    unit.target = null;
    unit.tacticalCommand = {
      id: nextCommandId(game),
      kind: TACTICAL_COMMAND_KINDS.RETURN_FOR_REPAIR,
      facilityId: facility.id,
      status: 'returning',
    };
  }
  const skipped = (units || []).length - eligible.length;
  return result(true, TACTICAL_COMMAND_RESULTS.ISSUED, `${eligible.length} vehicle${eligible.length === 1 ? '' : 's'} returning for repair${skipped ? `; ${skipped} ineligible unit${skipped === 1 ? '' : 's'} ignored` : ''}.`, {
    count: eligible.length,
    skipped,
  });
}

function slotAngle(unit, anchor) {
  const seed = (entityIdentity(unit, 0) * 31 + entityIdentity(anchor, 0) * 17) % TACTICAL_COMMAND_POLICY.slotCount;
  return (seed / TACTICAL_COMMAND_POLICY.slotCount) * Math.PI * 2;
}

export function tacticalSlotPoint(unit, anchor, radius) {
  const angle = slotAngle(unit, anchor);
  return {
    x: clamp(anchor.x + Math.cos(angle) * radius, 18, WORLD.w - 18),
    y: clamp(anchor.y + Math.sin(angle) * radius, 18, WORLD.h - 18),
  };
}

export function repairApproachPoint(unit, facility) {
  const type = BUILDING_TYPES[facility.type] || {};
  const radius = Math.max(type.w || 64, type.h || 64) / 2 + TACTICAL_COMMAND_POLICY.facilityClearance;
  return tacticalSlotPoint(unit, facility, radius);
}

export function selectGuardThreat(game, protectedEntity) {
  return [...(game.units || []), ...(game.buildings || [])]
    .filter(
      (entity) => entity.hp > 0 && entity.team !== protectedEntity.team &&
        distance(entity, protectedEntity) <= TACTICAL_COMMAND_POLICY.guardThreatRadius,
    )
    .sort((left, right) => compareDistanceThenId(protectedEntity, left, right))[0] || null;
}
