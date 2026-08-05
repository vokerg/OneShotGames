const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

const requireRecord = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
};

const requireString = (value, label) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value.trim();
};

export const TUTORIAL_PROLOGUE_VERSION = 1;
export const TUTORIAL_PROLOGUE_ID = 'prologue-first-command';

export const TUTORIAL_STEPS = deepFreeze([
  {
    id: 'select-units',
    topic: 'selection',
    title: 'Take command',
    prompt: 'Select the marked infantry squad, then drag a selection box around both squads.',
    events: ['selection.click', 'selection.box'],
    hints: ['Click a unit to select it.', 'Drag on open terrain to select several units.'],
    accessibility: { announce: true, focusTarget: 'selection-panel', reducedMotionSafe: true },
  },
  {
    id: 'move-force',
    topic: 'movement',
    title: 'Move to the assembly area',
    prompt: 'Move the selected squads to the marked assembly area.',
    events: ['order.move'],
    hints: ['Right-click the ground to issue a move order.'],
    accessibility: { announce: true, focusTarget: 'world-marker', reducedMotionSafe: true },
  },
  {
    id: 'gather-resources',
    topic: 'gathering',
    title: 'Secure supplies',
    prompt: 'Assign a worker to the nearby supply point and gather the required resources.',
    events: ['economy.worker-assigned', 'economy.resource-gathered'],
    hints: ['Select a worker, then order it to the highlighted resource point.'],
    accessibility: { announce: true, focusTarget: 'resource-counter', reducedMotionSafe: true },
  },
  {
    id: 'construct-base',
    topic: 'construction',
    title: 'Establish the position',
    prompt: 'Place and complete the highlighted production structure.',
    events: ['construction.placed', 'construction.completed'],
    hints: ['Open the build menu, choose the highlighted structure, and place it inside the marked area.'],
    accessibility: { announce: true, focusTarget: 'build-menu', reducedMotionSafe: true },
  },
  {
    id: 'produce-reinforcement',
    topic: 'production',
    title: 'Raise a reinforcement',
    prompt: 'Queue and complete the highlighted unit at the new structure.',
    events: ['production.queued', 'production.completed'],
    hints: ['Select the production structure and choose the highlighted unit card.'],
    accessibility: { announce: true, focusTarget: 'production-panel', reducedMotionSafe: true },
  },
  {
    id: 'win-skirmish',
    topic: 'combat',
    title: 'Clear the checkpoint',
    prompt: 'Use attack-move and defeat the training opposition at the checkpoint.',
    events: ['order.attack-move', 'combat.enemy-destroyed'],
    hints: ['Attack-move advances while engaging threats encountered along the route.'],
    accessibility: { announce: true, focusTarget: 'command-card', reducedMotionSafe: true },
  },
  {
    id: 'use-ability',
    topic: 'abilities',
    title: 'Use a tactical ability',
    prompt: 'Activate the highlighted squad ability on the marked target area.',
    events: ['ability.activated'],
    hints: ['Select the squad, choose the highlighted ability, then choose its target.'],
    accessibility: { announce: true, focusTarget: 'ability-card', reducedMotionSafe: true },
  },
  {
    id: 'use-minimap',
    topic: 'minimap',
    title: 'Read the battlefield',
    prompt: 'Use the minimap to move the camera to the marked objective.',
    events: ['minimap.camera-jump'],
    hints: ['Click the pulsing minimap marker to jump the camera.'],
    accessibility: { announce: true, focusTarget: 'minimap', reducedMotionSafe: true },
  },
  {
    id: 'save-progress',
    topic: 'saves',
    title: 'Preserve the operation',
    prompt: 'Create a manual save, then confirm that it appears in the save list.',
    events: ['save.created'],
    hints: ['Open the pause menu and choose Save Game.'],
    accessibility: { announce: true, focusTarget: 'save-dialog', reducedMotionSafe: true },
  },
  {
    id: 'review-accessibility',
    topic: 'accessibility',
    title: 'Configure your command post',
    prompt: 'Open accessibility settings and confirm the current visual, audio, and input preferences.',
    events: ['accessibility.reviewed'],
    hints: ['Prompts remain available in the objective log and can be replayed without resetting progress.'],
    accessibility: { announce: true, focusTarget: 'accessibility-panel', reducedMotionSafe: true },
  },
  {
    id: 'complete-objective',
    topic: 'objectives',
    title: 'Complete the prologue',
    prompt: 'Capture the marked command post to complete the operation.',
    events: ['objective.completed'],
    hints: ['The objective panel tracks the command post and all optional tutorial reminders.'],
    accessibility: { announce: true, focusTarget: 'objective-panel', reducedMotionSafe: true },
  },
]);

