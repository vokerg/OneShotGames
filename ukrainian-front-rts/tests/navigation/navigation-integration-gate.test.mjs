import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import test from 'node:test';

import { TEAM, WORLD } from '../../src/config.js';
import { createFormationAssignments } from '../../src/core/formation.js';
import { setSimulationSeed } from '../../src/core/random.js';
import { Game } from '../../src/game.js';
import { updateUnitsWithNavigation } from '../../src/systems/navigation-movement-system.js';

const GRID_WIDTH = WORLD.w / WORLD.tile;
const GRID_HEIGHT = WORLD.h / WORLD.tile;
const FIXED_STEP_SECONDS = 1 / 30;
const UNIT_COUNT = 150;
const MAX_TICKS = 6_000;
const MAX_STALL_TICKS = 600;
const ARRIVAL_DISTANCE = WORLD.tile * 4;
const FRAME_BUDGET_MS = 1000 / 60;
const UNIT_TYPES = Object.freeze(['uaInfantry', 'uaMedic', 'uaIfv', 'uaTank', 'uaArtillery']);

function cellCenter(x, y) {
  return Object.freeze({
    x: x * WORLD.tile + WORLD.tile / 2,
    y: y * WORLD.tile + WORLD.tile / 2,
  });
}

function authoredTerrain() {
  const terrain = Array(GRID_WIDTH * GRID_HEIGHT).fill(0);
  const barriers = [
    { x: 22, gates: [[5, 16], [35, 46]] },
    { x: 40, gates: [[18, 33]] },
    { x: 58, gates: [[5, 16], [35, 46]] },
  ];
  for (const barrier of barriers) {
    for (let y = 0; y < GRID_HEIGHT; y += 1) {
      const open = barrier.gates.some(([minimum, maximum]) => y >= minimum && y <= maximum);
      if (!open) terrain[y * GRID_WIDTH + barrier.x] = 4;
    }
  }
  return terrain;
}

function createGateGame(seed) {
  setSimulationSeed(seed);
  const game = new Game();
  game.player = {
    metal: 0,
    fuel: 0,
    intel: 0,
    pop: 0,
    cap: 1_000,
    mined: 0,
    objectives: [false, false, false],
    upgrades: new Set(),
  };
  game.enemy = { clock: Number.POSITIVE_INFINITY, pausedForCap: false };
  game.units = [];
  game.buildings = [];
  game.nodes = [];
  game.effects = [];
  game.projectiles = [];
  game.terrain = authoredTerrain();
  game.road = [];
  game.shelterbelts = [];
  game.bridges = [];
  game.missionIndex = 30;
  game.gameOver = false;
  game.lastError = '';
  game.nextId = 1;
  return game;
}

function groupStart(groupIndex, fromRight, laneY) {
  const column = groupIndex % 3;
  return {
    x: fromRight ? 74 - column * 2 : 5 + column * 2,
    y: laneY,
  };
}

function addFormation(game, {
  groupIndex,
  fromRight,
  startLane,
  destinationLane,
  destinations,
}) {
  const start = groupStart(groupIndex, fromRight, startLane);
  const units = [];
  for (let index = 0; index < 25; index += 1) {
    const column = index % 5;
    const row = Math.floor(index / 5);
    const startCell = {
      x: start.x + (fromRight ? -column : column),
      y: start.y - 2 + row,
    };
    const point = cellCenter(startCell.x, startCell.y);
    const unit = game.addUnit(UNIT_TYPES[index % UNIT_TYPES.length], TEAM.UA, point.x, point.y);
    unit.autoFire = false;
    units.push(unit);
  }

  const anchor = cellCenter(fromRight ? 5 : 74, destinationLane);
  const assignments = createFormationAssignments(units, anchor, { spacing: 28 });
  for (const assignment of assignments) {
    const unit = units.find((candidate) => candidate.id === assignment.unitId);
    unit.order = {
      kind: 'move',
      x: assignment.destination.x,
      y: assignment.destination.y,
      formation: assignment.formation,
    };
    destinations.set(unit.id, assignment.destination);
  }
}

