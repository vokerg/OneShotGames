import test from 'node:test';
import assert from 'node:assert/strict';
import { createEconomyHudModel } from '../../src/core/economy-hud-model.js';
import {
  createEconomyCompletionTracker,
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
  click() { this.dispatch('click'); }
  closest(selector) { return selector === '[data-action]' && this.dataset.action ? this : null; }
}

class FakeCustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
}

function fakeDocument(elements = {}) {
  const events = [];
  return {
    defaultView: { innerWidth: 1000, innerHeight: 700, CustomEvent: FakeCustomEvent },
    events,
    createElement: (tagName) => new FakeElement(tagName),
    querySelector: (selector) => elements[selector] || null,
    dispatchEvent: (event) => { events.push(event); return true; },
  };
}

function descendants(element) {
  return [element, ...element.children.flatMap(descendants)];
}

function modelFixture(overrides = {}) {
  return createEconomyHudModel({
    resources: { metal: 500, fuel: 250, intel: 100 },
    incomeRates: { metal: 120, fuel: 60, intel: 30 },
    workers: {
      total: 4,
      taskCounts: { idle: 1, gathering: 2, returning: 0, building: 1, other: 0 },
      resourceCounts: { metal: 2, fuel: 1, intel: 0 },
      carried: { metal: 20, fuel: 4, intel: 0 },
    },
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
      items: [{ id: 'research:1', techId: 'cageArmor', name: 'Roof Protection', status: 'active', progress: 0.5, percent: 50, remaining: 10 }],
    }],
    researchTree: { screenId: 'techTree', label: 'Open research tree' },
    completions: [{ id: 'completion:1', kind: 'production', sourceId: 7, buildingId: 7, sourceName: 'Repair Workshop', name: 'Combat Engineers' }],
    prerequisites: [{ id: 'activeProtection', kind: 'research', label: 'Active Protection', available: false, reasons: ['Requires Roof Protection'] }],
    capacity: { fielded: 10, reserved: 5, used: 15, capacity: 20, forecastLimit: 28 },
    ...overrides,
  });
}

test('renders all UFR-137 panel sections and actionable controls', () => {
  const documentTarget = fakeDocument();
  const root = new FakeElement();
  renderEconomyHud(root, modelFixture(), { documentTarget });
  assert.equal(root.children.length, 8);
  const all = descendants(root);
  const text = all.map((element) => element.textContent).join(' ');
  assert.match(text, /Economy flow/);
  assert.match(text, /Worker allocation/);
  assert.match(text, /Command capacity/);
  assert.match(text, /Global queues/);
  assert.match(text, /Production controls/);
  assert.match(text, /Research controls/);
  assert.match(text, /Recent completions/);
  assert.match(text, /Availability and prerequisites/);
  const actions = new Set(all.map((element) => element.dataset.action).filter(Boolean));
  assert.ok(actions.has('cancel-production'));
  assert.ok(actions.has('move-production'));
  assert.ok(actions.has('set-production-rally-view'));
  assert.ok(actions.has('focus-production-rally'));
  assert.ok(actions.has('clear-production-rally'));
  assert.ok(actions.has('cancel-research'));
  assert.ok(actions.has('set-research-paused'));
  assert.ok(actions.has('open-research-tree'));
  assert.ok(actions.has('focus-queue-source'));
  assert.ok(actions.has('focus-completion-source'));
});

test('tracks likely natural completions but excludes explicit cancellation', () => {
  const nearlyDone = modelFixture({
    production: [{
      buildingId: 7,
      name: 'Repair Workshop',
      queue: [{ id: 'unit:1', name: 'T-64BV', duration: 20, left: 0.2 }],
    }],
    research: [],
    completions: [],
  });
  const empty = modelFixture({ production: [], research: [], completions: [] });
  const tracker = createEconomyCompletionTracker({ limit: 2 });
  assert.deepEqual(tracker.observe(nearlyDone, { mission: 'm1', time: 10 }), []);
  const completed = tracker.observe(empty, { mission: 'm1', time: 11 });
  assert.equal(completed.length, 1);
  assert.equal(completed[0].name, 'T-64BV');
  assert.equal(completed[0].buildingId, '7');

  const cancellationTracker = createEconomyCompletionTracker();
  cancellationTracker.observe(nearlyDone, { mission: 'm1', time: 10 });
  cancellationTracker.ignore('production:7:unit:1');
  assert.deepEqual(cancellationTracker.observe(empty, { mission: 'm1', time: 11 }), []);
});

