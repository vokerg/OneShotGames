import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameRuntime } from '../../src/app/runtime.js';
import {
  ACCESSIBILITY_PAUSE_EVENT,
  ACCESSIBILITY_RESUME_EVENT,
} from '../../src/core/accessibility-events.js';
import {
  DEFAULT_ACTION_BINDINGS,
  DEFAULT_KEY_BINDINGS,
  getRuntimeKeyBindings,
  INPUT_ACTIONS,
  normalizeActionBindings,
  rebindInputAction,
  resolveInputAction,
  setRuntimeActionBindings,
  setRuntimeKeyBindings,
  unbindInputAction,
  createKeyBindings,
} from '../../src/input/action-map.js';
import {
  ACCESSIBILITY_SETTINGS_SCHEMA,
  ACCESSIBILITY_SETTINGS_VERSION,
  createAccessibilitySettingsController,
  DEFAULT_ACCESSIBILITY_SETTINGS,
  normalizeAccessibilitySettings,
} from '../../src/audio/accessibility-settings.js';
import { createAccessibilityRuntime } from '../../src/audio/accessibility-runtime.js';

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event) {
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    return true;
  }

  emit(type) {
    this.dispatchEvent({ type });
  }
}

class FakeStyle {
  constructor() {
    this.values = new Map();
  }

  getPropertyValue(name) {
    return this.values.get(name) ?? '';
  }

  setProperty(name, value) {
    this.values.set(name, String(value));
  }

  removeProperty(name) {
    this.values.delete(name);
  }
}

class FakeElement {
  constructor() {
    this.attributes = new Map();
    this.style = new FakeStyle();
    this.children = [];
    this.removed = false;
    this.id = '';
    this.textContent = '';
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  remove() {
    this.removed = true;
  }
}

function createFakeDocument() {
  const target = new FakeEventTarget();
  target.documentElement = new FakeElement();
  target.head = new FakeElement();
  target.defaultView = { CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } } };
  target.getElementById = () => null;
  target.createElement = () => new FakeElement();
  return target;
}

function createStorage(initial = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key, next) => { value = next; },
    value: () => value,
  };
}

test('action bindings normalize deterministically and reject duplicate physical keys', () => {
  const normalized = normalizeActionBindings({
    ...DEFAULT_ACTION_BINDINGS,
    [INPUT_ACTIONS.CAMERA_UP]: ['Z', 'z'],
    [INPUT_ACTIONS.ATTACK_MOVE]: ['z', 'q'],
  });
  assert.deepEqual(normalized[INPUT_ACTIONS.CAMERA_UP], ['z']);
  assert.deepEqual(normalized[INPUT_ACTIONS.ATTACK_MOVE], ['q']);
  assert.ok(Object.isFrozen(normalized));
});

test('runtime binding view updates already-installed input consumers', () => {
  setRuntimeKeyBindings(DEFAULT_KEY_BINDINGS);
  const installedView = createKeyBindings();
  const next = {
    ...DEFAULT_ACTION_BINDINGS,
    [INPUT_ACTIONS.ATTACK_MOVE]: ['z'],
  };
  const previous = setRuntimeActionBindings(next);
  try {
    assert.equal(resolveInputAction(installedView, 'z'), INPUT_ACTIONS.ATTACK_MOVE);
    assert.equal(resolveInputAction(installedView, 'q'), null);
    assert.equal(getRuntimeKeyBindings().z, INPUT_ACTIONS.ATTACK_MOVE);
  } finally {
    setRuntimeKeyBindings(previous);
  }
});

test('rebinding reports conflicts, supports explicit replacement, and permits unbinding', () => {
  const blocked = rebindInputAction(DEFAULT_ACTION_BINDINGS, INPUT_ACTIONS.ATTACK_MOVE, 'x');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.conflict, INPUT_ACTIONS.STOP);

  const replaced = rebindInputAction(DEFAULT_ACTION_BINDINGS, INPUT_ACTIONS.ATTACK_MOVE, 'x', { replace: true });
  assert.equal(replaced.ok, true);
  assert.deepEqual(replaced.bindings[INPUT_ACTIONS.ATTACK_MOVE], ['x']);
  assert.deepEqual(replaced.bindings[INPUT_ACTIONS.STOP], []);

  const unbound = unbindInputAction(replaced.bindings, INPUT_ACTIONS.ATTACK_MOVE);
  assert.deepEqual(unbound[INPUT_ACTIONS.ATTACK_MOVE], []);
});

