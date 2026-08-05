import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPerformanceProfiler,
  formatPerformanceSnapshot,
  PERFORMANCE_OVERLAY_DIAGNOSTIC,
} from '../../src/app/performance-profiler.js';
import { createGameRuntime, installPerformanceDebugOverlay } from '../../src/app/runtime.js';
import { deriveSimulationSeed } from '../../src/core/random.js';

function gameFixture() {
  return {
    units: [
      { id: 2, hp: 100, order: { kind: 'move', x: 40, y: 50 } },
      { id: 1, hp: 0, order: null },
    ],
    buildings: [{ id: 3, hp: 500, order: { kind: 'produce' } }],
    nodes: [{}, {}], projectiles: [{}], effects: [{}, {}, {}],
    selected: new Set([2, 3]), keys: new Set(['Shift', 'a']),
    mouse: { attackMove: true }, pendingBuild: { type: 'barracks' },
    lastError: 'blocked', simulationSeed: 42,
    navigationState: { pathService: { metrics: () => ({ trackedRequests: 3, cacheEntries: 5, cacheHits: 5, cacheMisses: 7, throttled: 2 }) } },
    tacticalAiSnapshot: () => ({
      tick: 90,
      blackboard: { cadence: { decisionIndex: 6, nextDecisionTick: 90 }, summary: { knownContacts: 4 } },
      commandMetrics: { assigned: 3 },
    }),
  };
}

function record(profiler, overrides = {}) {
  return profiler.recordFrame({
    frameAt: 100, frameDeltaMs: 16, totalMs: 8,
    simulationMs: 3, renderMs: 4, uiMs: 1,
    clock: { tick: 12, steps: 1, interpolationAlpha: 0.25, acceptedSeconds: 0.016, discardedSeconds: 0 },
    game: gameFixture(),
    audio: () => ({ status: 'running', activeVoiceCount: 4, maxVoices: 32, master: { muted: false } }),
    heap: { usedJSHeapSize: 1000, totalJSHeapSize: 2000, jsHeapSizeLimit: 4000 },
    ...overrides,
  });
}

test('profiler projects immutable required diagnostics', () => {
  const snapshot = record(createPerformanceProfiler({ sampleIntervalMs: 0 }));
  assert.equal(snapshot.frame.fps, 62.5);
  assert.equal(snapshot.simulation.lastMs, 3);
  assert.deepEqual(snapshot.entities, {
    units: 2, livingUnits: 1, buildings: 1, livingBuildings: 1,
    nodes: 2, projectiles: 1, effects: 3, selected: 2, total: 9,
  });
  assert.equal(snapshot.path.cacheEntries, 5);
  assert.equal(snapshot.ai.decisionIndex, 6);
  assert.equal(snapshot.audio.activeVoices, 4);
  assert.equal(snapshot.memory.heapAvailable, true);
  assert.equal(snapshot.seed, 42);
  assert.deepEqual(snapshot.commands.activeByKind, { move: 1, produce: 1 });
  assert.deepEqual(snapshot.commands.selectedOrders.map(({ id, kind }) => [id, kind]), [['2', 'move'], ['3', 'produce']]);
  assert.ok(Object.isFrozen(snapshot));
});

test('profiler retains bounded frame history while throttling detailed snapshots', () => {
  const profiler = createPerformanceProfiler({ historyLimit: 3, sampleIntervalMs: 250 });
  const first = record(profiler, { frameAt: 100, frameDeltaMs: 10 });
  assert.equal(record(profiler, { frameAt: 200, frameDeltaMs: 20 }), first);
  record(profiler, { frameAt: 300, frameDeltaMs: 30 });
  const next = record(profiler, { frameAt: 350, frameDeltaMs: 40 });
  assert.equal(next.framesObserved, 4);
  assert.equal(next.historySize, 3);
  assert.equal(next.frame.averageMs, 30);
  assert.equal(next.frame.p95Ms, 40);
  profiler.reset();
  assert.equal(profiler.snapshot(), null);
});

test('optional diagnostics fail closed and formatting exposes unavailable state', () => {
  const game = {
    units: [], buildings: [], selected: new Set(),
    navigationState: { pathService: { metrics() { throw new Error('path denied'); } } },
    tacticalAiSnapshot() { throw new Error('AI denied'); },
  };
  const snapshot = record(createPerformanceProfiler({ sampleIntervalMs: 0 }), {
    game, audio() { throw new Error('audio denied'); }, heap: null,
  });
  assert.deepEqual(snapshot.path, { available: false, error: 'path denied' });
  assert.deepEqual(snapshot.ai, { available: false, error: 'AI denied' });
  assert.deepEqual(snapshot.audio, { available: false, error: 'audio denied' });
  assert.match(formatPerformanceSnapshot(snapshot), /unavailable \(path denied\)/);
  assert.match(formatPerformanceSnapshot(snapshot), /seed unavailable/);
});

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase(); this.children = []; this.dataset = {};
    this.attributes = {}; this.listeners = new Map(); this.hidden = false;
    this.textContent = ''; this.removed = false;
  }
  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  dispatch(type, event = {}) { this.listeners.get(type)?.(event); }
  remove() { this.removed = true; }
}
class FakeDocument {
  constructor() { this.head = new FakeElement('head'); this.body = new FakeElement('body'); }
  createElement(tagName) { return new FakeElement(tagName); }
}
class FakeWindow {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type, listener) { if (this.listeners.get(type) === listener) this.listeners.delete(type); }
  dispatch(type, event) { this.listeners.get(type)?.(event); }
}

