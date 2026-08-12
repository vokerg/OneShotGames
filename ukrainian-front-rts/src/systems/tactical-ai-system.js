import { BUILDING_TYPES, FACTIONS, TEAM, UNIT_TYPES, WORLD } from '../config.js';
import {
  ageAiKnowledge,
  createAiBlackboard,
  inspectAiBlackboard,
  observeAiContact,
  replaceAiGoals,
  runAiDecisionCadence,
} from '../ai/ai-blackboard.js';
import { canonicalAiSnapshot, createAiDoctrineProfile } from '../ai/ai-contracts.js';
import { createTacticalAiPolicy, planTacticalAi } from '../ai/tactical-ai.js';
import { clearTacticalCommand } from './tactical-command-policy.js';

const STATES = new WeakMap();
const DEFAULT_TEAM = TEAM.RU;
const DEFAULT_DECISION_INTERVAL_TICKS = 15;
const DEFAULT_MAX_OBSERVERS = 96;
const DEFAULT_MAX_HOSTILES = 128;
const DEFAULT_WAVE_REACQUIRE_TICKS = 90;
const WAVE_ENGAGEMENT_RADIUS = 220;
const WAVE_APPROACH_RINGS = 3;

function requireGame(game) {
  if (!game || typeof game !== 'object') throw new TypeError('Tactical AI requires a game object.');
  if (!Array.isArray(game.units) || !Array.isArray(game.buildings)) {
    throw new TypeError('Tactical AI requires game.units and game.buildings arrays.');
  }
  return game;
}

