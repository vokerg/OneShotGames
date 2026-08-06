import { createSimulationHarness } from './simulation-harness.js';
import {
  assertReplayCompatibility,
  checksumReplayState,
  compareReplayChecksum,
  createReplayDefectReport,
  createReplayHeader,
  createReplayRecorder,
  createReplayTimeline,
  stableReplayStringify,
  validateReplay,
} from '../core/replay.js';

function integer(value, label, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) throw new RangeError(`${label} must be an integer >= ${minimum}`);
  return value;
}

function currentState(harness) {
  return harness.snapshot();
}

function commandResultDivergence(event, actualResult) {
  if (event.result === undefined || stableReplayStringify(event.result) === stableReplayStringify(actualResult)) return null;
  return Object.freeze({
    tick: event.tick,
    label: 'command-result',
    expected: checksumReplayState(event.result),
    actual: checksumReplayState(actualResult),
    diverged: true,
    command: event.command,
  });
}

export function createReplaySimulationRuntime({
  harness = createSimulationHarness(),
  gameVersion,
  buildCommit = 'unknown',
  contentVersion = 'unknown',
  checksumIntervalTicks = 30,
  metadata = {},
} = {}) {
  if (!harness || typeof harness.startScenario !== 'function' || typeof harness.issueCommand !== 'function') {
    throw new TypeError('harness must provide the simulation-harness contract');
  }
  integer(checksumIntervalTicks, 'checksumIntervalTicks', 1);
  let recorder = null;
  let lastChecksumTick = -1;

  function requireRecorder() {
    if (!recorder) throw new Error('Start replay recording before using the runtime');
    return recorder;
  }

  function recordChecksum(state, label = 'simulation') {
    if (state.tick === lastChecksumTick) return null;
    lastChecksumTick = state.tick;
    return requireRecorder().recordChecksum(state.tick, state, label);
  }

  return Object.freeze({
    harness,
    startScenario({ missionIndex = 0, seed } = {}) {
      integer(seed, 'seed');
      const state = harness.startScenario({ missionIndex, seed });
      recorder = createReplayRecorder({
        header: createReplayHeader({
          gameVersion,
          buildCommit,
          contentVersion,
          seed,
          missionIndex,
          tickSeconds: harness.tickSeconds,
          viewport: harness.viewport,
          metadata: { ...metadata, derivedSimulationSeed: state.simulationSeed },
        }),
      });
      lastChecksumTick = -1;
      recordChecksum(state, 'initial-state');
      return state;
    },
    issueCommand(command) {
      const activeRecorder = requireRecorder();
      const tick = currentState(harness).tick;
      const result = harness.issueCommand(command);
      activeRecorder.recordCommand(tick, command, result);
      lastChecksumTick = -1;
      return result;
    },
    recordChoice(choice) {
      const event = requireRecorder().recordChoice(currentState(harness).tick, choice);
      lastChecksumTick = -1;
      return event;
    },
    advanceTicks(count = 1) {
      integer(count, 'count');
      let state = currentState(harness);
      for (let index = 0; index < count; index += 1) {
        state = harness.advanceTicks(1);
        if (state.tick % checksumIntervalTicks === 0) recordChecksum(state);
      }
      return state;
    },
    snapshot() {
      return currentState(harness);
    },
    finalize({ outcome } = {}) {
      const state = currentState(harness);
      recordChecksum(state, 'final-state');
      return requireRecorder().finalize({
        finalTick: state.tick,
        outcome: outcome ?? {
          gameOver: state.gameOver,
          outcome: state.outcome,
          endReason: state.endReason,
        },
      });
    },
  });
}

export function playReplay(replay, {
  harnessFactory = () => createSimulationHarness(),
  onChoice = () => {},
  gameVersion,
  contentVersion,
  stopOnDivergence = true,
  targetTick,
} = {}) {
  if (typeof harnessFactory !== 'function') throw new TypeError('harnessFactory must be a function');
  if (typeof onChoice !== 'function') throw new TypeError('onChoice must be a function');
  const normalized = gameVersion !== undefined || contentVersion !== undefined
    ? assertReplayCompatibility(replay, { gameVersion, contentVersion })
    : validateReplay(replay);
  const timeline = createReplayTimeline(normalized);
  const endTick = targetTick === undefined ? normalized.finalTick : integer(targetTick, 'targetTick');
  if (endTick > normalized.finalTick) throw new RangeError(`targetTick must be <= ${normalized.finalTick}`);
  const harness = harnessFactory(normalized.header);
  harness.startScenario({ missionIndex: normalized.header.missionIndex, seed: normalized.header.seed });
  const divergences = [];

  function addDivergence(divergence) {
    if (!divergence?.diverged) return false;
    divergences.push(divergence);
    return stopOnDivergence;
  }

  outer: for (let tick = 0; tick <= endTick; tick += 1) {
    for (const event of timeline.eventsAtTick(tick)) {
      if (event.type === 'command') {
        const result = harness.issueCommand(event.command);
        if (addDivergence(commandResultDivergence(event, result))) break outer;
      } else if (event.type === 'choice') {
        onChoice(event.choice, { tick, harness });
      } else {
        const comparison = compareReplayChecksum({
          tick,
          expected: event.checksum,
          actual: currentState(harness),
          label: event.label ?? 'simulation',
        });
        if (addDivergence(comparison)) break outer;
      }
    }
    if (tick < endTick) harness.advanceTicks(1);
  }

  const state = currentState(harness);
  const firstDivergence = divergences[0] ?? null;
  return Object.freeze({
    replay: normalized,
    harness,
    state,
    tick: state.tick,
    completed: state.tick === endTick && !firstDivergence,
    divergences: Object.freeze(divergences),
    defectReport: firstDivergence
      ? createReplayDefectReport({ replay: normalized, divergence: firstDivergence, actualState: state })
      : null,
  });
}

export function createReplayPlaybackSession(replay, options = {}) {
  const normalized = validateReplay(replay);
  let position = 0;
  let lastResult = null;

  function seek(tick) {
    integer(tick, 'tick');
    if (tick > normalized.finalTick) throw new RangeError(`tick must be <= ${normalized.finalTick}`);
    lastResult = playReplay(normalized, { ...options, targetTick: tick });
    position = lastResult.tick;
    return lastResult;
  }

  return Object.freeze({
    replay: normalized,
    get position() {
      return position;
    },
    get result() {
      return lastResult;
    },
    seek,
    scrub(progress) {
      if (!Number.isFinite(progress) || progress < 0 || progress > 1) throw new RangeError('progress must be between 0 and 1');
      return seek(Math.round(normalized.finalTick * progress));
    },
    step(delta = 1) {
      if (!Number.isInteger(delta)) throw new TypeError('delta must be an integer');
      return seek(Math.min(normalized.finalTick, Math.max(0, position + delta)));
    },
  });
}
