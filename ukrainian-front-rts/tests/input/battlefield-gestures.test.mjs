import test from 'node:test';
import { TEAM } from '../../src/config.js';
import assert from 'node:assert/strict';
import { installBattlefieldInput } from '../../src/input/battlefield-input.js';
import { shouldIgnoreBattlefieldKey } from '../../src/input/keyboard-focus.js';

function target() {
  const listeners = new Map();
  return {
    style: {}, dataset: {}, focus() {},
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    removeEventListener(type, fn) { listeners.set(type, (listeners.get(type) || []).filter(value => value !== fn)); },
    fire(type, detail = {}) { const event = { button: 0, clientX: 0, clientY: 0, preventDefault() {}, ...detail }; for (const fn of listeners.get(type) || []) fn(event); },
  };
}
function setup() {
  const canvas = target(), minimap = target(), windowTarget = target();
  Object.assign(windowTarget, { innerWidth: 1000, innerHeight: 700 });
  const units = [{ id: 1, team: TEAM.UA, type: 'uaInfantry', hp: 100, x: 15, y: 15 }, { id: 2, team: TEAM.UA, type: 'uaInfantry', hp: 100, x: 70, y: 70 }];
  let selections = 0;
  const game = {
    mission: {}, camera: { x: 0, y: 0, z: 1 }, mouse: {}, keys: new Set(), selected: new Set([2]), units,
    selectedEntities: () => units.filter(unit => game.selected.has(unit.id)),
    worldPos: (x, y) => ({ x, y }), hit: () => null,
    select(entity, add) { selections++; if (!add) game.selected.clear(); if (entity) game.selected.add(entity.id); },
  };
  const dispose = installBattlefieldInput({ game, canvas, minimap, windowTarget, documentTarget: null, ui: { refresh() {}, toast() {} } });
  return { game, canvas, windowTarget, dispose, selections: () => selections };
}
test('mouseup after a captured force-fire gesture does not clear selection', () => {
  const h = setup();
  h.canvas.fire('mouseup', { clientX: 40, clientY: 40 });
  assert.equal(h.selections(), 0);
  assert.deepEqual([...h.game.selected], [2]);
  h.dispose();
});
test('Shift box selection adds units and releasing over the HUD ends dragging', () => {
  const h = setup();
  h.canvas.fire('mousedown', { clientX: 5, clientY: 5 });
  h.canvas.fire('mousemove', { clientX: 30, clientY: 30 });
  h.canvas.fire('mouseup', { clientX: 30, clientY: 30, shiftKey: true });
  assert.deepEqual([...h.game.selected].sort(), [1, 2]);
  h.canvas.fire('mousedown');
  h.canvas.fire('mousemove', { clientX: 40, clientY: 40 });
  h.windowTarget.fire('mouseup');
  assert.equal(h.game.mouse.down, false);
  assert.equal(h.game.mouse.drag, false);
  h.dispose();
});
test('camera aliases remain held until both keys release and editable fields own input', () => {
  const h = setup();
  h.windowTarget.fire('keydown', { key: 'w', code: 'KeyW' });
  h.windowTarget.fire('keydown', { key: 'ArrowUp', code: 'ArrowUp' });
  h.windowTarget.fire('keyup', { key: 'w', code: 'KeyW' });
  assert.equal(h.game.keys.has('w'), true);
  h.windowTarget.fire('keyup', { key: 'ArrowUp', code: 'ArrowUp' });
  assert.equal(h.game.keys.size, 0);
  h.windowTarget.fire('keydown', { key: 'w', code: 'KeyW', target: { tagName: 'INPUT' } });
  assert.equal(h.game.keys.size, 0);
  h.dispose();
});
test('Escape remains available after using a command button; Space activates the button', () => {
  const target = { tagName: 'BUTTON' };
  assert.equal(shouldIgnoreBattlefieldKey({ target, key: 'Escape' }), false);
  assert.equal(shouldIgnoreBattlefieldKey({ target, key: ' ' }), true);
  assert.equal(shouldIgnoreBattlefieldKey({ target, key: 'Tab' }), false, 'Tab keeps the established subgroup cycling shortcut');
});
test('right-click order passes Shift explicitly and records visible acknowledgement', () => {
  const h = setup();
  h.game.time = 12;
  h.game.mouse.attackMove = true;
  let issued;
  h.game.issue = (...args) => { issued = args; return true; };
  h.canvas.fire('contextmenu', { clientX: 130, clientY: 180, shiftKey: true });
  assert.deepEqual(issued, [130, 180, null, { append: true }]);
  assert.deepEqual(h.game.mouse.commandFeedback, { x: 130, y: 180, time: 12, attacking: true });
  h.dispose();
});
