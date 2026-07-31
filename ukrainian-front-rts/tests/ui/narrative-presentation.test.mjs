import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NARRATIVE_ACTIONS,
  NARRATIVE_INTERRUPTION_POLICIES,
  createNarrativePresentationState,
  createNarrativeSpeakerRegistry,
  ingestMissionNarrativeQueues,
  narrativePresentationSnapshot,
  reduceNarrativePresentation,
} from '../../src/ui/narrative-presentation.js';

const speakers = [
  { id: 'commander', label: 'Field Commander', role: 'Task-group command', faction: 'ukraine', portraitId: 'portrait.commander' },
  { id: 'observer', label: 'Observer', role: 'Reconnaissance' },
];
const cue = (text, metadata = {}, overrides = {}) => ({
  tick: 10,
  triggerId: 'intro',
  speaker: 'commander',
  text,
  portrait: null,
  durationSeconds: 0,
  metadata,
  ...overrides,
});

test('validates speaker metadata and requires explicit notes for public-figure fiction', () => {
  const registry = createNarrativeSpeakerRegistry(speakers);
  assert.equal(Object.isFrozen(registry), true);
  assert.equal(registry.commander.label, 'Field Commander');
  assert.throws(() => createNarrativeSpeakerRegistry([
    { id: 'named-figure', label: 'Named Figure', publicFigure: true },
  ]), /requires explicit fictionalization/);
  const safe = createNarrativeSpeakerRegistry([
    { id: 'named-figure', label: 'Named Figure', publicFigure: true, fictionalized: true, contentNote: 'Fictionalized dramatic portrayal.' },
  ]);
  assert.equal(safe['named-figure'].fictionalized, true);
});

test('ingests UFR-086 dialogue and camera queues without mutating the input arrays', () => {
  const dialogueQueue = [cue('Hold the crossing.', {}, { durationSeconds: 4 })];
  const cameraCues = [{ tick: 10, triggerId: 'intro', x: 320, y: 480, zoom: 1.1, durationSeconds: 2, label: 'Crossing' }];
  const result = ingestMissionNarrativeQueues(createNarrativePresentationState({ speakers }), { dialogueQueue, cameraCues });
  assert.deepEqual(result.consumed, { dialogue: 1, camera: 1 });
  assert.equal(result.state.active.text, 'Hold the crossing.');
  assert.equal(result.state.cameraQueue[0].x, 320);
  assert.equal(dialogueQueue.length, 1);
  assert.equal(cameraCues.length, 1);
});

test('queues dialogue in authored order and advances deterministically across cues', () => {
  let state = createNarrativePresentationState({ speakers });
  state = reduceNarrativePresentation(state, { type: NARRATIVE_ACTIONS.INGEST_DIALOGUE, cue: cue('First.', {}, { durationSeconds: 2 }) });
  state = reduceNarrativePresentation(state, { type: NARRATIVE_ACTIONS.INGEST_DIALOGUE, cue: cue('Second.', {}, { durationSeconds: 3, tick: 11 }) });
  state = reduceNarrativePresentation(state, { type: NARRATIVE_ACTIONS.ADVANCE, elapsedSeconds: 2.5 });
  assert.equal(state.active.text, 'Second.');
  assert.equal(state.active.remainingSeconds, 2.5);
  assert.equal(state.log[0].result, 'completed');
});

test('applies replace, priority, and drop interruption policies explicitly', () => {
  let state = createNarrativePresentationState({ speakers });
  state = reduceNarrativePresentation(state, { type: NARRATIVE_ACTIONS.INGEST_DIALOGUE, cue: cue('Base.', { priority: 1 }, { durationSeconds: 10 }) });
  state = reduceNarrativePresentation(state, { type: NARRATIVE_ACTIONS.INGEST_DIALOGUE, cue: cue('Low priority.', { interruptionPolicy: 'priority', priority: 0 }, { tick: 11 }) });
  assert.equal(state.active.text, 'Base.');
  assert.equal(state.queue[0].text, 'Low priority.');
  state = reduceNarrativePresentation(state, { type: NARRATIVE_ACTIONS.INGEST_DIALOGUE, cue: cue('Urgent.', { interruptionPolicy: 'priority', priority: 5 }, { tick: 12 }) });
  assert.equal(state.active.text, 'Urgent.');
  assert.equal(state.log.at(-1).result, 'interrupted');
  state = reduceNarrativePresentation(state, { type: NARRATIVE_ACTIONS.INGEST_DIALOGUE, cue: cue('Discard me.', { interruptionPolicy: 'drop' }, { tick: 13 }) });
  assert.equal(state.log.at(-1).result, 'dropped');
  state = reduceNarrativePresentation(state, { type: NARRATIVE_ACTIONS.INGEST_DIALOGUE, cue: cue('Replacement.', { interruptionPolicy: 'replace' }, { tick: 14 }) });
  assert.equal(state.active.text, 'Replacement.');
});

