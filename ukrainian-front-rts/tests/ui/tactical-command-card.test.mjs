import assert from 'node:assert/strict';
import test from 'node:test';

import { TEAM } from '../../src/config.js';
import { TACTICAL_COMMAND_KINDS } from '../../src/core/tactical-command-contract.js';
import { installTacticalCommandCard } from '../../src/ui/tactical-command-card.js';

function unit(id, type, overrides = {}) {
  return {
    id,
    type,
    team: TEAM.UA,
    hp: 100,
    maxHp: 100,
    autoFire: true,
    abilityCd: {},
    ...overrides,
  };
}

function fixture() {
  const buttons = [];
  const toasts = [];
  const calls = [];
  const game = {
    buildings: [{ id: 10, type: 'workshop', team: TEAM.UA, hp: 500, underConstruction: false }],
    pendingTacticalCommand: null,
    lastCommandMessage: '',
    lastError: '',
    unitStats(type) {
      if (type === 'uaTank') return { damage: 38, armor: true, vehicleClass: 'tank' };
      if (type === 'uaMedic') return { damage: 0 };
      return { damage: 13 };
    },
    armTacticalCommand(kind) {
      calls.push(['arm', kind]);
      this.pendingTacticalCommand = { kind };
      return true;
    },
    holdSelected() {
      calls.push(['hold']);
      this.lastCommandMessage = 'Holding.';
      return true;
    },
    returnSelectedForRepair() {
      calls.push(['repair']);
      this.lastCommandMessage = 'Returning.';
      return true;
    },
  };
  const ui = {
    g: game,
    appendUnitCommands(units) { calls.push(['base', units.length]); },
    commandStateSignature(entities) { return `base:${entities.length}`; },
    commandButton(spec) { buttons.push(spec); return spec; },
    toast(message) { toasts.push(message); },
    refresh() { calls.push(['refresh']); },
  };
  return { buttons, toasts, calls, game, ui };
}

test('adds all tactical command buttons after the base unit commands', () => {
  const state = fixture();
  const dispose = installTacticalCommandCard(state.ui);
  const infantry = unit(1, 'uaInfantry');
  const tank = unit(2, 'uaTank', { hp: 60 });

  state.ui.appendUnitCommands([infantry, tank]);

  assert.deepEqual(state.calls[0], ['base', 2]);
  assert.deepEqual(state.buttons.map((button) => button.title), [
    'Patrol',
    'Guard',
    'Follow',
    'Hold Position',
    'Return for Repair',
  ]);
  assert.deepEqual(state.buttons.map((button) => button.meta), ['P', 'G', 'Y', 'H', 'R']);
  assert.equal(state.buttons.at(-1).disabled, false);

  state.buttons[0].onClick();
  assert.deepEqual(state.calls.find((call) => call[0] === 'arm'), ['arm', TACTICAL_COMMAND_KINDS.PATROL]);
  assert.equal(state.toasts.at(-1), 'Patrol armed: right-click a valid target.');

  state.buttons[3].onClick();
  assert.equal(state.calls.some((call) => call[0] === 'hold'), true);
  assert.equal(state.toasts.at(-1), 'Holding.');

  state.buttons[4].onClick();
  assert.equal(state.calls.some((call) => call[0] === 'repair'), true);
  assert.equal(state.toasts.at(-1), 'Returning.');

  dispose();
  assert.equal(state.ui.appendUnitCommands.name, 'appendUnitCommands');
});

test('disables Guard without armed units and Return without eligible vehicle or facility', () => {
  const state = fixture();
  installTacticalCommandCard(state.ui);
  const medic = unit(1, 'uaMedic', { hp: 80 });

  state.game.buildings = [];
  state.ui.appendUnitCommands([medic]);

  assert.equal(state.buttons.find((button) => button.title === 'Guard').disabled, true);
  assert.equal(state.buttons.find((button) => button.title === 'Return for Repair').disabled, true);
});

test('signature changes for pending targeting, tactical state, damage eligibility, and repair facilities', () => {
  const state = fixture();
  installTacticalCommandCard(state.ui);
  const tank = unit(1, 'uaTank');

  const baseline = state.ui.commandStateSignature([tank]);
  state.game.pendingTacticalCommand = { kind: TACTICAL_COMMAND_KINDS.FOLLOW };
  const pending = state.ui.commandStateSignature([tank]);
  assert.notEqual(pending, baseline);

  state.game.pendingTacticalCommand = null;
  tank.tacticalCommand = { kind: TACTICAL_COMMAND_KINDS.HOLD_POSITION, id: 7 };
  const commanded = state.ui.commandStateSignature([tank]);
  assert.notEqual(commanded, baseline);

  delete tank.tacticalCommand;
  tank.hp = 60;
  const damaged = state.ui.commandStateSignature([tank]);
  assert.notEqual(damaged, baseline);

  state.game.buildings = [];
  const noFacility = state.ui.commandStateSignature([tank]);
  assert.notEqual(noFacility, damaged);
});

test('marks the currently armed target command in the card', () => {
  const state = fixture();
  installTacticalCommandCard(state.ui);
  state.game.pendingTacticalCommand = { kind: TACTICAL_COMMAND_KINDS.GUARD };
  state.ui.appendUnitCommands([unit(1, 'uaInfantry')]);

  const guard = state.buttons.find((button) => button.title.includes('Guard'));
  assert.equal(guard.title, '✓ Guard');
  assert.equal(guard.className.includes('stance-on'), true);
});
