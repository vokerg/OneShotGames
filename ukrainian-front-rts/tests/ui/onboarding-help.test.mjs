import assert from 'node:assert/strict';
import test from 'node:test';

import { TUTORIAL_STEPS } from '../../src/content/campaign/tutorial-prologue.js';
import {
  ONBOARDING_CONTEXT_EVENT,
  ONBOARDING_GLOBAL,
  createControlReference,
  createOnboardingHelpCatalog,
  createOnboardingHelpState,
  installOnboardingHelp,
  searchOnboardingHelp,
} from '../../src/ui/onboarding-help.js';

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
    snapshot() { return Object.fromEntries(values); },
  };
}

class FakeWindow extends EventTarget {
  setTimeout(callback) { callback(); return 1; }
}

class FakeDocument extends EventTarget {
  constructor() {
    super();
    this.body = {};
  }
  createElement() { return {}; }
}

class KeyEvent extends Event {
  constructor(key) {
    super('keydown', { cancelable: true });
    this.key = key;
  }
}

class ContextEvent extends Event {
  constructor(topic) {
    super(ONBOARDING_CONTEXT_EVENT);
    this.detail = { topic };
  }
}

test('catalog combines every tutorial step, current controls, and glossary entries', () => {
  const bindings = {
    q: 'attackMove',
    f: 'attackGround',
    escape: 'cancel',
  };
  const catalog = createOnboardingHelpCatalog({ keyBindings: bindings });
  const guideEntries = catalog.filter((entry) => entry.category === 'guide');
  const controlEntries = catalog.filter((entry) => entry.category === 'controls');
  const glossaryEntries = catalog.filter((entry) => entry.category === 'glossary');

  assert.equal(guideEntries.length, TUTORIAL_STEPS.length);
  assert.ok(controlEntries.length >= 10);
  assert.ok(glossaryEntries.length >= 8);
  assert.deepEqual(
    controlEntries.find((entry) => entry.action === 'attackMove').keys,
    ['Q'],
  );
  assert.equal(Object.isFrozen(catalog), true);
});

test('control reference reports multiple live bindings and unbound actions', () => {
  const controls = createControlReference({
    w: 'w',
    arrowup: 'w',
    q: 'attackMove',
  });
  const cameraUp = controls.find((entry) => entry.action === 'w');
  const attackMove = controls.find((entry) => entry.action === 'attackMove');
  const disembark = controls.find((entry) => entry.action === 'disembark');

  assert.deepEqual(cameraUp.keys, ['W', '↑']);
  assert.match(attackMove.summary, /Q/);
  assert.match(disembark.summary, /unbound/);
});

test('search requires every query token and ranks title matches first', () => {
  const catalog = createOnboardingHelpCatalog({ keyBindings: { q: 'attackMove' } });
  const attack = searchOnboardingHelp(catalog, 'attack move');
  assert.ok(attack.length >= 1);
  assert.equal(attack[0].title, 'Attack-move');
  assert.equal(attack.every((entry) => /attack/i.test(JSON.stringify(entry))), true);

  const glossary = searchOnboardingHelp(catalog, '', { category: 'glossary' });
  assert.ok(glossary.length >= 8);
  assert.equal(glossary.every((entry) => entry.category === 'glossary'), true);
});

test('hint state persists seen and dismissed hints and resets deterministically', () => {
  const storage = createStorage();
  const state = createOnboardingHelpState({ storage });
  const first = state.nextHint();
  assert.equal(first.id, TUTORIAL_STEPS[0].id);

  state.markSeen(first.id);
  assert.equal(state.nextHint().id, TUTORIAL_STEPS[1].id);
  state.dismiss(first.id);
  assert.equal(state.snapshot().dismissedHintIds.includes(first.id), true);

  const restored = createOnboardingHelpState({ storage });
  assert.equal(restored.snapshot().seenHintIds.includes(first.id), true);
  assert.equal(restored.snapshot().dismissedHintIds.includes(first.id), true);
  restored.dismissAll();
  assert.equal(restored.snapshot().remainingHintIds.length, 0);
  restored.reset();
  assert.equal(restored.snapshot().remainingHintIds.length, TUTORIAL_STEPS.length);
});