function integer(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function distance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function teamFactionId(team) {
  return FACTIONS[team]?.id ?? `team-${team}`;
}

function unitStats(game, unit) {
  if (unit.team === TEAM.UA && typeof game.unitStats === 'function') return game.unitStats(unit.type);
  return UNIT_TYPES[unit.type] ?? {};
}

function entityId(kind, entity) {
  return `${kind}:${entity.id}`;
}

function unitStrength(game, unit) {
  const stats = unitStats(game, unit);
  const hpRatio = unit.maxHp > 0 ? unit.hp / unit.maxHp : 0;
  const damage = Math.max(0, Number(stats.damage) || 0);
  const range = Math.max(0, Number(stats.range) || 0);
  const rate = Math.max(0.25, Number(stats.rate) || 1);
  const durability = Math.max(1, Number(unit.maxHp) || Number(stats.hp) || 1);
  const combatValue = damage > 0 ? damage * (1 + range / 300) / rate : 0;
  return Math.max(0.1, (combatValue + durability * 0.05) * hpRatio);
}

function buildingStrength(building) {
  const stats = BUILDING_TYPES[building.type] ?? {};
  const hpRatio = building.maxHp > 0 ? building.hp / building.maxHp : 0;
  const damage = Math.max(0, Number(stats.damage) || 0);
  const durability = Math.max(1, Number(building.maxHp) || Number(stats.hp) || 1);
  return Math.max(0.1, (damage + durability * 0.025) * hpRatio);
}

function ownUnitSnapshot(game, unit) {
  const stats = unitStats(game, unit);
  const damage = Math.max(0, Number(stats.damage) || 0);
  const speed = Math.max(0, Number(stats.speed) || 0);
  const sight = Math.max(0, Number(stats.sight) || 0);
  return Object.freeze({
    id: entityId('unit', unit),
    kind: unit.type,
    x: unit.x,
    y: unit.y,
    hp: Math.max(0, unit.hp),
    maxHp: Math.max(1, unit.maxHp),
    strength: unitStrength(game, unit),
    speed,
    sight,
    combat: damage > 0,
    scout: Boolean(stats.air) || speed >= 90 || sight >= 300,
    support: Boolean(stats.medic) || Boolean(stats.worker) || damage <= 0,
  });
}

function ownStructureSnapshot(building) {
  return Object.freeze({
    id: entityId('building', building),
    kind: building.type,
    x: building.x,
    y: building.y,
    strength: buildingStrength(building),
  });
}

function observationDetails(kind, entity) {
  return Object.freeze({
    entityKind: kind,
    entityId: entity.id,
    type: entity.type,
  });
}

function entitySight(game, observer) {
  if ('order' in observer) return Math.max(1, Number(unitStats(game, observer).sight) || 180);
  return Math.max(1, Number(BUILDING_TYPES[observer.type]?.sight) || 220);
}

function defaultCanObserve(game, observer, target, sight) {
  if (distance(observer, target) > sight) return false;
  const query = game.visibilityQuery;
  if (query && typeof query.canSee === 'function') return Boolean(query.canSee(observer, target));
  if (typeof game.canUnitSee === 'function') return Boolean(game.canUnitSee(observer, target));
  return true;
}

function controllableUnits(game, team, maximum) {
  return game.units
    .filter((unit) =>
      unit.team === team &&
      unit.hp > 0 &&
      unit.aiControl !== false &&
      !unit.embarked &&
      !unit.garrisoned)
    .sort((left, right) => left.id - right.id)
    .slice(0, maximum);
}

function controllableStructures(game, team) {
  return game.buildings
    .filter((building) => building.team === team && building.hp > 0)
    .sort((left, right) => left.id - right.id);
}

function hostileEntities(game, team, maximum) {
  return [...game.units, ...game.buildings]
    .filter((entity) => entity.team !== team && entity.hp > 0)
    .sort((left, right) => left.id - right.id)
    .slice(0, maximum);
}

function observersFor(game, team, maximum) {
  return [...controllableUnits(game, team, maximum), ...controllableStructures(game, team)]
    .sort((left, right) => left.id - right.id)
    .slice(0, maximum);
}

function observeVisibleContacts(game, state) {
  ageAiKnowledge(state.blackboard, state.tick);
  const observers = observersFor(game, state.team, state.maxObservers);
  const hostiles = hostileEntities(game, state.team, state.maxHostiles);
  let comparisons = 0;
  let observations = 0;

  for (const target of hostiles) {
    let visible = false;
    for (const observer of observers) {
      comparisons += 1;
      const sight = entitySight(game, observer);
      if (state.canObserve(game, observer, target, sight)) {
        visible = true;
        break;
      }
    }
    if (!visible) continue;

    const kind = 'order' in target ? 'unit' : 'building';
    observeAiContact(state.blackboard, {
      id: entityId(kind, target),
      tick: state.tick,
      source: 'line-of-sight',
      kind: target.type ?? kind,
      teamId: teamFactionId(target.team),
      position: { x: target.x, y: target.y },
      strength: kind === 'unit' ? unitStrength(game, target) : buildingStrength(target),
      details: observationDetails(kind, target),
    });
    observations += 1;
  }

  state.observationMetrics = Object.freeze({
    observers: observers.length,
    hostiles: hostiles.length,
    comparisons,
    observations,
  });
}

function resolveTarget(game, contactId, team) {
  if (typeof contactId !== 'string') return null;
  const [kind, rawId] = contactId.split(':');
  const numericId = Number(rawId);
  if (!Number.isInteger(numericId)) return null;
  const collection = kind === 'unit' ? game.units : kind === 'building' ? game.buildings : [];
  const target = collection.find((candidate) => candidate.id === numericId && candidate.hp > 0);
  return target && target.team !== team ? target : null;
}

function waveTargetId(target) {
  return target && Number.isInteger(target.id) ? entityId('building', target) : null;
}

function resolveWaveTarget(game, targetId, team) {
  const target = resolveTarget(game, targetId, team);
  return target && !('order' in target) ? target : null;
}

function selectWaveObjective(game, state, unit) {
  if (game.uaHQ?.hp > 0 && game.uaHQ.team !== state.team) return game.uaHQ;
  const candidates = game.buildings
    .filter((building) => building.team !== state.team && building.hp > 0)
    .sort((left, right) => {
      const distanceDelta = distance(unit, left) - distance(unit, right);
      return distanceDelta || left.id - right.id;
    });
  return candidates[0] ?? null;
}

function buildingBlockerCells(building) {
  const placement = building?.placement;
  if (
    placement?.origin && Number.isInteger(placement.origin.x) && Number.isInteger(placement.origin.y) &&
    placement?.footprint && Number.isInteger(placement.footprint.width) && Number.isInteger(placement.footprint.height)
  ) {
    return {
      left: placement.origin.x,
      top: placement.origin.y,
      right: placement.origin.x + placement.footprint.width,
      bottom: placement.origin.y + placement.footprint.height,
    };
  }
  const stats = BUILDING_TYPES[building?.type];
  if (!stats) return null;
  return {
    left: Math.max(0, Math.floor((building.x - stats.w / 2) / WORLD.tile)),
    top: Math.max(0, Math.floor((building.y - stats.h / 2) / WORLD.tile)),
    right: Math.min(WORLD.w / WORLD.tile, Math.ceil((building.x + stats.w / 2) / WORLD.tile)),
    bottom: Math.min(WORLD.h / WORLD.tile, Math.ceil((building.y + stats.h / 2) / WORLD.tile)),
  };
}

function buildingBlocksCell(building, cell) {
  const blocker = buildingBlockerCells(building);
  return Boolean(blocker && cell.x >= blocker.left && cell.x < blocker.right && cell.y >= blocker.top && cell.y < blocker.bottom);
}

function waveApproachPoint(game, unit, target) {
  const targetBlocker = buildingBlockerCells(target);
  if (!targetBlocker) return Object.freeze({ x: clamp(target.x, 0, WORLD.w), y: clamp(target.y, 0, WORLD.h) });
  const width = WORLD.w / WORLD.tile;
  const height = WORLD.h / WORLD.tile;
  const liveBuildings = game.buildings.filter((building) => building.hp > 0);
  const candidates = [];
  for (let ring = 1; ring <= WAVE_APPROACH_RINGS; ring += 1) {
    const left = targetBlocker.left - ring;
    const right = targetBlocker.right - 1 + ring;
    const top = targetBlocker.top - ring;
    const bottom = targetBlocker.bottom - 1 + ring;
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        if (x !== left && x !== right && y !== top && y !== bottom) continue;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const cell = { x, y };
        if (liveBuildings.some((building) => buildingBlocksCell(building, cell))) continue;
        const point = {
          x: (x + 0.5) * WORLD.tile,
          y: (y + 0.5) * WORLD.tile,
        };
        candidates.push({ point, ring, x, y, unitDistance: distance(unit, point), targetDistance: distance(target, point) });
      }
    }
    if (candidates.length) break;
  }
  candidates.sort((left, right) =>
    left.unitDistance - right.unitDistance ||
    left.targetDistance - right.targetDistance ||
    left.y - right.y ||
    left.x - right.x);
  const selected = candidates[0]?.point;
  if (selected) return Object.freeze(selected);
  return Object.freeze({ x: clamp(target.x, 0, WORLD.w), y: clamp(target.y, 0, WORLD.h) });
}

