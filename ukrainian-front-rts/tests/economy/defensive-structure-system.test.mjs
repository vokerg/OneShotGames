import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFENSE_CATALOG,
  DEFENSE_EVENT_TYPES,
  DEFENSE_KINDS,
  DEFENSE_STATUSES,
  applyDefenseConstructionWork,
  applyDefenseDamage,
  clearDestroyedDefense,
  createDefensePlacementRequest,
  createDefenseState,
  createMinefieldDeploymentDescriptor,
  evaluateDefensePlacement,
  getDefenseCatalogSnapshot,
  getDefenseEffectSnapshot,
  selectActiveDefenseTarget,
  setDefenseEnabled,
  tickActiveDefense,
} from '../../src/systems/defensive-structure-system.js';

function validPlacement(request, overrides = {}) {
  return evaluateDefensePlacement(request, {
    withinBounds: true,
    terrainAllowed: true,
    overlapFree: true,
    accessClear: true,
    pathSevered: false,
    terrain: 'open',
    ...overrides,
  });
}

function stateFor(defenseId, overrides = {}) {
  const request = createDefensePlacementRequest({
    orderId: `order:${defenseId}`,
    structureId: `structure:${defenseId}`,
    defenseId,
    team: 'ua',
    tileX: 10,
    tileY: 12,
    rotation: 0,
    ...overrides,
  });
  return createDefenseState(request, validPlacement(request));
}

function operational(defenseId, overrides = {}) {
  const building = stateFor(defenseId, overrides);
  return applyDefenseConstructionWork(building, building.workRequired).state;
}

test('catalog includes every required defense family and is deeply immutable', () => {
  assert.deepEqual(Object.keys(DEFENSE_CATALOG), [
    DEFENSE_KINDS.TRENCH,
    DEFENSE_KINDS.SANDBAGS,
    DEFENSE_KINDS.CHECKPOINT,
    DEFENSE_KINDS.ANTI_VEHICLE_OBSTACLE,
    DEFENSE_KINDS.MINEFIELD,
    DEFENSE_KINDS.OBSERVATION_POST,
    DEFENSE_KINDS.SENTRY_GUN,
  ]);
  assert.equal(Object.isFrozen(DEFENSE_CATALOG), true);
  assert.equal(Object.isFrozen(DEFENSE_CATALOG.sentryGun.weapon), true);
  const snapshot = getDefenseCatalogSnapshot();
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(snapshot.length, 7);
});

test('placement requests rotate rectangular footprints and expose deterministic build metadata', () => {
  const request = createDefensePlacementRequest({
    orderId: 'order:sandbags',
    structureId: 'sandbags:1',
    defenseId: DEFENSE_KINDS.SANDBAGS,
    team: 'ua',
    tileX: 4,
    tileY: 7,
    rotation: 90,
    requestedBy: 'engineer:2',
  });
  assert.deepEqual(request.footprint, { width: 1, height: 2 });
  assert.deepEqual(request.cost, { metal: 25 });
  assert.equal(request.requestedBy, 'engineer:2');
  assert.equal(Object.isFrozen(request.placement), true);
});

test('placement consumes external validation and fails closed with reason-specific feedback', () => {
  const request = createDefensePlacementRequest({
    orderId: 'order:checkpoint',
    structureId: 'checkpoint:1',
    defenseId: DEFENSE_KINDS.CHECKPOINT,
    team: 'ua',
    tileX: 1,
    tileY: 1,
  });
  assert.deepEqual(evaluateDefensePlacement(request, null), {
    ok: false,
    reason: 'Placement evaluation is unavailable.',
  });
  assert.equal(validPlacement(request, { overlapFree: false }).field, 'overlapFree');
  assert.equal(validPlacement(request, { pathSevered: true }).field, 'pathSevered');
  assert.equal(validPlacement(request).ok, true);
});

test('construction work is immutable, exact, and emits start/completion once', () => {
  const initial = stateFor(DEFENSE_KINDS.TRENCH);
  const partial = applyDefenseConstructionWork(initial, 3);
  assert.equal(partial.state.workDone, 3);
  assert.equal(partial.state.status, DEFENSE_STATUSES.BUILDING);
  assert.deepEqual(partial.events.map((entry) => entry.type), [DEFENSE_EVENT_TYPES.CONSTRUCTION_STARTED]);
  assert.equal(initial.workDone, 0);

  const complete = applyDefenseConstructionWork(partial.state, 99);
  assert.equal(complete.state.workDone, complete.state.workRequired);
  assert.equal(complete.state.progress, 1);
  assert.equal(complete.state.status, DEFENSE_STATUSES.OPERATIONAL);
  assert.deepEqual(complete.events.map((entry) => entry.type), [DEFENSE_EVENT_TYPES.CONSTRUCTION_COMPLETED]);
  assert.equal(applyDefenseConstructionWork(complete.state, 1).ok, false);
});

test('effect snapshots expose cover, blocking, observation, and active-defense ownership', () => {
  const trench = getDefenseEffectSnapshot(operational(DEFENSE_KINDS.TRENCH));
  assert.equal(trench.cover.cover, 0.45);
  assert.equal(trench.cover.occupancy, 6);
  assert.equal(trench.blocking.vehicles, false);

  const obstacle = getDefenseEffectSnapshot(operational(DEFENSE_KINDS.ANTI_VEHICLE_OBSTACLE));
  assert.equal(obstacle.blocking.vehicles, true);
  assert.equal(obstacle.blocking.infantry, false);

  const post = getDefenseEffectSnapshot(operational(DEFENSE_KINDS.OBSERVATION_POST));
  assert.equal(post.observation.sightBonus, 8);
  assert.equal(post.observation.detectionRadius, 10);

  const sentry = getDefenseEffectSnapshot(operational(DEFENSE_KINDS.SENTRY_GUN));
  assert.equal(sentry.activeDefense, true);
});

