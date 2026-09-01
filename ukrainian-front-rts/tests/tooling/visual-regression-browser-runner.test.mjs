import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BrowserProcessError,
  runBrowserWithTimeoutRetry,
} from '../../scripts/lib/browser-process.mjs';

function browserFailure({ timedOut, message = 'browser failure' } = {}) {
  return new BrowserProcessError(message, {
    timedOut: timedOut === true,
    timeoutMs: 60_000,
    elapsedMs: timedOut ? 60_001 : 12,
    code: timedOut ? null : 1,
    signal: timedOut ? null : 'SIGTERM',
    stdout: 'partial stdout',
    stderr: 'diagnostic stderr',
  });
}

test('visual regression browser runner retries one transient timeout and preserves diagnostics', async () => {
  let calls = 0;
  const failures = [];
  const result = await runBrowserWithTimeoutRetry('chromium', ['--test'], {
    timeoutMs: 60_000,
    retries: 1,
    run: async () => {
      calls += 1;
      if (calls === 1) throw browserFailure({ timedOut: true, message: 'slow CI startup' });
      return { code: 0, signal: null, stdout: 'ready', stderr: '', elapsedMs: 9 };
    },
    onAttemptFailure: async (failure) => failures.push(failure),
  });

  assert.equal(calls, 2);
  assert.equal(result.attemptCount, 2);
  assert.equal(result.priorFailures.length, 1);
  assert.equal(result.priorFailures[0].retryable, true);
  assert.equal(result.priorFailures[0].details.stderr, 'diagnostic stderr');
  assert.deepEqual(failures, result.priorFailures);
});

test('visual regression browser runner does not retry a real browser exit failure', async () => {
  let calls = 0;
  await assert.rejects(
    runBrowserWithTimeoutRetry('chromium', ['--test'], {
      retries: 1,
      run: async () => {
        calls += 1;
        throw browserFailure({ timedOut: false, message: 'renderer crashed' });
      },
    }),
    (error) => {
      assert.equal(error.message, 'renderer crashed');
      assert.equal(error.attemptCount, 1);
      assert.equal(error.attempts.length, 1);
      assert.equal(error.attempts[0].retryable, false);
      return true;
    },
  );
  assert.equal(calls, 1);
});

test('visual regression browser runner remains bounded when the browser is genuinely hung', async () => {
  let calls = 0;
  await assert.rejects(
    runBrowserWithTimeoutRetry('chromium', ['--test'], {
      timeoutMs: 60_000,
      retries: 1,
      run: async () => {
        calls += 1;
        throw browserFailure({ timedOut: true, message: `timeout ${calls}` });
      },
    }),
    (error) => {
      assert.equal(error.message, 'timeout 2');
      assert.equal(error.attemptCount, 2);
      assert.equal(error.attempts.length, 2);
      assert.equal(error.attempts.every((failure) => failure.retryable), true);
      return true;
    },
  );
  assert.equal(calls, 2);
});
