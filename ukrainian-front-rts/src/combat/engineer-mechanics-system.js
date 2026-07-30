import {
  ABILITY_TARGET_MODES,
  TARGET_ALLEGIANCES,
  createAbilityTargetingProfile,
} from './ability-targeting-system.js';
import { DAMAGE_CLASSES, TARGET_DOMAINS } from './combat-schema.js';

export const ENGINEER_MECHANICS_VERSION = 1;

export const ENGINEER_OBJECT_KINDS = Object.freeze({
  MINE: 'mine',
  OBSTACLE: 'obstacle',
  DEMOLITION_CHARGE: 'demolitionCharge',
});

export const OBSTACLE_TYPES = Object.freeze({
  WIRE: 'wire',
  BARRICADE: 'barricade',
  TANK_TRAP: 'tankTrap',
});

export const ENGINEER_RESULTS = Object.freeze({
  DEPLOYED: 'deployed',
  DETECTED: 'detected',
  CLEARED: 'cleared',
  TRIGGERED: 'triggered',
  CONSTRUCTING: 'constructing',
  CLEARING: 'clearing',
  BUILT: 'built',
  BREACHED: 'breached',
  CHARGE_PLACED: 'charge-placed',
  CHARGE_ARMED: 'charge-armed',
  CHARGE_DEFUSED: 'charge-defused',
  DETONATED: 'detonated',
  INVALID_STATE: 'invalid-state',
  INVALID_ACTOR: 'invalid-actor',
  INVALID_TARGET: 'invalid-target',
  NOT_FOUND: 'not-found',
  WRONG_TEAM: 'wrong-team',
  NOT_READY: 'not-ready',
  NOT_DETECTED: 'not-detected',
  LIMIT_REACHED: 'limit-reached',
});

const DEFAULT_OBSTACLE_PROFILES = Object.freeze({
  [OBSTACLE_TYPES.WIRE]: Object.freeze({
    maxHp: 120,
    buildWork: 6,
    clearanceWork: 4,
    blocksDomains: Object.freeze([TARGET_DOMAINS.GROUND]),
  }),
  [OBSTACLE_TYPES.BARRICADE]: Object.freeze({
    maxHp: 240,
    buildWork: 10,
    clearanceWork: 7,
    blocksDomains: Object.freeze([TARGET_DOMAINS.GROUND]),
  }),
  [OBSTACLE_TYPES.TANK_TRAP]: Object.freeze({
    maxHp: 360,
    buildWork: 14,
    clearanceWork: 10,
    blocksDomains: Object.freeze([TARGET_DOMAINS.GROUND]),
  }),
});

export const ENGINEER_ABILITY_PROFILES = Object.freeze({
  deployMine: createAbilityTargetingProfile({
    id: 'engineer.deployMine',
    mode: ABILITY_TARGET_MODES.POINT,
    range: 90,
    cooldown: 1,
    targetDomains: [TARGET_DOMAINS.GROUND],
    requiresPassablePoint: true,
    telegraphKind: 'mine-placement',
  }),
  detectMines: createAbilityTargetingProfile({
    id: 'engineer.detectMines',
    mode: ABILITY_TARGET_MODES.AREA,
    range: 120,
    radius: 80,
    cooldown: 1,
    targetDomains: [TARGET_DOMAINS.GROUND],
    telegraphKind: 'mine-detection-area',
  }),
  buildObstacle: createAbilityTargetingProfile({
    id: 'engineer.buildObstacle',
    mode: ABILITY_TARGET_MODES.POINT,
    range: 80,
    cooldown: 1,
    targetDomains: [TARGET_DOMAINS.GROUND],
    requiresPassablePoint: true,
    telegraphKind: 'obstacle-placement',
  }),
  breachObstacle: createAbilityTargetingProfile({
    id: 'engineer.breachObstacle',
    mode: ABILITY_TARGET_MODES.UNIT,
    range: 36,
    cooldown: 0,
    targetAllegiance: TARGET_ALLEGIANCES.ENEMY,
    targetDomains: [TARGET_DOMAINS.STRUCTURE],
    telegraphKind: 'obstacle-breach',
  }),
  demolitionCharge: createAbilityTargetingProfile({
    id: 'engineer.demolitionCharge',
    mode: ABILITY_TARGET_MODES.UNIT,
    range: 28,
    cooldown: 2,
    targetAllegiance: TARGET_ALLEGIANCES.ENEMY,
    targetDomains: [TARGET_DOMAINS.GROUND, TARGET_DOMAINS.STRUCTURE],
    telegraphKind: 'demolition-charge',
  }),
});

