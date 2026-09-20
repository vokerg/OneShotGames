import { rm } from 'node:fs/promises';

const RETRYABLE_PROFILE_ERRORS = new Set(['ENOTEMPTY', 'EBUSY', 'EPERM']);
const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

export async function removeChromeProfileWithRetry(profile, {
  remove = rm,
  delayFn = delay,
  attempts = 5,
  retryDelayMs = 100,
} = {}) {
  if (!profile) throw new TypeError('Chrome profile path is required.');
  if (typeof remove !== 'function' || typeof delayFn !== 'function') {
    throw new TypeError('Chrome profile cleanup requires remove and delay functions.');
  }
  if (!Number.isInteger(attempts) || attempts < 1) throw new TypeError('Chrome profile cleanup attempts must be a positive integer.');

  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await remove(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: retryDelayMs });
      return Object.freeze({ profile, attempts: attempt });
    } catch (error) {
      lastError = error;
      if (!RETRYABLE_PROFILE_ERRORS.has(error?.code) || attempt === attempts) throw error;
      await delayFn(retryDelayMs * attempt);
    }
  }
  throw lastError;
}
