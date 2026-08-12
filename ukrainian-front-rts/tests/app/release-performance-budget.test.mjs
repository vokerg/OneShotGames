import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import test from 'node:test';

import { createPerformanceProfiler } from '../../src/app/performance-profiler.js';
import {
  RELEASE_PERFORMANCE_BUDGETS,
  assertReleasePerformanceMeasurement,
  createReleasePerformanceMeasurement,
  evaluateReleasePerformanceMeasurement,
} from '../../src/app/release-performance-budget.js';
import { createSimulationHarness } from '../../src/app/simulation-harness.js';
import { TEAM } from '../../src/config.js';
import { VISUAL_PERFORMANCE_BUDGETS } from '../../src/render/visual-performance-runtime.js';

function profilerSnapshot({ frameDeltaMs = 16, unitCount = 200 } = {}) {
  const profiler = createPerformanceProfiler({ historyLimit: 120, sampleIntervalMs: 0 });
  const units = Array.from({ length: unitCount }, (_, index) => ({
    id: index + 1,
    hp: 100,
    order: index % 3 === 0 ? { kind: 'move', x: 10, y: 20 } : null,
  }));
  const game = {
    units,
    buildings: [],
    nodes: [],
    projectiles: [],
    effects: [],
    selected: new Set(),
    simulationSeed: 1234,
    navigationState: {
      pathService: {
        metrics: () => ({
          revision: 1,
          trackedRequests: 64,
          cacheEntries: 128,
          requests: 180,
          searches: 116,
          cacheHits: 64,
          cacheMisses: 116,
          throttled: 0,
          failures: 0,
          invalidations: 4,
          evictions: 0,
        }),
      },
    },
    tacticalAiSnapshot: () => ({
      enabled: true,
      tick: 600,
      blackboard: {
        cadence: { decisionIndex: 10, lastDecisionTick: 540, nextDecisionTick: 600, intervalTicks: 60 },
        summary: { knownContacts: 8, activeGoals: 3 },
      },
      commandMetrics: { assigned: 12 },
    }),
  };
  const audio = () => ({
    available: true,
    status: 'running',
    activeVoiceCount: 12,
    maxVoices: 32,
    paused: false,
    master: { muted: false },
  });

  for (let index = 0; index < 120; index += 1) {
    profiler.recordFrame({
      frameAt: index * frameDeltaMs,
      frameDeltaMs,
      totalMs: 9,
      simulationMs: 3,
      renderMs: 5,
      uiMs: 1,
      clock: { tick: index, steps: 1, acceptedSeconds: 1 / 30, discardedSeconds: 0 },
      game,
      audio,
    });
  }
  return profiler.snapshot();
}

function passingMeasurement() {
  return createReleasePerformanceMeasurement({
    startup: { interactiveMs: 2_400, missionReadyMs: 4_200 },
    profiler: profilerSnapshot(),
    atlas: { decodedSupportFrames: 144 },
    save: { serializedBytes: 192 * 1024, roundTripMs: 24 },
  });
}

function p95(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
}

function addStressForce(game, team, targetCount) {
  const type = team === TEAM.UA ? 'uaInfantry' : 'ruInfantry';
  const existing = game.units.filter((unit) => unit.team === team).length;
  for (let index = existing; index < targetCount; index += 1) {
    const column = index % 10;
    const row = Math.floor(index / 10);
    const x = team === TEAM.UA ? 180 + column * 34 : 1880 + column * 34;
    const y = team === TEAM.UA ? 1040 + row * 34 : 240 + row * 34;
    game.addUnit(type, team, x, y);
  }
}

function runTwoHundredUnitStressScenario() {
  const harness = createSimulationHarness({ tickSeconds: 1 / 30 });
  harness.startScenario({ missionIndex: 0, seed: 'release-200-unit-stress' });
  addStressForce(harness.game, TEAM.UA, 100);
  addStressForce(harness.game, TEAM.RU, 100);
  assert.equal(harness.game.units.length, RELEASE_PERFORMANCE_BUDGETS.stress.minimumUnits);

  const ukrainianIds = harness.game.units
    .filter((unit) => unit.team === TEAM.UA)
    .map((unit) => unit.id);
  assert.equal(harness.issueCommand({ type: 'select', entityIds: ukrainianIds }).ok, true);
  assert.equal(harness.issueCommand({ type: 'move', x: 1540, y: 720 }).ok, true);

  // Warm the navigation grid/cache before the steady-state release measurement window.
  harness.advanceTicks(15);

  const tickDurations = [];
  for (let index = 0; index < 30; index += 1) {
    const startedAt = performance.now();
    harness.advanceTicks(1);
    tickDurations.push(performance.now() - startedAt);
  }

  return {
    units: harness.game.units.length,
    p95TickMs: p95(tickDurations),
    path: harness.game.navigationState?.pathService?.metrics?.() ?? null,
  };
}