function displaySnapshot(sampledAt = 100, seed = 7) {
  return {
    sampledAt, frame: { fps: 60, lastMs: 16.7, p95Ms: 20 },
    simulation: { lastMs: 4 }, render: { lastMs: 7 }, ui: { lastMs: 2 },
    clock: { tick: 30, steps: 1, discardedMs: 0 },
    entities: { total: 10, units: 5, buildings: 2, projectiles: 1, effects: 2 },
    path: { available: false }, ai: { available: false }, audio: { available: false },
    memory: { estimatedBytes: 2048, heapAvailable: false }, seed,
    commands: { activeByKind: { move: 2 }, selectedOrders: [], pendingBuild: null, lastError: '' },
  };
}

test('F3 overlay mounts hidden, ignores editable targets, updates, and restores lifecycle exactly', () => {
  const documentTarget = new FakeDocument();
  const windowTarget = new FakeWindow();
  const previous = { existing: true };
  windowTarget[PERFORMANCE_OVERLAY_DIAGNOSTIC] = previous;
  let current = displaySnapshot();
  const overlay = installPerformanceDebugOverlay({
    profiler: { snapshot: () => current }, documentTarget, windowTarget, updateIntervalMs: 250,
  });
  const root = documentTarget.body.children[0];
  const output = root.children[1];
  assert.equal(root.hidden, true);
  windowTarget.dispatch('keydown', { key: 'F3', target: root, preventDefault() {} });
  assert.equal(root.hidden, false);
  windowTarget.dispatch('keydown', { key: 'F3', target: { tagName: 'INPUT' }, preventDefault() { throw new Error('must ignore'); } });
  assert.equal(overlay.visible(), true);
  current = displaySnapshot(400, 9);
  assert.equal(overlay.update(current, 400), true);
  assert.match(output.textContent, /seed 9/);
  assert.equal(overlay.dispose(), true);
  assert.equal(overlay.dispose(), false);
  assert.equal(root.removed, true);
  assert.equal(windowTarget[PERFORMANCE_OVERLAY_DIAGNOSTIC], previous);
  assert.equal(windowTarget.listeners.has('keydown'), false);
});

function timedNow(values) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

test('runtime measures phases, samples composition audio, and tears down/restarts the overlay', () => {
  const scheduled = []; const records = []; const cancelled = [];
  let installs = 0; let disposals = 0; let resets = 0;
  const game = {
    mission: { waves: { firstDelay: 9 } },
    update() {},
    start() { this.mission = { waves: { firstDelay: 9 } }; },
  };
  const windowTarget = { __fieldsOfResolveComposition: { audio: () => ({ mixer: { status: 'running', activeVoiceCount: 5, maxVoices: 32 } }) } };
  const runtime = createGameRuntime({
    game, renderer: { render() {} }, ui: { refresh() {}, setMission() {}, toast() {} },
    windowTarget, documentTarget: null,
    simulationStepSeconds: 0.01, maxFrameDeltaSeconds: 0.1,
    now: timedNow([0, 1, 2, 5, 8, 9, 13, 14, 16, 20, 21]),
    requestFrame(callback) { scheduled.push(callback); return scheduled.length; },
    cancelFrame(handle) { cancelled.push(handle); },
    performanceProfiler: {
      recordFrame(value) { records.push(value); return { sampledAt: value.frameAt }; },
      reset() { resets += 1; }, snapshot: () => null,
    },
    installDebugOverlay() { installs += 1; return { update() {}, dispose() { disposals += 1; } }; },
    heapSnapshot: () => ({ usedJSHeapSize: 123 }),
  });
  runtime.start();
  scheduled[0](20);
  assert.deepEqual([records[0].frameDeltaMs, records[0].simulationMs, records[0].renderMs, records[0].uiMs, records[0].totalMs], [19, 3, 4, 2, 18]);
  assert.equal(records[0].audio().activeVoiceCount, 5);
  assert.equal(runtime.stop(), true);
  assert.deepEqual(cancelled, [2]);
  runtime.start();
  assert.equal(installs, 2);
  assert.equal(disposals, 1);
  runtime.startMission(2, 100);
  assert.equal(game.simulationSeed, deriveSimulationSeed(100, 2));
  assert.equal(resets, 1);
});

test('restricted heap access does not interrupt the frame loop', () => {
  const scheduled = []; const records = [];
  const runtime = createGameRuntime({
    game: { mission: null, start() {} }, renderer: { render() {} },
    ui: { refresh() {}, setMission() {}, toast() {} }, now: () => 10,
    requestFrame(callback) { scheduled.push(callback); return scheduled.length; }, cancelFrame() {},
    performanceProfiler: { recordFrame(value) { records.push(value); return {}; }, reset() {}, snapshot: () => null },
    installDebugOverlay: () => ({ update() {}, dispose() {} }),
    heapSnapshot() { throw new Error('restricted'); },
  });
  runtime.start();
  assert.doesNotThrow(() => scheduled[0](20));
  assert.equal(records[0].heap, null);
  assert.equal(scheduled.length, 2);
});

test('invalid profiler and runtime adapter contracts are rejected', () => {
  assert.throws(() => createPerformanceProfiler({ historyLimit: 0 }), /positive integer/);
  const shared = { game: {}, renderer: {}, ui: {}, now: () => 0, requestFrame: () => 1, cancelFrame() {} };
  assert.throws(() => createGameRuntime({ ...shared, performanceProfiler: {} }), /performance profiler/);
  assert.throws(() => createGameRuntime({ ...shared, installDebugOverlay: null }), /installer/);
  assert.throws(() => createGameRuntime({ ...shared, audioSnapshot: null }), /audioSnapshot/);
  assert.throws(() => createGameRuntime({ ...shared, heapSnapshot: null }), /heapSnapshot/);
});