function refreshWaveAssaults(game, state) {
  const waveUnits = controllableUnits(game, state.team, state.policy.maxUnits)
    .filter((unit) => unit.waveSpawned);
  const liveIds = new Set(waveUnits.map((unit) => unit.id));
  for (const unitId of state.waveAssaults.keys()) {
    if (!liveIds.has(unitId)) state.waveAssaults.delete(unitId);
  }

  let ordered = 0;
  let engaging = 0;
  let reacquired = 0;
  let waiting = 0;

  for (const unit of waveUnits) {
    let assault = state.waveAssaults.get(unit.id);
    let target = resolveWaveTarget(game, assault?.targetId, state.team);
    const due = !assault || state.tick >= assault.nextReacquireTick;
    if (!target || due) {
      const nextTarget = selectWaveObjective(game, state, unit);
      if (nextTarget) {
        const changed = !assault || assault.targetId !== waveTargetId(nextTarget);
        assault = {
          targetId: waveTargetId(nextTarget),
          destination: waveApproachPoint(game, unit, nextTarget),
          nextReacquireTick: state.tick + state.waveReacquireTicks,
        };
        state.waveAssaults.set(unit.id, assault);
        target = nextTarget;
        if (changed) reacquired += 1;
      } else {
        state.waveAssaults.set(unit.id, {
          targetId: null,
          destination: null,
          nextReacquireTick: state.tick + state.waveReacquireTicks,
        });
        unit.waveAssaultState = 'waiting-bounded';
        unit.waveAssaultRetryTick = state.tick + state.waveReacquireTicks;
        waiting += 1;
        continue;
      }
    }

    if (!assault.destination) {
      assault = { ...assault, destination: waveApproachPoint(game, unit, target) };
      state.waveAssaults.set(unit.id, assault);
    }
    const targetDistance = distance(unit, target);
    if (targetDistance <= WAVE_ENGAGEMENT_RADIUS) engaging += 1;
    const destination = assault.destination;
    const correctOrder = unit.order?.kind === 'attackMove' &&
      Math.abs(unit.order.x - destination.x) < 1 && Math.abs(unit.order.y - destination.y) < 1;
    if (!correctOrder || due) {
      if (!correctOrder && !unit.order && !due) {
        assault = { ...assault, destination: waveApproachPoint(game, unit, target) };
        state.waveAssaults.set(unit.id, assault);
      }
      clearTacticalCommand(unit);
      unit.order = {
        kind: 'attackMove',
        x: clamp(assault.destination.x, 0, WORLD.w),
        y: clamp(assault.destination.y, 0, WORLD.h),
      };
      unit.target = null;
    }
    unit.waveAssaultState = targetDistance <= WAVE_ENGAGEMENT_RADIUS ? 'engaging' : 'ordered';
    unit.waveAssaultTargetId = assault.targetId;
    unit.waveAssaultRetryTick = assault.nextReacquireTick;
    ordered += 1;
  }

  state.waveMetrics = Object.freeze({
    total: waveUnits.length,
    ordered,
    engaging,
    waiting,
    reacquired,
    reacquireWithinTicks: state.waveReacquireTicks,
  });
  return liveIds;
}

