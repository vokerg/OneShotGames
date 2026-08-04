import assert from 'node:assert/strict';
import test from 'node:test';

import { TEAM, UNIT_TYPES, WORLD } from '../../src/config.js';
import { FORMATION_STATES, createFormationAssignments } from '../../src/core/formation.js';
import { MOVEMENT_RECOVERY_DEFAULTS } from '../../src/navigation/movement-recovery.js';
import {
  synchronizeNavigationGrid,
  updateUnitWithNavigation,
  updateUnitsWithNavigation,
} from '../../src/systems/navigation-movement-system.js';

function cellCenter(x, y) {
  return { x: x * WORLD.tile + WORLD.tile / 2, y: y * WORLD.tile + WORLD.tile / 2 };
}

function makeUnit({
  id = 1,
  type = 'uaInfantry',
  team = TEAM.UA,
  position = cellCenter(0, 1),
  order = null,
} = {}) {
  return {
    id,
    type,
    team,
    ...position,
    hp: UNIT_TYPES[type].hp,
    order,
    target: null,
  };
}

function makeGame({
  buildings = [],
  unitType = 'uaInfantry',
  order = null,
  units = null,
  updateUnit = null,
} = {}) {
  const gameUnits = units ?? [makeUnit({ type: unitType, order })];
  const game = {
    missionIndex: 0,
    terrain: Array((WORLD.w / WORLD.tile) * (WORLD.h / WORLD.tile)).fill(0),
    buildings,
    units: gameUnits,
    lastError: '',
    unitStats(type) {
      return UNIT_TYPES[type];
    },
    updateUnit(subject) {
      if (subject.order?.kind === 'move' || subject.order?.kind === 'attackMove') {
        subject.x = subject.order.x;
        subject.y = subject.order.y;
        subject.order = null;
      }
    },
  };
  if (updateUnit) game.updateUnit = updateUnit;
  return game;
}

function depot(id = 10, x = 80, y = 48) {
  return { id, type: 'depot', team: TEAM.RU, x, y, hp: 680 };
}

function normalizedPositions(units) {
  return [...units]
    .sort((left, right) => left.id - right.id)
    .map(({ id, x, y }) => ({ id, x, y }));
}

test('registers building footprints as deterministic dynamic blockers', () => {
  const game = makeGame({ buildings: [depot()] });
  const state = synchronizeNavigationGrid(game);

  assert.deepEqual(state.grid.blockerIdsAt(2, 1), ['building:10']);
  assert.equal(state.grid.isPassable(2, 1), false);
});

test('routes a ground move order around a building footprint', () => {
  const destination = cellCenter(5, 1);
  const game = makeGame({
    buildings: [depot()],
    order: { kind: 'move', ...destination },
  });
  const unit = game.units[0];

  updateUnitWithNavigation(game, unit, 1 / 30);
  const route = unit.order.navigationRoute;
  for (let step = 1; step < 20 && unit.order; step += 1) {
    updateUnitWithNavigation(game, unit, 1 / 30);
  }

  assert.deepEqual({ x: unit.x, y: unit.y }, destination);
  assert.equal(unit.order, null);
  assert.equal(game.lastError, '');
  assert.equal(route.nextIndex, route.waypoints.length);
  assert.equal(
    route.waypoints.some((point) => {
      const cell = game.navigationState.grid.worldToCell(point.x, point.y);
      return game.navigationState.grid.blockerIdsAt(cell.x, cell.y).length > 0;
    }),
    false,
  );
});

test('retains the route object while advancing attack-move waypoints', () => {
  const game = makeGame({
    buildings: [depot()],
    order: { kind: 'attackMove', ...cellCenter(5, 1) },
  });
  const unit = game.units[0];

  updateUnitWithNavigation(game, unit, 1 / 30);

  assert.equal(unit.order.kind, 'attackMove');
  assert.equal(unit.order.navigationRoute.nextIndex, 1);
  assert.equal(unit.order.navigationRoute.waypoints.length > 1, true);
});

