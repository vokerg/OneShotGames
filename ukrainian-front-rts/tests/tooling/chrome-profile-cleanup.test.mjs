import assert from 'node:assert/strict';
import test from 'node:test';

import { removeChromeProfileWithRetry } from '../../scripts/lib/chrome-profile-cleanup.mjs';

function errorWithCode(code) {
  return Object.assign(new Error(code), { code });
}

test('Chrome profile cleanup retries transient profile locks', async () => {
  const attempts = [];
  const delays = [];
  const result = await removeChromeProfileWithRetry('/tmp/profile', {
    remove: async (_profile, options) => {
      attempts.push(options);
      if (attempts.length === 1) throw errorWithCode('ENOTEMPTY');
      if (attempts.length === 2) throw errorWithCode('EBUSY');
      if (attempts.length === 3) throw errorWithCode('EPERM');
    },
    delayFn: async (milliseconds) => { delays.push(milliseconds); },
    attempts: 5,
    retryDelayMs: 25,
  });

  assert.equal(result.attempts, 4);
  assert.equal(attempts.length, 4);
  assert.deepEqual(delays, [25, 50, 75]);
  assert.ok(attempts.every((options) => options.recursive && options.force));
});

test('Chrome profile cleanup fails immediately for non-transient errors', async () => {
  let attempts = 0;
  const failure = errorWithCode('EACCES');

  await assert.rejects(
    removeChromeProfileWithRetry('/tmp/profile', {
      remove: async () => {
        attempts += 1;
        throw failure;
      },
      delayFn: async () => assert.fail('non-transient failure must not delay/retry'),
    }),
    (error) => error === failure,
  );
  assert.equal(attempts, 1);
});

test('Chrome profile cleanup rethrows the final transient failure after its retry budget', async () => {
  let attempts = 0;
  const delays = [];

  await assert.rejects(
    removeChromeProfileWithRetry('/tmp/profile', {
      remove: async () => {
        attempts += 1;
        throw errorWithCode('ENOTEMPTY');
      },
      delayFn: async (milliseconds) => { delays.push(milliseconds); },
      attempts: 3,
      retryDelayMs: 10,
    }),
    (error) => error.code === 'ENOTEMPTY',
  );
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [10, 20]);
});