function applyPlan(game, state, plan, protectedWaveIds = new Set()) {
  const units = new Map(
    controllableUnits(game, state.team, state.policy.maxUnits)
      .map((unit) => [entityId('unit', unit), unit]),
  );
  const assignedIds = new Set();
  let assigned = 0;
  let skipped = 0;
  let waveProtected = 0;

  for (const descriptor of plan.commands) {
    const target = resolveTarget(game, descriptor.targetId, state.team);
    for (const unitId of descriptor.unitIds) {
      const unit = units.get(unitId);
      if (!unit || assignedIds.has(unitId)) {
        skipped += 1;
        continue;
      }
      if (protectedWaveIds.has(unit.id)) {
        assignedIds.add(unitId);
        waveProtected += 1;
        continue;
      }
      clearTacticalCommand(unit);
      if (descriptor.kind === 'attack' && target) {
        unit.order = { kind: 'attack', target };
        unit.target = target;
      } else {
        const kind = descriptor.kind === 'attack' ? 'attackMove' : descriptor.kind;
        unit.order = {
          kind,
          x: clamp(descriptor.target.x, 0, WORLD.w),
          y: clamp(descriptor.target.y, 0, WORLD.h),
        };
        unit.target = null;
      }
      unit.tacticalAiRole = descriptor.role;
      assignedIds.add(unitId);
      assigned += 1;
    }
  }

  state.commandMetrics = Object.freeze({ assigned, skipped, waveProtected, waveAssault: state.waveMetrics });
  state.lastPlan = plan;
  return state.commandMetrics;
}

function tacticalGoals(tick) {
  return [
    {
      id: 'tactical-attack',
      kind: 'attack',
      priority: 60,
      createdTick: tick,
      reason: 'Apply pressure when observed force and readiness permit.',
    },
    {
      id: 'tactical-scout',
      kind: 'scouting',
      priority: 20,
      createdTick: tick,
      reason: 'Maintain observed-only contact knowledge.',
    },
  ];
}

function createState(options) {
  const team = options.team ?? DEFAULT_TEAM;
  const factionId = teamFactionId(team);
  const doctrine = createAiDoctrineProfile({
    id: options.doctrine?.id ?? `${factionId}.tactical.standard`,
    factionId,
    strategy: options.doctrine?.strategy ?? 'combined-arms-pressure',
    decisionIntervalTicks:
      options.doctrine?.decisionIntervalTicks ?? DEFAULT_DECISION_INTERVAL_TICKS,
    decisionOffsetTicks: options.doctrine?.decisionOffsetTicks ?? 0,
    contactStaleAfterTicks: options.doctrine?.contactStaleAfterTicks ?? 150,
    contactForgetAfterTicks: options.doctrine?.contactForgetAfterTicks ?? 450,
    riskTolerance: options.doctrine?.riskTolerance ?? 0.55,
    retreatThreshold: options.doctrine?.retreatThreshold ?? 0.32,
    informationPolicy: 'observed-only',
    budgetWeights: options.doctrine?.budgetWeights,
    goalWeights: options.doctrine?.goalWeights,
  });
  const policy = createTacticalAiPolicy({
    worldWidth: WORLD.w,
    worldHeight: WORLD.h,
    ...options.policy,
  });
  const blackboard = createAiBlackboard({ factionId, doctrine, initialTick: 1, historyLimit: 32 });
  replaceAiGoals(blackboard, tacticalGoals(1));
  return {
    team,
    tick: 0,
    enabled: options.enabled !== false,
    doctrine,
    policy,
    blackboard,
    lastPlan: null,
    observationMetrics: Object.freeze({ observers: 0, hostiles: 0, comparisons: 0, observations: 0 }),
    commandMetrics: Object.freeze({ assigned: 0, skipped: 0, waveProtected: 0 }),
    waveMetrics: Object.freeze({ total: 0, ordered: 0, engaging: 0, waiting: 0, reacquired: 0, reacquireWithinTicks: options.waveReacquireTicks ?? DEFAULT_WAVE_REACQUIRE_TICKS }),
    waveAssaults: new Map(),
    waveReacquireTicks: integer(options.waveReacquireTicks ?? DEFAULT_WAVE_REACQUIRE_TICKS, 'waveReacquireTicks', 1, 3600),
    maxObservers: integer(options.maxObservers ?? DEFAULT_MAX_OBSERVERS, 'maxObservers', 1, 512),
    maxHostiles: integer(options.maxHostiles ?? DEFAULT_MAX_HOSTILES, 'maxHostiles', 1, 512),
    canObserve: typeof options.canObserve === 'function' ? options.canObserve : defaultCanObserve,
    options,
  };
}

