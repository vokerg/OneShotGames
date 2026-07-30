import { TEAM } from '../config.js';
import { distance } from '../core/math.js';
import { TACTICAL_COMMAND_KINDS } from '../core/tactical-command-contract.js';
import {
  TACTICAL_COMMAND_POLICY,
  activeEntityById,
  clearTacticalCommand,
  entityIdentity,
  findNearestRepairFacility,
  isRepairFacility,
  repairApproachPoint,
  selectGuardThreat,
  tacticalSlotPoint,
  tacticalUnitStats,
} from './tactical-command-policy.js';

function projectedOrderMatches(order, command, kind, point, target = null) {
  if (!order || order.tacticalCommandId !== command.id || order.kind !== kind) return false;
  if (target && order.target !== target) return false;
  if (!point) return true;
  return Math.hypot((order.tacticalDestinationX ?? order.x) - point.x, (order.tacticalDestinationY ?? order.y) - point.y) <
    TACTICAL_COMMAND_POLICY.followRepathDistance;
}

function projectOrder(unit, command, kind, point = null, target = null) {
  if (projectedOrderMatches(unit.order, command, kind, point, target)) return unit.order;
  unit.order = {
    kind,
    ...(point ? { x: point.x, y: point.y } : {}),
    ...(target ? { target } : {}),
    tacticalCommandId: command.id,
    tacticalKind: command.kind,
    ...(point ? { tacticalDestinationX: point.x, tacticalDestinationY: point.y } : {}),
  };
  unit.target = target;
  return unit.order;
}

function clearCurrentProjection(unit, command) {
  if (unit.order?.tacticalCommandId === command.id) unit.order = null;
  if (unit.target && unit.order == null) unit.target = null;
}

function cancelInvalidTargetCommand(game, unit, message) {
  clearTacticalCommand(unit);
  if (unit.team === TEAM.UA && !game.lastError) game.lastError = message;
}

export function prepareTacticalCommands(game) {
  const units = [...(game.units || [])].sort((left, right) => entityIdentity(left) - entityIdentity(right));
  for (const unit of units) {
    const command = unit.tacticalCommand;
    if (!command || unit.hp <= 0) continue;

    if (command.kind === TACTICAL_COMMAND_KINDS.HOLD_POSITION) {
      unit.order = null;
      unit.target = null;
      if (Array.isArray(unit.orderQueue)) unit.orderQueue.length = 0;
      continue;
    }

    if (command.kind === TACTICAL_COMMAND_KINDS.PATROL) {
      const point = command.leg === 'origin'
        ? { x: command.originX, y: command.originY }
        : { x: command.destinationX, y: command.destinationY };
      const order = projectOrder(unit, command, 'attackMove', point);
      if (command.leg === 'destination') order.formation = command.formation;
      else delete order.formation;
      continue;
    }

    if (command.kind === TACTICAL_COMMAND_KINDS.FOLLOW) {
      const target = activeEntityById(game, command.targetId, { unitsOnly: true });
      if (!target || target.team !== unit.team) {
        cancelInvalidTargetCommand(game, unit, 'Follow target is no longer available.');
        continue;
      }
      const point = tacticalSlotPoint(unit, target, TACTICAL_COMMAND_POLICY.followDistance);
      if (distance(unit, point) <= TACTICAL_COMMAND_POLICY.followDistance * 0.35) clearCurrentProjection(unit, command);
      else projectOrder(unit, command, 'move', point);
      continue;
    }

    if (command.kind === TACTICAL_COMMAND_KINDS.GUARD) {
      const protectedEntity = activeEntityById(game, command.targetId);
      if (!protectedEntity || protectedEntity.team !== unit.team) {
        cancelInvalidTargetCommand(game, unit, 'Guard target is no longer available.');
        continue;
      }
      const threat = Number(tacticalUnitStats(game, unit)?.damage) > 0 ? selectGuardThreat(game, protectedEntity) : null;
      if (threat) {
        projectOrder(unit, command, 'attack', null, threat);
      } else {
        const point = tacticalSlotPoint(unit, protectedEntity, TACTICAL_COMMAND_POLICY.guardDistance);
        if (distance(unit, point) <= TACTICAL_COMMAND_POLICY.guardDistance * 0.35) clearCurrentProjection(unit, command);
        else projectOrder(unit, command, 'move', point);
      }
      continue;
    }

    if (command.kind === TACTICAL_COMMAND_KINDS.RETURN_FOR_REPAIR) {
      if (unit.hp >= unit.maxHp) {
        clearTacticalCommand(unit);
        continue;
      }
      let facility = activeEntityById(game, command.facilityId);
      if (!isRepairFacility(game, facility, unit.team)) {
        facility = findNearestRepairFacility(game, unit);
        if (!facility) {
          cancelInvalidTargetCommand(game, unit, 'No operational repair workshop remains.');
          continue;
        }
        command.facilityId = facility.id;
      }
      if (distance(unit, facility) <= TACTICAL_COMMAND_POLICY.returnInteractionDistance) {
        command.status = 'waiting';
        unit.awaitingRepairAt = facility.id;
        clearCurrentProjection(unit, command);
      } else {
        command.status = 'returning';
        delete unit.awaitingRepairAt;
        projectOrder(unit, command, 'move', repairApproachPoint(unit, facility));
      }
    }
  }
}

export function reconcileTacticalCommands(game) {
  for (const unit of game.units || []) {
    const command = unit.tacticalCommand;
    if (!command || command.kind !== TACTICAL_COMMAND_KINDS.PATROL || unit.order) continue;
    const point = command.leg === 'origin'
      ? { x: command.originX, y: command.originY }
      : { x: command.destinationX, y: command.destinationY };
    if (distance(unit, point) <= TACTICAL_COMMAND_POLICY.patrolArrivalRadius) {
      command.leg = command.leg === 'origin' ? 'destination' : 'origin';
    } else {
      clearTacticalCommand(unit);
      if (unit.team === TEAM.UA && !game.lastError) game.lastError = 'Patrol route became unreachable.';
    }
  }
}

export function tacticalCommandSnapshot(unit) {
  const command = unit?.tacticalCommand;
  if (!command) return null;
  const origin = Number.isFinite(command.originX) && Number.isFinite(command.originY)
    ? Object.freeze({ x: command.originX, y: command.originY })
    : null;
  const destination = Number.isFinite(command.destinationX) && Number.isFinite(command.destinationY)
    ? Object.freeze({ x: command.destinationX, y: command.destinationY })
    : null;
  return Object.freeze({
    id: command.id,
    kind: command.kind,
    targetId: command.targetId ?? null,
    facilityId: command.facilityId ?? null,
    status: command.status ?? null,
    leg: command.leg ?? null,
    origin,
    destination,
  });
}