test('minefields produce a UFR-048-compatible deployment descriptor only when operational', () => {
  const building = stateFor(DEFENSE_KINDS.MINEFIELD);
  assert.equal(createMinefieldDeploymentDescriptor(building).ok, false);
  const descriptor = createMinefieldDeploymentDescriptor(operational(DEFENSE_KINDS.MINEFIELD));
  assert.equal(descriptor.ok, true);
  assert.equal(descriptor.deployment.mechanic, 'engineerMinefield');
  assert.equal(descriptor.deployment.mineCount, 6);
  assert.equal(descriptor.deployment.cells.length, 4);
  assert.equal(Object.isFrozen(descriptor.deployment.cells), true);
});

test('active defense target selection is deterministic by tag, threat, distance, and ID', () => {
  const sentry = operational(DEFENSE_KINDS.SENTRY_GUN);
  const target = selectActiveDefenseTarget(sentry, [
    { id: 'vehicle:1', team: 'ru', x: 11, y: 12, domain: 'ground', tag: 'vehicle', threat: 99 },
    { id: 'infantry:b', team: 'ru', x: 15, y: 12, domain: 'ground', tag: 'infantry', threat: 4 },
    { id: 'infantry:a', team: 'ru', x: 15, y: 12, domain: 'ground', tag: 'infantry', threat: 4 },
    { id: 'friendly', team: 'ua', x: 10, y: 12, domain: 'ground', tag: 'infantry', threat: 999 },
  ]);
  assert.equal(target.id, 'infantry:a');
});

test('active defense fixed-step cadence preserves cooldown and deterministic overflow', () => {
  const sentry = operational(DEFENSE_KINDS.SENTRY_GUN);
  const candidates = [{ id: 'infantry:1', team: 'ru', x: 12, y: 12, domain: 'ground', tag: 'infantry' }];
  const first = tickActiveDefense(sentry, 0.25, candidates);
  assert.equal(first.shots, 1);
  assert.equal(first.state.cooldownRemaining, 1.25);
  assert.equal(first.events[0].targetId, 'infantry:1');
  assert.equal(sentry.cooldownRemaining, 0);

  const second = tickActiveDefense(first.state, 3.1, candidates);
  assert.equal(second.shots, 2);
  assert.ok(Math.abs(second.state.cooldownRemaining - 1.15) < 1e-9);
  assert.deepEqual(second.events.map((entry) => entry.sequence), [first.state.eventSequence, first.state.eventSequence + 1]);
});

test('disabled sentries do not engage and re-enable without losing state', () => {
  const sentry = operational(DEFENSE_KINDS.SENTRY_GUN);
  const disabled = setDefenseEnabled(sentry, false);
  assert.equal(disabled.ok, true);
  assert.equal(disabled.state.enabled, false);
  const tick = tickActiveDefense(disabled.state, 5, [
    { id: 'enemy', team: 'ru', x: 11, y: 12, domain: 'ground', tag: 'infantry' },
  ]);
  assert.equal(tick.shots, 0);
  assert.equal(tick.state.cooldownRemaining, 0);
  assert.equal(setDefenseEnabled(disabled.state, true).state.enabled, true);
});

test('damage produces reference-free destruction handoff and disables active behavior', () => {
  const sentry = operational(DEFENSE_KINDS.SENTRY_GUN);
  const destroyed = applyDefenseDamage(sentry, 999);
  assert.equal(destroyed.destroyed, true);
  assert.equal(destroyed.state.status, DEFENSE_STATUSES.DESTROYED);
  assert.equal(destroyed.state.enabled, false);
  assert.equal(destroyed.destructionRequest.requestedLifecycle, 'wreckOrRubble');
  assert.deepEqual(destroyed.events.map((entry) => entry.type), [
    DEFENSE_EVENT_TYPES.DAMAGED,
    DEFENSE_EVENT_TYPES.DESTROYED,
  ]);
  assert.equal(Object.isFrozen(destroyed.destructionRequest), true);
});

test('destroyed defenses clear obstruction exactly once', () => {
  const destroyed = applyDefenseDamage(operational(DEFENSE_KINDS.CHECKPOINT), 9999).state;
  const cleared = clearDestroyedDefense(destroyed);
  assert.equal(cleared.ok, true);
  assert.equal(cleared.state.status, DEFENSE_STATUSES.CLEARED);
  assert.equal(getDefenseEffectSnapshot(cleared.state).blocking.vehicles, false);
  assert.equal(clearDestroyedDefense(cleared.state).ok, false);
});

test('invalid requests and elapsed values reject without mutating valid state', () => {
  assert.throws(() => createDefensePlacementRequest({
    orderId: 'bad',
    structureId: 'bad',
    defenseId: DEFENSE_KINDS.MINEFIELD,
    team: 'ua',
    tileX: 0,
    tileY: 0,
    rotation: 90,
  }), /not supported/);
  const sentry = operational(DEFENSE_KINDS.SENTRY_GUN);
  assert.throws(() => tickActiveDefense(sentry, 0, []), /greater than 0/);
  assert.throws(() => applyDefenseDamage(sentry, Number.NaN), /finite number/);
  assert.equal(sentry.status, DEFENSE_STATUSES.OPERATIONAL);
});