function resetState(game, previous) {
  const next = createState(previous.options);
  STATES.set(game, next);
  return next;
}

export function tacticalAiSnapshot(game) {
  const state = STATES.get(requireGame(game));
  if (!state) return null;
  return canonicalAiSnapshot({
    enabled: state.enabled,
    team: state.team,
    tick: state.tick,
    doctrine: state.doctrine,
    blackboard: inspectAiBlackboard(state.blackboard),
    lastPlan: state.lastPlan,
    observationMetrics: state.observationMetrics,
    commandMetrics: state.commandMetrics,
  }, 'tactical AI runtime snapshot');
}

export function updateTacticalAi(game) {
  requireGame(game);
  const state = STATES.get(game);
  if (!state) throw new Error('Tactical AI controller is not installed.');
  if (!state.enabled || game.gameOver) return tacticalAiSnapshot(game);

  state.tick += 1;
  observeVisibleContacts(game, state);
  const protectedWaveIds = refreshWaveAssaults(game, state);
  const ownUnits = controllableUnits(game, state.team, state.policy.maxUnits)
    .map((unit) => ownUnitSnapshot(game, unit));
  const ownStructures = controllableStructures(game, state.team)
    .map(ownStructureSnapshot);
  const decisions = runAiDecisionCadence(state.blackboard, {
    throughTick: state.tick,
    decide: (snapshot, cadence) => planTacticalAi({
      tick: cadence.tick,
      decisionIndex: cadence.index,
      doctrine: snapshot.doctrine,
      goals: snapshot.goals,
      knowledge: snapshot.knowledge,
      ownUnits,
      ownStructures,
      policy: state.policy,
    }),
  });
  const latest = decisions.at(-1)?.result ?? null;
  if (latest) applyPlan(game, state, latest, protectedWaveIds);
  else state.commandMetrics = Object.freeze({ ...state.commandMetrics, waveAssault: state.waveMetrics });
  return tacticalAiSnapshot(game);
}

export function createTacticalAiController(game, options = {}) {
  requireGame(game);
  if (STATES.has(game)) throw new Error('Tactical AI controller is already installed.');
  if (typeof game.start !== 'function') throw new TypeError('Tactical AI controller requires game.start().');

  const originalStart = game.start;
  STATES.set(game, createState(options));
  game.tacticalAiSnapshot = () => tacticalAiSnapshot(game);
  game.setTacticalAiEnabled = (enabled) => {
    const state = STATES.get(game);
    state.enabled = Boolean(enabled);
    return state.enabled;
  };
  game.start = (...args) => {
    const result = originalStart.apply(game, args);
    resetState(game, STATES.get(game));
    return result;
  };

  let active = true;
  return () => {
    if (!active) return false;
    active = false;
    game.start = originalStart;
    delete game.tacticalAiSnapshot;
    delete game.setTacticalAiEnabled;
    for (const unit of game.units) {
      delete unit.tacticalAiRole;
      delete unit.waveAssaultState;
      delete unit.waveAssaultTargetId;
      delete unit.waveAssaultRetryTick;
    }
    STATES.delete(game);
    return true;
  };
}
