import { TEAM, UNIT_TYPES } from '../config.js';
import { distance } from '../core/math.js';
import {
  COMBAT_STANCES,
  COMBAT_STANCE_VALUES,
  DEFAULT_COMBAT_STANCE,
} from '../core/stance-contract.js';
import { resolveChasePolicy, selectTarget } from '../combat/target-policy.js';

export { COMBAT_STANCES, DEFAULT_COMBAT_STANCE } from '../core/stance-contract.js';

export const STANCE_POLICY = Object.freeze({
  retaliationMemorySeconds: 8,
  aggressiveSightMultiplier: 1.6,
  defensiveLeashMultiplier: 1.25,
  aggressiveLeashMultiplier: 2.25,
});

const STANCE_SET = new Set(COMBAT_STANCE_VALUES);
const EPSILON = 1e-9;

function freezePoint(entity) {
  return Object.freeze({ x: entity.x, y: entity.y });
}

function unitStats(game, unit) {
  if (unit?.team === TEAM.UA && typeof game?.unitStats === 'function') return game.unitStats(unit.type);
  return UNIT_TYPES[unit?.type] ?? null;
}

export function createStanceEvaluationContext(game) {
  const units = game.units || [];
  const buildings = game.buildings || [];
  return Object.freeze({
    units,
    buildings,
    entities: Object.freeze([...units, ...buildings]),
    unitSet: new Set(units),
    buildingSet: new Set(buildings),
  });
}

function entityStats(game, entity, context) {
  if (context.unitSet.has(entity)) return unitStats(game, entity);
  return null;
}

function entityDomain(game, entity, context) {
  if (context.buildingSet.has(entity)) return 'structure';
  const stats = entityStats(game, entity, context);
  if (stats?.air) return 'air';
  if (stats?.armor) return 'armor';
  if (stats?.vehicleClass) return 'vehicle';
  return 'infantry';
}

function stableId(entity, fallback = Number.MAX_SAFE_INTEGER) {
  return Number.isInteger(entity?.id) ? entity.id : fallback;
}

function activeEntity(entity, context) {
  return Boolean(
    entity &&
      entity.hp > 0 &&
      (context.unitSet.has(entity) || context.buildingSet.has(entity)),
  );
}

function stanceRule(stance, sight, range) {
  if (stance === COMBAT_STANCES.HOLD_FIRE) {
    return Object.freeze({ acquisitionRange: 0, leashDistance: 0, retaliateOnly: false, chase: false });
  }
  if (stance === COMBAT_STANCES.RETURN_FIRE) {
    return Object.freeze({ acquisitionRange: range, leashDistance: 0, retaliateOnly: true, chase: false });
  }
  if (stance === COMBAT_STANCES.FIRE_AT_WILL || stance === COMBAT_STANCES.HOLD_POSITION) {
    return Object.freeze({ acquisitionRange: range, leashDistance: 0, retaliateOnly: false, chase: false });
  }
  if (stance === COMBAT_STANCES.DEFENSIVE) {
    return Object.freeze({
      acquisitionRange: sight,
      leashDistance: sight * STANCE_POLICY.defensiveLeashMultiplier,
      retaliateOnly: false,
      chase: true,
    });
  }
  return Object.freeze({
    acquisitionRange: sight * STANCE_POLICY.aggressiveSightMultiplier,
    leashDistance: sight * STANCE_POLICY.aggressiveLeashMultiplier,
    retaliateOnly: false,
    chase: true,
  });
}

export function isCombatStance(value) {
  return STANCE_SET.has(value);
}

export function ensureCombatStance(unit, time = 0) {
  if (!unit || typeof unit !== 'object') throw new TypeError('Combat stance requires a unit.');
  if (!isCombatStance(unit.combatStance)) unit.combatStance = DEFAULT_COMBAT_STANCE;
  if (!Number.isFinite(unit.stanceOriginX) || !Number.isFinite(unit.stanceOriginY)) {
    unit.stanceOriginX = unit.x;
    unit.stanceOriginY = unit.y;
  }
  if (!Number.isFinite(unit.stanceChangedAt)) unit.stanceChangedAt = Number.isFinite(time) ? time : 0;
  unit.autoFire = unit.combatStance !== COMBAT_STANCES.HOLD_FIRE;
  return unit.combatStance;
}

export function setCombatStance(unit, stance, time = 0) {
  if (!isCombatStance(stance)) throw new TypeError(`Unknown combat stance: ${stance}`);
  ensureCombatStance(unit, time);
  unit.combatStance = stance;
  unit.stanceOriginX = unit.x;
  unit.stanceOriginY = unit.y;
  unit.stanceChangedAt = Number.isFinite(time) ? time : 0;
  unit.autoFire = stance !== COMBAT_STANCES.HOLD_FIRE;
  if (stance === COMBAT_STANCES.HOLD_FIRE) {
    unit.target = null;
    if (unit.order?.stanceProjection) unit.order = null;
  }
  return stance;
}

