import assert from 'node:assert/strict';
import test from 'node:test';

import { TEAM } from '../../src/config.js';
import {
  NOTIFICATION_CENTER_SCHEMA,
  NOTIFICATION_CENTER_STYLESHEET,
  NOTIFICATION_KINDS,
  createNotificationCenterView,
  createNotificationObservation,
  createNotificationStore,
  deriveNotificationInputs,
  installNotificationCenter,
  navigateToNotification,
} from '../../src/ui/notification-center.js';

class FakeClassList {
  constructor(element) { this.element = element; }
  values() { return new Set(this.element.className.split(/\s+/).filter(Boolean)); }
  contains(token) { return this.values().has(token); }
  toggle(token, force) {
    const values = this.values();
    const enabled = force === undefined ? !values.has(token) : Boolean(force);
    if (enabled) values.add(token);
    else values.delete(token);
    this.element.className = [...values].join(' ');
    return enabled;
  }
}

class FakeElement {
  constructor(tagName, documentTarget) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = documentTarget;
    this.className = '';
    this.textContent = '';
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.listeners = new Map();
    this.classList = new FakeClassList(this);
    this.disabled = false;
    this.type = '';
    this.rel = '';
    this.href = '';
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
  removeEventListener(type, listener) {
    const listeners = (this.listeners.get(type) || []).filter((entry) => entry !== listener);
    if (listeners.length) this.listeners.set(type, listeners);
    else this.listeners.delete(type);
  }
  dispatch(type, event = {}) {
    for (const listener of this.listeners.get(type) || []) listener({ target: this, ...event });
  }
  remove() { this.removed = true; }
}

class FakeDocument {
  constructor() {
    this.body = new FakeElement('body', this);
    this.head = new FakeElement('head', this);
  }
  createElement(tagName) { return new FakeElement(tagName, this); }
  querySelector(selector) {
    if (selector === 'link[data-notification-center-styles="true"]') {
      return this.head.children.find((child) => child.dataset.notificationCenterStyles === 'true' && !child.removed) || null;
    }
    return null;
  }
}

function entity(id, type, hp, overrides = {}) {
  return { id, type, team: TEAM.UA, hp, maxHp: 100, x: 100, y: 200, ...overrides };
}

function gameFixture() {
  return {
    mission: { id: 'donbas', objectives: ['Secure the depot.', 'Build a workshop.'] },
    time: 10,
    tick: 300,
    player: { objectives: [false, false] },
    units: [entity(1, 'uaInfantry', 100)],
    buildings: [{
      ...entity(7, 'barracks', 100),
      queue: [{ id: '7:1', type: 'uaTank', left: 1 }],
    }],
    researchQueueEvents: [],
    camera: { x: 0, y: 0, z: 1 },
    selected: null,
    select(selected) { this.selected = selected; },
  };
}

function descendants(element) {
  return [element, ...element.children.flatMap(descendants)];
}

test('store bounds history, exposes feed/unread state, and collapses spam within cooldown', () => {
  const store = createNotificationStore({ historyLimit: 3, feedLimit: 2, cooldownSeconds: { attack: 5 } });
  const first = store.publish({
    kind: NOTIFICATION_KINDS.ATTACK,
    key: 'attack:1',
    title: 'Under attack',
    message: 'First hit',
    time: 10,
  });
  const collapsed = store.publish({
    kind: NOTIFICATION_KINDS.ATTACK,
    key: 'attack:1',
    title: 'Under attack',
    message: 'Second hit',
    time: 12,
  });
  assert.equal(first.id, collapsed.id);
  assert.equal(collapsed.count, 2);
  assert.equal(collapsed.message, 'Second hit');
  store.publish({ kind: 'system', title: 'One', message: 'One', key: '1', time: 20 });
  store.publish({ kind: 'system', title: 'Two', message: 'Two', key: '2', time: 21 });
  store.publish({ kind: 'system', title: 'Three', message: 'Three', key: '3', time: 22 });

  let model = store.snapshot();
  assert.equal(model.schema, NOTIFICATION_CENTER_SCHEMA);
  assert.equal(model.history.length, 3);
  assert.equal(model.feed.length, 2);
  assert.equal(model.unread, 3);
  assert.ok(Object.isFrozen(model));
  assert.ok(Object.isFrozen(model.history[0]));

  model = store.setHistoryOpen(true);
  assert.equal(model.historyOpen, true);
  assert.equal(model.unread, 0);
  assert.equal(store.clear().history.length, 0);
});

