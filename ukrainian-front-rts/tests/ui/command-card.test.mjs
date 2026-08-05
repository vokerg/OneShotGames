import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMMAND_CARD_PAGE_SIZE,
  COMMAND_CARD_SCHEMA,
  COMMAND_CARD_STYLESHEET,
  createCommandCardController,
  createCommandCardModel,
  installProductionCommandCard,
  navigateCommandCard,
} from '../../src/ui/command-card.js';

class FakeElement {
  constructor(tagName, documentTarget) {
    this.tagName = tagName;
    this.ownerDocument = documentTarget;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.listeners = new Map();
    this.className = '';
    this.textContent = '';
    this.title = '';
    this.type = '';
    this.rel = '';
    this.href = '';
    this.disabled = false;
    this.removed = false;
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  dispatch(type, event = {}) {
    const resolved = {
      type,
      button: 0,
      detail: 0,
      key: '',
      prevented: false,
      preventDefault() { this.prevented = true; },
      ...event,
    };
    for (const listener of this.listeners.get(type) || []) listener(resolved);
    return resolved;
  }
  focus() { this.ownerDocument.activeElement = this; }
  remove() { this.removed = true; }
}

class FakeDocument {
  constructor() {
    this.activeElement = null;
    this.head = new FakeElement('head', this);
  }
  createElement(tagName) { return new FakeElement(tagName, this); }
  querySelector(selector) {
    if (selector !== 'link[data-command-card-styles="true"]') return null;
    return this.head.children.find((child) => child.dataset.commandCardStyles === 'true' && !child.removed) || null;
  }
}

function action(index, overrides = {}) {
  return {
    id: `action-${index}`,
    title: `Action ${index}`,
    description: `Description ${index}`,
    meta: '',
    className: 'command',
    onClick() {},
    ...overrides,
  };
}

test('builds a frozen, grouped, deterministic 4x3 paged command-card model', () => {
  const game = {
    mouse: { attackMove: true },
    pendingTacticalCommand: { kind: 'patrol' },
    isAttackGroundArmed: () => true,
  };
  const actions = [
    action(0, { title: 'Train Infantry', className: 'production-command' }),
    action(1, { title: 'Attack-Move', meta: 'Q' }),
    action(2, { title: 'Patrol', meta: 'P' }),
    action(3, { title: 'Auto-Fire: ON', className: 'command stance-on', meta: 'T' }),
    action(4, { title: 'Repair', disabled: true, disabledReason: 'No repair facility.' }),
    ...Array.from({ length: 9 }, (_, index) => action(index + 5)),
  ];
  const model = createCommandCardModel(actions, { game });

  assert.equal(model.schema, COMMAND_CARD_SCHEMA);
  assert.equal(model.pageSize, COMMAND_CARD_PAGE_SIZE);
  assert.equal(model.pageCount, 2);
  assert.equal(model.actions.length, 12);
  assert.equal(model.actions[0].title, 'Action 5');
  assert.equal(model.actions.find((entry) => entry.title === 'Attack-Move').hotkey, 'Q');
  assert.equal(model.actions.find((entry) => entry.title === 'Attack-Move').targeting, true);
  assert.equal(model.actions.find((entry) => entry.title === 'Patrol').targeting, true);
  assert.equal(model.actions.find((entry) => entry.title === 'Auto-Fire: ON').pressed, true);
  assert.equal(model.allActions.at(-1).group, 'production');
  assert.equal(model.allActions.find((entry) => entry.title === 'Repair').disabledReason, 'No repair facility.');
  assert.ok(Object.isFrozen(model));
  assert.ok(Object.isFrozen(model.actions));
  assert.ok(Object.isFrozen(model.actions[0]));
});

test('navigation follows grid geometry and exposes deterministic page changes', () => {
  const model = createCommandCardModel(Array.from({ length: 13 }, (_, index) => action(index)));
  assert.deepEqual(navigateCommandCard(model, 'action-0', 'ArrowRight'), { pageDelta: 0, actionId: 'action-1' });
  assert.deepEqual(navigateCommandCard(model, 'action-0', 'ArrowDown'), { pageDelta: 0, actionId: 'action-4' });
  assert.deepEqual(navigateCommandCard(model, 'action-11', 'ArrowDown'), { pageDelta: 0, actionId: 'action-11' });
  assert.deepEqual(navigateCommandCard(model, 'action-0', 'End'), { pageDelta: 0, actionId: 'action-11' });
  assert.deepEqual(navigateCommandCard(model, 'action-3', 'PageDown'), { pageDelta: 1, actionId: 'action-3' });
});

test('controller renders grouped actions, pager, targeting state, disabled reason, and keyboard focus', () => {
  const documentTarget = new FakeDocument();
  const root = new FakeElement('section', documentTarget);
  const calls = [];
  const controller = createCommandCardController({
    root,
    game: { mouse: { attackMove: true }, player: {} },
    documentTarget,
  });
  controller.begin([{ id: 1, type: 'uaInfantry' }]);
  for (let index = 0; index < 13; index += 1) {
    controller.add(action(index, {
      title: index === 0 ? 'Attack-Move' : `Action ${index}`,
      meta: index === 0 ? 'Q' : '',
      disabled: index === 2,
      disabledReason: index === 2 ? 'Unavailable in test.' : '',
      onClick: () => calls.push(index),
    }));
  }
  const firstModel = controller.commit();

  assert.equal(firstModel.pageCount, 2);
  assert.equal(root.children.length, 2);
  const firstGrid = root.children[0];
  assert.equal(firstGrid.children.length, 12);
  assert.equal(firstGrid.children[0].dataset.targeting, 'true');
  assert.equal(firstGrid.children[0].children.some((child) => child.tagName === 'kbd' && child.textContent === 'Q'), true);
  assert.equal(firstGrid.children[2].title, 'Unavailable in test.');
  assert.equal(documentTarget.head.children[0].href, COMMAND_CARD_STYLESHEET);

  firstGrid.children[0].dispatch('pointerdown', { detail: 1 });
  firstGrid.children[0].dispatch('click', { detail: 1 });
  firstGrid.children[0].dispatch('click', { detail: 0 });
  assert.deepEqual(calls, [0, 0]);

  const pageEvent = firstGrid.children[3].dispatch('keydown', { key: 'PageDown' });
  assert.equal(pageEvent.prevented, true);
  assert.equal(controller.page(), 1);
  assert.equal(root.children[0].children.length, 1);
  assert.equal(documentTarget.activeElement.dataset.commandId, 'action-12');

  controller.dispose();
  assert.equal(root.children.length, 0);
  assert.equal(documentTarget.head.children[0].removed, true);
});

test('installer captures the existing UI command lifecycle and restores exact methods', () => {
  const documentTarget = new FakeDocument();
  const root = new FakeElement('section', documentTarget);
  const game = {
    mouse: { attackMove: false },
    player: { metal: 100, fuel: 50, intel: 25, pop: 2, cap: 10 },
    selectedEntities: () => [{ id: 7, type: 'uaInfantry' }],
  };
  const ui = {
    g: game,
    e: { abilities: root },
    commandSignature: '',
    commandButton(actionDefinition) {
      const legacy = documentTarget.createElement('button');
      legacy.textContent = actionDefinition.title;
      root.append(legacy);
      return legacy;
    },
    commandStateSignature() { return 'base'; },
    shouldRenderCommands(entities) {
      const signature = this.commandStateSignature(entities);
      if (signature === this.commandSignature) return false;
      this.commandSignature = signature;
      root.replaceChildren();
      return true;
    },
    refresh() {
      const entities = game.selectedEntities();
      if (this.shouldRenderCommands(entities)) {
        this.commandButton({
          id: 'attack-move',
          title: 'Attack-Move',
          description: 'Advance and engage.',
          meta: 'Q',
          className: 'command',
          onClick() {},
        });
      }
      return 'refreshed';
    },
    setMission() { return 'mission'; },
    showMissionSelect() { return 'operations'; },
  };
  const originals = Object.fromEntries(
    ['commandButton', 'commandStateSignature', 'shouldRenderCommands', 'refresh', 'setMission', 'showMissionSelect']
      .map((key) => [key, ui[key]]),
  );
  const dispose = installProductionCommandCard(ui, { documentTarget });

  assert.equal(ui.refresh(), 'refreshed');
  assert.equal(root.children[0].className, 'commandCardGrid');
  assert.equal(root.children[0].children[0].dataset.commandId, 'attack-move');
  const firstSignature = ui.commandStateSignature(game.selectedEntities());
  game.mouse.attackMove = true;
  const secondSignature = ui.commandStateSignature(game.selectedEntities());
  assert.notEqual(firstSignature, secondSignature);
  ui.refresh();
  assert.equal(root.children[0].children[0].dataset.targeting, 'true');
  assert.equal(ui.setMission(), 'mission');
  assert.equal(root.children.length, 0);

  dispose();
  for (const [key, value] of Object.entries(originals)) assert.equal(ui[key], value);
  assert.equal(root.children.length, 0);
});

test('model rejects malformed grid dimensions and preserves duplicate command IDs safely', () => {
  assert.throws(() => createCommandCardModel([], { columns: 0 }), /positive integers/);
  const model = createCommandCardModel([
    action(0, { id: 'duplicate' }),
    action(1, { id: 'duplicate' }),
  ]);
  assert.deepEqual(model.actions.map((entry) => entry.id), ['duplicate', 'duplicate-2']);
});
