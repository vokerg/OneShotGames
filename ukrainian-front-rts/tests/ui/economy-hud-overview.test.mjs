import test from 'node:test';
import assert from 'node:assert/strict';
import { createEconomyHudModel } from '../../src/core/economy-hud-model.js';
import {
  installEconomyHudOverview,
  renderEconomyHud,
} from '../../src/ui/economy-hud-overview.js';

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
    createElement: (tagName) => new FakeElement(tagName),
    querySelector: (selector) => elements[selector] || null,
  };
}

function descendants(element) {
  return [element, ...element.children.flatMap(descendants)];
}

function modelFixture() {
  return createEconomyHudModel({
    resources: { metal: 500, fuel: 250, intel: 100 },
    incomeRates: { metal: 120, fuel: 60, intel: 30 },
    production: [{
      buildingId: 7,
      name: 'Repair Workshop',
      queue: [{ id: 'unit:1', type: 'uaTank', name: 'T-64BV', duration: 20, left: 10, pop: 5 }],
      rally: { waypoints: [{ x: 320, y: 640 }] },
    }],
    research: [{
      facilityId: 'building:7',
      buildingId: 7,
      name: 'Repair Workshop',
      items: [{ id: 'research:1', techId: 'cageArmor', name: 'Roof Protection', progress: 0.5, percent: 50, remaining: 10 }],
    }],
    prerequisites: [{ id: 'activeProtection', kind: 'research', label: 'Active Protection', available: false, reasons: ['Requires Roof Protection'] }],
    capacity: { fielded: 10, reserved: 5, used: 15, capacity: 20, forecastLimit: 28 },
  });
}

test('renders all economy overview sections and actionable controls', () => {
  const documentTarget = fakeDocument();
  const root = new FakeElement();
  renderEconomyHud(root, modelFixture(), { documentTarget });
  assert.equal(root.children.length, 5);
  const all = descendants(root);
  const text = all.map((element) => element.textContent).join(' ');
  assert.match(text, /Economy flow/);
  assert.match(text, /Command capacity/);
  assert.match(text, /Production overview/);
  assert.match(text, /Research overview/);
  assert.match(text, /Availability and prerequisites/);
  const actions = new Set(all.map((element) => element.dataset.action).filter(Boolean));
  assert.ok(actions.has('cancel-production'));
  assert.ok(actions.has('move-production'));
  assert.ok(actions.has('clear-production-rally'));
  assert.ok(actions.has('cancel-research'));
  assert.ok(actions.has('set-research-paused'));
});

test('installs panel controls and delegates queue actions through public game commands', () => {
  const panel = new FakeElement();
  panel.className = 'hidden';
  const content = new FakeElement();
  const toggle = new FakeElement('button');
  const close = new FakeElement('button');
  const documentTarget = fakeDocument({
    '#economyHud': panel,
    '#economyHudContent': content,
    '#economyHudToggle': toggle,
    '#economyHudClose': close,
  });
  const building = { id: 7, x: 10, y: 20 };
  const calls = [];
  const game = {
    mission: null,
    buildings: [building],
    camera: { x: 0, y: 0, z: 1 },
    select(entity) { calls.push(['select', entity.id]); },
    cancelProduction(index) { calls.push(['cancelProduction', index]); return true; },
    lastError: '',
  };
  const ui = { refresh() {}, toast(message) { calls.push(['toast', message]); } };
  const dispose = installEconomyHudOverview({ game, ui, documentTarget });

  toggle.dispatch('click');
  assert.equal(panel.classList.contains('hidden'), false);
  assert.equal(toggle.attributes['aria-expanded'], 'true');
  close.dispatch('click');
  assert.equal(panel.classList.contains('hidden'), true);

  const cancel = new FakeElement('button');
  cancel.dataset.action = 'cancel-production';
  cancel.dataset.buildingId = '7';
  cancel.dataset.index = '2';
  content.dispatch('click', { target: cancel });
  assert.deepEqual(calls, [['select', 7], ['cancelProduction', 2]]);

  dispose();
  assert.equal(content.listeners.has('click'), false);
});
