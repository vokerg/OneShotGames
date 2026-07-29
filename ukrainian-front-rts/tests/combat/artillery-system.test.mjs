import test from 'node:test';
import assert from 'node:assert/strict';
import { ARTILLERY_STATES, beginSetup, beginPack, canFire, createArtilleryState, fireSalvoRound, scatterPoint, startSalvo, tickArtillery } from '../../src/combat/artillery-system.js';

const config = { minimumRange: 10, setupTime: 2, packTime: 1, requiresSpotter: true, salvoSize: 3, shotCadence: 0.5, signaturePerShot: 0.3, signatureDecay: 0.1 };

test('setup reaches ready deterministically', () => {
  let state = beginSetup(createArtilleryState(), config);
  assert.equal(state.state, ARTILLERY_STATES.SETTING_UP);
  state = tickArtillery(state, 2, config);
  assert.equal(state.state, ARTILLERY_STATES.READY);
});

test('minimum range is enforced', () => {
  const state = { ...createArtilleryState(), state: ARTILLERY_STATES.READY };
  assert.equal(canFire(state, { distance: 9, spotted: true }, config).reason, 'minimum-range');
});

test('spotting requirement is enforced', () => {
  const state = { ...createArtilleryState(), state: ARTILLERY_STATES.READY };
  assert.equal(canFire(state, { distance: 20, spotted: false }, config).reason, 'spotting-required');
});

test('salvo is bounded by available ammunition', () => {
  const state = { ...createArtilleryState({ ammo: 2 }), state: ARTILLERY_STATES.READY };
  assert.equal(startSalvo(state, { distance: 20, spotted: true }, config).state.salvoRemaining, 2);
});

test('firing consumes ammo, applies cadence and signature', () => {
  const state = { ...createArtilleryState(), state: ARTILLERY_STATES.READY, salvoRemaining: 2 };
  const next = fireSalvoRound(state, config);
  assert.equal(next.ammo, 5);
  assert.equal(next.salvoRemaining, 1);
  assert.equal(next.cooldown, 0.5);
  assert.equal(next.signature, 0.3);
});

test('scatter uses injected deterministic randomness', () => {
  const values = [0, 1];
  const point = scatterPoint({ x: 5, y: 5 }, () => values.shift(), { scatterRadius: 4 });
  assert.deepEqual(point, { x: 9, y: 5 });
});

test('packing cancels salvos and reaches packed state', () => {
  let state = beginPack({ ...createArtilleryState(), state: ARTILLERY_STATES.READY, salvoRemaining: 2 }, config);
  assert.equal(state.salvoRemaining, 0);
  state = tickArtillery(state, 1, config);
  assert.equal(state.state, ARTILLERY_STATES.PACKED);
});