test('release performance budgets inherit production render/cache limits', () => {
  assert.equal(RELEASE_PERFORMANCE_BUDGETS.frame.p95Ms, VISUAL_PERFORMANCE_BUDGETS.warningP95FrameMs);
  assert.equal(RELEASE_PERFORMANCE_BUDGETS.frame.targetMs, VISUAL_PERFORMANCE_BUDGETS.targetFrameMs);
  assert.equal(
    RELEASE_PERFORMANCE_BUDGETS.atlas.maximumDecodedSupportFrames,
    VISUAL_PERFORMANCE_BUDGETS.supportDecodedFrameLimit,
  );
  assert.equal(RELEASE_PERFORMANCE_BUDGETS.stress.minimumUnits, 200);
  assert.equal(RELEASE_PERFORMANCE_BUDGETS.audio.maximumVoices, 32);
});

test('release candidate integration budget composes profiler subsystem diagnostics', () => {
  const measurement = passingMeasurement();
  const report = assertReleasePerformanceMeasurement(measurement);
  assert.equal(report.pass, true);
  assert.equal(measurement.stress.units, 200);
  assert.equal(measurement.pathfinding.failures, 0);
  assert.equal(measurement.audio.maximumVoices, 32);
  assert.ok(measurement.stress.estimatedMemoryBytes > 0);
});

test('assembled 200-unit simulation stays inside the RC1 stress budget', () => {
  const stress = runTwoHundredUnitStressScenario();
  assert.equal(stress.units, RELEASE_PERFORMANCE_BUDGETS.stress.minimumUnits);
  assert.ok(stress.path, 'Expected the assembled simulation to expose path-service diagnostics.');
  assert.equal(stress.path.failures, 0);
  assert.ok(
    stress.p95TickMs <= RELEASE_PERFORMANCE_BUDGETS.stress.maximumP95FrameMs,
    `200-unit steady-state tick p95 ${stress.p95TickMs.toFixed(2)} ms exceeded ${RELEASE_PERFORMANCE_BUDGETS.stress.maximumP95FrameMs} ms budget.`,
  );
});

test('release gate reports concrete subsystem failures at the budget boundary', () => {
  const baseline = structuredClone(passingMeasurement());
  baseline.frame.p95Ms = RELEASE_PERFORMANCE_BUDGETS.frame.p95Ms + 0.01;
  baseline.pathfinding.failures = 1;
  baseline.atlas.decodedSupportFrames = RELEASE_PERFORMANCE_BUDGETS.atlas.maximumDecodedSupportFrames + 1;
  baseline.save.serializedBytes = RELEASE_PERFORMANCE_BUDGETS.save.maximumSerializedBytes + 1;
  baseline.stress.units = 199;

  const report = evaluateReleasePerformanceMeasurement(baseline);
  assert.equal(report.pass, false);
  assert.deepEqual(report.failures.map((failure) => failure.id), [
    'frame.p95',
    'pathfinding.failures',
    'atlas.decodedSupportFrames',
    'save.serializedBytes',
    'stress.minimumUnits',
  ]);
  assert.throws(() => assertReleasePerformanceMeasurement(baseline), /Release performance budget failed/);
});

test('release measurement fails closed when profiler diagnostics are unavailable', () => {
  const profiler = structuredClone(profilerSnapshot());
  profiler.path.available = false;
  assert.throws(() => createReleasePerformanceMeasurement({
    startup: { interactiveMs: 100, missionReadyMs: 200 },
    profiler,
    atlas: { decodedSupportFrames: 1 },
    save: { serializedBytes: 1, roundTripMs: 1 },
  }), /pathfinding diagnostics/);
});
