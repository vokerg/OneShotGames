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
  assert.ok(buildActions.every((action) => action.meta.startsWith('2× Combat Engineers · ')));

  buildActions[0].onClick();
  assert.deepEqual(calls, [
    'buildDepot',
    'toast:runtime.commands.placeBuilding:Field Logistics Depot',
    'refresh',
  ]);

  dispose();
});

test('mixed engineer and infantry selections do not expose misleading construction actions', () => {
  const entities = [unit(1, 'uaEngineer'), unit(3, 'uaInfantry')];
  assert.deepEqual(commonConstructionAbilityIds(entities), []);

  const { ui, actions } = fixture(entities);
  installGroupConstructionCommands(ui);
  ui.appendUnitCommands(entities);
  assert.equal(actions.filter((action) => action.className === 'build-command').length, 0);
});

test('mixed unit/building selections do not inherit engineer-only construction actions', () => {
  const engineer = unit(1, 'uaEngineer');
  const building = { id: 9, type: 'depot', team: TEAM.UA, hp: 680 };
  const { ui, actions } = fixture([engineer, building]);
  installGroupConstructionCommands(ui);
  ui.appendUnitCommands([engineer]);
  assert.equal(actions.filter((action) => action.className === 'build-command').length, 0);
});