function temporaryGateBlocker() {
  return {
    id: 50_000,
    type: 'depot',
    team: TEAM.UA,
    x: cellCenter(40, 20).x,
    y: cellCenter(40, 20).y,
    hp: 1_000,
    maxHp: 1_000,
    selected: false,
    queue: [],
    underConstruction: false,
    capacityGranted: true,
    placement: {
      rotation: 0,
      origin: { x: 40, y: 18 },
      footprint: { width: 1, height: 4 },
    },
  };
}

function distanceToDestination(unit, destinations) {
  const destination = destinations.get(unit.id);
  return Math.hypot(destination.x - unit.x, destination.y - unit.y);
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}

function rounded(value) {
  return Math.round(value * 1_000) / 1_000;
}

function orderDiagnostic(order) {
  if (!order) return null;
  return {
    kind: order.kind,
    x: rounded(order.x),
    y: rounded(order.y),
    routeStatus: order.navigationRoute?.status ?? null,
    routeNextIndex: order.navigationRoute?.nextIndex ?? null,
    routeWaypoints: order.navigationRoute?.waypoints?.length ?? null,
    recoveryReplans: order.navigationRecoveryReplans ?? null,
    detourAttempts: order.navigationRecovery?.detourAttempts ?? null,
    stalledSeconds: rounded(order.navigationRecovery?.stalledSeconds ?? 0),
    blockedStartAttempts: order.navigationBlockedStartRecovery?.detourAttempts ?? null,
  };
}

function unitDiagnostic(unit, destinations, tick, tickStart = null) {
  const destination = destinations.get(unit.id);
  return {
    id: unit.id,
    type: unit.type,
    tick,
    hp: rounded(unit.hp),
    x: rounded(unit.x),
    y: rounded(unit.y),
    destination: { x: rounded(destination.x), y: rounded(destination.y) },
    distance: rounded(distanceToDestination(unit, destinations)),
    order: orderDiagnostic(unit.order),
    tickStart,
  };
}

function runScenario(seed = 'ufr-030-navigation-gate') {
  const game = createGateGame(seed);
  const destinations = new Map();
  const groupPlans = [
    { fromRight: false, startLane: 9, destinationLane: 41 },
    { fromRight: false, startLane: 25, destinationLane: 9 },
    { fromRight: false, startLane: 41, destinationLane: 25 },
    { fromRight: true, startLane: 9, destinationLane: 41 },
    { fromRight: true, startLane: 25, destinationLane: 9 },
    { fromRight: true, startLane: 41, destinationLane: 25 },
  ];
  groupPlans.forEach((plan, groupIndex) => addFormation(game, {
    groupIndex,
    ...plan,
    destinations,
  }));
  assert.equal(game.units.length, UNIT_COUNT);

  const completionTicks = new Map();
  const previousPositions = new Map(game.units.map((unit) => [unit.id, { x: unit.x, y: unit.y }]));
  const stepDurations = [];
  const startedAt = performance.now();
  let blocker = null;
  let lastProgressTick = 0;
  let maxStallTicks = 0;
  let tick = 0;

  for (tick = 1; tick <= MAX_TICKS; tick += 1) {
    if (tick === 300) {
      blocker = temporaryGateBlocker();
      game.buildings.push(blocker);
    }
    if (tick === 900 && blocker) blocker.hp = 0;

    const tickStart = new Map(game.units.map((unit) => [unit.id, {
      x: rounded(unit.x),
      y: rounded(unit.y),
      order: orderDiagnostic(unit.order),
    }]));
    const stepStartedAt = performance.now();
    updateUnitsWithNavigation(game, FIXED_STEP_SECONDS);
    stepDurations.push(performance.now() - stepStartedAt);

    let movement = 0;
    const completedBeforeTick = completionTicks.size;
    for (const unit of game.units) {
      const previous = previousPositions.get(unit.id);
      movement += Math.hypot(unit.x - previous.x, unit.y - previous.y);
      previous.x = unit.x;
      previous.y = unit.y;
      if (unit.order === null && distanceToDestination(unit, destinations) <= ARRIVAL_DISTANCE) {
        if (!completionTicks.has(unit.id)) completionTicks.set(unit.id, tick);
      }
    }

    if (movement > 0.1 || completionTicks.size > completedBeforeTick) lastProgressTick = tick;
    maxStallTicks = Math.max(maxStallTicks, tick - lastProgressTick);
    assert.ok(
      tick - lastProgressTick <= MAX_STALL_TICKS,
      `navigation made no measurable progress for ${tick - lastProgressTick} ticks`,
    );

    const cancelled = game.units.filter((unit) =>
      !completionTicks.has(unit.id) &&
      unit.order === null &&
      distanceToDestination(unit, destinations) > ARRIVAL_DISTANCE);
    const cancellationDiagnostics = cancelled.map((unit) =>
      unitDiagnostic(unit, destinations, tick, tickStart.get(unit.id)));
    assert.deepEqual(
      cancellationDiagnostics,
      [],
      `navigation cancelled units before first arrival: ${game.lastError}`,
    );

    if (completionTicks.size === UNIT_COUNT) break;
  }

  const incompleteDiagnostics = game.units
    .filter((unit) => !completionTicks.has(unit.id))
    .map((unit) => unitDiagnostic(unit, destinations, tick));
  assert.deepEqual(
    incompleteDiagnostics,
    [],
    `navigation did not complete all units within ${MAX_TICKS} ticks`,
  );

  const elapsedMs = performance.now() - startedAt;
  const metrics = game.navigationState.pathService.metrics();
  const finalUnits = game.units
    .map((unit) => ({
      id: unit.id,
      type: unit.type,
      x: rounded(unit.x),
      y: rounded(unit.y),
      distance: rounded(distanceToDestination(unit, destinations)),
      completionTick: completionTicks.get(unit.id) ?? null,
    }))
    .sort((left, right) => left.id - right.id);
  const steadyStateDurations = stepDurations.slice(1);

  return {
    deterministic: {
      ticks: tick,
      metrics,
      finalUnits,
      maxStallTicks,
      navigationRevision: game.navigationState.revision,
    },
    timing: {
      elapsedMs,
      initialRoutingMs: stepDurations[0] ?? 0,
      p95StepMs: percentile(steadyStateDurations, 0.95),
      maxStepMs: Math.max(...stepDurations),
    },
  };
}

