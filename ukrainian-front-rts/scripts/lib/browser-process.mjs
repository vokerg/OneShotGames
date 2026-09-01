import { spawn } from 'node:child_process';

export class BrowserProcessError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'BrowserProcessError';
    this.details = details;
  }
}

export function isBrowserTimeout(error) {
  return error instanceof BrowserProcessError && error.details?.timedOut === true;
}

export function runBrowserProcess(browser, arguments_, { timeoutMs = 45_000 } = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const startedAt = Date.now();
    const child = spawn(browser, arguments_, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    let settled = false;

    const snapshot = (extra = {}) => ({
      browser,
      arguments: [...arguments_],
      timeoutMs,
      elapsedMs: Date.now() - startedAt,
      code: null,
      signal: null,
      timedOut: false,
      stdout: Buffer.concat(stdout).toString(),
      stderr: Buffer.concat(stderr).toString(),
      ...extra,
    });

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback(value);
    };

    const timeout = setTimeout(() => {
      const details = snapshot({ timedOut: true });
      try {
        child.kill('SIGKILL');
      } catch (error) {
        details.killError = error.message;
      }
      finish(rejectRun, new BrowserProcessError(`Chrome exceeded ${timeoutMs}ms timeout.`, details));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.once('error', (error) => {
      finish(rejectRun, new BrowserProcessError(`Chrome failed to start: ${error.message}`, snapshot({ spawnError: error.message })));
    });
    child.once('exit', (code, signal) => {
      const result = snapshot({ code, signal });
      if (code === 0) {
        finish(resolveRun, result);
      } else {
        finish(rejectRun, new BrowserProcessError(`Chrome exited with ${code ?? signal}.`, result));
      }
    });
  });
}

export async function runBrowserWithTimeoutRetry(browser, arguments_, {
  timeoutMs = 45_000,
  retries = 0,
  run = runBrowserProcess,
  beforeAttempt = null,
  onAttemptFailure = null,
} = {}) {
  const failures = [];
  const maxAttempts = retries + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (beforeAttempt) await beforeAttempt(attempt);
    try {
      const result = await run(browser, arguments_, { timeoutMs });
      return {
        ...result,
        attemptCount: attempt,
        priorFailures: failures,
      };
    } catch (error) {
      const failure = {
        attempt,
        retryable: isBrowserTimeout(error),
        message: error.message,
        details: error.details ?? {},
      };
      failures.push(failure);
      if (onAttemptFailure) await onAttemptFailure(failure);

      if (!failure.retryable || attempt === maxAttempts) {
        error.attemptCount = attempt;
        error.attempts = failures;
        throw error;
      }
    }
  }

  throw new Error('Browser retry loop exhausted unexpectedly.');
}
