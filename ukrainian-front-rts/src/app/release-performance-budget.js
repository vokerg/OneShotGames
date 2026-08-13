const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

export const RELEASE_PERFORMANCE_BUDGET_VERSION = 1;

export const RELEASE_PERFORMANCE_BUDGETS = deepFreeze({
  version: RELEASE_PERFORMANCE_BUDGET_VERSION,
  profileId: '2026-08-rc1',
  startup: {
    interactiveMs: 8_000,
    missionReadyMs: 12_000,
  },
  frame: {
    targetMs: 1000 / 60,
    p95Ms: 25,
    simulationP95Ms: 10,
    renderP95Ms: 20,
    uiP95Ms: 5,
  },
  ai: {
    maximumDecisionIntervalTicks: 180,
  },
  pathfinding: {
    maximumTrackedRequests: 512,
    maximumCacheEntries: 512,
    maximumFailures: 0,
  },
  atlas: {
    maximumDecodedSupportFrames: 192,
  },
  audio: {
    maximumVoices: 32,
  },
  save: {
    maximumSerializedBytes: 2 * 1024 * 1024,
    maximumRoundTripMs: 250,
  },
  stress: {
    minimumUnits: 200,
    maximumP95FrameMs: 25,
    maximumEstimatedMemoryBytes: 96 * 1024 * 1024,
  },
});

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new TypeError(`${label} must be a non-negative finite number.`);
  return number;
}

function integer(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new TypeError(`${label} must be a non-negative integer.`);
  return number;
}

function result(id, actual, maximum, unit = '') {
  return Object.freeze({ id, actual, maximum, unit, pass: actual <= maximum });
}

export function createReleasePerformanceMeasurement({
  startup,
  profiler,
  atlas,
  save,
} = {}) {
  if (!startup || !profiler || !atlas || !save) {
    throw new TypeError('Release performance measurement requires startup, profiler, atlas, and save sections.');
  }
  if (!profiler.frame || !profiler.simulation || !profiler.render || !profiler.ui
    || !profiler.entities || !profiler.path || !profiler.ai || !profiler.audio || !profiler.memory) {
    throw new TypeError('Release performance measurement requires a complete profiler snapshot.');
  }
  if (profiler.path.available !== true) throw new Error('Release performance gate requires pathfinding diagnostics.');
  if (profiler.ai.available !== true) throw new Error('Release performance gate requires AI diagnostics.');
  if (profiler.audio.available !== true) throw new Error('Release performance gate requires audio diagnostics.');

  return deepFreeze({
    startup: {
      interactiveMs: finite(startup.interactiveMs, 'startup.interactiveMs'),
      missionReadyMs: finite(startup.missionReadyMs, 'startup.missionReadyMs'),
    },
    frame: {
      p95Ms: finite(profiler.frame.p95Ms, 'profiler.frame.p95Ms'),
      simulationP95Ms: finite(profiler.simulation.p95Ms, 'profiler.simulation.p95Ms'),
      renderP95Ms: finite(profiler.render.p95Ms, 'profiler.render.p95Ms'),
      uiP95Ms: finite(profiler.ui.p95Ms, 'profiler.ui.p95Ms'),
    },
    ai: {
      decisionIntervalTicks: finite(profiler.ai.intervalTicks, 'profiler.ai.intervalTicks'),
    },
    pathfinding: {
      trackedRequests: integer(profiler.path.trackedRequests, 'profiler.path.trackedRequests'),
      cacheEntries: integer(profiler.path.cacheEntries, 'profiler.path.cacheEntries'),
      failures: integer(profiler.path.failures, 'profiler.path.failures'),
    },
    atlas: {
      decodedSupportFrames: integer(atlas.decodedSupportFrames, 'atlas.decodedSupportFrames'),
    },
    audio: {
      maximumVoices: integer(profiler.audio.maximumVoices, 'profiler.audio.maximumVoices'),
    },
    save: {
      serializedBytes: integer(save.serializedBytes, 'save.serializedBytes'),
      roundTripMs: finite(save.roundTripMs, 'save.roundTripMs'),
    },
    stress: {
      units: integer(profiler.entities.units, 'profiler.entities.units'),
      p95FrameMs: finite(profiler.frame.p95Ms, 'profiler.frame.p95Ms'),
      estimatedMemoryBytes: integer(profiler.memory.estimatedBytes, 'profiler.memory.estimatedBytes'),
    },
  });
}

export function evaluateReleasePerformanceMeasurement(measurement, budgets = RELEASE_PERFORMANCE_BUDGETS) {
  if (!measurement || typeof measurement !== 'object') throw new TypeError('Release performance measurement is required.');
  const checks = [
    result('startup.interactive', measurement.startup.interactiveMs, budgets.startup.interactiveMs, 'ms'),
    result('startup.missionReady', measurement.startup.missionReadyMs, budgets.startup.missionReadyMs, 'ms'),
    result('frame.p95', measurement.frame.p95Ms, budgets.frame.p95Ms, 'ms'),
    result('frame.simulationP95', measurement.frame.simulationP95Ms, budgets.frame.simulationP95Ms, 'ms'),
    result('frame.renderP95', measurement.frame.renderP95Ms, budgets.frame.renderP95Ms, 'ms'),
    result('frame.uiP95', measurement.frame.uiP95Ms, budgets.frame.uiP95Ms, 'ms'),
    result('ai.decisionInterval', measurement.ai.decisionIntervalTicks, budgets.ai.maximumDecisionIntervalTicks, 'ticks'),
    result('pathfinding.trackedRequests', measurement.pathfinding.trackedRequests, budgets.pathfinding.maximumTrackedRequests, 'requests'),
    result('pathfinding.cacheEntries', measurement.pathfinding.cacheEntries, budgets.pathfinding.maximumCacheEntries, 'entries'),
    result('pathfinding.failures', measurement.pathfinding.failures, budgets.pathfinding.maximumFailures, 'failures'),
    result('atlas.decodedSupportFrames', measurement.atlas.decodedSupportFrames, budgets.atlas.maximumDecodedSupportFrames, 'frames'),
    result('audio.maximumVoices', measurement.audio.maximumVoices, budgets.audio.maximumVoices, 'voices'),
    result('save.serializedBytes', measurement.save.serializedBytes, budgets.save.maximumSerializedBytes, 'bytes'),
    result('save.roundTrip', measurement.save.roundTripMs, budgets.save.maximumRoundTripMs, 'ms'),
    result('stress.frameP95', measurement.stress.p95FrameMs, budgets.stress.maximumP95FrameMs, 'ms'),
    result('stress.memoryProxy', measurement.stress.estimatedMemoryBytes, budgets.stress.maximumEstimatedMemoryBytes, 'bytes'),
    Object.freeze({
      id: 'stress.minimumUnits',
      actual: measurement.stress.units,
      minimum: budgets.stress.minimumUnits,
      unit: 'units',
      pass: measurement.stress.units >= budgets.stress.minimumUnits,
    }),
  ];
  return deepFreeze({
    version: budgets.version,
    profileId: budgets.profileId,
    pass: checks.every((check) => check.pass),
    checks,
    failures: checks.filter((check) => !check.pass),
  });
}

export function assertReleasePerformanceMeasurement(measurement, budgets = RELEASE_PERFORMANCE_BUDGETS) {
  const report = evaluateReleasePerformanceMeasurement(measurement, budgets);
  if (!report.pass) {
    throw new Error(`Release performance budget failed: ${report.failures.map((failure) => failure.id).join(', ')}`);
  }
  return report;
}