const clamp = (value, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, value));
const freeze = (value) => Object.freeze(value);

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be a finite number.`);
  return number;
}

function nonNegative(value, label) {
  const number = finite(value, label);
  if (number < 0) throw new RangeError(`${label} must be non-negative.`);
  return number;
}

function pointSnapshot(point, label = 'Target point') {
  if (!point || typeof point !== 'object') throw new TypeError(`${label} must be an object.`);
  return freeze({ x: finite(point.x, `${label}.x`), y: finite(point.y, `${label}.y`) });
}

function actorSnapshot(actor) {
  if (!actor || actor.id === undefined || actor.id === null || actor.id === '') {
    throw new TypeError('Engineer actor requires a stable id.');
  }
  return freeze({
    id: String(actor.id),
    side: actor.side ?? actor.team ?? null,
    x: finite(actor.x, 'actor.x'),
    y: finite(actor.y, 'actor.y'),
    alive: actor.alive !== false && !(Number.isFinite(actor.hp) && actor.hp <= 0),
    buildRate: nonNegative(actor.buildRate ?? actor.engineerBuildRate ?? 1, 'actor.buildRate'),
    clearanceRate: nonNegative(actor.clearanceRate ?? actor.engineerClearanceRate ?? 1, 'actor.clearanceRate'),
    mineDetection: clamp(finite(actor.mineDetection ?? 0.5, 'actor.mineDetection')),
    mineClearance: clamp(finite(actor.mineClearance ?? 0.55, 'actor.mineClearance')),
    chargeDefusal: clamp(finite(actor.chargeDefusal ?? 0.5, 'actor.chargeDefusal')),
  });
}

function assertState(state) {
  if (
    !state ||
    state.schemaVersion !== ENGINEER_MECHANICS_VERSION ||
    !Number.isInteger(state.nextObjectId) ||
    !Array.isArray(state.mines) ||
    !Array.isArray(state.obstacles) ||
    !Array.isArray(state.charges)
  ) {
    throw new TypeError('Engineer state must be created by createEngineerMechanicsState.');
  }
}

function stableSort(records) {
  return [...records].sort((left, right) => left.id.localeCompare(right.id));
}

function immutableRecord(record) {
  const copy = { ...record };
  if (Array.isArray(copy.detectedBy)) copy.detectedBy = freeze([...new Set(copy.detectedBy.map(String))].sort());
  if (Array.isArray(copy.triggerDomains)) copy.triggerDomains = freeze([...copy.triggerDomains]);
  if (Array.isArray(copy.blocksDomains)) copy.blocksDomains = freeze([...copy.blocksDomains]);
  return freeze(copy);
}

function immutableState(state, overrides = {}) {
  return freeze({
    ...state,
    ...overrides,
    mines: freeze(stableSort((overrides.mines ?? state.mines).map(immutableRecord))),
    obstacles: freeze(stableSort((overrides.obstacles ?? state.obstacles).map(immutableRecord))),
    charges: freeze(stableSort((overrides.charges ?? state.charges).map(immutableRecord))),
  });
}

function success(state, status, details = {}) {
  return freeze({ ok: true, status, reason: null, state, ...details });
}

function failure(state, status, reason, details = {}) {
  return freeze({ ok: false, status, reason, state, ...details });
}

function nextId(state, prefix) {
  return `${prefix}-${String(state.nextObjectId).padStart(4, '0')}`;
}

function distance(left, right) {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function requireRandom(random, label) {
  if (typeof random !== 'function') throw new TypeError(`${label} requires an injected random source.`);
}

function domainOf(entity) {
  return entity?.domain ?? (entity?.air ? TARGET_DOMAINS.AIR : TARGET_DOMAINS.GROUND);
}

export function createEngineerMechanicsState() {
  return immutableState({
    schemaVersion: ENGINEER_MECHANICS_VERSION,
    nextObjectId: 1,
    mines: [],
    obstacles: [],
    charges: [],
  });
}

export function deployMine(state, actor, target, config = {}) {
  assertState(state);
  const engineer = actorSnapshot(actor);
  if (!engineer.alive) return failure(state, ENGINEER_RESULTS.INVALID_ACTOR, 'Engineer is unavailable.');
  const point = pointSnapshot(target, 'Mine target');
  const maxMines = config.maxMines ?? Infinity;
  const ownedMines = state.mines.filter((mine) => mine.ownerSide === engineer.side && !mine.spent).length;
  if (ownedMines >= maxMines) return failure(state, ENGINEER_RESULTS.LIMIT_REACHED, 'Mine deployment limit reached.');

  const armRemaining = nonNegative(config.armingTime ?? 1.5, 'armingTime');
  const mine = immutableRecord({
    id: nextId(state, 'mine'),
    kind: ENGINEER_OBJECT_KINDS.MINE,
    ownerSide: engineer.side,
    placedBy: engineer.id,
    x: point.x,
    y: point.y,
    triggerRadius: nonNegative(config.triggerRadius ?? 20, 'triggerRadius'),
    damage: nonNegative(config.damage ?? 80, 'damage'),
    damageClass: config.damageClass ?? DAMAGE_CLASSES.HIGH_EXPLOSIVE,
    armRemaining,
    armed: armRemaining === 0,
    spent: false,
    concealment: clamp(finite(config.concealment ?? 0.72, 'concealment')),
    detectionDifficulty: clamp(finite(config.detectionDifficulty ?? 0.55, 'detectionDifficulty')),
    clearanceDifficulty: clamp(finite(config.clearanceDifficulty ?? 0.5, 'clearanceDifficulty')),
    triggerChance: clamp(finite(config.triggerChance ?? 1, 'triggerChance')),
    triggerDomains: config.triggerDomains ?? [TARGET_DOMAINS.GROUND],
    detectedBy: engineer.side == null ? [] : [engineer.side],
  });
  const next = immutableState(state, {
    nextObjectId: state.nextObjectId + 1,
    mines: [...state.mines, mine],
  });
  return success(next, ENGINEER_RESULTS.DEPLOYED, {
    mine,
    event: freeze({ kind: 'mine-deployed', mineId: mine.id, x: mine.x, y: mine.y }),
  });
}

export function scanForMines(state, scanner, center, random, config = {}) {
  assertState(state);
  requireRandom(random, 'Mine detection');
  const engineer = actorSnapshot(scanner);
  if (!engineer.alive) return failure(state, ENGINEER_RESULTS.INVALID_ACTOR, 'Engineer is unavailable.');
  const origin = pointSnapshot(center ?? engineer, 'Detection center');
  const radius = nonNegative(config.radius ?? 80, 'radius');
  const baseChance = clamp(finite(config.baseChance ?? 0.35, 'baseChance'));
  const results = [];
  const mines = state.mines.map((mine) => {
    if (mine.spent || mine.ownerSide === engineer.side || distance(origin, mine) > radius) return mine;
    const rangeFactor = radius === 0 ? 0 : clamp(1 - distance(origin, mine) / radius);
    const probability = clamp(baseChance + engineer.mineDetection * 0.55 + rangeFactor * 0.2 - mine.detectionDifficulty);
    const roll = random();
    const detected = roll < probability;
    results.push(freeze({ mineId: mine.id, probability, roll, detected }));
    if (!detected || engineer.side == null || mine.detectedBy.includes(String(engineer.side))) return mine;
    return immutableRecord({ ...mine, detectedBy: [...mine.detectedBy, String(engineer.side)] });
  });
  const next = immutableState(state, { mines });
  const detectedIds = freeze(results.filter((result) => result.detected).map((result) => result.mineId));
  return success(next, ENGINEER_RESULTS.DETECTED, {
    detectedIds,
    results: freeze(results),
    events: freeze(detectedIds.map((mineId) => freeze({ kind: 'mine-detected', mineId, side: engineer.side }))),
  });
}

export function resolveMineTriggers(state, entity, random, config = {}) {
  assertState(state);
  requireRandom(random, 'Mine triggering');
  if (!entity || entity.id === undefined || entity.id === null) throw new TypeError('Mine trigger entity requires a stable id.');
  const position = pointSnapshot(entity, 'Mine trigger entity');
  const side = entity.side ?? entity.team ?? null;
  const domain = domainOf(entity);
  const avoidance = clamp(finite(entity.mineAvoidance ?? 0, 'entity.mineAvoidance'));
  const maxTriggers = Math.max(0, Math.floor(config.maxTriggers ?? 1));
  const events = [];
  const triggeredIds = new Set();

  for (const mine of stableSort(state.mines)) {
    if (events.length >= maxTriggers) break;
    if (mine.spent || !mine.armed || mine.ownerSide === side || !mine.triggerDomains.includes(domain)) continue;
    if (distance(position, mine) > mine.triggerRadius) continue;
    const probability = clamp(mine.triggerChance * (1 - avoidance));
    const roll = random();
    if (roll >= probability) continue;
    triggeredIds.add(mine.id);
    events.push(freeze({
      kind: 'mine-triggered',
      mineId: mine.id,
      targetId: String(entity.id),
      x: mine.x,
      y: mine.y,
      damage: mine.damage,
      damageClass: mine.damageClass,
      probability,
      roll,
    }));
  }
  const mines = state.mines.filter((mine) => !triggeredIds.has(mine.id));
  const next = immutableState(state, { mines });
  return success(next, triggeredIds.size ? ENGINEER_RESULTS.TRIGGERED : ENGINEER_RESULTS.NOT_READY, {
    triggeredMineIds: freeze([...triggeredIds].sort()),
    events: freeze(events),
  });
}

export function clearMine(state, mineId, actor, random, config = {}) {
  assertState(state);
  requireRandom(random, 'Mine clearance');
  const engineer = actorSnapshot(actor);
  if (!engineer.alive) return failure(state, ENGINEER_RESULTS.INVALID_ACTOR, 'Engineer is unavailable.');
  const id = String(mineId);
  const mine = state.mines.find((candidate) => candidate.id === id);
  if (!mine) return failure(state, ENGINEER_RESULTS.NOT_FOUND, 'Mine not found.');
  if (engineer.side == null || (!mine.detectedBy.includes(String(engineer.side)) && mine.ownerSide !== engineer.side)) {
    return failure(state, ENGINEER_RESULTS.NOT_DETECTED, 'Mine must be detected before clearance.');
  }
  const probability = clamp((config.baseChance ?? 0.35) + engineer.mineClearance * 0.65 - mine.clearanceDifficulty);
  const roll = random();
  const cleared = roll < probability;
  const triggerOnFailure = config.triggerOnFailure ?? true;
  if (cleared || triggerOnFailure) {
    const next = immutableState(state, { mines: state.mines.filter((candidate) => candidate.id !== id) });
    if (cleared) {
      return success(next, ENGINEER_RESULTS.CLEARED, {
        clearedMineId: id,
        probability,
        roll,
        event: freeze({ kind: 'mine-cleared', mineId: id, engineerId: engineer.id }),
      });
    }
    return failure(next, ENGINEER_RESULTS.TRIGGERED, 'Mine detonated during clearance.', {
      probability,
      roll,
      event: freeze({
        kind: 'mine-clearance-detonation',
        mineId: id,
        targetId: engineer.id,
        x: mine.x,
        y: mine.y,
        damage: mine.damage,
        damageClass: mine.damageClass,
      }),
    });
  }
  return failure(state, ENGINEER_RESULTS.NOT_READY, 'Mine clearance failed.', { probability, roll });
}

export function beginObstacleConstruction(state, actor, target, config = {}) {
  assertState(state);
  const engineer = actorSnapshot(actor);
  if (!engineer.alive) return failure(state, ENGINEER_RESULTS.INVALID_ACTOR, 'Engineer is unavailable.');
  const point = pointSnapshot(target, 'Obstacle target');
  const obstacleType = config.obstacleType ?? OBSTACLE_TYPES.WIRE;
  const profile = DEFAULT_OBSTACLE_PROFILES[obstacleType];
  if (!profile) return failure(state, ENGINEER_RESULTS.INVALID_TARGET, 'Unknown obstacle type.');
  const maxHp = nonNegative(config.maxHp ?? profile.maxHp, 'maxHp');
  const obstacle = immutableRecord({
    id: nextId(state, 'obstacle'),
    kind: ENGINEER_OBJECT_KINDS.OBSTACLE,
    obstacleType,
    ownerSide: engineer.side,
    x: point.x,
    y: point.y,
    maxHp,
    hp: 1,
    buildWork: nonNegative(config.buildWork ?? profile.buildWork, 'buildWork'),
    buildProgress: 0,
    complete: false,
    blocking: false,
    clearanceWork: nonNegative(config.clearanceWork ?? profile.clearanceWork, 'clearanceWork'),
    breachProgress: 0,
    breached: false,
    blocksDomains: config.blocksDomains ?? profile.blocksDomains,
  });
  const next = immutableState(state, {
    nextObjectId: state.nextObjectId + 1,
    obstacles: [...state.obstacles, obstacle],
  });
  return success(next, ENGINEER_RESULTS.CONSTRUCTING, {
    obstacle,
    event: freeze({ kind: 'obstacle-started', obstacleId: obstacle.id, obstacleType, x: obstacle.x, y: obstacle.y }),
  });
}

export function workObstacleConstruction(state, obstacleId, actor, dt) {
  assertState(state);
  const engineer = actorSnapshot(actor);
  if (!engineer.alive) return failure(state, ENGINEER_RESULTS.INVALID_ACTOR, 'Engineer is unavailable.');
  const elapsed = nonNegative(dt, 'dt');
  const id = String(obstacleId);
  const obstacle = state.obstacles.find((candidate) => candidate.id === id);
  if (!obstacle) return failure(state, ENGINEER_RESULTS.NOT_FOUND, 'Obstacle not found.');
  if (obstacle.breached) return failure(state, ENGINEER_RESULTS.INVALID_STATE, 'Breached obstacle cannot be constructed.');
  if (obstacle.ownerSide !== engineer.side) return failure(state, ENGINEER_RESULTS.WRONG_TEAM, 'Only friendly engineers may construct this obstacle.');
  if (obstacle.complete) return success(state, ENGINEER_RESULTS.BUILT, { obstacle });
  const progress = obstacle.buildWork === 0 ? 1 : clamp(obstacle.buildProgress + engineer.buildRate * elapsed / obstacle.buildWork);
  const complete = progress >= 1;
  const updated = immutableRecord({
    ...obstacle,
    buildProgress: progress,
    complete,
    blocking: complete,
    hp: Math.max(1, obstacle.maxHp * progress),
  });
  const next = immutableState(state, {
    obstacles: state.obstacles.map((candidate) => candidate.id === id ? updated : candidate),
  });
  return success(next, complete ? ENGINEER_RESULTS.BUILT : ENGINEER_RESULTS.CONSTRUCTING, {
    obstacle: updated,
    event: freeze({ kind: complete ? 'obstacle-built' : 'obstacle-progress', obstacleId: id, progress }),
  });
}

export function breachObstacle(state, obstacleId, actor, dt, config = {}) {
  assertState(state);
  const engineer = actorSnapshot(actor);
  if (!engineer.alive) return failure(state, ENGINEER_RESULTS.INVALID_ACTOR, 'Engineer is unavailable.');
  const elapsed = nonNegative(dt, 'dt');
  const id = String(obstacleId);
  const obstacle = state.obstacles.find((candidate) => candidate.id === id);
  if (!obstacle) return failure(state, ENGINEER_RESULTS.NOT_FOUND, 'Obstacle not found.');
  if (!obstacle.complete) return failure(state, ENGINEER_RESULTS.NOT_READY, 'Obstacle is not complete.');
  if (obstacle.ownerSide === engineer.side && !config.allowFriendlyBreach) {
    return failure(state, ENGINEER_RESULTS.WRONG_TEAM, 'Friendly obstacle breach is disabled.');
  }
  if (obstacle.breached) return success(state, ENGINEER_RESULTS.BREACHED, { obstacle });
  const work = obstacle.clearanceWork === 0 ? 1 : engineer.clearanceRate * elapsed / obstacle.clearanceWork;
  const breachProgress = clamp(obstacle.breachProgress + work);
  const breached = breachProgress >= 1;
  const updated = immutableRecord({
    ...obstacle,
    breachProgress,
    breached,
    blocking: breached ? false : obstacle.blocking,
    hp: breached ? 0 : obstacle.hp,
  });
  const next = immutableState(state, {
    obstacles: state.obstacles.map((candidate) => candidate.id === id ? updated : candidate),
  });
  return success(next, breached ? ENGINEER_RESULTS.BREACHED : ENGINEER_RESULTS.CLEARING, {
    obstacle: updated,
    event: freeze({ kind: breached ? 'obstacle-breached' : 'obstacle-breach-progress', obstacleId: id, progress: breachProgress }),
  });
}

export function placeDemolitionCharge(state, actor, target, config = {}) {
  assertState(state);
  const engineer = actorSnapshot(actor);
  if (!engineer.alive) return failure(state, ENGINEER_RESULTS.INVALID_ACTOR, 'Engineer is unavailable.');
  const point = pointSnapshot(target, 'Demolition target');
  const charge = immutableRecord({
    id: nextId(state, 'charge'),
    kind: ENGINEER_OBJECT_KINDS.DEMOLITION_CHARGE,
    ownerSide: engineer.side,
    placedBy: engineer.id,
    x: point.x,
    y: point.y,
    targetId: target.id === undefined || target.id === null ? null : String(target.id),
    damage: nonNegative(config.damage ?? 220, 'damage'),
    radius: nonNegative(config.radius ?? 46, 'radius'),
    damageClass: config.damageClass ?? DAMAGE_CLASSES.SHAPED_CHARGE,
    armed: false,
    fuseRemaining: null,
    defuseDifficulty: clamp(finite(config.defuseDifficulty ?? 0.55, 'defuseDifficulty')),
  });
  const next = immutableState(state, {
    nextObjectId: state.nextObjectId + 1,
    charges: [...state.charges, charge],
  });
  return success(next, ENGINEER_RESULTS.CHARGE_PLACED, {
    charge,
    event: freeze({ kind: 'demolition-charge-placed', chargeId: charge.id, targetId: charge.targetId, x: charge.x, y: charge.y }),
  });
}

export function armDemolitionCharge(state, chargeId, actor, config = {}) {
  assertState(state);
  const engineer = actorSnapshot(actor);
  if (!engineer.alive) return failure(state, ENGINEER_RESULTS.INVALID_ACTOR, 'Engineer is unavailable.');
  const id = String(chargeId);
  const charge = state.charges.find((candidate) => candidate.id === id);
  if (!charge) return failure(state, ENGINEER_RESULTS.NOT_FOUND, 'Demolition charge not found.');
  if (charge.ownerSide !== engineer.side) return failure(state, ENGINEER_RESULTS.WRONG_TEAM, 'Only the owning side may arm this charge.');
  const fuseRemaining = nonNegative(config.fuse ?? 3, 'fuse');
  const updated = immutableRecord({ ...charge, armed: true, fuseRemaining });
  const next = immutableState(state, {
    charges: state.charges.map((candidate) => candidate.id === id ? updated : candidate),
  });
  return success(next, ENGINEER_RESULTS.CHARGE_ARMED, {
    charge: updated,
    event: freeze({ kind: 'demolition-charge-armed', chargeId: id, fuse: fuseRemaining }),
  });
}

export function defuseDemolitionCharge(state, chargeId, actor, random, config = {}) {
  assertState(state);
  requireRandom(random, 'Demolition defusal');
  const engineer = actorSnapshot(actor);
  if (!engineer.alive) return failure(state, ENGINEER_RESULTS.INVALID_ACTOR, 'Engineer is unavailable.');
  const id = String(chargeId);
  const charge = state.charges.find((candidate) => candidate.id === id);
  if (!charge) return failure(state, ENGINEER_RESULTS.NOT_FOUND, 'Demolition charge not found.');
  const probability = clamp((config.baseChance ?? 0.35) + engineer.chargeDefusal * 0.65 - charge.defuseDifficulty);
  const roll = random();
  if (roll >= probability) return failure(state, ENGINEER_RESULTS.NOT_READY, 'Demolition charge defusal failed.', { probability, roll });
  const next = immutableState(state, { charges: state.charges.filter((candidate) => candidate.id !== id) });
  return success(next, ENGINEER_RESULTS.CHARGE_DEFUSED, {
    chargeId: id,
    probability,
    roll,
    event: freeze({ kind: 'demolition-charge-defused', chargeId: id, engineerId: engineer.id }),
  });
}

export function tickEngineerMechanics(state, dt) {
  assertState(state);
  const elapsed = nonNegative(dt, 'dt');
  const events = [];
  const mines = state.mines.map((mine) => {
    if (mine.armed || mine.spent || mine.armRemaining <= 0) return mine;
    const armRemaining = Math.max(0, mine.armRemaining - elapsed);
    const armed = armRemaining === 0;
    if (armed) events.push(freeze({ kind: 'mine-armed', mineId: mine.id }));
    return immutableRecord({ ...mine, armRemaining, armed });
  });
  const charges = [];
  for (const charge of state.charges) {
    if (!charge.armed || charge.fuseRemaining === null) {
      charges.push(charge);
      continue;
    }
    const fuseRemaining = Math.max(0, charge.fuseRemaining - elapsed);
    if (fuseRemaining > 0) {
      charges.push(immutableRecord({ ...charge, fuseRemaining }));
      continue;
    }
    events.push(freeze({
      kind: 'demolition-detonated',
      chargeId: charge.id,
      targetId: charge.targetId,
      x: charge.x,
      y: charge.y,
      radius: charge.radius,
      damage: charge.damage,
      damageClass: charge.damageClass,
    }));
  }
  const next = immutableState(state, { mines, charges });
  return success(next, events.some((event) => event.kind === 'demolition-detonated') ? ENGINEER_RESULTS.DETONATED : ENGINEER_RESULTS.NOT_READY, {
    events: freeze(events),
  });
}

export function engineerClearanceSnapshot(state, viewerSide, center = null, radius = Infinity) {
  assertState(state);
  const side = viewerSide === undefined || viewerSide === null ? null : String(viewerSide);
  const origin = center == null ? null : pointSnapshot(center, 'Clearance center');
  const range = radius === Infinity ? Infinity : nonNegative(radius, 'radius');
  const withinRange = (record) => !origin || distance(origin, record) <= range;
  const mineFeedback = state.mines
    .filter(withinRange)
    .filter((mine) => mine.ownerSide === viewerSide || (side !== null && mine.detectedBy.includes(side)))
    .map((mine) => freeze({
      id: mine.id,
      kind: ENGINEER_OBJECT_KINDS.MINE,
      x: mine.x,
      y: mine.y,
      status: mine.armed ? 'armed' : 'arming',
      progress: mine.armed ? 1 : clamp(1 - mine.armRemaining / Math.max(mine.armRemaining, 1)),
      risk: 'high',
      action: mine.ownerSide === viewerSide ? 'protect' : 'clear',
    }));
  const obstacleFeedback = state.obstacles.filter(withinRange).map((obstacle) => freeze({
    id: obstacle.id,
    kind: ENGINEER_OBJECT_KINDS.OBSTACLE,
    obstacleType: obstacle.obstacleType,
    x: obstacle.x,
    y: obstacle.y,
    status: obstacle.breached ? 'breached' : obstacle.complete ? 'blocking' : 'constructing',
    progress: obstacle.breached ? obstacle.breachProgress : obstacle.buildProgress,
    action: obstacle.ownerSide === viewerSide ? (obstacle.complete ? 'hold' : 'build') : 'breach',
  }));
  const chargeFeedback = state.charges.filter(withinRange).map((charge) => freeze({
    id: charge.id,
    kind: ENGINEER_OBJECT_KINDS.DEMOLITION_CHARGE,
    x: charge.x,
    y: charge.y,
    targetId: charge.targetId,
    status: charge.armed ? 'armed' : 'placed',
    fuseRemaining: charge.fuseRemaining,
    action: charge.ownerSide === viewerSide ? (charge.armed ? 'evacuate' : 'arm') : 'defuse',
  }));
  return freeze({
    owner: 'presentation',
    viewerSide,
    mines: freeze(mineFeedback),
    obstacles: freeze(obstacleFeedback),
    charges: freeze(chargeFeedback),
  });
}
