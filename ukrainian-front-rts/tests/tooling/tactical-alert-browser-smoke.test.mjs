import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../../scripts/tactical-alert-browser-smoke.mjs', import.meta.url), 'utf8');

test('tactical alert browser smoke uses bounded fail-closed Chromium teardown', () => {
  assert.match(source, /shutdownProcessBounded/);
  assert.match(source, /waitForChromeExit/);
  assert.match(source, /browser-process-shutdown/);
  assert.match(source, /Chromium did not confirm exit/);
  assert.match(source, /teardown-failure\.json/);
  assert.match(source, /teardown\.json/);
  assert.match(source, /ENOTEMPTY/);
  assert.match(source, /EBUSY/);
  assert.match(source, /EPERM/);
  assert.match(source, /if \(runError\) throw runError/);
  assert.doesNotMatch(source, /if \(!chromeExited\) chrome\.kill\('SIGTERM'\)/);
});

test('tactical alert browser smoke keeps profile cleanup behind confirmed Chromium exit', () => {
  const exitGuard = source.indexOf('if (!chromeExited) {');
  const profileRemoval = source.indexOf('await rm(profile', exitGuard);
  assert.notEqual(exitGuard, -1);
  assert.notEqual(profileRemoval, -1);
  assert.ok(profileRemoval > exitGuard);
  assert.match(source.slice(exitGuard, profileRemoval), /ProfileCleanupSkipped/);
});
