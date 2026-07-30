import assert from 'node:assert/strict';
import test from 'node:test';

import { INPUT_ACTIONS, createKeyBindings, resolveInputAction } from '../../src/input/action-map.js';
import { installTacticalCommandInput } from '../../src/input/tactical-command-input.js';
import { TACTICAL_COMMAND_KINDS } from '../../src/systems/tactical-command-system.js';

class Target {
  constructor() { this.listeners = new Map(); this.dataset = {}; }
  addEventListener(type, handler) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(handler); }
  removeEventListener(type, handler) { this.listeners.set(type, (this.listeners.get(type) || []).filter((candidate) => candidate !== handler)); }
  emit(type, event = {}) { for (const handler of [...(this.listeners.get(type) || [])]) handler(event); }
}

function fixture() {
  const windowTarget = new Target();
  const canvas = new Target();
  const root = { dataset: {} };
  const styles = [];
  const documentTarget = {
    body: root,
    head: { appendChild(style) { styles.push(style); } },
    createElement() { return { dataset: {}, textContent: '', remove() { this.removed = true; } }; },
  };
  const calls = [];
  const game = {
    gameOver: false,
    pendingBuild: null,
    pendingTacticalCommand: null,
    lastError: '',
    lastCommandMessage: '',
    armTacticalCommand(kind) { calls.push(['arm', kind]); this.pendingTacticalCommand = { kind }; return true; },
    cancelTacticalCommand() { const changed = Boolean(this.pendingTacticalCommand); this.pendingTacticalCommand = null; calls.push(['cancel']); return changed; },
    issueTacticalTarget(x, y, target) { calls.push(['target', x, y, target]); this.pendingTacticalCommand = null; this.lastCommandMessage = 'Target accepted.'; return true; },
    holdSelected() { calls.push(['hold']); this.lastCommandMessage = 'Holding.'; return true; },
    returnSelectedForRepair() { calls.push(['repair']); this.lastCommandMessage = 'Returning.'; return true; },
    worldPos(x, y) { return { x: x + 10, y: y + 20 }; },
    hit(x, y) { return { id: `${x}:${y}` }; },
  };
  const toasts = [];
  const ui = { toast(message) { toasts.push(message); }, refresh() { calls.push(['refresh']); } };
  return { windowTarget, canvas, root, documentTarget, styles, game, ui, calls, toasts };
}

function key(key, overrides = {}) {
  return { key, repeat: false, preventDefault() { this.prevented = true; }, ...overrides };
}

test('action map exposes unique tactical command bindings and supports overrides', () => {
  const bindings = createKeyBindings();
  assert.equal(resolveInputAction(bindings, 'P'), INPUT_ACTIONS.PATROL);
  assert.equal(resolveInputAction(bindings, 'g'), INPUT_ACTIONS.GUARD);
  assert.equal(resolveInputAction(bindings, 'Y'), INPUT_ACTIONS.FOLLOW);
  assert.equal(resolveInputAction(bindings, 'h'), INPUT_ACTIONS.HOLD_POSITION);
  assert.equal(resolveInputAction(bindings, 'r'), INPUT_ACTIONS.RETURN_FOR_REPAIR);
  const remapped = createKeyBindings({ p: null, z: INPUT_ACTIONS.PATROL });
  assert.equal(resolveInputAction(remapped, 'p'), null);
  assert.equal(resolveInputAction(remapped, 'z'), INPUT_ACTIONS.PATROL);
});

test('targeted hotkeys arm modes and capture the next right-click before battlefield input', () => {
  const state = fixture();
  const dispose = installTacticalCommandInput(state);

  const patrolKey = key('p');
  state.windowTarget.emit('keydown', patrolKey);
  assert.equal(patrolKey.prevented, true);
  assert.deepEqual(state.calls[0], ['arm', TACTICAL_COMMAND_KINDS.PATROL]);
  assert.equal(state.canvas.dataset.tacticalCommand, 'patrol');
  assert.equal(state.root.dataset.tacticalCommand, 'patrol');

  const event = {
    clientX: 25,
    clientY: 35,
    preventDefault() { this.prevented = true; },
    stopImmediatePropagation() { this.stopped = true; },
  };
  state.canvas.emit('contextmenu', event);
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
  assert.deepEqual(state.calls.find((call) => call[0] === 'target'), ['target', 35, 55, { id: '35:55' }]);
  assert.equal('tacticalCommand' in state.canvas.dataset, false);
  assert.equal(state.toasts.at(-1), 'Target accepted.');

  dispose();
  assert.equal(state.styles[0].removed, true);
});

test('hold and return-for-repair are immediate while construction keeps the R key', () => {
  const state = fixture();
  const dispose = installTacticalCommandInput(state);

  state.windowTarget.emit('keydown', key('h'));
  assert.equal(state.calls.some((call) => call[0] === 'hold'), true);
  assert.equal(state.toasts.at(-1), 'Holding.');

  state.game.pendingBuild = { type: 'workshop' };
  const constructionR = key('r');
  state.windowTarget.emit('keydown', constructionR);
  assert.equal(state.calls.some((call) => call[0] === 'repair'), false);
  assert.equal(constructionR.prevented, undefined);

  state.game.pendingBuild = null;
  const repairR = key('r');
  state.windowTarget.emit('keydown', repairR);
  assert.equal(state.calls.some((call) => call[0] === 'repair'), true);
  assert.equal(repairR.prevented, true);

  dispose();
});

test('escape, blur, and disposal clear targeting state and listeners', () => {
  const state = fixture();
  const dispose = installTacticalCommandInput(state);
  state.windowTarget.emit('keydown', key('g'));
  assert.equal(state.canvas.dataset.tacticalCommand, 'guard');

  const escape = key('Escape');
  state.windowTarget.emit('keydown', escape);
  assert.equal(escape.prevented, true);
  assert.equal('tacticalCommand' in state.canvas.dataset, false);

  state.windowTarget.emit('keydown', key('y'));
  state.windowTarget.emit('blur', {});
  assert.equal(state.game.pendingTacticalCommand, null);
  assert.equal('tacticalCommand' in state.root.dataset, false);

  dispose();
  const callsBefore = state.calls.length;
  state.windowTarget.emit('keydown', key('p'));
  assert.equal(state.calls.length, callsBefore);
});
