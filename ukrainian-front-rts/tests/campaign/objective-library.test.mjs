import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OBJECTIVE_TYPES,
  createObjectiveDefinition,
  updateObjectiveLibrary,
  validateObjectiveDefinitions,
} from '../../src/systems/objective-library.js';

const rect = { shape: 'rect', x: 0, y: 0, width: 100, height: 100 };

function game(definitions, overrides = {}) {
  return {
    time: 0,
    mission: { id: 'test', objectiveDefinitions: definitions },
    player: { metal: 0, fuel: 0, intel: 0, mined: 0, objectives: [] },
    units: [], buildings: [], reconRegions: new Set(), gameOver: false,
    finish(outcome, reason) { this.gameOver = true; this.outcome = outcome; this.endReason = reason; },
    ...overrides,
  };
}

test('validates every required objective family and rejects duplicates', () => {
  const definitions = [
    { id: 'build', type: 'build', target: { collection: 'buildings', type: 'hq' } },
    { id: 'gather', type: 'gather', resource: 'metal', amount: 10 },
    { id: 'capture', type: 'capture', target: { collection: 'buildings', type: 'site' }, ownerTeam: 0, region: rect },
    { id: 'escort', type: 'escort', target: { collection: 'units', type: 'convoy' }, region: rect },
    { id: 'defend', type: 'defend', target: { collection: 'buildings', type: 'hq' }, region: rect, durationSeconds: 10 },
    { id: 'survive', type: 'survive', durationSeconds: 10 },
    { id: 'destroy', type: 'destroy', target: { collection: 'units', type: 'tank' } },
    { id: 'disable', type: 'disable', target: { collection: 'units', type: 'tank' } },
    { id: 'rescue', type: 'rescue', target: { collection: 'units', type: 'civilian' }, region: rect },
    { id: 'recon', type: 'recon', observer: { collection: 'units', type: 'scout' }, region: rect },
    { id: 'extract', type: 'extract', target: { collection: 'units', type: 'hero' }, region: rect },
  ];
  assert.deepEqual(new Set(validateObjectiveDefinitions(definitions).map((item) => item.type)), new Set(OBJECTIVE_TYPES));
  assert.throws(() => validateObjectiveDefinitions([definitions[0], definitions[0]]), /Duplicate/);
});

test('completes build, gather, capture, disable, recon, and destroy deterministically', () => {
  const definitions = [
    { id: 'build', type: 'build', target: { collection: 'buildings', type: 'hq' } },
    { id: 'gather', type: 'gather', resource: 'metal', amount: 50 },
    { id: 'capture', type: 'capture', target: { collection: 'buildings', type: 'site' }, ownerTeam: 0, region: rect },
    { id: 'disable', type: 'disable', target: { collection: 'units', type: 'tank' } },
    { id: 'recon', type: 'recon', observer: { collection: 'units', type: 'scout' }, regionId: 'sector' },
    { id: 'destroy', type: 'destroy', target: { collection: 'units', type: 'enemy' } },
  ];
  const state = game(definitions, {
    player: { metal: 60, objectives: [] },
    buildings: [{ id: 1, type: 'hq', hp: 100, underConstruction: false }, { id: 2, type: 'site', team: 0, hp: 100, x: 10, y: 10 }],
    units: [{ id: 3, type: 'tank', hp: 20, maxHp: 100 }, { id: 4, type: 'enemy', hp: 1 }],
    reconRegions: new Set(['sector']),
  });
  updateObjectiveLibrary(state);
  state.units = state.units.filter((unit) => unit.type !== 'enemy');
  const summary = updateObjectiveLibrary(state);
  assert.ok(summary.results.every((result) => result.complete));
  assert.equal(state.outcome, 'victory');
});

test('supports escort, rescue, extract, defend, and survive flows', () => {
  const definitions = [
    { id: 'escort', type: 'escort', target: { collection: 'units', type: 'convoy' }, region: rect },
    { id: 'rescue', type: 'rescue', target: { collection: 'units', type: 'casualty' }, region: rect },
    { id: 'extract', type: 'extract', target: { collection: 'units', type: 'hero' }, region: rect },
    { id: 'defend', type: 'defend', target: { collection: 'buildings', type: 'hq' }, region: rect, durationSeconds: 10 },
    { id: 'survive', type: 'survive', durationSeconds: 10 },
  ];
  const state = game(definitions, {
    units: [{ id: 1, type: 'convoy', hp: 10, x: 10, y: 10 }, { id: 2, type: 'casualty', hp: 10, x: 20, y: 20 }, { id: 3, type: 'hero', hp: 10, x: 30, y: 30 }],
    buildings: [{ id: 4, type: 'hq', hp: 100, x: 10, y: 10 }],
  });
  updateObjectiveLibrary(state);
  state.time = 10;
  const summary = updateObjectiveLibrary(state);
  assert.ok(summary.results.every((result) => result.complete));
  assert.equal(summary.allRequiredComplete, true);
});

test('handles optional, hidden, timed, and explicit fail states', () => {
  const definitions = [
    { id: 'required', type: 'survive', durationSeconds: 20, timeLimitSeconds: 5, failureReason: 'Too slow.' },
    { id: 'optional', type: 'gather', resource: 'intel', amount: 100, optional: true, hidden: true },
  ];
  const state = game(definitions);
  updateObjectiveLibrary(state);
  state.time = 6;
  const summary = updateObjectiveLibrary(state);
  assert.equal(summary.requiredFailed, true);
  assert.equal(state.outcome, 'defeat');
  assert.equal(state.endReason, 'Too slow.');
  assert.equal(summary.visibleResults.some((result) => result.id === 'optional'), false);
});

test('fails escort when a previously seen protected target is lost', () => {
  const state = game([{ id: 'escort', type: 'escort', target: { collection: 'units', scriptId: 'convoy' }, region: rect, failureReason: 'Convoy lost.' }], {
    units: [{ id: 1, scriptId: 'convoy', hp: 10, x: 200, y: 200 }],
  });
  updateObjectiveLibrary(state);
  state.units = [];
  const summary = updateObjectiveLibrary(state);
  assert.equal(summary.requiredFailed, true);
  assert.equal(state.endReason, 'Convoy lost.');
});

test('definition normalization is deeply immutable', () => {
  const definition = createObjectiveDefinition({ id: 'hold', type: 'survive', durationSeconds: 30, optional: true, hidden: true });
  assert.ok(Object.isFrozen(definition));
  assert.throws(() => { definition.durationSeconds = 0; }, TypeError);
});
