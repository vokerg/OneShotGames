import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cycleSelectionSubgroup,
  primarySelectedEntity,
  resolvePrimarySelection,
  selectAllOfTypeOnScreen,
  synchronizePrimarySelection,
} from '../../src/input/selection-subgroups.js';

const TEAM_UA = 'ua';

function unit(id, type, x = 20, y = 20, overrides = {}) {
  return { id, type, team: TEAM_UA, x, y, hp: 100, selected: false, ...overrides };
}

function game(units, selectedIds = []) {
  const selected = new Set(selectedIds);
  units.forEach((candidate) => { candidate.selected = selected.has(candidate.id); });
  return {
    units,
    buildings: [],
    selected,
    camera: { x: 0, y: 0, z: 1 },
    primarySelectedId: null,
    select(entity, add = false) {
      if (!add) {
        this.selected.clear();
        this.units.forEach((candidate) => { candidate.selected = false; });
      }
      if (entity) {
        this.selected.add(entity.id);
        entity.selected = true;
      }
    },
    selectedEntities() {
      return this.units.filter((candidate) => this.selected.has(candidate.id));
    },
  };
}

test('stable primary retains a valid explicit unit and falls back by id', () => {
  const state = game([unit(9, 'tank'), unit(3, 'infantry')], [9, 3]);
  assert.equal(resolvePrimarySelection(state), 3);
  assert.equal(synchronizePrimarySelection(state, 9), 9);
  assert.equal(resolvePrimarySelection(state), 9);

  state.selected.delete(9);
  assert.equal(resolvePrimarySelection(state), 3);
});

test('Tab cycles deterministic type subgroups and Shift+Tab reverses', () => {
  const state = game([
    unit(1, 'tank'),
    unit(2, 'infantry'),
    unit(3, 'engineer'),
    unit(4, 'tank'),
  ], [1, 2, 3, 4]);
  synchronizePrimarySelection(state, 2);

  const forward = cycleSelectionSubgroup(state, 1);
  assert.equal(forward.type, 'tank');
  assert.equal(forward.count, 2);
  assert.equal(state.primarySelectedId, 1);

  const reverse = cycleSelectionSubgroup(state, -1);
  assert.equal(reverse.type, 'infantry');
  assert.equal(state.primarySelectedId, 2);
});

test('select-all-of-type includes only living friendly units visible on screen', () => {
  const source = unit(1, 'infantry', 50, 50);
  const visible = unit(2, 'infantry', 90, 90);
  const offscreen = unit(3, 'infantry', 220, 90);
  const destroyed = unit(4, 'infantry', 70, 70, { hp: 0 });
  const enemy = unit(5, 'infantry', 60, 60, { team: 'ru' });
  const otherType = unit(6, 'tank', 60, 60);
  const state = game([source, visible, offscreen, destroyed, enemy, otherType]);

  const result = selectAllOfTypeOnScreen(state, source, { width: 100, height: 100 });
  assert.equal(result.count, 2);
  assert.deepEqual([...state.selected], [1, 2]);
  assert.equal(state.primarySelectedId, 1);
});

test('primarySelectedEntity resolves the explicit primary in mixed selection', () => {
  const infantry = unit(1, 'infantry');
  const tank = unit(2, 'tank');
  const state = game([infantry, tank], [1, 2]);
  synchronizePrimarySelection(state, 2);
  assert.equal(primarySelectedEntity(state), tank);
});
