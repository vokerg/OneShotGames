import assert from 'node:assert/strict';
import test from 'node:test';

import { TEAM } from '../../src/config.js';
import { COMBAT_STANCES } from '../../src/core/stance-contract.js';
import { createLocalizer } from '../../src/localization/localization.js';
import { RUNTIME_LOCALIZATION_CATALOGS } from '../../src/localization/runtime-catalogs.js';
import { installStanceCommandCard } from '../../src/ui/stance-command-card.js';
import { installTacticalCommandCard } from '../../src/ui/tactical-command-card.js';

function createStanceUi(localizer) {
  const buttons = [];
  const unit = {
    id: 1,
    type: 'uaInfantry',
    team: TEAM.UA,
    combatStance: COMBAT_STANCES.RETURN_FIRE,
  };
  const game = {
    lastError: '',
    lastCommandMessage: '',
    unitStats() { return { damage: 13 }; },
    setSelectedCombatStance(stance) {
      unit.combatStance = stance;
      return true;
    },
  };
  const ui = {
    g: game,
    t: localizer.t,
    appendUnitCommands() {},
    commandStateSignature() { return `base:${localizer.locale}`; },
    commandButton(spec) { buttons.push(spec); return spec; },
    toast() {},
    refresh() {},
  };
  return { buttons, unit, ui };
}

function createTacticalUi(localizer) {
  const buttons = [];
  const game = {
    buildings: [{ id: 10, type: 'workshop', team: TEAM.UA, hp: 500, underConstruction: false }],
    pendingTacticalCommand: null,
    lastCommandMessage: '',
    lastError: '',
    unitStats() { return { damage: 13 }; },
    armAttackGround() { return true; },
    isAttackGroundArmed() { return false; },
    armTacticalCommand(kind) {
      this.pendingTacticalCommand = { kind };
      return true;
    },
    holdSelected() { return true; },
    returnSelectedForRepair() { return true; },
  };
  const ui = {
    g: game,
    localization: localizer,
    t: localizer.t,
    appendUnitCommands() {},
    commandStateSignature() { return `base:${localizer.locale}`; },
    commandButton(spec) { buttons.push(spec); return spec; },
    toast() {},
    refresh() {},
  };
  const unit = {
    id: 2,
    type: 'uaInfantry',
    team: TEAM.UA,
    hp: 100,
    maxHp: 100,
  };
  return { buttons, unit, ui };
}

function renderTitles(state) {
  state.buttons.length = 0;
  state.ui.appendUnitCommands([state.unit]);
  return state.buttons.map((button) => button.title.replace(/^✓ /, ''));
}

test('stance command copy follows a reversible en -> uk -> en locale roundtrip', () => {
  const localizer = createLocalizer(RUNTIME_LOCALIZATION_CATALOGS, { locale: 'en' });
  const state = createStanceUi(localizer);
  const dispose = installStanceCommandCard(state.ui);

  assert.ok(renderTitles(state).includes('Return Fire'));
  assert.ok(renderTitles(state).includes('Hold Position'));

  assert.equal(localizer.setLocale('uk'), true);
  assert.ok(renderTitles(state).includes('Вогонь у відповідь'));
  assert.ok(renderTitles(state).includes('Утримувати позицію'));
  assert.equal(state.buttons.some((button) => button.title.includes('Return Fire')), false);

  assert.equal(localizer.setLocale('en'), true);
  assert.ok(renderTitles(state).includes('Return Fire'));
  dispose();
});

test('tactical command copy follows a reversible en -> uk -> en locale roundtrip', () => {
  const localizer = createLocalizer(RUNTIME_LOCALIZATION_CATALOGS, { locale: 'en' });
  const state = createTacticalUi(localizer);
  const dispose = installTacticalCommandCard(state.ui);

  assert.ok(renderTitles(state).includes('Attack Ground'));
  assert.ok(renderTitles(state).includes('Patrol'));
  assert.ok(renderTitles(state).includes('Return for Repair'));

  assert.equal(localizer.setLocale('uk'), true);
  const ukrainian = renderTitles(state);
  assert.ok(ukrainian.includes('Вогонь по місцевості'));
  assert.ok(ukrainian.includes('Патруль'));
  assert.ok(ukrainian.includes('Утримувати позицію'));
  assert.ok(ukrainian.includes('Повернутися на ремонт'));
  assert.equal(ukrainian.includes('Attack Ground'), false);

  assert.equal(localizer.setLocale('en'), true);
  assert.ok(renderTitles(state).includes('Attack Ground'));
  dispose();
});
