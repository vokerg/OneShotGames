import assert from 'node:assert/strict';
import test from 'node:test';

import { TEAM, UNIT_TYPES } from '../../src/config.js';
import { COMBAT_STANCES } from '../../src/core/stance-contract.js';
import { installStanceCommandCard } from '../../src/ui/stance-command-card.js';

function createUi(units) {
  const buttons = [];
  const toasts = [];
  const game = {
    units,
    lastError: '',
    lastCommandMessage: '',
    unitStats(type) { return UNIT_TYPES[type]; },
    setSelectedCombatStance(stance) {
      units.forEach((unit) => { unit.combatStance = stance; });
      this.lastCommandMessage = `stance:${stance}`;
      return true;
    },
  };
  return {
    g: game,
    buttons,
    toasts,
    appendUnitCommands() {},
    commandStateSignature() { return 'base'; },
    commandButton(spec) { buttons.push(spec); return spec; },
    toast(message) { toasts.push(message); },
    refresh() {},
  };
}

test('stance card adds six commands and marks a unanimous active stance', () => {
  const units = [{ id: 1, type: 'uaInfantry', team: TEAM.UA, combatStance: COMBAT_STANCES.DEFENSIVE }];
  const ui = createUi(units);
  const dispose = installStanceCommandCard(ui);
  ui.appendUnitCommands(units);
  assert.equal(ui.buttons.length, 6);
  assert.match(ui.buttons.find((button) => button.title.includes('Defensive')).title, /^✓ /);
  assert.match(ui.commandStateSignature(units), /stances:1:defensive/);
  dispose();
});

test('stance command invokes the public game boundary and refreshes feedback', () => {
  const units = [{ id: 1, type: 'uaInfantry', team: TEAM.UA, combatStance: COMBAT_STANCES.FIRE_AT_WILL }];
  const ui = createUi(units);
  installStanceCommandCard(ui);
  ui.appendUnitCommands(units);
  ui.buttons.find((button) => button.title.includes('Hold Fire')).onClick();
  assert.equal(units[0].combatStance, COMBAT_STANCES.HOLD_FIRE);
  assert.deepEqual(ui.toasts, ['stance:holdFire']);
});

test('unarmed selections do not receive stance controls', () => {
  const units = [{ id: 1, type: 'uaMedic', team: TEAM.UA }];
  const ui = createUi(units);
  installStanceCommandCard(ui);
  ui.appendUnitCommands(units);
  assert.equal(ui.buttons.length, 0);
});
