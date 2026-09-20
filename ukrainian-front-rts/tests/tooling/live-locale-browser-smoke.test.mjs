import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const liveLocaleSource = await readFile(new URL('../../scripts/live-locale-browser-smoke.mjs', import.meta.url), 'utf8');
const sessionSource = await readFile(new URL('../../scripts/lib/chrome-devtools-session.mjs', import.meta.url), 'utf8');

test('shared DevTools session gates profile cleanup on bounded Chromium exit', () => {
  assert.match(sessionSource, /shutdownProcessBounded/);
  assert.match(sessionSource, /waitForChromeExit/);
  assert.match(sessionSource, /browser-process-shutdown/);
  assert.match(sessionSource, /ProfileCleanupSkipped/);
  assert.match(sessionSource, /removeChromeProfileWithRetry/);

  const exitGuard = sessionSource.indexOf('if (!chromeExited) {');
  const cleanup = sessionSource.indexOf('removeChromeProfileWithRetry(profile)', exitGuard);
  assert.notEqual(exitGuard, -1);
  assert.notEqual(cleanup, -1);
  assert.ok(cleanup > exitGuard);
  assert.match(sessionSource.slice(exitGuard, cleanup), /Chromium did not confirm exit/);
});

test('live-locale smoke persists teardown evidence and preserves a primary verification failure', () => {
  assert.match(liveLocaleSource, /let runError = null/);
  assert.match(liveLocaleSource, /live-locale-browser-teardown\.json/);
  assert.match(liveLocaleSource, /browser-session-close/);
  assert.match(liveLocaleSource, /http-server-close/);
  assert.match(liveLocaleSource, /new AggregateError\(\[runError, teardownError\]/);
  assert.match(liveLocaleSource, /if \(runError\) throw runError/);

  const primaryCapture = liveLocaleSource.indexOf('runError = error;');
  const sessionClose = liveLocaleSource.indexOf('teardown.session = await session.close()');
  const aggregate = liveLocaleSource.indexOf('new AggregateError([runError, teardownError]');
  assert.notEqual(primaryCapture, -1);
  assert.notEqual(sessionClose, -1);
  assert.notEqual(aggregate, -1);
  assert.ok(primaryCapture < sessionClose);
  assert.ok(sessionClose < aggregate);
});
