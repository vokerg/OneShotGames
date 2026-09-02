import assert from 'node:assert/strict';
import test from 'node:test';

import { TEAM } from '../../src/config.js';
import {
  commonConstructionAbilityIds,
  installGroupConstructionCommands,
} from '../../src/ui/group-construction-commands.js';

function unit(id, type) {
  return { id, type, team: TEAM.UA, hp: 100 };
}

function fixture(selectedEntities) {
  const actions = [];
  const calls = [];
  const game = {
    lastError: '',
    selectedEntities: () => selectedEntities,
    useAbility(abilityId) {
      calls.push(abilityId);
      return true;
    },
  };
  const ui = {
    g: game,
    appendUnitCommands() {
      actions.push({ title: 'Base command', className: 'command' });
      return 'base-result';
    },
    commandButton(action) {
      actions.push(action);
      return action;
    },
    formatCost() {
      return '100 metal';
    },
    selectionSummary(entities) {
      return `${entities.length}× Combat Engineers`;
    },
    toast(message) {
      calls.push(`toast:${message}`);
    },
    refresh() {
      calls.push('refresh');
    },
    t(key, variables = {}) {
      return `${key}:${variables.name || ''}`;
    },
  };
  return { ui, game, actions, calls };
}

test('two compatible engineers expose their common construction actions', () => {
  const engineers = [unit(1, 'uaEngineer'), unit(2, 'uaEngineer')];
  assert.deepEqual(commonConstructionAbilityIds(engineers), [
    'buildDepot',
    'buildBarracks',
    'buildWorkshop',
  ]);

  const { ui, actions, calls } = fixture(engineers);
  const dispose = installGroupConstructionCommands(ui);
  const result = ui.appendUnitCommands(engineers);

  assert.equal(result, 'base-result');
  const buildActions = actions.filter((action) => action.className === 'build-command');
  assert.equal(buildActions.length, 3);
  assert.deepEqual(buildActions.map((action) => action.id), [
    'group-buildDepot',
    'group-buildBarracks',
    'group-buildWorkshop',
  ]);
  assert.equal(new Set(buildActions.map((action) => action.id)).size, buildActions.length);
  assert.ok(buildActions.every((action) => action.disabled === false));
  assert.ok(buildActions.every((action) => action.meta.startsWith('2× Combat Engineers · ')));

  buildActions[0].onClick();
  assert.deepEqual(calls, [
    'buildDepot',
    'toast:runtime.commands.placeBuilding:Field Logistics Depot',
    'refresh',
  ]);

  dispose();
});

test('mixed engineer and infantry selections expose disabled construction actions with an explanatory reason', () => {
  const entities = [unit(1, 'uaEngineer'), unit(3, 'uaInfantry')];
  assert.deepEqual(commonConstructionAbilityIds(entities), []);

  const { ui, actions } = fixture(entities);
  installGroupConstructionCommands(ui);
  ui.appendUnitCommands(entities);

  const buildActions = actions.filter((action) => action.className === 'build-command');
  assert.equal(buildActions.length, 3);
  assert.ok(buildActions.every((action) => action.disabled === true));
  assert.ok(buildActions.every((action) => /Select only compatible Ukrainian engineers/.test(action.description)));
});

test('mixed unit/building selections expose disabled construction actions with an explanatory reason', () => {
  const engineer = unit(1, 'uaEngineer');
  const building = { id: 9, type: 'depot', team: TEAM.UA, hp: 680 };
  const { ui, actions } = fixture([engineer, building]);
  installGroupConstructionCommands(ui);
  ui.appendUnitCommands([engineer]);

  const buildActions = actions.filter((action) => action.className === 'build-command');
  assert.equal(buildActions.length, 3);
  assert.ok(buildActions.every((action) => action.disabled === true));
  assert.ok(buildActions.every((action) => /Select only compatible Ukrainian engineers/.test(action.description)));
});

test('selections without engineers do not expose construction actions', () => {
  const infantry = [unit(3, 'uaInfantry'), unit(4, 'uaInfantry')];
  const { ui, actions } = fixture(infantry);
  installGroupConstructionCommands(ui);
  ui.appendUnitCommands(infantry);
  assert.equal(actions.filter((action) => action.className === 'build-command').length, 0);
});

test('installer fails fast when its localization dependency is missing', () => {
  const engineers = [unit(1, 'uaEngineer'), unit(2, 'uaEngineer')];
  const { ui } = fixture(engineers);
  delete ui.t;
  assert.throws(
    () => installGroupConstructionCommands(ui),
    /requires ui\.t\(\)/,
  );
});
