import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertReplayCompatibility,
  checksumReplayState,
  compareReplayChecksum,
  createReplayDefectReport,
  createReplayHeader,
  createReplayRecorder,
  createReplayTimeline,
  parseReplay,
  serializeReplay,
  stableReplayStringify,
  validateReplay,
} from '../../src/core/replay.js';
import {
  createReplayPlaybackSession,
  createReplaySimulationRuntime,
  playReplay,
} from '../../src/app/replay-runtime.js';

function createFakeHarness({ drift = 0 } = {}) {
  const state = {
    tick: 0,
    simulationSeed: 0,
    missionIndex: 0,
    counter: 0,
    gameOver: false,
    outcome: null,
    endReason: '',
  };
  return {
    tickSeconds: 1 / 30,
    viewport: Object.freeze({ width: 800, height: 600 }),
    startScenario({ missionIndex, seed }) {
      Object.assign(state, { tick: 0, simulationSeed: seed, missionIndex, counter: 0, gameOver: false, outcome: null, endReason: '' });
      return this.snapshot();
    },
    issueCommand(command) {
      if (command.type !== 'add') throw new Error(`unsupported ${command.type}`);
      state.counter += command.amount + drift;
      return { ok: true, value: state.counter, error: '' };
    },
    advanceTicks(count = 1) {
      state.tick += count;
      state.counter += count;
      return this.snapshot();
    },
    snapshot() {
      return { ...state };
    },
  };
}

function header() {
  return createReplayHeader({
    gameVersion: '1.2.3',
    buildCommit: 'abc1234',
    contentVersion: 'content-7',
    seed: 42,
    missionIndex: 0,
    tickSeconds: 1 / 30,
    viewport: { width: 800, height: 600 },
    metadata: { z: 2, a: 1 },
  });
}

test('canonical serialization and checksums ignore object insertion order', () => {
  const left = { z: [3, { b: 2, a: 1 }], a: true };
  const right = { a: true, z: [3, { a: 1, b: 2 }] };
  assert.equal(stableReplayStringify(left), stableReplayStringify(right));
  assert.equal(checksumReplayState(left), checksumReplayState(right));
  assert.match(checksumReplayState(left), /^[0-9a-f]{8}$/);
});

test('records commands choices checksums and round-trips a stable versioned replay', () => {
  const recorder = createReplayRecorder({ header: header() });
  recorder.recordChecksum(0, { counter: 0 }, 'initial');
  recorder.recordCommand(0, { type: 'add', amount: 2 }, { ok: true, value: 2, error: '' });
  recorder.recordChoice(1, { id: 'doctrine', value: 'mobile' });
  recorder.recordChecksum(2, { counter: 4 });
  const replay = recorder.finalize({ finalTick: 2, outcome: { winner: 'Ukraine' } });
  const serialized = serializeReplay(replay);

  assert.deepEqual(parseReplay(serialized), replay);
  assert.equal(serialized, serializeReplay(parseReplay(serialized)));
  assert.deepEqual(replay.events.map((event) => event.type), ['checksum', 'command', 'choice', 'checksum']);
  assert.ok(Object.isFrozen(replay));
  assert.throws(() => recorder.recordChoice(2, { id: 'late' }), /finalized/);
});

test('timeline supports deterministic tick lookup and scrubbing', () => {
  const recorder = createReplayRecorder({ header: header() });
  recorder.recordCommand(0, { type: 'add', amount: 1 });
  recorder.recordChoice(3, { id: 'branch', value: 'north' });
  const timeline = createReplayTimeline(recorder.finalize({ finalTick: 5 }));

  assert.equal(timeline.maxTick, 5);
  assert.equal(timeline.eventsAtTick(0).length, 1);
  assert.equal(timeline.eventsAtTick(1).length, 0);
  assert.equal(timeline.scrub(3).progress, 0.6);
  assert.deepEqual(timeline.scrub(3).events.map((event) => event.tick), [0, 3]);
  assert.throws(() => timeline.scrub(6), /<= 5/);
});

test('runtime recording replays to the same outcome and supports seek/step/scrub', () => {
  const runtime = createReplaySimulationRuntime({
    harness: createFakeHarness(),
    gameVersion: '1.2.3',
    buildCommit: 'abc1234',
    contentVersion: 'content-7',
    checksumIntervalTicks: 1,
  });
  runtime.startScenario({ missionIndex: 0, seed: 42 });
  runtime.issueCommand({ type: 'add', amount: 2 });
  runtime.advanceTicks(2);
  runtime.recordChoice({ id: 'doctrine', value: 'mobile' });
  runtime.issueCommand({ type: 'add', amount: 3 });
  const replay = runtime.finalize({ outcome: { winner: 'Ukraine' } });

  const choices = [];
  const playback = playReplay(replay, {
    harnessFactory: () => createFakeHarness(),
    gameVersion: '1.2.3',
    contentVersion: 'content-7',
    onChoice: (choice) => choices.push(choice),
  });
  assert.equal(playback.completed, true);
  assert.deepEqual(playback.divergences, []);
  assert.equal(playback.state.counter, runtime.snapshot().counter);
  assert.deepEqual(choices, [{ id: 'doctrine', value: 'mobile' }]);

  const session = createReplayPlaybackSession(replay, { harnessFactory: () => createFakeHarness() });
  assert.equal(session.seek(1).state.tick, 1);
  assert.equal(session.step(1).state.tick, 2);
  assert.equal(session.scrub(0).state.tick, 0);
  assert.equal(session.scrub(1).state.tick, replay.finalTick);
});

test('detects command or checksum divergence and exports a self-contained defect report', () => {
  const runtime = createReplaySimulationRuntime({
    harness: createFakeHarness(),
    gameVersion: '1.2.3',
    contentVersion: 'content-7',
    checksumIntervalTicks: 1,
  });
  runtime.startScenario({ missionIndex: 0, seed: 42 });
  runtime.issueCommand({ type: 'add', amount: 2 });
  runtime.advanceTicks(1);
  const replay = runtime.finalize();

  const playback = playReplay(replay, { harnessFactory: () => createFakeHarness({ drift: 1 }) });
  assert.equal(playback.completed, false);
  assert.equal(playback.divergences[0].label, 'command-result');
  assert.equal(playback.defectReport.schema, 'fields-of-resolve.replay-defect');
  assert.deepEqual(playback.defectReport.replay, replay);

  const comparison = compareReplayChecksum({ tick: 3, expected: checksumReplayState({ value: 1 }), actual: { value: 2 } });
  assert.equal(comparison.diverged, true);
  assert.equal(createReplayDefectReport({ replay, divergence: comparison }).divergence.tick, 3);
});

test('fails closed on malformed and incompatible replay data', () => {
  const recorder = createReplayRecorder({ header: header() });
  const replay = recorder.finalize({ finalTick: 0 });
  assert.deepEqual(assertReplayCompatibility(replay, { gameVersion: '1.2.3', contentVersion: 'content-7' }), replay);
  assert.throws(() => assertReplayCompatibility(replay, { gameVersion: '2.0.0' }), /incompatible/);
  assert.throws(() => validateReplay({ ...replay, version: 99 }), /Unsupported replay version/);
  assert.throws(() => parseReplay('{'), SyntaxError);
  assert.throws(() => createReplayHeader({ ...header(), seed: -1 }), /seed/);
});