test('invalidates cached routes when structures are destroyed and constructed', () => {
  const game = makeGame({ buildings: [depot()] });
  const first = synchronizeNavigationGrid(game);
  first.pathService.requestRoute(cellCenter(0, 1), cellCenter(5, 1), {}, { force: true });

  game.buildings = [];
  const afterDestruction = synchronizeNavigationGrid(game);
  game.buildings = [depot(11)];
  const afterConstruction = synchronizeNavigationGrid(game);

  assert.equal(afterDestruction.revision, first.revision + 1);
  assert.deepEqual(afterDestruction.grid.blockerIdsAt(2, 1), []);
  assert.equal(afterConstruction.revision, afterDestruction.revision + 1);
  assert.deepEqual(afterConstruction.grid.blockerIdsAt(2, 1), ['building:11']);
  assert.equal(afterConstruction.pathService.metrics().invalidations, 2);
  assert.equal(afterConstruction.pathService.metrics().cacheEntries, 0);
});

test('shares cached path templates across units without sharing route progress', () => {
  const destination = cellCenter(8, 4);
  const units = [
    makeUnit({ id: 1, order: { kind: 'move', ...destination } }),
    makeUnit({ id: 2, order: { kind: 'move', ...destination } }),
  ];
  const game = makeGame({ units });

  updateUnitsWithNavigation(game, 1 / 30);

  const firstRoute = units[0].order.navigationRoute;
  const secondRoute = units[1].order.navigationRoute;
  const metrics = game.navigationState.pathService.metrics();
  assert.notEqual(firstRoute, secondRoute);
  assert.equal(firstRoute.waypoints, secondRoute.waypoints);
  assert.equal(firstRoute.nextIndex, 1);
  assert.equal(secondRoute.nextIndex, 1);
  assert.equal(metrics.searches, 1);
  assert.equal(metrics.cacheHits, 1);
});

test('formation orders share the compressed anchor route before expanding to distinct final slots', () => {
  const units = [makeUnit({ id: 1 }), makeUnit({ id: 2 })];
  const anchorDestination = cellCenter(8, 4);
  const assignments = createFormationAssignments(units, anchorDestination, { spacing: 32 });
  for (const unit of units) {
    const assignment = assignments.find((candidate) => candidate.unitId === unit.id);
    unit.order = {
      kind: 'move',
      x: assignment.destination.x,
      y: assignment.destination.y,
      formation: assignment.formation,
    };
  }
  const game = makeGame({ units });

  updateUnitsWithNavigation(game, 1 / 30);

  assert.deepEqual(units[0].order.navigationDestination, anchorDestination);
  assert.deepEqual(units[1].order.navigationDestination, anchorDestination);
  assert.equal(
    units[0].order.navigationRoute.waypoints,
    units[1].order.navigationRoute.waypoints,
  );
  assert.deepEqual(
    { x: units[0].order.x, y: units[0].order.y },
    { x: units[1].order.x, y: units[1].order.y },
  );
  assert.equal(units[0].order.formationCompression, 0);
  assert.equal(units[1].order.formationCompression, 0);
  assert.equal(units[0].order.formationState, FORMATION_STATES.COMPRESSED);
  assert.equal(units[1].order.formationState, FORMATION_STATES.COMPRESSED);
  assert.notDeepEqual(units[0].order.formation.slotOffset, units[1].order.formation.slotOffset);
  assert.equal(game.navigationState.pathService.metrics().searches, 1);
  assert.equal(game.navigationState.pathService.metrics().cacheHits, 1);
});

test('bounds structure-triggered replans and resumes at the deterministic retry tick', () => {
  const destination = cellCenter(5, 1);
  const game = makeGame({ order: { kind: 'move', ...destination } });
  const unit = game.units[0];

  updateUnitsWithNavigation(game, 1 / 30);
  const firstRevision = game.navigationState.revision;
  const pausedPosition = { x: unit.x, y: unit.y };
  game.buildings = [depot(10, 112, 48)];

  updateUnitsWithNavigation(game, 1 / 30);
  assert.equal(game.navigationState.revision, firstRevision + 1);
  assert.deepEqual({ x: unit.x, y: unit.y }, pausedPosition);
  assert.equal(unit.order.navigationRepathTick, 7);

  for (let tick = 3; tick <= 6; tick += 1) {
    updateUnitsWithNavigation(game, 1 / 30);
    assert.deepEqual({ x: unit.x, y: unit.y }, pausedPosition);
  }
  updateUnitsWithNavigation(game, 1 / 30);

  assert.equal(unit.order.navigationRevision, game.navigationState.revision);
  assert.equal(Object.hasOwn(unit.order, 'navigationRepathTick'), false);
  assert.equal(game.navigationState.pathService.metrics().throttled, 5);
});

