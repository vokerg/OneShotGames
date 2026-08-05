import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TECH_NODE_STATES,
  createTechTreeModel,
  installTechTreeScreen,
  renderTechTreeScreen,
} from '../../src/ui/tech-tree-screen.js';

class FakeClassList {
  constructor(element) { this.element = element; }
  tokens() { return new Set(this.element.className.split(/\s+/).filter(Boolean)); }
  contains(token) { return this.tokens().has(token); }
  toggle(token, force) {
    const tokens = this.tokens();
    const present = force === undefined ? !tokens.has(token) : Boolean(force);
    if (present) tokens.add(token);
    else tokens.delete(token);
    this.element.className = [...tokens].join(' ');
    return present;
  }
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.className = '';
    this.textContent = '';
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.disabled = false;
    this.attributes = {};
    this.listeners = new Map();
    this.classList = new FakeClassList(this);
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }
  dispatch(type, event = {}) { this.listeners.get(type)?.({ target: this, ...event }); }
  closest(selector) { return selector === '[data-action]' && this.dataset.action ? this : null; }
}

function fakeDocument(elements = {}) {
  return {
    body: new FakeElement('body'),
    createElement: (tagName) => new FakeElement(tagName),
    querySelector: (selector) => elements[selector] || null,
  };
}

function fakeWindow() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    dispatch(type, event = {}) { listeners.get(type)?.(event); },
    listeners,
  };
}

function descendants(element) {
  return [element, ...element.children.flatMap(descendants)];
}

function gameFixture() {
  return {
    player: {
      metal: 500,
      fuel: 250,
      intel: 200,
      upgrades: new Set(['cageArmor']),
    },
    buildings: [{ id: 7, type: 'workshop', team: 0, hp: 900, underConstruction: false }],
    researchQueueStates: {
      'building:7': {
        facilityId: 'building:7',
        paused: false,
        queue: [{
          id: 'building:7:research:1',
          techId: 'thermal',
          duration: 20,
          remaining: 10,
          started: true,
        }],
      },
    },
  };
}

test('builds category lanes with readable locked, available, queued, and completed states', () => {
  const model = createTechTreeModel(gameFixture(), { selectedTechId: 'activeProtection' });
  assert.ok(model.lanes.length >= 3);
  assert.equal(model.selected.id, 'activeProtection');
  assert.equal(model.nodes.find((node) => node.id === 'cageArmor').state, TECH_NODE_STATES.COMPLETED);
  assert.equal(model.nodes.find((node) => node.id === 'thermal').state, TECH_NODE_STATES.QUEUED);
  assert.equal(model.nodes.find((node) => node.id === 'activeProtection').state, TECH_NODE_STATES.AVAILABLE);
  assert.equal(model.nodes.find((node) => node.id === 'digitalC2').state, TECH_NODE_STATES.LOCKED);
  assert.match(model.nodes.find((node) => node.id === 'digitalC2').blockingReasons.join(' '), /Thermal Fire-Control Sights/);
});

test('renders resource, prerequisite, node-state, and selected-project details', () => {
  const root = new FakeElement();
  const documentTarget = fakeDocument();
  renderTechTreeScreen(root, createTechTreeModel(gameFixture(), { selectedTechId: 'digitalC2' }), { documentTarget });
  const all = descendants(root);
  const text = all.map((node) => node.textContent).join(' ');
  assert.match(text, /metal/);
  assert.match(text, /Research facility ready/);
  assert.match(text, /Digital Battle Management/);
  assert.match(text, /Prerequisite: Thermal Fire-Control Sights/);
  assert.ok(all.some((node) => node.className.includes('state-completed')));
  assert.ok(all.some((node) => node.className.includes('state-queued')));
  assert.ok(all.some((node) => node.className.includes('state-locked')));
  assert.ok(all.some((node) => node.className.includes('state-available')));
});

test('opens, selects, researches through the game API, and closes with explicit controls or Escape', () => {
  const panel = new FakeElement('section');
  panel.className = 'hidden';
  const content = new FakeElement();
  const toggle = new FakeElement('button');
  const close = new FakeElement('button');
  const documentTarget = fakeDocument({
    '#techTree': panel,
    '#techTreeContent': content,
    '#techTreeToggle': toggle,
    '#techTreeClose': close,
  });
  const windowTarget = fakeWindow();
  const game = gameFixture();
  const calls = [];
  game.select = (building) => calls.push(['select', building.id]);
  game.research = (techId) => {
    calls.push(['research', techId]);
    game.researchQueueStates['building:7'].queue.push({
      id: 'building:7:research:2', techId, duration: 20, remaining: 20, started: false,
    });
    return true;
  };
  const ui = {
    toast(message) { calls.push(['toast', message]); },
    refresh() { calls.push(['refresh']); },
  };

  const dispose = installTechTreeScreen({ game, ui, documentTarget, windowTarget });
  toggle.dispatch('click');
  assert.equal(panel.classList.contains('hidden'), false);
  assert.equal(toggle.attributes['aria-expanded'], 'true');

  const selectable = descendants(content).find((node) => node.dataset.techId === 'activeProtection' && node.dataset.action === 'select-tech');
  content.dispatch('click', { target: selectable });
  const research = descendants(content).find((node) => node.dataset.techId === 'activeProtection' && node.dataset.action === 'research-tech');
  assert.equal(research.disabled, false);
  content.dispatch('click', { target: research });
  assert.deepEqual(calls.slice(0, 2), [['select', 7], ['research', 'activeProtection']]);
  assert.ok(calls.some(([name]) => name === 'refresh'));
  assert.ok(descendants(content).some((node) => node.dataset.techId === 'activeProtection' && node.className.includes('state-queued')));

  close.dispatch('click');
  assert.equal(panel.classList.contains('hidden'), true);
  toggle.dispatch('click');
  windowTarget.dispatch('keydown', { key: 'Escape' });
  assert.equal(panel.classList.contains('hidden'), true);

  dispose();
  assert.equal(content.listeners.has('click'), false);
  assert.equal(windowTarget.listeners.has('keydown'), false);
});