export function recordStanceRetaliation(target, attacker, time = 0) {
  if (
    !target ||
    !attacker ||
    target === attacker ||
    target.team === attacker.team ||
    !Number.isInteger(attacker.id)
  ) {
    return false;
  }
  target.lastAttackerId = attacker.id;
  target.lastAttackedAt = Number.isFinite(time) ? time : 0;
  return true;
}

export function activeRetaliationTargetId(unit, time = 0) {
  if (
    !Number.isInteger(unit?.lastAttackerId) ||
    !Number.isFinite(unit?.lastAttackedAt) ||
    !Number.isFinite(time) ||
    time - unit.lastAttackedAt > STANCE_POLICY.retaliationMemorySeconds
  ) {
    return null;
  }
  return unit.lastAttackerId;
}

function targetCandidate(game, unit, entity, acquisitionRange, context) {
  if (!activeEntity(entity, context) || entity.team === unit.team) return null;
  const candidateDistance = distance(unit, entity);
  if (candidateDistance > acquisitionRange + EPSILON) return null;
  const stats = entityStats(game, entity, context) || {};
  return {
    id: entity.id,
    entity,
    domain: entityDomain(game, entity, context),
    visible: true,
    destroyed: false,
    friendly: false,
    distance: candidateDistance,
    threat: Math.max(0, Number(stats.damage) || 0) / 100,
    damagePotential: Math.max(0, Number(stats.damage) || 0) / Math.max(1, Number(stats.rate) || 1) / 100,
    health: entity.hp,
    maxHealth: entity.maxHp,
  };
}

export function resolveStanceTarget(
  game,
  unit,
  time = game?.time ?? 0,
  context = createStanceEvaluationContext(game),
) {
  const stance = ensureCombatStance(unit, time);
  const stats = unitStats(game, unit);
  if (!stats || !(Number(stats.damage) > 0) || !(Number(stats.range) > 0)) return null;
  const sight = Math.max(Number(stats.sight) || stats.range, stats.range);
  const range = Number(stats.range);
  const rule = stanceRule(stance, sight, range);
  if (rule.acquisitionRange <= 0) return null;

  const lastAttackerId = activeRetaliationTargetId(unit, time);
  const origin = {
    x: Number.isFinite(unit.stanceOriginX) ? unit.stanceOriginX : unit.x,
    y: Number.isFinite(unit.stanceOriginY) ? unit.stanceOriginY : unit.y,
  };
  const candidates = context.entities
    .map((entity) => targetCandidate(game, unit, entity, rule.acquisitionRange, context))
    .filter(Boolean)
    .filter((candidate) => !rule.retaliateOnly || candidate.id === lastAttackerId)
    .filter((candidate) => {
      if (!rule.chase) return candidate.distance <= range + EPSILON;
      const originDistance = distance(origin, candidate.entity);
      return candidate.distance <= range + EPSILON || originDistance <= rule.leashDistance + EPSILON;
    });
  if (!candidates.length) return null;

  const selected = selectTarget(candidates, {
    profile: stats.targetProfile || 'balanced',
    maxRange: rule.acquisitionRange,
    lastAttackerId,
    retaliationBonus: 0.75,
  });
  if (!selected) return null;

  const originDistance = distance(origin, selected.entity);
  const chasePolicy = resolveChasePolicy({
    stance: rule.chase ? stance : 'no-chase',
    originDistance,
    leashDistance: rule.leashDistance,
    targetInRange: selected.distance <= range + EPSILON,
  });
  if (!chasePolicy.acquire) return null;
  return Object.freeze({
    target: selected.entity,
    targetId: selected.id,
    stance,
    chase: chasePolicy.chase,
    reason: chasePolicy.reason,
    distance: selected.distance,
    acquisitionRange: rule.acquisitionRange,
    leashDistance: rule.leashDistance,
  });
}

export function stanceSnapshot(unit) {
  if (!unit) return null;
  return Object.freeze({
    stance: isCombatStance(unit.combatStance) ? unit.combatStance : DEFAULT_COMBAT_STANCE,
    origin: Object.freeze({
      x: Number.isFinite(unit.stanceOriginX) ? unit.stanceOriginX : unit.x,
      y: Number.isFinite(unit.stanceOriginY) ? unit.stanceOriginY : unit.y,
    }),
    lastAttackerId: Number.isInteger(unit.lastAttackerId) ? unit.lastAttackerId : null,
    lastAttackedAt: Number.isFinite(unit.lastAttackedAt) ? unit.lastAttackedAt : null,
    targetId: Number.isInteger(unit.stanceTargetId) ? unit.stanceTargetId : null,
  });
}