test('cancels blocked player orders with actionable feedback', () => {
  const game = makeGame({
    buildings: [depot()],
    order: { kind: 'move', ...cellCenter(2, 1) },
  });
  const unit = game.units[0];

  updateUnitWithNavigation(game, unit, 1 / 30);

  assert.equal(unit.order, null);
  assert.equal(game.lastError, 'Destination is blocked.');
});

test('escapes a newly blocked start cell before replanning', () => {
  const destination = cellCenter(5, 1);
  const game = makeGame({
    buildings: [depot()],
    units: [makeUnit({
      position: cellCenter(2, 1),
      order: { kind: 'move', ...destination },
    })],
  });
  const unit = game.units[0];

  for (let step = 0; step < 20 && unit.order; step += 1) {
    updateUnitWithNavigation(game, unit, 1 / 30);
  }

  assert.deepEqual({ x: unit.x, y: unit.y }, destination);
  assert.equal(unit.order, null);
  assert.equal(game.lastError, '');
  assert.equal(game.navigationState.pathService.metrics().failures, 0);
});

test('escapes an impassable terrain start before replanning', () => {
  const destination = cellCenter(5, 1);
  const game = makeGame({
    units: [makeUnit({
      position: cellCenter(2, 1),
      order: { kind: 'move', ...destination },
    })],
  });
  const unit = game.units[0];
  const gridWidth = WORLD.w / WORLD.tile;
  game.terrain[1 * gridWidth + 2] = 4;

  for (let step = 0; step < 20 && unit.order; step += 1) {
    updateUnitWithNavigation(game, unit, 1 / 30);
  }

  assert.deepEqual({ x: unit.x, y: unit.y }, destination);
  assert.equal(unit.order, null);
  assert.equal(game.lastError, '');
  assert.equal(game.navigationState.pathService.metrics().failures, 0);
});

test('preserves direct movement behavior for air units', () => {
  const destination = cellCenter(5, 1);
  const game = makeGame({
    buildings: [depot()],
    unitType: 'uaDrone',
    order: { kind: 'move', ...destination },
  });
  const unit = game.units[0];

  updateUnitWithNavigation(game, unit, 1 / 30);

  assert.deepEqual({ x: unit.x, y: unit.y }, destination);
  assert.equal(unit.order, null);
});

test('resolves mixed ground-unit overlap after all waypoint movement in the step', () => {
  const destination = cellCenter(8, 8);
  const units = [
    makeUnit({ id: 1, type: 'uaInfantry', order: { kind: 'move', ...destination } }),
    makeUnit({ id: 2, type: 'uaTank', order: { kind: 'move', ...destination } }),
  ];
  const game = makeGame({ units });

  const result = updateUnitsWithNavigation(game, 1 / 30);
  const separation = Math.hypot(units[1].x - units[0].x, units[1].y - units[0].y);

  assert.equal(result.unitsConsidered, 2);
  assert.equal(result.pairsResolved > 0, true);
  assert.equal(separation > 0, true);
  assert.equal(units.every((unit) => unit.order?.navigationRoute?.nextIndex === 1), true);
});

test('produces identical fixed-step collision results for reversed unit arrays', () => {
  const source = [
    makeUnit({ id: 7, type: 'uaInfantry', position: { x: 300, y: 300 } }),
    makeUnit({ id: 3, type: 'uaTank', position: { x: 300, y: 300 } }),
    makeUnit({ id: 5, type: 'uaInfantry', position: { x: 304, y: 300 } }),
  ];
  const first = makeGame({ units: source.map((unit) => ({ ...unit })) });
  const second = makeGame({ units: [...source].reverse().map((unit) => ({ ...unit })) });

  updateUnitsWithNavigation(first, 1 / 30);
  updateUnitsWithNavigation(second, 1 / 30);

  assert.deepEqual(normalizedPositions(first.units), normalizedPositions(second.units));
});

