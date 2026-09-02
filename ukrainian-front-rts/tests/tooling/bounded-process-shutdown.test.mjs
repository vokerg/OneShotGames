import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ProcessShutdownError,
  shutdownProcessBounded,
} from '../../scripts/lib/bounded-process-shutdown.mjs';

function createHarness(waitResults = []) {
  let exited = false;
  const signals = [];
  const waits = [];
  return {
    signals,
    waits,
    markExited: () => { exited = true; },
    options: {
      label: 'chromium',
      isExited: () => exited,
      sendSignal: (signal) => {
        signals.push(signal);
        return true;
      },
      waitForExit: async (timeoutMs) => {
        waits.push(timeoutMs);
        const result = waitResults.shift() ?? false;
        if (result) exited = true;
        return result;
      },
    },
  };
}

test('bounded process shutdown returns immediately when the child already exited', async () => {
  const harness = createHarness();
  harness.markExited();
  const result = await shutdownProcessBounded(harness.options);

  assert.equal(result.alreadyExited, true);
  assert.deepEqual(harness.signals, []);
  assert.deepEqual(harness.waits, []);
});

test('bounded process shutdown accepts graceful SIGTERM exit', async () => {
  const harness = createHarness([true]);
  const result = await shutdownProcessBounded(harness.options);

  assert.deepEqual(harness.signals, ['SIGTERM']);
  assert.deepEqual(harness.waits, [2_000]);
  assert.equal(result.gracefulExited, true);
  assert.equal(result.forcedExited, false);
});

test('bounded process shutdown waits again after SIGKILL', async () => {
  const harness = createHarness([false, true]);
  const result = await shutdownProcessBounded(harness.options);

  assert.deepEqual(harness.signals, ['SIGTERM', 'SIGKILL']);
  assert.deepEqual(harness.waits, [2_000, 3_000]);
  assert.equal(result.gracefulExited, false);
  assert.equal(result.forcedExited, true);
});

test('bounded process shutdown reports a genuinely stuck child after both waits', async () => {
  const harness = createHarness([false, false]);

  await assert.rejects(
    shutdownProcessBounded(harness.options),
    (error) => {
      assert.equal(error instanceof ProcessShutdownError, true);
      assert.match(error.message, /did not exit after SIGTERM/);
      assert.deepEqual(error.details.signals.map(({ signal }) => signal), ['SIGTERM', 'SIGKILL']);
      assert.equal(error.details.gracefulExited, false);
      assert.equal(error.details.forcedExited, false);
      return true;
    },
  );
  assert.deepEqual(harness.waits, [2_000, 3_000]);
});