function clearHoldPositionCommand(unit) {
  if (unit.tacticalCommand?.kind !== 'holdPosition') return false;
  const commandId = unit.tacticalCommand.id;
  delete unit.tacticalCommand;
  if (unit.order?.tacticalCommandId === commandId) unit.order = null;
  return true;
}

export function prepareStanceOrders(game) {
  const context = createStanceEvaluationContext(game);
  const units = [...context.units].sort((left, right) => stableId(left) - stableId(right));
  let projected = 0;
  for (const unit of units) {
    if (unit.team !== TEAM.UA || unit.hp <= 0) continue;
    const stats = unitStats(game, unit);
    if (!stats || !(Number(stats.damage) > 0) || !(Number(stats.range) > 0)) continue;
    ensureCombatStance(unit, game.time);
    if (unit.order?.stanceProjection) unit.order = null;
    if (unit.order) continue;

    const decision = resolveStanceTarget(game, unit, game.time, context);
    if (!decision) {
      if (unit.target?.id === unit.stanceTargetId) unit.target = null;
      delete unit.stanceTargetId;
      continue;
    }
    unit.target = decision.target;
    unit.stanceTargetId = decision.targetId;
    unit.order = {
      kind: 'attack',
      target: decision.target,
      stanceProjection: true,
      stance: decision.stance,
      chase: decision.chase,
    };
    projected += 1;
  }
  return projected;
}

export function reconcileStanceOrders(game) {
  let cleared = 0;
  for (const unit of game.units || []) {
    if (unit.order?.stanceProjection) {
      unit.order = null;
      cleared += 1;
    }
    if (unit.target?.hp <= 0) {
      unit.target = null;
      delete unit.stanceTargetId;
    }
  }
  return cleared;
}

export function createStanceController(game) {
  for (const method of ['selectedUnits', 'addUnit', 'update', 'start', 'toggleAutoFire', 'fail']) {
    if (typeof game?.[method] !== 'function') {
      throw new TypeError(`Stance controller requires game.${method}().`);
    }
  }
  const originalAddUnit = game.addUnit;
  const originalUpdate = game.update;
  const originalStart = game.start;
  const originalToggleAutoFire = game.toggleAutoFire;

  for (const unit of game.units || []) ensureCombatStance(unit, game.time);

  game.addUnit = (...args) => {
    const unit = originalAddUnit.apply(game, args);
    ensureCombatStance(unit, game.time);
    return unit;
  };

  game.setSelectedCombatStance = (stance) => {
    game.lastError = '';
    game.lastCommandMessage = '';
    if (!isCombatStance(stance)) return game.fail('Unknown combat stance.');
    const units = [...game.selectedUnits()]
      .filter((unit) => Number(unitStats(game, unit)?.damage) > 0)
      .sort((left, right) => stableId(left) - stableId(right));
    if (!units.length) return game.fail('Select at least one armed Ukrainian unit.');
    if (stance === COMBAT_STANCES.HOLD_POSITION) {
      if (typeof game.holdSelected === 'function' && !game.holdSelected()) return false;
      if (typeof game.holdSelected !== 'function') {
        units.forEach((unit) => {
          unit.order = null;
          unit.target = null;
          if (Array.isArray(unit.orderQueue)) unit.orderQueue.length = 0;
        });
      }
    } else {
      units.forEach(clearHoldPositionCommand);
    }
    units.forEach((unit) => setCombatStance(unit, stance, game.time));
    game.lastCommandMessage = `${units.length} unit${units.length === 1 ? '' : 's'} set to ${stance}.`;
    return true;
  };

  game.combatStanceSnapshot = (unit) => stanceSnapshot(unit);

  game.toggleAutoFire = () => {
    const armed = game.selectedUnits().filter((unit) => Number(unitStats(game, unit)?.damage) > 0);
    if (!armed.length) return originalToggleAutoFire.call(game);
    const enable = armed.some((unit) => ensureCombatStance(unit, game.time) === COMBAT_STANCES.HOLD_FIRE);
    const accepted = game.setSelectedCombatStance(
      enable ? COMBAT_STANCES.FIRE_AT_WILL : COMBAT_STANCES.HOLD_FIRE,
    );
    return accepted ? enable : false;
  };

  game.update = (stepSeconds) => {
    if (!game.gameOver) prepareStanceOrders(game);
    const updated = originalUpdate.call(game, stepSeconds);
    reconcileStanceOrders(game);
    return updated;
  };

  game.start = (...args) => {
    const started = originalStart.apply(game, args);
    for (const unit of game.units || []) ensureCombatStance(unit, game.time);
    return started;
  };

  return () => {
    game.addUnit = originalAddUnit;
    game.update = originalUpdate;
    game.start = originalStart;
    game.toggleAutoFire = originalToggleAutoFire;
    delete game.setSelectedCombatStance;
    delete game.combatStanceSnapshot;
  };
}