test('uses a local detour and then resumes a stalled waypoint route', () => {
  const destination = cellCenter(5, 1);
  const routeY = cellCenter(0, 1).y;
  let detourReached = false;
  let stalledTicks = 0;
  const detourTargets = [];
  const game = makeGame({
    order: { kind: 'move', ...destination },
    updateUnit(subject) {
      if (!subject.order) return;
      if (subject.order.y !== routeY) {
        detourTargets.push({ x: subject.order.x, y: subject.order.y });
        subject.x = subject.order.x;
        subject.y = subject.order.y;
        subject.order = null;
        detourReached = true;
        return;
      }
      if (!detourReached) {
        stalledTicks += 1;
        return;
      }
      subject.x = subject.order.x;
      subject.y = subject.order.y;
      subject.order = null;
    },
  });
  const unit = game.units[0];

  for (let step = 0; step < 120 && unit.order; step += 1) {
    updateUnitWithNavigation(game, unit, 1 / 30);
  }

  assert.equal(stalledTicks >= 22, true);
  assert.equal(detourTargets.length, 1);
  assert.notEqual(detourTargets[0].y, routeY);
  assert.deepEqual({ x: unit.x, y: unit.y }, destination);
  assert.equal(unit.order, null);
  assert.equal(game.lastError, '');
});

test('preserves the global replan budget across detour-only movement', () => {
  const order = { kind: 'move', ...cellCenter(5, 1) };
  let detoursReached = 0;
  const game = makeGame({
    order,
    updateUnit(subject) {
      if (!subject.order?.navigationRecovery?.detour) return;
      subject.x = subject.order.x;
      subject.y = subject.order.y;
      subject.order = null;
      detoursReached += 1;
    },
  });
  const unit = game.units[0];
  const stuckTicks = Math.ceil(MOVEMENT_RECOVERY_DEFAULTS.stuckSeconds / (1 / 30)) + 1;
  const recoveryCycles = MOVEMENT_RECOVERY_DEFAULTS.maxReplans + 1;
  const attemptsPerCycle = MOVEMENT_RECOVERY_DEFAULTS.maxDetours + 1;
  const detourArrivalTicks = recoveryCycles * MOVEMENT_RECOVERY_DEFAULTS.maxDetours;
  const maximumSteps = stuckTicks * recoveryCycles * attemptsPerCycle + detourArrivalTicks + 10;

  let steps = 0;
  for (; steps < maximumSteps && unit.order; steps += 1) {
    updateUnitWithNavigation(game, unit, 1 / 30);
  }

  assert.equal(detoursReached > MOVEMENT_RECOVERY_DEFAULTS.maxDetours, true);
  assert.equal(steps < maximumSteps, true);
  assert.equal(unit.order, null);
  assert.equal(game.lastError, 'Unit is blocked and cannot reach the destination.');
  assert.equal(Object.hasOwn(order, 'navigationRecoveryReplans'), false);
});

test('safely cancels a permanently stuck order after bounded detour attempts', () => {
  const order = { kind: 'move', ...cellCenter(5, 1) };
  const game = makeGame({
    order,
    updateUnit() {},
  });
  const unit = game.units[0];
  const stuckTicks = Math.ceil(MOVEMENT_RECOVERY_DEFAULTS.stuckSeconds / (1 / 30)) + 1;
  const recoveryCycles = MOVEMENT_RECOVERY_DEFAULTS.maxReplans + 1;
  const attemptsPerCycle = MOVEMENT_RECOVERY_DEFAULTS.maxDetours + 1;
  const maximumSteps = stuckTicks * recoveryCycles * attemptsPerCycle + 10;

  let steps = 0;
  for (; steps < maximumSteps && unit.order; steps += 1) {
    updateUnitWithNavigation(game, unit, 1 / 30);
  }

  assert.equal(steps < maximumSteps, true);
  assert.equal(unit.order, null);
  assert.equal(unit.target, null);
  assert.equal(game.lastError, 'Unit is blocked and cannot reach the destination.');
  assert.equal(Object.hasOwn(order, 'navigationRecovery'), false);
  assert.equal(Object.hasOwn(order, 'navigationRecoveryReplans'), false);
});
