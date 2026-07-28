import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function importTransformed(relativePath, transform) {
  const source = readFileSync(join(projectRoot, relativePath), 'utf8');
  const transformed = transform(source);
  const encoded = Buffer.from(transformed).toString('base64');
  return import(`data:text/javascript;base64,${encoded}#${Date.now()}-${Math.random()}`);
}

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

  contains(name) {
    return this.values.has(name);
  }
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.classList = new FakeClassList();
    this.children = [];
    this.listeners = new Map();
    this.items = [];
    this.disabled = false;
    this.clearCount = 0;
    this._innerHTML = '';
    this.textContent = '';
    this.className = '';
    this.bounds = { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 };
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

  append(...children) {
    this.children.push(...children);
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  removeEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    this.listeners.set(
      type,
      handlers.filter((candidate) => candidate !== handler),
    );
  }

  dispatch(type, event = {}) {
    const normalized = {
      type,
      button: 0,
      detail: 0,
      repeat: false,
      shiftKey: false,
      preventDefault() {},
      ...event,
    };
    for (const handler of [...(this.listeners.get(type) || [])]) handler(normalized);
  }

  querySelectorAll(selector) {
    return selector === 'li' ? this.items : [];
  }

  getBoundingClientRect() {
    return this.bounds;
  }

  getContext() {
    return {
      fillStyle: '',
      fillRect() {},
    };
  }
}

async function verifyCommandCards() {
  const configStub = `
const ABILITIES = {};
const BUILDING_TYPES = {
  barracks: {
    name: 'Infantry Assembly Area',
    desc: 'Produces infantry.',
    produces: ['uaInfantry'],
  },
};
const FACTIONS = { 0: { name: 'Ukraine' }, 1: { name: 'Russia' } };
const MISSIONS = [];
const REGIONS = {};
const TEAM = { UA: 0, RU: 1 };
const UNIT_TYPES = {
  uaInfantry: {
    name: 'Ukrainian Mechanized Infantry Squad',
    short: 'Mechanized Squad',
    role: 'Dismounted line infantry',
    cost: { metal: 85 },
    abilities: [],
  },
};
const UPGRADES = {};
`;
  const { UI } = await importTransformed('src/ui.js', (source) =>
    source.replace(/import \{[\s\S]*?\} from '\.\/config\.js';/, configStub),
  );

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
  elements['#objectiveList'].items = [new FakeElement('li'), new FakeElement('li'), new FakeElement('li')];

  const originalDocument = globalThis.document;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  globalThis.document = {
    body: new FakeElement('body'),
    querySelector: (selector) => elements[selector],
    createElement: (tagName) => new FakeElement(tagName),
  };
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
        region: 'test',
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
    assert.equal(elements['#abilities'].children.length, 1, 'production command should render');
    const firstButton = elements['#abilities'].children[0];
    const initialClearCount = elements['#abilities'].clearCount;

    ui.refresh();
    assert.equal(
      elements['#abilities'].children[0],
      firstButton,
      'unchanged command cards must survive frame refreshes',
    );
    assert.equal(
      elements['#abilities'].clearCount,
      initialClearCount,
      'frame refresh must not rebuild unchanged command cards',
    );

    firstButton.dispatch('pointerdown', { button: 0 });
    assert.equal(queueCalls, 1, 'primary pointer press should queue production immediately');
    firstButton.dispatch('click', { detail: 1 });
    assert.equal(queueCalls, 1, 'the following pointer click must not double-activate the command');

    const keyboardButton = elements['#abilities'].children[0];
    keyboardButton.dispatch('click', { detail: 0 });
    assert.equal(queueCalls, 2, 'keyboard-generated clicks should still activate command cards');
  } finally {
    globalThis.document = originalDocument;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
}

async function verifyBattlefieldInput() {
  const { installBattlefieldInput } = await importTransformed(
    'src/input/battlefield-input.js',
    (source) => source.replace("import { TEAM } from '../config.js';", 'const TEAM = { UA: 0, RU: 1 };'),
  );

  const canvas = new FakeElement('canvas');
  const minimap = new FakeElement('canvas');
  const windowTarget = new FakeElement('window');
  windowTarget.innerWidth = 800;
  windowTarget.innerHeight = 600;

  const units = [
    { id: 1, type: 'uaInfantry', team: 0, x: 100, y: 100, selected: false },
    { id: 2, type: 'uaInfantry', team: 0, x: 240, y: 160, selected: false },
    { id: 3, type: 'uaInfantry', team: 0, x: 920, y: 120, selected: false },
    { id: 4, type: 'uaEngineer', team: 0, x: 180, y: 240, selected: false },
  ];
  const selected = new Set();
  const abilityCalls = [];
  let refreshCalls = 0;
  const game = {
    gameOver: false,
    pendingBuild: null,
    lastError: '',
    keys: new Set(),
    mouse: {
      down: false,
      drag: false,
      startX: 0,
      startY: 0,
      x: 0,
      y: 0,
      wx: 0,
      wy: 0,
    },
    camera: { x: 0, y: 0, z: 1 },
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
      if (add && selected.has(entity.id)) {
        selected.delete(entity.id);
        entity.selected = false;
        return;
      }
      selected.add(entity.id);
      entity.selected = true;
    },
    useAbility(ability) {
      abilityCalls.push(ability);
      return true;
    },
    cancelBuild() {},
    placeBuilding: () => true,
    issue: () => true,
    armAttackMove: () => true,
    stopSelected: () => true,
    toggleAutoFire: () => true,
  };
  const ui = {
    toast() {},
    refresh() {
      refreshCalls += 1;
    },
  };

  const dispose = installBattlefieldInput({ game, ui, canvas, minimap, windowTarget });
  canvas.dispatch('dblclick', { clientX: 100, clientY: 100 });
  assert.deepEqual(
    [...selected].sort((a, b) => a - b),
    [1, 2],
    'double-click should select matching friendly units in the visible viewport only',
  );

  windowTarget.dispatch('keydown', { key: '1', repeat: false });
  assert.deepEqual(abilityCalls, ['buildDepot'], 'build hotkey 1 should arm logistics-depot placement');
  assert.ok(refreshCalls >= 2, 'selection and build hotkeys should refresh the HUD');

  dispose();
  assert.equal(canvas.listeners.get('dblclick')?.length || 0, 0, 'input disposal should remove dblclick');
}

await verifyCommandCards();
await verifyBattlefieldInput();
console.log('Interaction regression checks passed.');
