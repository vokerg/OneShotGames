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

function fixture(selectedEntities, { primarySelectedId = null } = {}) {
  const actions = [];
  const calls = [];
  const game = {
    lastError: '',
    primarySelectedId,
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

function buildActions(actions) {
  return actions.filter((action) => action.className === 'build-command');
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
  const builds = buildActions(actions);
  assert.equal(builds.length, 3);
  assert.deepEqual(builds.map((action) => action.id), [
    'group-buildDepot',
    'group-buildBarracks',
    'group-buildWorkshop',
  ]);
  assert.equal(new Set(builds.map((action) => action.id)).size, builds.length);
  assert.ok(builds.every((action) => action.disabled === false));
  assert.ok(builds.every((action) => action.meta.startsWith('2× Combat Engineers · ')));

  builds[0].onClick();
  assert.deepEqual(calls, [
    'buildDepot',
    'toast:runtime.commands.placeBuilding:Field Logistics Depot',
    'refresh',
  ]);

  dispose();
});

test('active engineer subgroup exposes build commands inside a mixed drag selection', () => {
  const engineerA = unit(1, 'uaEngineer');
  const engineerB = unit(2, 'uaEngineer');
  const infantry = unit(3, 'uaInfantry');
  const entities = [engineerA, engineerB, infantry];
  const { ui, actions } = fixture(entities, { primarySelectedId: engineerA.id });

  installGroupConstructionCommands(ui);
  ui.appendUnitCommands(entities);

  const builds = buildActions(actions);
  assert.equal(builds.length, 3);
  assert.ok(builds.every((action) => action.disabled === false));
  assert.ok(builds.every((action) => action.meta.startsWith('2× Combat Engineers · ')));
});

test('non-engineer active subgroup keeps engineer construction actions disabled with an explanation', () => {
  const engineerA = unit(1, 'uaEngineer');
  const engineerB = unit(2, 'uaEngineer');
  const infantry = unit(3, 'uaInfantry');
  const entities = [engineerA, engineerB, infantry];
  const { ui, actions } = fixture(entities, { primarySelectedId: infantry.id });

  installGroupConstructionCommands(ui);
  ui.appendUnitCommands(entities);

  const builds = buildActions(actions);
  assert.equal(builds.length, 3);
  assert.ok(builds.every((action) => action.disabled === true));
  assert.ok(builds.every((action) => /engineer subgroup active/.test(action.description)));
});

test('single engineers stay on the existing appendAbilities path without duplicate group commands', () => {
  const engineer = unit(1, 'uaEngineer');
  assert.deepEqual(commonConstructionAbilityIds([engineer]), []);

  const { ui, actions } = fixture([engineer], { primarySelectedId: engineer.id });
  installGroupConstructionCommands(ui);
  ui.appendUnitCommands([engineer]);
  assert.equal(buildActions(actions).length, 0);
});

test('mixed engineer and infantry selections without an active subgroup stay disabled', () => {
  const entities = [unit(1, 'uaEngineer'), unit(3, 'uaInfantry')];
  assert.deepEqual(commonConstructionAbilityIds(entities), []);

  const { ui, actions } = fixture(entities);
  installGroupConstructionCommands(ui);
  ui.appendUnitCommands(entities);

  const builds = buildActions(actions);
  assert.equal(builds.length, 3);
  assert.ok(builds.every((action) => action.disabled === true));
  assert.ok(builds.every((action) => /engineer subgroup active/.test(action.description)));
});

test('mixed unit/building selections remain disabled even with an engineer primary', () => {
  const engineer = unit(1, 'uaEngineer');
  const building = { id: 9, type: 'depot', team: TEAM.UA, hp: 680 };
  const { ui, actions } = fixture([engineer, building], { primarySelectedId: engineer.id });
  installGroupConstructionCommands(ui);
  ui.appendUnitCommands([engineer]);

  const builds = buildActions(actions);
  assert.equal(builds.length, 3);
  assert.ok(builds.every((action) => action.disabled === true));
  assert.ok(builds.every((action) => /Select only units/.test(action.description)));
});

test('selections without engineers do not expose construction actions', () => {
  const infantry = [unit(3, 'uaInfantry'), unit(4, 'uaInfantry')];
  const { ui, actions } = fixture(infantry, { primarySelectedId: infantry[0].id });
  installGroupConstructionCommands(ui);
  ui.appendUnitCommands(infantry);
  assert.equal(buildActions(actions).length, 0);
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