test('observation diff emits objective, attack, production, and research completion notices', () => {
  const game = gameFixture();
  const previous = createNotificationObservation(game);
  game.time = 12;
  game.tick = 360;
  game.player.objectives[0] = true;
  game.units[0].hp = 74;
  game.buildings[0].queue = [];
  game.units.push(entity(2, 'uaTank', 100, { x: 320, y: 420 }));
  game.researchQueueEvents.push({
    time: 12,
    type: 'researchCompleted',
    facilityId: 'building:7',
    itemId: 'building:7:research:1',
    techId: 'cageArmor',
  });
  const current = createNotificationObservation(game);
  const notices = deriveNotificationInputs(previous, current);
  assert.deepEqual(new Set(notices.map((notice) => notice.kind)), new Set([
    'objective', 'attack', 'production', 'research',
  ]));
  assert.match(notices.find((notice) => notice.kind === 'objective').message, /Secure the depot/);
  assert.match(notices.find((notice) => notice.kind === 'attack').message, /26 damage/);
  assert.match(notices.find((notice) => notice.kind === 'production').message, /T-64BV deployed/);
  assert.match(notices.find((notice) => notice.kind === 'research').message, /Counter-UAS Roof Protection/);
  assert.equal(notices.find((notice) => notice.kind === 'attack').navigation.entityId, '1');
  assert.ok(Object.isFrozen(notices));
});

test('view renders feed/history, accessibility state, counts, and navigation controls', () => {
  const documentTarget = new FakeDocument();
  const navigations = [];
  const view = createNotificationCenterView({
    documentTarget,
    onNavigate: (navigation) => navigations.push(navigation),
  });
  const store = createNotificationStore();
  store.publish({
    kind: 'attack',
    title: 'Under attack',
    message: 'Infantry is taking fire.',
    time: 1,
    navigation: { entityId: 1, x: 10, y: 20 },
  });
  view.render(store.snapshot());

  assert.equal(documentTarget.body.children[0], view.root);
  assert.equal(view.feed.attributes.role, 'status');
  assert.equal(view.feed.attributes['aria-live'], 'polite');
  assert.equal(view.toggle.textContent, 'Messages (1)');
  const focus = descendants(view.feed).find((element) => element.className === 'notificationNavigate');
  focus.dispatch('click');
  assert.deepEqual(navigations, [{ entityId: '1', x: 10, y: 20 }]);

  view.render(store.setHistoryOpen(true));
  assert.equal(view.toggle.attributes['aria-expanded'], 'true');
  assert.equal(view.panel.classList.contains('hidden'), false);
  assert.equal(view.panel.attributes.role, 'dialog');
});

test('installer observes runtime changes, captures save notices, navigates, and restores exact methods', () => {
  const documentTarget = new FakeDocument();
  const game = gameFixture();
  const calls = [];
  const ui = {
    refresh() { calls.push('refresh'); },
    toast(message) { calls.push(['toast', message]); },
    setMission() { calls.push('setMission'); },
    showMissionSelect() { calls.push('showMissionSelect'); },
  };
  const originals = Object.fromEntries(['refresh', 'toast', 'setMission', 'showMissionSelect'].map((key) => [key, ui[key]]));
  const dispose = installNotificationCenter({
    game,
    ui,
    documentTarget,
    windowTarget: { innerWidth: 1000, innerHeight: 800 },
  });
  assert.equal(documentTarget.head.children[0].href, NOTIFICATION_CENTER_STYLESHEET);
  ui.setMission();
  game.player.objectives[1] = true;
  game.units[0].hp = 80;
  ui.refresh();
  ui.toast('Campaign saved to Slot 1.');

  let model = ui.notificationCenter.snapshot();
  assert.deepEqual(new Set(model.history.map((notice) => notice.kind)), new Set(['objective', 'attack', 'save']));
  const attack = model.history.find((notice) => notice.kind === 'attack');
  assert.equal(navigateToNotification(game, attack.navigation, { windowTarget: { innerWidth: 1000, innerHeight: 800 } }), true);
  assert.equal(game.selected.id, 1);
  assert.equal(game.camera.x, 400);
  assert.equal(game.camera.y, 200);

  ui.notificationCenter.openHistory();
  model = ui.notificationCenter.snapshot();
  assert.equal(model.historyOpen, true);
  assert.equal(model.unread, 0);

  dispose();
  for (const [key, value] of Object.entries(originals)) assert.equal(ui[key], value);
  assert.equal(ui.notificationCenter, undefined);
  assert.equal(documentTarget.body.children[0].removed, true);
  assert.equal(documentTarget.head.children[0].removed, true);
});

test('mission changes establish a clean baseline instead of replaying initial state', () => {
  const game = gameFixture();
  const first = createNotificationObservation(game);
  game.mission = { id: 'kherson', objectives: ['Hold the line.'] };
  game.player.objectives = [true];
  const second = createNotificationObservation(game);
  assert.deepEqual(deriveNotificationInputs(first, second), []);
});
