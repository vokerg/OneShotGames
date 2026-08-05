import { TEAM } from '../config.js';
import {
  createRepairOrder,
  DEFAULT_REPAIR_POLICY,
  REPAIR_CONTEXTS,
  REPAIR_ORDER_STATES,
  resolveRepairTick,
} from '../combat/repair-system.js';
import { TARGET_DOMAINS } from '../combat/combat-schema.js';
import { TACTICAL_COMMAND_KINDS } from '../core/tactical-command-contract.js';
import { clearTacticalCommand, isRepairFacility } from './tactical-command-policy.js';

export const REPAIR_RUNTIME_EVENT_LIMIT = 64;

const RESOURCE_KINDS = Object.freeze(['metal', 'fuel', 'intel']);
const EPSILON = 1e-9;

function stableId(value) {
  return String(value);
}

function compareEntityIds(left, right) {
  const leftId = Number.isInteger(left?.id) ? left.id : Number.MAX_SAFE_INTEGER;
  const rightId = Number.isInteger(right?.id) ? right.id : Number.MAX_SAFE_INTEGER;
  if (leftId !== rightId) return leftId - rightId;
  return stableId(left?.id).localeCompare(stableId(right?.id));
}

function liveResources(game) {
  return Object.fromEntries(
    RESOURCE_KINDS.map((resource) => [resource, Math.max(0, Number(game.player?.[resource]) || 0)]),
  );
}

function applyResources(game, resources) {
  for (const resource of RESOURCE_KINDS) {
    game.player[resource] = Math.max(0, Number(resources[resource]) || 0);
  }
}

function facilityFor(game, unit) {
  const facilityId = unit.tacticalCommand?.facilityId ?? unit.awaitingRepairAt;
  return (game.buildings || []).find(
    (building) => building.id === facilityId && isRepairFacility(game, building, unit.team),
  ) || null;
}

function repairOrderFor(unit, facility) {
  const existing = unit.facilityRepairOrder;
  const targetId = stableId(unit.id);
  const facilityId = stableId(facility.id);
  if (
    existing?.state === REPAIR_ORDER_STATES.ACTIVE &&
    existing.targetId === targetId &&
    existing.facilityId === facilityId
  ) {
    return existing;
  }
  return createRepairOrder({
    id: `facility-repair:${targetId}:${stableId(unit.tacticalCommand?.id ?? facilityId)}`,
    team: unit.team,
    targetId,
    context: REPAIR_CONTEXTS.FACILITY,
    facilityId,
  });
}

function targetDescriptor(unit) {
  return {
    id: stableId(unit.id),
    team: unit.team,
    domain: TARGET_DOMAINS.GROUND,
    hp: unit.hp,
    maxHp: unit.maxHp,
    destroyed: unit.hp <= 0,
    repairable: true,
  };
}

function facilityDescriptor(facility) {
  return {
    id: stableId(facility.id),
    team: facility.team,
    online: facility.hp > 0 && !facility.underConstruction,
    canRepair: true,
    acceptsDomains: [TARGET_DOMAINS.GROUND],
    rateMultiplier: 1,
  };
}

function resetMissionState(game) {
  game.repairRuntimeEvents = [];
  game.repairRuntimeEventSequence = 1;
  for (const unit of game.units || []) {
    delete unit.facilityRepairOrder;
    delete unit.repairBlockedReason;
  }
}

function recordEvent(game, unit, facility, result) {
  if (!result.event) return;
  const sequence = Number.isInteger(game.repairRuntimeEventSequence)
    ? game.repairRuntimeEventSequence
    : 1;
  game.repairRuntimeEventSequence = sequence + 1;
  game.repairRuntimeEvents ??= [];
  game.repairRuntimeEvents.push(Object.freeze({
    sequence,
    time: Number(game.time) || 0,
    unitId: unit.id,
    facilityId: facility.id,
    repairedHp: result.repairedHp,
    hpAfter: result.target.hp,
    cost: Object.freeze({ ...result.cost }),
    completionReason: result.order.completionReason,
  }));
  if (game.repairRuntimeEvents.length > REPAIR_RUNTIME_EVENT_LIMIT) {
    game.repairRuntimeEvents.splice(
      0,
      game.repairRuntimeEvents.length - REPAIR_RUNTIME_EVENT_LIMIT,
    );
  }
}

