import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TUTORIAL_PROLOGUE,
  TUTORIAL_STEPS,
  createTutorialProgress,
  getTutorialPrompt,
  reduceTutorialProgress,
} from '../../src/content/campaign/tutorial-prologue.js';

const REQUIRED_TOPICS = [
  'selection',
  'movement',
  'gathering',
  'construction',
  'production',
  'combat',
  'abilities',
  'minimap',
  'saves',
  'accessibility',
  'objectives',
];

function completeStep(progress) {
  const step = getTutorialPrompt(progress);
  return step.events.reduce(
    (next, type) => reduceTutorialProgress(next, { type }),
    progress,
  );
}

test('authored prologue covers every required onboarding topic', () => {
  assert.deepEqual(TUTORIAL_STEPS.map((step) => step.topic), REQUIRED_TOPICS);
  assert.equal(TUTORIAL_PROLOGUE.kind, 'interactive-tutorial');
  assert.equal(TUTORIAL_PROLOGUE.settings.allowSkip, true);
  assert.equal(TUTORIAL_PROLOGUE.settings.saveEnabled, true);
  assert.equal(TUTORIAL_PROLOGUE.settings.objectiveLogRetainsPrompts, true);
  assert.ok(TUTORIAL_STEPS.every((step) => step.accessibility.announce));
  assert.ok(TUTORIAL_STEPS.every((step) => step.accessibility.reducedMotionSafe));
});

test('progresses only after all events for the active step arrive', () => {
  let progress = createTutorialProgress();
  assert.equal(progress.activeStepId, 'select-units');

  progress = reduceTutorialProgress(progress, { type: 'selection.click' });
  assert.equal(progress.activeStepId, 'select-units');
  assert.deepEqual(progress.completedEventTypes, ['selection.click']);

  progress = reduceTutorialProgress(progress, { type: 'selection.box' });
  assert.equal(progress.activeStepId, 'move-force');
  assert.deepEqual(progress.completedSteps, ['select-units']);
  assert.deepEqual(progress.completedEventTypes, []);
});

test('ignores out-of-order and duplicate runtime events', () => {
  const initial = createTutorialProgress();
  const outOfOrder = reduceTutorialProgress(initial, { type: 'order.move' });
  assert.equal(outOfOrder, initial);

  const clicked = reduceTutorialProgress(initial, { type: 'selection.click' });
  const duplicate = reduceTutorialProgress(clicked, { type: 'selection.click' });
  assert.deepEqual(duplicate, clicked);
});

test('completes the entire tutorial deterministically', () => {
  let progress = createTutorialProgress();
  for (const expectedStep of TUTORIAL_STEPS) {
    assert.equal(getTutorialPrompt(progress).id, expectedStep.id);
    progress = completeStep(progress);
  }

  assert.equal(progress.status, 'completed');
  assert.equal(progress.activeStepId, null);
  assert.deepEqual(progress.completedSteps, TUTORIAL_STEPS.map((step) => step.id));
  assert.equal(progress.progress, 1);
  assert.equal(getTutorialPrompt(progress), null);
});

test('supports skip and restart without leaking partial state', () => {
  let progress = reduceTutorialProgress(createTutorialProgress(), { type: 'selection.click' });
  progress = reduceTutorialProgress(progress, { type: 'tutorial.skip' });

  assert.equal(progress.status, 'skipped');
  assert.equal(progress.progress, 1);
  assert.deepEqual(progress.completedSteps, TUTORIAL_STEPS.map((step) => step.id));

  progress = reduceTutorialProgress(progress, { type: 'tutorial.restart' });
  assert.deepEqual(progress, createTutorialProgress());
});

test('authored content and emitted progress snapshots are immutable', () => {
  const progress = createTutorialProgress();
  assert.equal(Object.isFrozen(TUTORIAL_PROLOGUE), true);
  assert.equal(Object.isFrozen(TUTORIAL_STEPS[0].accessibility), true);
  assert.equal(Object.isFrozen(progress), true);
  assert.equal(Object.isFrozen(progress.completedSteps), true);
});
