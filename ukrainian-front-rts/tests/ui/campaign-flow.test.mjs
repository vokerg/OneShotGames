import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMPAIGN_FLOW_ACTIONS,
  CAMPAIGN_FLOW_STAGES,
  createCampaignFlowState,
  createLoadingTransitionModel,
  createMissionBriefingModel,
  createMissionDebriefModel,
  reduceCampaignFlow,
  updateLoadingTransition,
} from '../../src/ui/campaign-flow.js';

function briefingFixture() {
  return createMissionBriefingModel({
    operationId: 'operation-dnipro',
    title: 'Hold the Crossing',
    summary: 'Secure the bridgehead and preserve enough combat power for the counterattack.',
    mapPreview: {
      mapId: 'map-dnipro',
      imageId: 'preview-dnipro',
      caption: 'River crossing and eastern assembly areas',
      markers: [
        { id: 'start', kind: 'friendly-start', label: 'Bridgehead', x: 0.22, y: 0.61 },
        { id: 'objective', kind: 'objective', label: 'Eastern bank', x: 0.73, y: 0.44 },
      ],
    },
    forces: [
      { id: 'infantry', label: 'Mechanized infantry', category: 'infantry', count: 3 },
      { id: 'armor', label: 'Tank platoon', category: 'armor', count: 1, note: 'Limited replacements' },
    ],
    intelligence: [
      { id: 'enemy-fires', title: 'Enemy artillery', detail: 'A battery is likely west of the industrial area.', confidence: 'likely' },
    ],
    objectives: [
      { id: 'hold', title: 'Hold the bridgehead', description: 'Prevent hostile forces entering the command zone.' },
      { id: 'rescue', title: 'Recover the scouts', description: 'Extract the isolated reconnaissance team.', optional: true },
    ],
    difficulty: 'veteran',
    difficultyNotes: { label: 'Veteran', summary: 'Shorter recovery windows.', modifiers: ['Faster enemy reaction', 'Reduced checkpoint frequency'] },
    loadingHints: ['Use smoke before crossing open ground.', 'Recovery vehicles preserve scarce armor.'],
    metadata: { weather: 'rain', startHour: 5 },
  });
}

function debriefFixture() {
  return createMissionDebriefModel({
    operationId: 'operation-dnipro',
    title: 'Bridgehead Secured',
    summary: 'The crossing remains open for the next operation.',
    outcome: 'victory',
    score: 8420,
    completedTick: 5400,
    medals: [{ id: 'medal-preservation', title: 'Force Preservation', description: 'Lost fewer than three vehicles.' }],
    losses: {
      categories: [
        { id: 'infantry', label: 'Infantry', lost: 8, deployed: 42 },
        { id: 'vehicles', label: 'Vehicles', lost: 2, deployed: 12 },
      ],
    },
    timeline: [
      { id: 'bridge-held', tick: 1200, kind: 'objective', title: 'First assault repelled' },
      { id: 'scouts-recovered', tick: 3100, kind: 'optional-objective', title: 'Recon team extracted' },
      { id: 'victory', tick: 5400, kind: 'outcome', title: 'Counterattack defeated' },
    ],
    nextOperations: [
      { operationId: 'operation-steppe', title: 'Steppe Advance', unlocked: true, recommended: true },
      { operationId: 'operation-coast', title: 'Coastal Route', unlocked: false, lockReason: 'Requires the logistics choice.' },
    ],
    campaignConsequences: { unlocked: ['operation-steppe'], preservedArmor: 10 },
  });
}

test('briefing model covers map, forces, intelligence, objectives, and difficulty', () => {
  const briefing = briefingFixture();
  assert.equal(briefing.screenId, 'briefing');
  assert.equal(briefing.mapPreview.markers.length, 2);
  assert.equal(briefing.forces[1].count, 1);
  assert.equal(briefing.intelligence[0].confidence, 'likely');
  assert.equal(briefing.objectives[1].optional, true);
  assert.deepEqual(briefing.difficulty.modifiers, ['Faster enemy reaction', 'Reduced checkpoint frequency']);
  assert.ok(Object.isFrozen(briefing.mapPreview.markers));
});

test('authored objective and force order is preserved', () => {
  const briefing = briefingFixture();
  assert.deepEqual(briefing.objectives.map((entry) => entry.id), ['hold', 'rescue']);
  assert.deepEqual(briefing.forces.map((entry) => entry.id), ['infantry', 'armor']);
});

test('loading transition reports bounded progress and rotating hints', () => {
  const briefing = briefingFixture();
  const loading = createLoadingTransitionModel(briefing, { status: 'loading-map', progress: 0.42, hintIndex: 1 });
  assert.equal(loading.percentage, 42);
  assert.equal(loading.hint, 'Recovery vehicles preserve scarce armor.');
  const ready = updateLoadingTransition(loading, { status: 'ready', progress: 1 });
  assert.equal(ready.ready, true);
  assert.equal(ready.percentage, 100);
  const rotated = updateLoadingTransition(loading, { hintIndex: 0 });
  assert.equal(rotated.hint, 'Use smoke before crossing open ground.');
});