test('malformed stored hint identifiers are normalized without leaking invalid values', () => {
  const storage = createStorage({
    'fields-of-resolve:onboarding-help:v1': JSON.stringify({
      version: 1,
      dismissedHintIds: [TUTORIAL_STEPS[0].id, 42, '', null],
      seenHintIds: [TUTORIAL_STEPS[1].id, false, '  '],
    }),
  });
  const snapshot = createOnboardingHelpState({ storage }).snapshot();
  assert.deepEqual(snapshot.dismissedHintIds, ['42', TUTORIAL_STEPS[0].id].sort());
  assert.deepEqual(snapshot.seenHintIds, [TUTORIAL_STEPS[1].id, 'false'].sort());
});

test('installation exposes F1 help, contextual prompts, reset, and exact teardown', () => {
  const windowTarget = new FakeWindow();
  const documentTarget = new FakeDocument();
  const storage = createStorage();
  const calls = [];
  let open = false;
  const dispose = installOnboardingHelp({
    windowTarget,
    documentTarget,
    storage,
    keyBindings: { q: 'attackMove' },
    schedule(callback) { callback(); },
    createView({ catalog, state }) {
      calls.push(['created', catalog.length, state.snapshot().remainingHintIds.length]);
      return {
        open() { open = true; calls.push(['open']); },
        close() { open = false; calls.push(['close']); return true; },
        showHint(step) { calls.push(['hint', step.topic]); return true; },
        hideHint() { calls.push(['hide']); },
        isOpen() { return open; },
        dispose() { calls.push(['dispose']); },
      };
    },
  });

  assert.equal(typeof windowTarget[ONBOARDING_GLOBAL].search, 'function');
  assert.equal(calls.some(([kind]) => kind === 'hint'), true);

  const key = new KeyEvent('F1');
  windowTarget.dispatchEvent(key);
  assert.equal(key.defaultPrevented, true);
  assert.equal(open, true);

  windowTarget.dispatchEvent(new ContextEvent('minimap'));
  assert.equal(calls.some(([kind, topic]) => kind === 'hint' && topic === 'minimap'), true);
  windowTarget[ONBOARDING_GLOBAL].reset();
  assert.equal(windowTarget[ONBOARDING_GLOBAL].snapshot().catalogSize > TUTORIAL_STEPS.length, true);

  assert.equal(dispose(), true);
  assert.equal(dispose(), false);
  assert.equal(ONBOARDING_GLOBAL in windowTarget, false);
  assert.deepEqual(calls.at(-1), ['dispose']);
});

test('installation refreshes bindings and cancels a pending first-time hint', () => {
  const windowTarget = new FakeWindow();
  const documentTarget = new FakeDocument();
  let bindings = { q: 'attackMove' };
  let scheduled = null;
  const cancellations = [];
  const hints = [];
  const dispose = installOnboardingHelp({
    windowTarget,
    documentTarget,
    storage: createStorage(),
    keyBindings: () => bindings,
    schedule(callback) { scheduled = callback; return 17; },
    cancelSchedule(handle) { cancellations.push(handle); },
    createView() {
      return {
        open() {},
        close() { return true; },
        showHint(step) { hints.push(step.id); return true; },
        hideHint() {},
        isOpen() { return false; },
        dispose() {},
      };
    },
  });

  let attackMove = windowTarget[ONBOARDING_GLOBAL]
    .search('', { category: 'controls' })
    .find((entry) => entry.action === 'attackMove');
  assert.deepEqual(attackMove.keys, ['Q']);

  bindings = { f: 'attackMove' };
  attackMove = windowTarget[ONBOARDING_GLOBAL]
    .search('', { category: 'controls' })
    .find((entry) => entry.action === 'attackMove');
  assert.deepEqual(attackMove.keys, ['F']);

  assert.equal(dispose(), true);
  assert.deepEqual(cancellations, [17]);
  scheduled();
  assert.deepEqual(hints, []);
});