function finishRepair(game, unit) {
  delete unit.facilityRepairOrder;
  delete unit.repairBlockedReason;
  clearTacticalCommand(unit);
  unit.hp = Math.min(unit.maxHp, unit.hp);
  if (unit.team === TEAM.UA) {
    game.lastCommandMessage = 'Vehicle repair complete.';
    game.lastError = '';
  }
}

export function updateFacilityRepairs(
  game,
  stepSeconds,
  { policy = DEFAULT_REPAIR_POLICY } = {},
) {
  if (!game?.player || !Array.isArray(game.units) || !Array.isArray(game.buildings)) {
    throw new TypeError('Facility repair runtime requires player, unit, and building state.');
  }
  if (!Number.isFinite(stepSeconds) || stepSeconds <= 0) {
    throw new RangeError('Facility repair step duration must be a positive finite number.');
  }
  if (game.time <= stepSeconds + EPSILON) resetMissionState(game);

  const records = [];
  const units = [...game.units].sort(compareEntityIds);
  for (const unit of units) {
    const command = unit.tacticalCommand;
    const waitingAtFacility =
      command?.kind === TACTICAL_COMMAND_KINDS.RETURN_FOR_REPAIR &&
      command.status === 'waiting' &&
      unit.awaitingRepairAt === command.facilityId;

    if (
      unit.team === TEAM.UA &&
      unit.hp > 0 &&
      waitingAtFacility &&
      unit.hp >= unit.maxHp - EPSILON
    ) {
      const facilityId = command.facilityId;
      finishRepair(game, unit);
      records.push(Object.freeze({
        unitId: unit.id,
        facilityId,
        repairedHp: 0,
        blockedReason: '',
        complete: true,
      }));
      continue;
    }

    const waiting =
      unit.team === TEAM.UA &&
      unit.hp > 0 &&
      unit.hp < unit.maxHp - EPSILON &&
      waitingAtFacility;

    if (!waiting) {
      delete unit.facilityRepairOrder;
      delete unit.repairBlockedReason;
      continue;
    }

    const facility = facilityFor(game, unit);
    if (!facility) {
      delete unit.facilityRepairOrder;
      unit.repairBlockedReason = 'facility-missing';
      continue;
    }

    const result = resolveRepairTick({
      order: repairOrderFor(unit, facility),
      target: targetDescriptor(unit),
      facility: facilityDescriptor(facility),
      resources: liveResources(game),
      dt: stepSeconds,
      policy,
    });

    unit.facilityRepairOrder = result.order;
    unit.hp = result.target.hp;
    applyResources(game, result.resources);
    unit.repairBlockedReason = result.blockedReason || '';
    recordEvent(game, unit, facility, result);
    records.push(Object.freeze({
      unitId: unit.id,
      facilityId: facility.id,
      repairedHp: result.repairedHp,
      blockedReason: result.blockedReason,
      complete: result.order.state === REPAIR_ORDER_STATES.COMPLETE,
    }));

    if (result.order.state === REPAIR_ORDER_STATES.COMPLETE) finishRepair(game, unit);
  }

  return Object.freeze(records);
}

export function repairRuntimeSnapshot(game) {
  return Object.freeze({
    events: Object.freeze([...(game?.repairRuntimeEvents || [])]),
    active: Object.freeze(
      (game?.units || [])
        .filter((unit) => unit.facilityRepairOrder)
        .sort(compareEntityIds)
        .map((unit) => Object.freeze({
          unitId: unit.id,
          facilityId: unit.awaitingRepairAt ?? null,
          hp: unit.hp,
          maxHp: unit.maxHp,
          blockedReason: unit.repairBlockedReason || '',
          order: unit.facilityRepairOrder,
        })),
    ),
  });
}
