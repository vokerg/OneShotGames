import assert from 'node:assert/strict';
import test from 'node:test';
import { createMenuController } from '../../src/ui/menu-controller.js';

test('menu pauses once, navigates, and resumes on close', () => {
  const calls = [];
  const menu = createMenuController({ onPause: () => calls.push('pause'), onResume: () => calls.push('resume') });
  menu.open();
  menu.show('settings');
  assert.deepEqual(calls, ['pause']);
  assert.equal(menu.snapshot().screen, 'settings');
  menu.back();
  assert.equal(menu.snapshot().screen, 'pause');
  menu.back();
  assert.equal(menu.snapshot().open, false);
  assert.deepEqual(calls, ['pause', 'resume']);
});

test('confirmation runs only after explicit confirmation', () => {
  let executions = 0;
  const menu = createMenuController();
  menu.open('load');
  menu.requestConfirmation({ title: 'Load?', message: 'Replace progress', action: () => { executions += 1; } });
  menu.cancelConfirmation();
  assert.equal(executions, 0);
  assert.equal(menu.snapshot().screen, 'load');
  menu.requestConfirmation({ title: 'Load?', message: 'Replace progress', action: () => { executions += 1; } });
  assert.equal(menu.confirm(), true);
  assert.equal(executions, 1);
});

test('unknown screens are rejected', () => {
  const menu = createMenuController();
  assert.throws(() => menu.open('debug'), /Unknown menu screen/);
});
