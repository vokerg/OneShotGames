import assert from 'node:assert/strict';
import test from 'node:test';

import { TUTORIAL_PROLOGUE_ID, TUTORIAL_STEPS } from '../../src/content/campaign/tutorial-prologue.js';
import { ONBOARDING_GLOBAL, installOnboardingHelp } from '../../src/ui/onboarding-help.js';
import { ONBOARDING_TUTORIAL_RUNTIME_EVENT } from '../../src/ui/onboarding-runtime-contract.js';

function runtimeFor(stepId) {
  const step = TUTORIAL_STEPS.find((candidate) => candidate.id === stepId);
  return {
    runtimeId: TUTORIAL_PROLOGUE_ID,
    tutorialId: TUTORIAL_PROLOGUE_ID,
    status: 'active',
    activeStepId: step.id,
    marker: { id: step.id, topic: step.topic, title: step.title, prompt: step.prompt },
  };
}

class FakeDocument extends EventTarget {
  constructor() {
    super();
    this.body = {};
    this.documentElement = { lang: 'en' };
  }
  createElement() { return {}; }
}

class RuntimeEvent extends Event {
  constructor(detail) {
    super(ONBOARDING_TUTORIAL_RUNTIME_EVENT);
    this.detail = detail;
  }
}

function installHarness({ initialRuntime = null } = {}) {
  const windowTarget = new EventTarget();
  const documentTarget = new FakeDocument();
  let runtime = initialRuntime;
  let scheduled = null;
  const hints = [];
  let hideCount = 0;
  const dispose = installOnboardingHelp({
    windowTarget,
    documentTarget,
    storage: null,
    keyBindings: { q: 'attackMove' },
    resolveTutorialRuntime: () => runtime,
    schedule(callback) { scheduled = callback; return 91; },
    cancelSchedule() {},
    createView() {
      return {
        open() {},
        close() { return true; },
        showHint(step) { hints.push(step.id); return true; },
        hideHint() { hideCount += 1; },
        isOpen() { return false; },
        setLocale() {},
        dispose() {},
      };
    },
  });
  return {
    windowTarget,
    get runtime() { return runtime; },
    set runtime(value) { runtime = value; },
    get hideCount() { return hideCount; },
    hints,
    runScheduled() { scheduled?.(); },
    dispatch(runtimeId = runtime?.runtimeId ?? TUTORIAL_PROLOGUE_ID) {
      windowTarget.dispatchEvent(new RuntimeEvent({ runtimeId, snapshot: runtime }));
    },
    dispose,
  };
}

test('selector and non-tutorial states suppress authored guides but keep generic help', () => {
  const harness = installHarness();
  assert.equal(harness.windowTarget[ONBOARDING_GLOBAL].search('', { category: 'guide' }).length, 0);
  assert.ok(harness.windowTarget[ONBOARDING_GLOBAL].search('', { category: 'controls' }).length > 0);
  assert.ok(harness.windowTarget[ONBOARDING_GLOBAL].search('', { category: 'glossary' }).length > 0);
  harness.runScheduled();
  assert.deepEqual(harness.hints, []);
  harness.dispose();
});

test('runtime event renders only the matching active authored marker', () => {
  const harness = installHarness();
  harness.runtime = runtimeFor(TUTORIAL_STEPS[0].id);
  harness.dispatch();
  assert.deepEqual(harness.hints, [TUTORIAL_STEPS[0].id]);

  harness.runtime = runtimeFor(TUTORIAL_STEPS[1].id);
  harness.dispatch('different-runtime');
  assert.deepEqual(harness.hints, [TUTORIAL_STEPS[0].id]);
  harness.dispatch();
  assert.deepEqual(harness.hints, [TUTORIAL_STEPS[0].id, TUTORIAL_STEPS[1].id]);

  harness.runtime = null;
  harness.dispatch();
  assert.ok(harness.hideCount >= 1);
  assert.equal(harness.windowTarget[ONBOARDING_GLOBAL].search('', { category: 'guide' }).length, 0);
  harness.dispose();
});

test('delayed first-run callback re-reads current runtime instead of startup state', () => {
  const stale = installHarness({ initialRuntime: runtimeFor(TUTORIAL_STEPS[0].id) });
  stale.runtime = null;
  stale.runScheduled();
  assert.deepEqual(stale.hints, []);
  stale.dispose();

  const current = installHarness();
  current.runtime = runtimeFor(TUTORIAL_STEPS[1].id);
  current.runScheduled();
  assert.deepEqual(current.hints, [TUTORIAL_STEPS[1].id]);
  current.dispose();
});
