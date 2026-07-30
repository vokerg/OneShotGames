import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DRONE_STATES,
  beginDroneLaunch,
  beginDroneRecovery,
  canDroneStrike,
  createDroneState,
  evaluateDroneLink,
  executeDroneStrike,
  resolveDroneInterception,
  tickDrone,
} from '../../src/combat/drone-ew-system.js';

const config = {
  launchTime: 1,
  loiterDuration: 10,
  linkRange: 100,
  jamRangePenalty: 60,
  linkLossGrace: 2,
  returnTime: 2,
  recoveryTime: 1,
  strikeCooldown: 3,
  signaturePerStrike: 0.6,
  signatureDecay: 0.1,
};

test('launch transitions from docked to airborne with configured loiter time', () => {
  let state = beginDroneLaunch(createDroneState(), config);
  assert.equal(state.state, DRONE_STATES.LAUNCHING);
  assert.equal(state.loiterRemaining, 10);
  state = tickDrone(state, 1, {}, config);
  assert.equal(state.state, DRONE_STATES.AIRBORNE);
  assert.equal(state.lastTransitionReason, 'launch-complete');
});

test('commanded recovery returns through recovery to docked', () => {
  let state = { ...createDroneState(), state: DRONE_STATES.AIRBORNE, loiterRemaining: 8 };
  state = beginDroneRecovery(state, config);
  assert.equal(state.state, DRONE_STATES.RETURNING);
  state = tickDrone(state, 2, {}, config);
  assert.equal(state.state, DRONE_STATES.RECOVERING);
  state = tickDrone(state, 1, {}, config);
  assert.equal(state.state, DRONE_STATES.DOCKED);
  assert.equal(state.lastTransitionReason, 'recovered');
});

test('link range includes relay bonus and reports out-of-range loss', () => {
  const connected = evaluateDroneLink({ distance: 115, relayBonus: 20 }, config);
  assert.equal(connected.connected, true);
  assert.equal(connected.effectiveRange, 120);
  const lost = evaluateDroneLink({ distance: 121, relayBonus: 20 }, config);
  assert.equal(lost.connected, false);
  assert.equal(lost.reason, 'link-range');
});

test('jamming shrinks effective range and link hardening mitigates it', () => {
  const jammed = evaluateDroneLink({ distance: 70, jammerStrength: 0.75 }, config);
  assert.equal(jammed.connected, false);
  assert.equal(jammed.reason, 'jammed');
  assert.equal(jammed.effectiveRange, 55);

  const hardened = evaluateDroneLink(
    { distance: 70, jammerStrength: 0.75, linkHardening: 0.75 },
    config,
  );
  assert.equal(hardened.connected, true);
  assert.equal(hardened.effectiveRange, 88.75);
});

test('sustained jamming triggers autonomous return after grace period', () => {
  let state = { ...createDroneState(), state: DRONE_STATES.AIRBORNE, loiterRemaining: 8 };
  state = tickDrone(state, 1, { distance: 70, jammerStrength: 0.75 }, config);
  assert.equal(state.state, DRONE_STATES.AIRBORNE);
  assert.equal(state.linkLostFor, 1);
  state = tickDrone(state, 1, { distance: 70, jammerStrength: 0.75 }, config);
  assert.equal(state.state, DRONE_STATES.RETURNING);
  assert.equal(state.lastTransitionReason, 'jammed-return');
});

test('link loss destroys a drone when autonomous return is disabled', () => {
  let state = { ...createDroneState(), state: DRONE_STATES.AIRBORNE, loiterRemaining: 8 };
  const noReturn = { ...config, autonomousReturn: false, linkLossGrace: 1 };
  state = tickDrone(state, 1, { distance: 150 }, noReturn);
  assert.equal(state.state, DRONE_STATES.LOST);
  assert.equal(state.lastTransitionReason, 'link-loss-lost');
});

test('loiter expiry begins return even with a healthy link', () => {
  let state = { ...createDroneState(), state: DRONE_STATES.AIRBORNE, loiterRemaining: 0.5 };
  state = tickDrone(state, 0.5, { distance: 20 }, config);
  assert.equal(state.state, DRONE_STATES.RETURNING);
  assert.equal(state.lastTransitionReason, 'loiter-expired');
});

test('strike validation enforces airborne state, payload, and command link', () => {
  const docked = createDroneState();
  assert.equal(canDroneStrike(docked, { distance: 10 }, config).reason, 'not-airborne');
  const empty = { ...docked, state: DRONE_STATES.AIRBORNE, payload: 0 };
  assert.equal(canDroneStrike(empty, { distance: 10 }, config).reason, 'no-payload');
  const airborne = { ...docked, state: DRONE_STATES.AIRBORNE, payload: 1 };
  assert.equal(canDroneStrike(airborne, { distance: 70, jammerStrength: 0.75 }, config).reason, 'jammed');
});

test('reusable strike consumes payload, applies cooldown, and exposes counterplay signature', () => {
  const state = { ...createDroneState({ payload: 2 }), state: DRONE_STATES.AIRBORNE };
  const result = executeDroneStrike(state, { distance: 20 }, config);
  assert.equal(result.verdict.ok, true);
  assert.equal(result.state.payload, 1);
  assert.equal(result.state.cooldown, 3);
  assert.equal(result.state.signature, 0.6);
  assert.equal(result.counterplay.revealed, true);
  const decayed = tickDrone(result.state, 2, { distance: 20 }, config);
  assert.ok(Math.abs(decayed.signature - 0.4) < 1e-9);
});

test('one-way strike consumes the drone', () => {
  const state = { ...createDroneState(), state: DRONE_STATES.AIRBORNE };
  const result = executeDroneStrike(state, { distance: 20 }, { ...config, consumedOnStrike: true });
  assert.equal(result.state.state, DRONE_STATES.LOST);
  assert.equal(result.state.payload, 0);
  assert.equal(result.state.lastTransitionReason, 'strike-consumed');
});

test('interception resolution is deterministic and signature increases risk', () => {
  const state = { ...createDroneState(), state: DRONE_STATES.AIRBORNE, signature: 0.8 };
  const hit = resolveDroneInterception(
    state,
    { canEngage: true, interceptionChance: 0.4, evasionBonus: 0.1 },
    () => 0.2,
    config,
  );
  assert.ok(Math.abs(hit.probability - 0.5) < 1e-9);
  assert.equal(hit.intercepted, true);
  assert.equal(hit.state.state, DRONE_STATES.LOST);

  const miss = resolveDroneInterception(
    state,
    { canEngage: true, interceptionChance: 0.4, evasionBonus: 0.1 },
    () => 0.8,
    config,
  );
  assert.equal(miss.intercepted, false);
  assert.equal(miss.reason, 'evaded');
});
