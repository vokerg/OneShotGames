import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RUNTIME_DIAGNOSTICS_GLOBAL,
  RuntimeInvariantError,
  assertRuntimeInvariant,
  collectRuntimeRecoveryData,
  createRuntimeDebugReport,
  createRuntimeDiagnostics,
  createRuntimeRecoveryBundle,
  resetRuntimeRecoveryData,
  serializeRuntimeRecoveryBundle,
} from '../../src/app/diagnostics.js';

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()].sort()[index] ?? null; },
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
    snapshot() { return Object.fromEntries([...values.entries()].sort()); },
  };
}

class FakeWindow extends EventTarget {
  constructor() {
    super();
    this.location = { reloadCalls: 0, reload: () => { this.location.reloadCalls += 1; } };
  }
}

class WindowErrorEvent extends Event {
  constructor(error) {
    super('error');
    this.error = error;
    this.message = error?.message ?? String(error);
  }
}

class RejectionEvent extends Event {
  constructor(reason) {
    super('unhandledrejection', { cancelable: true });
    this.reason = reason;
  }
}

test('runtime invariant failures use an explicit error type and preserve details', () => {
  assert.equal(assertRuntimeInvariant(true, 'unused'), true);
  assert.throws(
    () => assertRuntimeInvariant(false, 'Simulation owner missing.', { module: 'runtime' }),
    (error) => {
      assert.ok(error instanceof RuntimeInvariantError);
      assert.equal(error.message, 'Simulation owner missing.');
      assert.deepEqual(error.details, { module: 'runtime' });
      return true;
    },
  );
});

test('debug reports are bounded, deterministic, and exclude browser identity fields', () => {
  const error = new Error('x'.repeat(4_000));
  error.stack = 's'.repeat(20_000);
  const report = createRuntimeDebugReport({
    error,
    phase: 'simulation-step',
    now: () => 12345,
    game: {
      mission: { id: 'donbas' },
      missionIndex: 0,
      simulationSeed: 77,
      time: 12.5,
      units: [{}, {}],
      buildings: [{}],
      projectiles: [],
      effects: [{}],
      lastError: 'command rejected',
    },
    composition: { installedModules: () => ['runtime', 'ui'] },
    performance: { snapshot: () => ({
      sequence: 4,
      frame: { p95Ms: 18 },
      simulation: { p95Ms: 3 },
      render: { p95Ms: 7 },
      entities: { total: 4 },
    }) },
  });

  assert.equal(report.capturedAt, 12345);
  assert.equal(report.runtime.missionId, 'donbas');
  assert.deepEqual(report.composition.installedModules, ['runtime', 'ui']);
  assert.equal(report.performance.frameP95Ms, 18);
  assert.ok(report.error.message.length <= 2_000);
  assert.ok(report.error.stack.length <= 12_000);
  assert.equal(Object.isFrozen(report), true);
  assert.equal('userAgent' in report, false);
  assert.equal('location' in report, false);
});

test('recovery export includes only Fields of Resolve local data', () => {
  const storage = createStorage({
    'fields-of-resolve:campaign-save:autosave': '{"version":1}',
    'fields-of-resolve:accessibility': '{"uiScale":1}',
    'another-application:key': 'do-not-export',
  });
  const data = collectRuntimeRecoveryData(storage);
  assert.equal(data.available, true);
  assert.deepEqual(Object.keys(data.entries), [
    'fields-of-resolve:accessibility',
    'fields-of-resolve:campaign-save:autosave',
  ]);

  const report = createRuntimeDebugReport({ error: new Error('failure'), now: () => 100 });
  const bundle = createRuntimeRecoveryBundle({ report, storage, now: () => 200 });
  const serialized = serializeRuntimeRecoveryBundle(bundle);
  assert.equal(bundle.exportedAt, 200);
  assert.equal(serialized.endsWith('\n'), true);
  assert.doesNotMatch(serialized, /another-application/);
  assert.deepEqual(JSON.parse(serialized), bundle);
});

test('reset removes only application-owned keys', () => {
  const storage = createStorage({
    'fields-of-resolve:campaign-save:slot-1': 'save',
    'fields-of-resolve:audio': 'settings',
    unrelated: 'keep',
  });
  assert.equal(resetRuntimeRecoveryData(storage), 2);
  assert.deepEqual(storage.snapshot(), { unrelated: 'keep' });
});

test('diagnostics capture window errors and prevent unhandled rejection leakage', () => {
  const windowTarget = new FakeWindow();
  const rendered = [];
  const diagnostics = createRuntimeDiagnostics({
    windowTarget,
    documentTarget: null,
    storage: createStorage(),
    now: () => 300,
    renderFatal(model) {
      rendered.push(model);
      return () => rendered.push({ removed: true });
    },
    copyText: async () => true,
    downloadText: async () => true,
  });

  const dispose = diagnostics.install();
  assert.equal(typeof windowTarget[RUNTIME_DIAGNOSTICS_GLOBAL].snapshot, 'function');
  windowTarget.dispatchEvent(new WindowErrorEvent(new Error('window boom')));
  assert.equal(rendered[0].report.phase, 'window-error');

  const rejection = new RejectionEvent(new Error('promise boom'));
  windowTarget.dispatchEvent(rejection);
  assert.equal(rejection.defaultPrevented, true);
  assert.equal(rendered[2].report.phase, 'unhandled-rejection');
  assert.equal(diagnostics.snapshot().fatal, true);

  assert.equal(dispose(), true);
  assert.equal(RUNTIME_DIAGNOSTICS_GLOBAL in windowTarget, false);
});

test('export-and-reset never deletes data when export fails', async () => {
  const storage = createStorage({ 'fields-of-resolve:campaign-save:autosave': 'save' });
  const windowTarget = new FakeWindow();
  const downloads = [];
  let failDownload = true;
  const diagnostics = createRuntimeDiagnostics({
    windowTarget,
    documentTarget: null,
    storage,
    now: () => 400,
    renderFatal: () => () => {},
    copyText: async () => true,
    downloadText: async (filename, text) => {
      downloads.push({ filename, text });
      if (failDownload) throw new Error('download blocked');
    },
  });
  diagnostics.showFatal(new Error('fatal'), 'test');

  await assert.rejects(() => diagnostics.actions.exportAndReset(), /download blocked/);
  assert.equal(storage.getItem('fields-of-resolve:campaign-save:autosave'), 'save');

  failDownload = false;
  const message = await diagnostics.actions.exportAndReset();
  assert.match(message, /Reset 1 local data entries/);
  assert.equal(storage.getItem('fields-of-resolve:campaign-save:autosave'), null);
  assert.equal(downloads.length, 2);
});
