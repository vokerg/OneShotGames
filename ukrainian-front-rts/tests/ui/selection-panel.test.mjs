import assert from 'node:assert/strict';
import test from 'node:test';

import { TEAM } from '../../src/config.js';
import { createVeterancyState } from '../../src/core/veterancy.js';
import { createSelectionPanelController } from '../../src/ui/selection-panel.js';
import { createSelectionPanelModel } from '../../src/ui/selection-panel-model.js';

function unit(id, type, overrides = {}) {
  return {
    id,
    type,
    team: TEAM.UA,
    hp: 100,
    maxHp: 100,
    autoFire: true,
    ...overrides,
  };
}

function gameWith(entities, primarySelectedId = null) {
  const selected = new Set(entities.map((entity) => entity.id));
  return {
    selected,
    primarySelectedId,
    units: entities.filter((entity) => !entity.queue),
    buildings: entities.filter((entity) => Array.isArray(entity.queue)),
    selectedEntities() {
      return entities.filter((entity) => this.selected.has(entity.id));
    },
    select(entity, additive = false) {
      if (!additive) this.selected.clear();
      if (!entity) return;
      if (additive && this.selected.has(entity.id)) this.selected.delete(entity.id);
      else this.selected.add(entity.id);
    },
  };
}

class FakeClassList {
  constructor(element) { this.element = element; this.values = new Set(); }
  add(...values) { values.forEach((value) => this.values.add(value)); this.sync(); }
  remove(...values) { values.forEach((value) => this.values.delete(value)); this.sync(); }
  toggle(value, force) {
    if (force === true || (force === undefined && !this.values.has(value))) this.values.add(value);
    else if (force === false || force === undefined) this.values.delete(value);
    this.sync();
    return this.values.has(value);
  }
  contains(value) { return this.values.has(value); }
  sync() { this.element.className = [...this.values].join(' '); }
}

