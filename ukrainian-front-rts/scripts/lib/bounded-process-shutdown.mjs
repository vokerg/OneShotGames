export class ProcessShutdownError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ProcessShutdownError';
    this.details = details;
  }
}

export async function shutdownProcessBounded({
  label = 'process',
  isExited,
  sendSignal,
  waitForExit,
  gracefulTimeoutMs = 2_000,
  forcedTimeoutMs = 3_000,
} = {}) {
  if (typeof isExited !== 'function' || typeof sendSignal !== 'function' || typeof waitForExit !== 'function') {
    throw new TypeError('shutdownProcessBounded requires isExited, sendSignal, and waitForExit functions.');
  }

  const details = {
    label,
    gracefulTimeoutMs,
    forcedTimeoutMs,
    signals: [],
    gracefulExited: false,
    forcedExited: false,
  };

  if (isExited()) return { ...details, alreadyExited: true };

  try {
    details.signals.push({ signal: 'SIGTERM', accepted: sendSignal('SIGTERM') !== false });
  } catch (error) {
    details.signals.push({ signal: 'SIGTERM', accepted: false, error: error.message });
  }

  if (!isExited()) {
    details.gracefulExited = Boolean(await waitForExit(gracefulTimeoutMs));
  } else {
    details.gracefulExited = true;
  }
  if (details.gracefulExited || isExited()) return details;

  try {
    details.signals.push({ signal: 'SIGKILL', accepted: sendSignal('SIGKILL') !== false });
  } catch (error) {
    details.signals.push({ signal: 'SIGKILL', accepted: false, error: error.message });
  }

  if (!isExited()) {
    details.forcedExited = Boolean(await waitForExit(forcedTimeoutMs));
  } else {
    details.forcedExited = true;
  }
  if (details.forcedExited || isExited()) return details;

  throw new ProcessShutdownError(
    `${label} did not exit after SIGTERM (${gracefulTimeoutMs}ms) and SIGKILL (${forcedTimeoutMs}ms).`,
    details,
  );
}