test('game runtime keeps independent pause reasons isolated', () => {
  const runtime = createGameRuntime({
    game: { mission: null },
    renderer: { render() {} },
    ui: { refresh() {} },
    now: () => 100,
    requestFrame: () => 1,
    cancelFrame() {},
  });
  assert.equal(runtime.isPaused(), false);
  runtime.pause('menu');
  runtime.pause('accessibility-focus-loss');
  assert.deepEqual(runtime.pauseReasons(), ['accessibility-focus-loss', 'menu']);
  runtime.resume('accessibility-focus-loss');
  assert.equal(runtime.isPaused(), true);
  assert.deepEqual(runtime.pauseReasons(), ['menu']);
  runtime.resume('menu');
  assert.equal(runtime.isPaused(), false);
  assert.throws(() => runtime.pause(''), /non-empty string/);
});

test('settings migrate safely, persist updates, and fail closed on future schemas', () => {
  const future = normalizeAccessibilitySettings({
    schema: ACCESSIBILITY_SETTINGS_SCHEMA,
    version: ACCESSIBILITY_SETTINGS_VERSION + 1,
    uiScale: 1.3,
  });
  assert.deepEqual(future, DEFAULT_ACCESSIBILITY_SETTINGS);

  const storage = createStorage();
  const applied = [];
  const controller = createAccessibilitySettingsController({ storage, apply: (settings) => applied.push(settings) });
  controller.update({ uiScale: 1.15, contrastMode: 'high', reduceFlashes: true });
  const snapshot = controller.snapshot();
  assert.equal(snapshot.settings.uiScale, 1.15);
  assert.equal(snapshot.settings.contrastMode, 'high');
  assert.equal(snapshot.settings.reduceFlashes, true);
  assert.equal(JSON.parse(storage.value()).schema, ACCESSIBILITY_SETTINGS_SCHEMA);
  assert.equal(applied.at(-1), snapshot.settings);
  assert.equal(controller.dispose(), true);
  assert.equal(controller.dispose(), false);
});

test('runtime applies and restores visual state, bindings, and focus-loss lifecycle', () => {
  const documentTarget = createFakeDocument();
  const windowTarget = new FakeEventTarget();
  let pauses = 0;
  let resumes = 0;
  let pauseEvents = 0;
  let resumeEvents = 0;
  documentTarget.addEventListener(ACCESSIBILITY_PAUSE_EVENT, () => { pauseEvents += 1; });
  documentTarget.addEventListener(ACCESSIBILITY_RESUME_EVENT, () => { resumeEvents += 1; });
  const previous = setRuntimeKeyBindings(DEFAULT_KEY_BINDINGS);
  const runtime = createAccessibilityRuntime({
    documentTarget,
    windowTarget,
    pause: () => { pauses += 1; },
    resume: () => { resumes += 1; },
  });
  try {
    runtime.apply({
      ...DEFAULT_ACCESSIBILITY_SETTINGS,
      uiScale: 1.3,
      textScale: 1.15,
      colorVisionPreset: 'deuteranopia',
      contrastMode: 'high',
      reducedMotion: true,
      reduceFlashes: true,
      cursorSize: 'large',
      actionBindings: {
        ...DEFAULT_ACTION_BINDINGS,
        [INPUT_ACTIONS.ATTACK_MOVE]: ['z'],
      },
    });
    const root = documentTarget.documentElement;
    assert.equal(root.getAttribute('data-accessibility-contrast'), 'high');
    assert.equal(root.style.getPropertyValue('--accessibility-ui-scale'), '1.3');
    assert.equal(getRuntimeKeyBindings().z, INPUT_ACTIONS.ATTACK_MOVE);
    windowTarget.emit('blur');
    assert.equal(pauses, 1);
    assert.equal(pauseEvents, 1);
    assert.equal(root.getAttribute('data-accessibility-focus-paused'), 'true');
    windowTarget.emit('focus');
    assert.equal(resumes, 1);
    assert.equal(resumeEvents, 1);
    assert.equal(root.getAttribute('data-accessibility-focus-paused'), null);
    assert.equal(runtime.dispose(), true);
    assert.equal(root.getAttribute('data-accessibility-contrast'), null);
    assert.equal(documentTarget.head.children[0].removed, true);
  } finally {
    setRuntimeKeyBindings(previous);
  }
});