test('loading rejects contradictory ready state', () => {
  assert.throws(() => createLoadingTransitionModel(briefingFixture(), { status: 'ready', progress: 0.9 }), /progress 1/);
  assert.throws(() => createLoadingTransitionModel(briefingFixture(), { status: 'loading-map', progress: 2 }), /Loading progress/);
});

test('debrief covers outcome, medals, losses, timeline, consequences, and next operations', () => {
  const debrief = debriefFixture();
  assert.equal(debrief.screenId, 'endgame');
  assert.equal(debrief.medals[0].id, 'medal-preservation');
  assert.equal(debrief.losses.totalLost, 10);
  assert.equal(debrief.timeline.at(-1).tick, 5400);
  assert.equal(debrief.nextOperations[0].recommended, true);
  assert.deepEqual(debrief.campaignConsequences.unlocked, ['operation-steppe']);
});

test('debrief rejects unordered timeline and unknown outcomes', () => {
  const base = {
    operationId: 'operation-dnipro', title: 'Result', outcome: 'victory',
    timeline: [
      { id: 'later', tick: 5, kind: 'event', title: 'Later' },
      { id: 'earlier', tick: 4, kind: 'event', title: 'Earlier' },
    ],
  };
  assert.throws(() => createMissionDebriefModel(base), /ordered by tick/);
  assert.throws(() => createMissionDebriefModel({ ...base, timeline: [], outcome: 'draw' }), /Unknown mission outcome/);
});

test('flow reducer enforces briefing-loading-battlefield-debrief order', () => {
  let state = createCampaignFlowState(briefingFixture());
  assert.equal(state.stage, CAMPAIGN_FLOW_STAGES.BRIEFING);
  state = reduceCampaignFlow(state, { type: CAMPAIGN_FLOW_ACTIONS.BEGIN_LOADING, loading: { status: 'loading-map', progress: 0.2 } });
  assert.equal(state.stage, CAMPAIGN_FLOW_STAGES.LOADING);
  assert.throws(() => reduceCampaignFlow(state, { type: CAMPAIGN_FLOW_ACTIONS.START_MISSION }), /ready/);
  state = reduceCampaignFlow(state, { type: CAMPAIGN_FLOW_ACTIONS.UPDATE_LOADING, changes: { status: 'ready', progress: 1 } });
  state = reduceCampaignFlow(state, { type: CAMPAIGN_FLOW_ACTIONS.START_MISSION });
  assert.equal(state.stage, CAMPAIGN_FLOW_STAGES.BATTLEFIELD);
  state = reduceCampaignFlow(state, { type: CAMPAIGN_FLOW_ACTIONS.SHOW_DEBRIEF, debrief: debriefFixture() });
  assert.equal(state.stage, CAMPAIGN_FLOW_STAGES.DEBRIEF);
  assert.equal(state.selectedNextOperationId, 'operation-steppe');
  assert.equal(state.revision, 4);
});

test('next-operation selection permits only unlocked authored choices', () => {
  let state = createCampaignFlowState(briefingFixture());
  state = reduceCampaignFlow(state, { type: CAMPAIGN_FLOW_ACTIONS.BEGIN_LOADING, loading: { status: 'ready', progress: 1 } });
  state = reduceCampaignFlow(state, { type: CAMPAIGN_FLOW_ACTIONS.START_MISSION });
  state = reduceCampaignFlow(state, { type: CAMPAIGN_FLOW_ACTIONS.SHOW_DEBRIEF, debrief: debriefFixture() });
  assert.throws(() => reduceCampaignFlow(state, { type: CAMPAIGN_FLOW_ACTIONS.SELECT_NEXT_OPERATION, operationId: 'operation-coast' }), /locked/);
  const same = reduceCampaignFlow(state, { type: CAMPAIGN_FLOW_ACTIONS.SELECT_NEXT_OPERATION, operationId: 'operation-steppe' });
  assert.equal(same, state);
});

test('return to operations is deterministic and idempotent', () => {
  const initial = createCampaignFlowState(briefingFixture());
  const operations = reduceCampaignFlow(initial, { type: CAMPAIGN_FLOW_ACTIONS.RETURN_TO_OPERATIONS });
  assert.equal(operations.stage, CAMPAIGN_FLOW_STAGES.OPERATIONS);
  assert.equal(reduceCampaignFlow(operations, { type: CAMPAIGN_FLOW_ACTIONS.RETURN_TO_OPERATIONS }), operations);
});