class FakeElement {
  constructor(tagName, documentTarget) {
    this.tagName = tagName;
    this.ownerDocument = documentTarget;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.listeners = new Map();
    this.style = {};
    this.className = '';
    this.classList = new FakeClassList(this);
    this.textContent = '';
    this.title = '';
    this.type = '';
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  dispatch(type, event = {}) { this.listeners.get(type)?.({ shiftKey: false, ...event }); }
}

class FakeDocument {
  createElement(tagName) { return new FakeElement(tagName, this); }
}

function panelElements(documentTarget) {
  return {
    root: new FakeElement('section', documentTarget),
    subgroups: new FakeElement('div', documentTarget),
    grid: new FakeElement('div', documentTarget),
    contents: new FakeElement('div', documentTarget),
  };
}

test('builds immutable subgroup, primary, health, status, veterancy, transport, and garrison presentation', () => {
  const infantry = unit(2, 'uaInfantry', {
    hp: 18,
    maxHp: 100,
    suppression: 0.4,
    veterancy: createVeterancyState({ xp: 240 }),
  });
  const medic = unit(1, 'uaMedic');
  const transport = unit(3, 'uaIfv', {
    passengers: [unit(8, 'uaInfantry', { hp: 70, maxHp: 100 })],
  });
  const garrison = {
    id: 4,
    type: 'depot',
    team: TEAM.UA,
    hp: 600,
    maxHp: 600,
    queue: [],
    garrisonState: {
      capacity: 4,
      occupants: [{ id: 'g-1', type: 'uaInfantry', team: TEAM.UA, hp: 60, maxHp: 100 }],
    },
  };
  const game = gameWith([infantry, medic, transport, garrison], 2);
  const model = createSelectionPanelModel(game);

  assert.equal(model.version, 1);
  assert.equal(model.primaryId, '2');
  assert.deepEqual(model.items.map((item) => item.id), ['2', '1', '3', '4']);
  assert.deepEqual(model.subgroups.map((group) => [group.id, group.count]), [
    ['uaIfv', 1],
    ['uaInfantry', 1],
    ['uaMedic', 1],
  ]);
  const primary = model.items[0];
  assert.equal(primary.health.state, 'critical');
  assert.ok(primary.statuses.some((status) => status.id === 'suppression'));
  assert.equal(primary.veterancy.label, 'Veteran');
  assert.equal(model.containers.length, 2);
  assert.deepEqual(model.containers.map((container) => container.kind), ['transport', 'garrison']);
  assert.ok(Object.isFrozen(model));
  assert.ok(Object.isFrozen(model.items));
  assert.ok(Object.isFrozen(model.containers[0].contents[0]));
});

test('falls back to deterministic primary and excludes destroyed entities', () => {
  const first = unit(10, 'uaInfantry');
  const second = unit(9, 'uaMedic');
  const destroyed = unit(8, 'uaInfantry', { hp: 0 });
  const game = gameWith([first, second, destroyed], 999);
  const model = createSelectionPanelModel(game);
  assert.equal(model.primaryId, '9');
  assert.deepEqual(model.items.map((item) => item.id), ['9', '10']);
});

test('renders subgroup tabs, filters the grid, exposes contents, and selects directly through Game.select', () => {
  const infantry = unit(1, 'uaInfantry');
  const medic = unit(2, 'uaMedic');
  const transport = unit(3, 'uaIfv', { passengers: [unit(7, 'uaInfantry')] });
  const game = gameWith([infantry, medic, transport], 1);
  const documentTarget = new FakeDocument();
  const elements = panelElements(documentTarget);
  const changes = [];
  const controller = createSelectionPanelController({
    game,
    elements,
    documentTarget,
    onSelectionChanged: (change) => changes.push(change),
  });

  controller.render();
  assert.equal(elements.subgroups.children.length, 4);
  assert.equal(elements.grid.children.length, 3);
  assert.equal(elements.contents.children.length, 1);

  const medicTab = elements.subgroups.children.find((child) => child.dataset.subgroup === 'uaMedic');
  medicTab.dispatch('click');
  assert.equal(controller.activeSubgroup(), 'uaMedic');
  assert.equal(elements.grid.children.length, 1);
  assert.equal(elements.grid.children[0].dataset.entityId, '2');

  elements.grid.children[0].dispatch('click');
  assert.deepEqual([...game.selected], [2]);
  assert.deepEqual(changes, [{ entityId: '2', additive: false }]);
});

test('shift-click toggles a unit without replacing the group', () => {
  const infantry = unit(1, 'uaInfantry');
  const medic = unit(2, 'uaMedic');
  const game = gameWith([infantry, medic], 1);
  const documentTarget = new FakeDocument();
  const elements = panelElements(documentTarget);
  const controller = createSelectionPanelController({ game, elements, documentTarget });
  controller.render();

  const medicCard = elements.grid.children.find((child) => child.dataset.entityId === '2');
  medicCard.dispatch('click', { shiftKey: true });
  assert.deepEqual([...game.selected], [1]);
});

test('installer composes refresh and restores the exact UI lifecycle on disposal', async () => {
  const infantry = unit(1, 'uaInfantry');
  const game = gameWith([infantry], 1);
  game.mission = { id: 'test' };
  const documentTarget = new FakeDocument();
  const elements = panelElements(documentTarget);
  const bySelector = new Map([
    ['#selectionPanel', elements.root],
    ['#selectionSubgroups', elements.subgroups],
    ['#selectionGrid', elements.grid],
    ['#selectionContents', elements.contents],
  ]);
  documentTarget.querySelector = (selector) => bySelector.get(selector) ?? null;
  const calls = [];
  const ui = {
    refresh() { calls.push('refresh'); return 'refresh-result'; },
    setMission() { calls.push('setMission'); },
    showMissionSelect() { calls.push('showMissionSelect'); },
  };
  const original = { refresh: ui.refresh, setMission: ui.setMission, showMissionSelect: ui.showMissionSelect };
  const { installSelectionPanel } = await import('../../src/ui/selection-panel.js');
  const dispose = installSelectionPanel({ game, ui, documentTarget });

  assert.equal(ui.refresh(), 'refresh-result');
  assert.equal(elements.grid.children.length, 1);
  ui.setMission();
  assert.ok(elements.root.classList.contains('hidden'));
  ui.refresh();
  assert.equal(elements.grid.children.length, 1);
  dispose();
  assert.equal(ui.refresh, original.refresh);
  assert.equal(ui.setMission, original.setMission);
  assert.equal(ui.showMissionSelect, original.showMissionSelect);
  assert.deepEqual(calls, ['refresh', 'setMission', 'refresh']);
});