test('150 mixed units cross authored chokepoints deterministically within navigation budgets', { timeout: 120_000 }, () => {
  const first = runScenario();
  const second = runScenario();

  assert.deepEqual(second.deterministic, first.deterministic);
  assert.ok(first.deterministic.ticks <= MAX_TICKS);
  assert.equal(first.deterministic.finalUnits.length, UNIT_COUNT);
  assert.equal(first.deterministic.finalUnits.every((unit) => unit.completionTick !== null), true);
  assert.equal(first.deterministic.metrics.failures, 0);
  assert.equal(first.deterministic.metrics.invalidations, 2);
  assert.equal(first.deterministic.navigationRevision, 3);
  assert.ok(first.deterministic.metrics.searches <= UNIT_COUNT * 6);
  assert.ok(first.deterministic.metrics.throttled <= UNIT_COUNT * 4);
  assert.ok(first.deterministic.metrics.maxVisited <= GRID_WIDTH * GRID_HEIGHT);
  assert.ok(first.deterministic.maxStallTicks <= MAX_STALL_TICKS);

  assert.ok(
    first.timing.initialRoutingMs < 2_500,
    `initial 150-unit routing took ${first.timing.initialRoutingMs.toFixed(2)}ms`,
  );
  assert.ok(
    first.timing.p95StepMs < FRAME_BUDGET_MS,
    `steady-state p95 ${first.timing.p95StepMs.toFixed(2)}ms exceeds ${FRAME_BUDGET_MS.toFixed(2)}ms`,
  );
  assert.ok(
    first.timing.elapsedMs < 20_000,
    `scenario took ${first.timing.elapsedMs.toFixed(2)}ms`,
  );

  console.log('[navigation-gate]', JSON.stringify({
    units: UNIT_COUNT,
    ticks: first.deterministic.ticks,
    searches: first.deterministic.metrics.searches,
    throttled: first.deterministic.metrics.throttled,
    invalidations: first.deterministic.metrics.invalidations,
    totalVisited: first.deterministic.metrics.totalVisited,
    initialRoutingMs: rounded(first.timing.initialRoutingMs),
    p95StepMs: rounded(first.timing.p95StepMs),
    elapsedMs: rounded(first.timing.elapsedMs),
  }));
});
