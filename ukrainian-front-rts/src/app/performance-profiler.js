export const PERFORMANCE_PROFILER_VERSION = 1;
export const DEFAULT_PERFORMANCE_HISTORY_LIMIT = 120;
export const DEFAULT_PERFORMANCE_SAMPLE_INTERVAL_MS = 250;
export const PERFORMANCE_OVERLAY_TOGGLE_KEY = 'F3';
export const PERFORMANCE_OVERLAY_DIAGNOSTIC = '__fieldsOfResolvePerformance';

const MEMORY_PROXY_WEIGHTS = Object.freeze({
  unit: 512,
  building: 640,
  node: 192,
  projectile: 256,
  effect: 192,
  selected: 16,
  pathCacheEntry: 256,
  pathRequest: 96,
});

function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive integer.`);
  }
  return value;
}

function nonNegativeFinite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new RangeError(`${label} must be a non-negative finite number.`);
  }
  return number;
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function integerOrZero(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function arrayLength(value) {
  return Array.isArray(value) ? value.length : 0;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function safeCall(callback) {
  if (typeof callback !== 'function') return Object.freeze({ value: null, error: null });
  try {
    return Object.freeze({ value: callback(), error: null });
  } catch (error) {
    return Object.freeze({
      value: null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function summarize(samples, key) {
  const values = samples.map((sample) => sample[key]);
  const lastMs = values.at(-1) ?? 0;
  const total = values.reduce((sum, value) => sum + value, 0);
  const averageMs = values.length ? total / values.length : 0;
  const maximumMs = values.length ? Math.max(...values) : 0;
  const sorted = [...values].sort((left, right) => left - right);
  const p95Index = sorted.length ? Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1) : 0;
  const p95Ms = sorted[p95Index] ?? 0;
  return Object.freeze({ lastMs, averageMs, maximumMs, p95Ms });
}

function entitySnapshot(game) {
  const units = Array.isArray(game?.units) ? game.units : [];
  const buildings = Array.isArray(game?.buildings) ? game.buildings : [];
  const selected = game?.selected instanceof Set ? game.selected.size : 0;
  return Object.freeze({
    units: units.length,
    livingUnits: units.filter((entity) => Number(entity?.hp) > 0).length,
    buildings: buildings.length,
    livingBuildings: buildings.filter((entity) => Number(entity?.hp) > 0).length,
    nodes: arrayLength(game?.nodes),
    projectiles: arrayLength(game?.projectiles),
    effects: arrayLength(game?.effects),
    selected,
    total: units.length + buildings.length + arrayLength(game?.nodes) + arrayLength(game?.projectiles) + arrayLength(game?.effects),
  });
}

function pathSnapshot(game) {
  const result = safeCall(() => game?.navigationState?.pathService?.metrics?.());
  const metrics = result.value;
  if (!metrics || typeof metrics !== 'object') {
    return Object.freeze({ available: false, error: result.error });
  }
  return Object.freeze({
    available: true,
    error: null,
    revision: finiteOrNull(metrics.revision),
    trackedRequests: integerOrZero(metrics.trackedRequests),
    cacheEntries: integerOrZero(metrics.cacheEntries),
    requests: integerOrZero(metrics.requests),
    searches: integerOrZero(metrics.searches),
    cacheHits: integerOrZero(metrics.cacheHits),
    cacheMisses: integerOrZero(metrics.cacheMisses),
    throttled: integerOrZero(metrics.throttled),
    failures: integerOrZero(metrics.failures),
    invalidations: integerOrZero(metrics.invalidations),
    evictions: integerOrZero(metrics.evictions),
  });
}

function aiSnapshot(game) {
  const result = safeCall(() => game?.tacticalAiSnapshot?.());
  const snapshot = result.value;
  if (!snapshot || typeof snapshot !== 'object') {
    return Object.freeze({ available: false, error: result.error });
  }
  const cadence = snapshot.blackboard?.cadence ?? {};
  const summary = snapshot.blackboard?.summary ?? {};
  return Object.freeze({
    available: true,
    error: null,
    enabled: snapshot.enabled !== false,
    tick: integerOrZero(snapshot.tick),
    decisionIndex: integerOrZero(cadence.decisionIndex),
    lastDecisionTick: finiteOrNull(cadence.lastDecisionTick),
    nextDecisionTick: finiteOrNull(cadence.nextDecisionTick),
    intervalTicks: finiteOrNull(cadence.intervalTicks),
    knownContacts: integerOrZero(summary.knownContacts),
    activeGoals: integerOrZero(summary.activeGoals),
    assignedCommands: integerOrZero(snapshot.commandMetrics?.assigned),
  });
}

function audioSnapshot(candidate) {
  const result = safeCall(() => typeof candidate === 'function' ? candidate() : candidate);
  const snapshot = result.value;
  if (!snapshot || typeof snapshot !== 'object') {
    return Object.freeze({ available: false, error: result.error });
  }
  return Object.freeze({
    available: snapshot.available !== false,
    error: null,
    status: typeof snapshot.status === 'string' ? snapshot.status : 'unknown',
    activeVoices: integerOrZero(snapshot.activeVoiceCount ?? snapshot.voices?.length),
    maximumVoices: integerOrZero(snapshot.maxVoices),
    paused: Boolean(snapshot.paused),
    muted: Boolean(snapshot.master?.muted),
  });
}

function commandSnapshot(game) {
  const entities = [
    ...(Array.isArray(game?.units) ? game.units : []),
    ...(Array.isArray(game?.buildings) ? game.buildings : []),
  ];
  const activeByKind = {};
  for (const entity of entities) {
    const kind = entity?.order?.kind;
    if (typeof kind !== 'string' || !kind) continue;
    activeByKind[kind] = (activeByKind[kind] ?? 0) + 1;
  }
  const selectedIds = new Set(game?.selected instanceof Set ? [...game.selected].map(String) : []);
  const selectedOrders = entities
    .filter((entity) => selectedIds.has(String(entity?.id)))
    .map((entity) => Object.freeze({
      id: String(entity.id),
      kind: entity.order?.kind ?? null,
      targetId: entity.order?.target?.id == null ? null : String(entity.order.target.id),
      x: finiteOrNull(entity.order?.x),
      y: finiteOrNull(entity.order?.y),
    }))
    .sort((left, right) => left.id.localeCompare(right.id, undefined, { numeric: true }));
  return deepFreeze({
    activeByKind,
    selectedOrders,
    pendingBuild: game?.pendingBuild?.type ?? game?.pendingBuild ?? null,
    lastError: typeof game?.lastError === 'string' ? game.lastError : '',
    pressedKeys: game?.keys instanceof Set ? [...game.keys].map(String).sort() : [],
    targetingMode: Boolean(game?.mouse?.attackMove),
  });
}

function memorySnapshot(entities, path, heap) {
  const estimatedBytes =
    entities.units * MEMORY_PROXY_WEIGHTS.unit +
    entities.buildings * MEMORY_PROXY_WEIGHTS.building +
    entities.nodes * MEMORY_PROXY_WEIGHTS.node +
    entities.projectiles * MEMORY_PROXY_WEIGHTS.projectile +
    entities.effects * MEMORY_PROXY_WEIGHTS.effect +
    entities.selected * MEMORY_PROXY_WEIGHTS.selected +
    (path.available ? path.cacheEntries * MEMORY_PROXY_WEIGHTS.pathCacheEntry : 0) +
    (path.available ? path.trackedRequests * MEMORY_PROXY_WEIGHTS.pathRequest : 0);
  const source = heap && typeof heap === 'object' ? heap : null;
  return Object.freeze({
    estimatedBytes,
    heapAvailable: Boolean(source),
    usedHeapBytes: finiteOrNull(source?.usedJSHeapSize),
    totalHeapBytes: finiteOrNull(source?.totalJSHeapSize),
    heapLimitBytes: finiteOrNull(source?.jsHeapSizeLimit),
  });
}

function clockSnapshot(clock = {}) {
  return Object.freeze({
    tick: integerOrZero(clock.tick),
    steps: integerOrZero(clock.steps),
    interpolationAlpha: finiteOrNull(clock.interpolationAlpha),
    acceptedMs: nonNegativeFinite((clock.acceptedSeconds ?? 0) * 1000, 'Accepted simulation time'),
    discardedMs: nonNegativeFinite((clock.discardedSeconds ?? 0) * 1000, 'Discarded simulation time'),
  });
}

export function createPerformanceProfiler({
  historyLimit = DEFAULT_PERFORMANCE_HISTORY_LIMIT,
  sampleIntervalMs = DEFAULT_PERFORMANCE_SAMPLE_INTERVAL_MS,
} = {}) {
  const maximumSamples = positiveInteger(historyLimit, 'Performance history limit');
  const minimumSampleIntervalMs = nonNegativeFinite(sampleIntervalMs, 'Performance sample interval');
  const frames = [];
  let sequence = 0;
  let framesObserved = 0;
  let latest = null;

  function reset() {
    frames.length = 0;
    sequence = 0;
    framesObserved = 0;
    latest = null;
  }

  function recordFrame({
    frameAt,
    frameDeltaMs,
    totalMs,
    simulationMs = 0,
    renderMs = 0,
    uiMs = 0,
    clock = {},
    game = null,
    audio = null,
    heap = null,
  } = {}) {
    const sample = Object.freeze({
      frameAt: nonNegativeFinite(frameAt, 'Frame timestamp'),
      frameDeltaMs: nonNegativeFinite(frameDeltaMs, 'Frame delta'),
      totalMs: nonNegativeFinite(totalMs, 'Measured frame time'),
      simulationMs: nonNegativeFinite(simulationMs, 'Simulation time'),
      renderMs: nonNegativeFinite(renderMs, 'Render time'),
      uiMs: nonNegativeFinite(uiMs, 'UI time'),
    });
    frames.push(sample);
    framesObserved += 1;
    if (frames.length > maximumSamples) frames.splice(0, frames.length - maximumSamples);
    if (latest && sample.frameAt - latest.sampledAt < minimumSampleIntervalMs) return latest;

    const frame = summarize(frames, 'frameDeltaMs');
    const entities = entitySnapshot(game);
    const path = pathSnapshot(game);
    latest = deepFreeze({
      version: PERFORMANCE_PROFILER_VERSION,
      sequence: sequence += 1,
      framesObserved,
      sampledAt: sample.frameAt,
      historySize: frames.length,
      frame: {
        ...frame,
        measuredMs: sample.totalMs,
        fps: frame.averageMs > 0 ? 1000 / frame.averageMs : 0,
      },
      simulation: summarize(frames, 'simulationMs'),
      render: summarize(frames, 'renderMs'),
      ui: summarize(frames, 'uiMs'),
      clock: clockSnapshot(clock),
      entities,
      path,
      ai: aiSnapshot(game),
      audio: audioSnapshot(audio),
      memory: memorySnapshot(entities, path, heap),
      seed: game?.simulationSeed ?? null,
      commands: commandSnapshot(game),
    });
    return latest;
  }

  function snapshot() {
    return latest;
  }

  return Object.freeze({ recordFrame, reset, snapshot });
}

function displayFinite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function displayNumber(value, digits = 1) {
  return displayFinite(value).toFixed(digits);
}

function displayBytes(value) {
  const bytes = Math.max(0, displayFinite(value));
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 ** 2) return `${displayNumber(bytes / 1024)} KiB`;
  return `${displayNumber(bytes / 1024 ** 2)} MiB`;
}

function unavailable(record) {
  return !record?.available ? `unavailable${record?.error ? ` (${record.error})` : ''}` : null;
}

function commandLine(commands) {
  const active = Object.entries(commands?.activeByKind ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([kind, count]) => `${kind}:${count}`)
    .join(' ');
  const selected = (commands?.selectedOrders ?? [])
    .map((order) => `${order.id}:${order.kind ?? 'idle'}`)
    .join(' ');
  return `orders ${active || 'none'}\nselected ${selected || 'none'}\npending ${commands?.pendingBuild ?? 'none'} | error ${commands?.lastError || 'none'}`;
}

export function formatPerformanceSnapshot(snapshot) {
  if (!snapshot) return 'Waiting for first frame…';
  const pathUnavailable = unavailable(snapshot.path);
  const aiUnavailable = unavailable(snapshot.ai);
  const audioUnavailable = unavailable(snapshot.audio);
  const memory = snapshot.memory ?? {};
  return [
    `FPS ${displayNumber(snapshot.frame?.fps)} | frame ${displayNumber(snapshot.frame?.lastMs)} ms | p95 ${displayNumber(snapshot.frame?.p95Ms)} ms`,
    `sim ${displayNumber(snapshot.simulation?.lastMs)} ms | render ${displayNumber(snapshot.render?.lastMs)} ms | UI ${displayNumber(snapshot.ui?.lastMs)} ms`,
    `tick ${snapshot.clock?.tick ?? 0} | steps ${snapshot.clock?.steps ?? 0} | discarded ${displayNumber(snapshot.clock?.discardedMs)} ms`,
    `entities ${snapshot.entities?.total ?? 0} | units ${snapshot.entities?.units ?? 0} | buildings ${snapshot.entities?.buildings ?? 0} | projectiles ${snapshot.entities?.projectiles ?? 0} | effects ${snapshot.entities?.effects ?? 0}`,
    pathUnavailable ?? `path requests ${snapshot.path.trackedRequests} | cache ${snapshot.path.cacheEntries} | hit/miss ${snapshot.path.cacheHits}/${snapshot.path.cacheMisses} | throttled ${snapshot.path.throttled}`,
    aiUnavailable ?? `AI tick ${snapshot.ai.tick} | decisions ${snapshot.ai.decisionIndex} | next ${snapshot.ai.nextDecisionTick ?? 'n/a'} | contacts ${snapshot.ai.knownContacts}`,
    audioUnavailable ?? `audio ${snapshot.audio.status} | voices ${snapshot.audio.activeVoices}/${snapshot.audio.maximumVoices}`,
    `memory proxy ${displayBytes(memory.estimatedBytes)}${memory.heapAvailable ? ` | heap ${displayBytes(memory.usedHeapBytes)}` : ''}`,
    `seed ${snapshot.seed ?? 'unavailable'}`,
    commandLine(snapshot.commands),
  ].join('\n');
}