const stepById = new Map(TUTORIAL_STEPS.map((step) => [step.id, step]));

function canonicalProgress({ index, completedEventTypes, status }) {
  const safeIndex = Math.max(0, Math.min(index, TUTORIAL_STEPS.length));
  const completedSteps = TUTORIAL_STEPS.slice(0, safeIndex).map((step) => step.id);
  return deepFreeze({
    version: TUTORIAL_PROLOGUE_VERSION,
    tutorialId: TUTORIAL_PROLOGUE_ID,
    status,
    stepIndex: safeIndex,
    activeStepId: status === 'active' ? TUTORIAL_STEPS[safeIndex]?.id ?? null : null,
    completedSteps,
    completedEventTypes: [...completedEventTypes].sort(),
    progress: safeIndex / TUTORIAL_STEPS.length,
  });
}

export function createTutorialProgress() {
  return canonicalProgress({ index: 0, completedEventTypes: [], status: 'active' });
}

export function getTutorialPrompt(progress) {
  requireRecord(progress, 'progress');
  if (progress.status !== 'active' || !progress.activeStepId) return null;
  return stepById.get(progress.activeStepId) ?? null;
}

export function reduceTutorialProgress(progress, event) {
  requireRecord(progress, 'progress');
  requireRecord(event, 'event');
  const eventType = requireString(event.type, 'event.type');

  if (eventType === 'tutorial.restart') return createTutorialProgress();
  if (eventType === 'tutorial.skip') {
    return canonicalProgress({
      index: TUTORIAL_STEPS.length,
      completedEventTypes: progress.completedEventTypes ?? [],
      status: 'skipped',
    });
  }
  if (progress.status !== 'active') return progress;

  const step = TUTORIAL_STEPS[progress.stepIndex];
  if (!step || !step.events.includes(eventType)) return progress;

  const completedEventTypes = new Set(progress.completedEventTypes ?? []);
  completedEventTypes.add(eventType);
  const complete = step.events.every((requiredType) => completedEventTypes.has(requiredType));
  if (!complete) {
    return canonicalProgress({
      index: progress.stepIndex,
      completedEventTypes,
      status: 'active',
    });
  }

  const nextIndex = progress.stepIndex + 1;
  return canonicalProgress({
    index: nextIndex,
    completedEventTypes: [],
    status: nextIndex === TUTORIAL_STEPS.length ? 'completed' : 'active',
  });
}

export const TUTORIAL_PROLOGUE = deepFreeze({
  version: TUTORIAL_PROLOGUE_VERSION,
  id: TUTORIAL_PROLOGUE_ID,
  title: 'First Command',
  kind: 'interactive-tutorial',
  fictionalized: true,
  summary: 'A safe training operation that introduces the complete player command loop before the campaign.',
  briefing: {
    commander: 'Training Command',
    situation: 'A controlled exercise area contains a supply point, construction zone, training opposition, and command-post objective.',
    intent: 'Teach one mechanic at a time, retain every prompt in the objective log, and permit skip or replay without campaign penalties.',
  },
  settings: {
    allowSkip: true,
    allowRestart: true,
    saveEnabled: true,
    defeatEnabled: false,
    objectiveLogRetainsPrompts: true,
    narrationOptional: true,
    inputGlyphs: 'active-device',
  },
  steps: TUTORIAL_STEPS,
  completion: {
    objectiveId: 'capture-training-command-post',
    unlocksCampaign: true,
    medalEligible: false,
  },
});
