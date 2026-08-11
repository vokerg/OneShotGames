import assert from 'node:assert/strict';
import test from 'node:test';

import { createPerformanceProfiler } from '../../src/app/performance-profiler.js';
import {
  RELEASE_PERFORMANCE_BUDGETS,
  assertReleasePerformanceMeasurement,
  createReleasePerformanceMeasurement,
  evaluateReleasePerformanceMeasurement,
} from '../../src/app/release-performance-budget.js';
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

test('200-unit profiler workload satisfies the release candidate integration budget', () => {
  const measurement = passingMeasurement();
  const report = assertReleasePerformanceMeasurement(measurement);
  assert.equal(report.pass, true);
  assert.equal(measurement.stress.units, 200);
  assert.equal(measurement.pathfinding.failures, 0);
  assert.equal(measurement.audio.maximumVoices, 32);
  assert.ok(measurement.stress.estimatedMemoryBytes > 0);
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
    'stress.frameP95',
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
