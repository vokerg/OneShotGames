import assert from 'node:assert/strict';
import test from 'node:test';

import { installDoubleClickSelection } from '../../src/input/double-click-selection.js';
import { UI } from '../../src/ui.js';

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(...names) {
    names.forEach((name) => this.values.add(name));
  }

  remove(...names) {
    names.forEach((name) => this.values.delete(name));
  }

  toggle(name, force) {
    if (force === true) {
      this.values.add(name);
      return true;
    }
    if (force === false) {
      this.values.delete(name);
      return false;
    }
    if (this.values.has(name)) {
      this.values.delete(name);
      return false;
    }
    this.values.add(name);
    return true;
  }
}

class FakeElement {
  constructor() {
    this.classList = new FakeClassList();
    this.children = [];
    this.listeners = new Map();
    this.items = [];
    this.disabled = false;
    this.clearCount = 0;
    this._innerHTML = '';
    this.textContent = '';
    this.className = '';
  }

  set innerHTML(value) {
    this._innerHTML = value;
    this.children = [];
    this.clearCount += 1;
  }

  get innerHTML() {
    return this._innerHTML;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  removeEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    this.listeners.set(type, handlers.filter((candidate) => candidate !== handler));
  }

  dispatch(type, event = {}) {
    const normalized = {
      type,
      button: 0,
      detail: 0,
      clientX: 0,
      clientY: 0,
      ...event,
    };
    for (const handler of [...(this.listeners.get(type) || [])]) handler(normalized);
  }

  querySelectorAll(selector) {
    return selector === 'li' ? this.items : [];
  }
}

function createUiDocument() {
  const selectors = [
    '#metal',
    '#fuel',
    '#intel',
    '#pop',
    '#waveStatus',
    '#selectionName',
    '#selectionStats',
    '#abilities',
    '#missionTitle',
    '#missionStory',
    '#objectiveList',
    '#objectives',
    '#message',
    '#missionSelect',
    '#missionCards',
    '#endgame',
    '#endgameTitle',
    '#endgameReason',
    '#endgameStats',
    '#retryMission',
    '#returnOperations',
  ];
  const elements = Object.fromEntries(selectors.map((selector) => [selector, new FakeElement()]));
  elements['#objectiveList'].items = [new FakeElement(), new FakeElement(), new FakeElement()];
  return {
    elements,
    document: {
      body: new FakeElement(),
      querySelector: (selector) => elements[selector],
      createElement: () => new FakeElement(),
    },
  };
}

test('unchanged command cards retain their DOM nodes and activate once per pointer gesture', () => {
  const originalDocument = globalThis.document;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const { document, elements } = createUiDocument();
  globalThis.document = document;
  globalThis.setTimeout = () => 1;
  globalThis.clearTimeout = () => {};

  try {
    const building = {
      id: 11,
      type: 'barracks',
      team: 0,
      hp: 840,
      maxHp: 840,
      queue: [],
      underConstruction: false,
    };
    let queueCalls = 0;
    const game = {
      mission: {
        region: 'donbas',
        title: 'Test Mission',
        story: '',
        objectives: ['', '', ''],
        trainableHeroes: [],
        waves: { maxWaves: 1 },
      },
      player: {
        metal: 500,
        fuel: 200,
        intel: 100,
        pop: 0,
        cap: 20,
        mined: 0,
        objectives: [false, false, false],
        upgrades: new Set(),
      },
      enemy: { clock: 30, pausedForCap: false },
      wave: 0,
      gameOver: false,
      pendingBuild: null,
      selectedEntities: () => [building],
      heroAlreadyFieldedOrQueued: () => false,
      queue(type) {
        queueCalls += 1;
        building.queue.push({ type, left: 5 });
        return true;
      },
      research: () => true,
      unitStats: () => ({ damage: 10, sight: 100 }),
    };

    const ui = new UI(game);
    ui.refresh();
    const abilities = elements['#abilities'];
    assert.ok(abilities.children.length > 0);
    const firstButton = abilities.children[0];
    const initialClearCount = abilities.clearCount;

    ui.refresh();
    assert.equal(abilities.children[0], firstButton);
    assert.equal(abilities.clearCount, initialClearCount);

    firstButton.dispatch('pointerdown', { button: 0 });
    assert.equal(queueCalls, 1);
    firstButton.dispatch('click', { detail: 1 });
    assert.equal(queueCalls, 1);

    const keyboardButton = abilities.children[0];
    keyboardButton.dispatch('click', { detail: 0 });
    assert.equal(queueCalls, 2);
  } finally {
    globalThis.document = originalDocument;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test('double-click selects matching friendly units in the visible viewport and disposes cleanly', () => {
  const canvas = new FakeElement();
  const units = [
    { id: 1, type: 'uaInfantry', team: 0, hp: 100, x: 100, y: 100, selected: false },
    { id: 2, type: 'uaInfantry', team: 0, hp: 100, x: 240, y: 160, selected: false },
    { id: 3, type: 'uaInfantry', team: 0, hp: 100, x: 920, y: 120, selected: false },
    { id: 4, type: 'uaEngineer', team: 0, hp: 100, x: 180, y: 240, selected: false },
  ];
  const selected = new Set();
  const game = {
    gameOver: false,
    camera: { x: 0, y: 0, z: 1 },
    mouse: { down: true, drag: true },
    units,
    selected,
    worldPos: (x, y) => ({ x, y }),
    hit: () => units[0],
    select(entity, add = false) {
      if (!add) {
        selected.clear();
        units.forEach((unit) => {
          unit.selected = false;
        });
      }
      if (!entity) return;
      selected.add(entity.id);
      entity.selected = true;
    },
    selectedEntities: () => units.filter((unit) => selected.has(unit.id)),
  };
  let refreshCalls = 0;
  let toastMessage = '';
  const ui = {
    refresh() {
      refreshCalls += 1;
    },
    toast(message) {
      toastMessage = message;
    },
  };

  const dispose = installDoubleClickSelection({
    game,
    ui,
    canvas,
    windowTarget: { innerWidth: 800, innerHeight: 600 },
  });
  canvas.dispatch('dblclick', { clientX: 100, clientY: 100 });

  assert.deepEqual([...selected].sort((left, right) => left - right), [1, 2]);
  assert.equal(game.primarySelectedId, 1);
  assert.equal(game.mouse.down, false);
  assert.equal(game.mouse.drag, false);
  assert.equal(refreshCalls, 1);
  assert.match(toastMessage, /2 matching units/);

  dispose();
  assert.equal(canvas.listeners.get('dblclick')?.length || 0, 0);
});