test('installs controls, delegates public commands, and restores the exact refresh function', () => {
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
  const building = { id: 7, x: 10, y: 20, rallyWaypoints: [{ x: 50, y: 60 }] };
  const calls = [];
  const game = {
    mission: null,
    buildings: [building],
    camera: { x: -100, y: -50, z: 1 },
    select(entity) { calls.push(['select', entity.id]); },
    cancelProduction(index) { calls.push(['cancelProduction', index]); return true; },
    setProductionRally(x, y, options) { calls.push(['setProductionRally', x, y, options.append, options.building.id]); return true; },
    lastError: '',
  };
  const originalRefresh = function originalRefresh() { calls.push(['refresh']); };
  const ui = {
    refresh: originalRefresh,
    toast(message) { calls.push(['toast', message]); },
    openScreen(screenId) { calls.push(['openScreen', screenId]); return true; },
  };
  const dispose = installEconomyHudOverview({ game, ui, documentTarget });
  assert.notEqual(ui.refresh, originalRefresh);

  toggle.dispatch('click');
  assert.equal(panel.classList.contains('hidden'), false);
  assert.equal(toggle.attributes['aria-expanded'], 'true');
  close.dispatch('click');
  assert.equal(panel.classList.contains('hidden'), true);

  const rally = new FakeElement('button');
  rally.dataset.action = 'set-production-rally-view';
  rally.dataset.buildingId = '7';
  rally.dataset.append = 'true';
  content.dispatch('click', { target: rally });

  const cancel = new FakeElement('button');
  cancel.dataset.action = 'cancel-production';
  cancel.dataset.buildingId = '7';
  cancel.dataset.index = '2';
  cancel.dataset.globalQueueId = 'production:7:unit:1';
  content.dispatch('click', { target: cancel });

  const techTree = new FakeElement('button');
  techTree.dataset.action = 'open-research-tree';
  techTree.dataset.screenId = 'techTree';
  content.dispatch('click', { target: techTree });

  assert.ok(calls.some((call) => call[0] === 'cancelProduction' && call[1] === 2));
  assert.ok(calls.some((call) => call[0] === 'setProductionRally' && call[1] === 600 && call[2] === 400 && call[3] === true && call[4] === 7));
  assert.ok(calls.some((call) => call[0] === 'openScreen' && call[1] === 'techTree'));

  dispose();
  assert.equal(ui.refresh, originalRefresh);
  assert.equal(content.listeners.has('click'), false);
});

test('opens the merged UFR-138 screen through the installed tech-tree toggle', () => {
  const panel = new FakeElement();
  panel.className = 'hidden';
  const content = new FakeElement();
  const toggle = new FakeElement('button');
  const close = new FakeElement('button');
  const techTreeToggle = new FakeElement('button');
  let opened = 0;
  techTreeToggle.addEventListener('click', () => { opened += 1; });
  const documentTarget = fakeDocument({
    '#economyHud': panel,
    '#economyHudContent': content,
    '#economyHudToggle': toggle,
    '#economyHudClose': close,
    '#techTreeToggle': techTreeToggle,
  });
  const game = { mission: null, buildings: [], camera: { x: 0, y: 0, z: 1 }, lastError: '' };
  const ui = { refresh() {}, toast() {} };
  const dispose = installEconomyHudOverview({ game, ui, documentTarget });

  const action = new FakeElement('button');
  action.dataset.action = 'open-research-tree';
  action.dataset.screenId = 'techTree';
  content.dispatch('click', { target: action });

  assert.equal(opened, 1);
  dispose();
});