test('derives bounded reading duration when scripts omit explicit duration', () => {
  let state = createNarrativePresentationState({ speakers, settings: { readingCharactersPerSecond: 10, minimumDurationSeconds: 2, maximumDurationSeconds: 5 } });
  state = reduceNarrativePresentation(state, { type: NARRATIVE_ACTIONS.INGEST_DIALOGUE, cue: cue('12345') });
  assert.equal(state.active.totalSeconds, 2);
  state = createNarrativePresentationState({ speakers, settings: { readingCharactersPerSecond: 10, minimumDurationSeconds: 2, maximumDurationSeconds: 5 } });
  state = reduceNarrativePresentation(state, { type: NARRATIVE_ACTIONS.INGEST_DIALOGUE, cue: cue('x'.repeat(100)) });
  assert.equal(state.active.totalSeconds, 5);
});

test('skip respects global and cue-level policy and preserves a retrievable log', () => {
  let state = createNarrativePresentationState({ speakers, settings: { maxLogEntries: 2 } });
  state = reduceNarrativePresentation(state, { type: NARRATIVE_ACTIONS.INGEST_DIALOGUE, cue: cue('Locked.', { skippable: false }, { durationSeconds: 5 }) });
  assert.equal(reduceNarrativePresentation(state, { type: NARRATIVE_ACTIONS.SKIP }), state);
  state = reduceNarrativePresentation(state, { type: NARRATIVE_ACTIONS.ADVANCE, elapsedSeconds: 5 });
  state = reduceNarrativePresentation(state, { type: NARRATIVE_ACTIONS.INGEST_DIALOGUE, cue: cue('Skippable.', {}, { tick: 12 }) });
  state = reduceNarrativePresentation(state, { type: NARRATIVE_ACTIONS.SKIP });
  assert.equal(state.active, null);
  assert.equal(state.log.at(-1).result, 'skipped');
  assert.equal(state.log.length, 2);
  state = reduceNarrativePresentation(state, { type: NARRATIVE_ACTIONS.CLEAR_LOG });
  assert.deepEqual(state.log, []);
});

test('camera cues remain ordered until explicitly acknowledged', () => {
  let state = createNarrativePresentationState({ speakers });
  for (const [index, x] of [100, 200].entries()) {
    state = reduceNarrativePresentation(state, { type: NARRATIVE_ACTIONS.INGEST_CAMERA, cue: { tick: index, x, y: 50, zoom: null, durationSeconds: 1, label: `Cue ${index}` } });
  }
  assert.equal(state.cameraQueue[0].x, 100);
  state = reduceNarrativePresentation(state, { type: NARRATIVE_ACTIONS.ACKNOWLEDGE_CAMERA });
  assert.equal(state.cameraQueue[0].x, 200);
});

test('snapshot resolves speaker and portrait fallback while subtitle visibility remains presentation-only', () => {
  let state = createNarrativePresentationState({ speakers });
  state = reduceNarrativePresentation(state, { type: NARRATIVE_ACTIONS.INGEST_DIALOGUE, cue: cue('Status report.', { contentNote: 'Fictional mission dialogue.' }) });
  let snapshot = narrativePresentationSnapshot(state);
  assert.equal(snapshot.regionId, 'notifications');
  assert.equal(snapshot.active.speakerLabel, 'Field Commander');
  assert.equal(snapshot.active.portraitId, 'portrait.commander');
  assert.equal(snapshot.controls.canSkip, true);
  assert.equal(Object.isFrozen(snapshot), true);
  state = reduceNarrativePresentation(state, { type: NARRATIVE_ACTIONS.SET_SUBTITLES, enabled: false });
  snapshot = narrativePresentationSnapshot(state);
  assert.equal(snapshot.active, null);
  assert.equal(state.active.text, 'Status report.');
});

test('rejects invalid actions and interruption metadata', () => {
  const state = createNarrativePresentationState({ speakers });
  assert.throws(() => reduceNarrativePresentation(state, { type: 'unknown' }), /Unknown narrative presentation action/);
  assert.throws(() => reduceNarrativePresentation(state, {
    type: NARRATIVE_ACTIONS.INGEST_DIALOGUE,
    cue: cue('Bad.', { interruptionPolicy: 'explode' }),
  }), /Unknown narrative interruption policy/);
  assert.equal(NARRATIVE_INTERRUPTION_POLICIES.QUEUE, 'queue');
});
