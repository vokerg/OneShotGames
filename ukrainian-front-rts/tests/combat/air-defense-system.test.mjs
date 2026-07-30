import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AIR_TARGET_CLASSES,
  canLaunchAirDefenseMissile,
  createAirDefenseState,
  createDroneInterceptionThreat,
  evaluateAirDetection,
  evaluateEngagementEnvelope,
  launchAirDefenseMissile,
  reservedDamageFor,
  selectAirDefenseTarget,
  tickAirDefense,
} from '../../src/combat/air-defense-system.js';

const defender = { id: 'sam-1', x: 0, y: 0 };
const airTarget = (overrides = {}) => ({
  id: 'air-1',
  x: 200,
  y: 0,
  hp: 80,
  air: true,
  altitude: 80,
  signature: 0.8,
  targetClass: AIR_TARGET_CLASSES.STRIKE_DRONE,
  ...overrides,
});

test('detection distinguishes optical, radar, jamming, and invalid targets', () => {
  assert.equal(evaluateAirDetection(defender, airTarget({ x: 100 }), {}, {}).mode, 'optical');
  assert.equal(evaluateAirDetection(defender, airTarget({ x: 240 }), {}, {}).mode, 'radar');
  assert.equal(
    evaluateAirDetection(defender, airTarget({ x: 300, signature: 0.2 }), { jammerStrength: 1 }, {}).detected,
    false,
  );
  assert.equal(evaluateAirDetection(defender, { ...airTarget(), air: false, domain: 'ground' }, {}, {}).reason, 'not-air-target');
});

test('engagement envelope enforces range and altitude bounds', () => {
  assert.equal(evaluateEngagementEnvelope(defender, airTarget({ x: 20 })).reason, 'inside-minimum-range');
  assert.equal(evaluateEngagementEnvelope(defender, airTarget({ x: 400 })).reason, 'outside-maximum-range');
  assert.equal(evaluateEngagementEnvelope(defender, airTarget({ altitude: 2 })).reason, 'below-minimum-altitude');
  assert.equal(evaluateEngagementEnvelope(defender, airTarget()).ok, true);
});

test('target priority prefers inbound munitions and is deterministic', () => {
  const state = createAirDefenseState();
  const recon = airTarget({ id: 'z-recon', targetClass: AIR_TARGET_CLASSES.RECON_DRONE, x: 120 });
  const missile = airTarget({ id: 'a-missile', targetClass: AIR_TARGET_CLASSES.MISSILE, inbound: true, x: 260, hp: 20 });
  const choice = selectAirDefenseTarget(defender, [recon, missile], state);
  assert.equal(choice.target.id, 'a-missile');

  const tieA = airTarget({ id: 'a', x: 200 });
  const tieB = airTarget({ id: 'b', x: 200 });
  assert.equal(selectAirDefenseTarget(defender, [tieB, tieA], state).target.id, 'a');
});

test('launch reserves damage and prevents unnecessary overkill', () => {
  const target = airTarget({ hp: 80 });
  const first = launchAirDefenseMissile(createAirDefenseState(), defender, target);
  assert.equal(first.verdict.ok, true);
  assert.equal(reservedDamageFor(first.state, target), 90);
  const secondVerdict = canLaunchAirDefenseMissile({ ...first.state, cooldown: 0 }, defender, target);
  assert.equal(secondVerdict.reason, 'overkill-reserved');
});

test('high-health targets can receive a bounded multi-missile salvo', () => {
  const target = airTarget({ hp: 250 });
  const first = launchAirDefenseMissile(createAirDefenseState(), defender, target);
  const second = launchAirDefenseMissile({ ...first.state, cooldown: 0 }, defender, target);
  assert.equal(second.verdict.ok, true);
  const third = canLaunchAirDefenseMissile({ ...second.state, cooldown: 0 }, defender, target);
  assert.equal(third.reason, 'target-salvo-cap');
});

test('reload, ammunition, and in-flight limits block launches', () => {
  const target = airTarget();
  assert.equal(canLaunchAirDefenseMissile({ ...createAirDefenseState(), cooldown: 1 }, defender, target).reason, 'reload');
  assert.equal(canLaunchAirDefenseMissile(createAirDefenseState({ ammunition: 0 }), defender, target).reason, 'no-ammunition');
  const state = { ...createAirDefenseState(), missiles: [{ id: 'x', targetId: 'other', damage: 1 }] };
  assert.equal(canLaunchAirDefenseMissile(state, defender, target, {}, { maxInFlight: 1 }).reason, 'in-flight-cap');
});

test('missiles travel deterministically toward moving targets', () => {
  const target = airTarget({ x: 300 });
  const launch = launchAirDefenseMissile(createAirDefenseState(), defender, target, {}, { missileSpeed: 100 });
  const tick = tickAirDefense(launch.state, 1, [target]);
  assert.equal(tick.events.length, 0);
  assert.equal(tick.state.missiles[0].x, 100);
  assert.equal(tick.state.missiles[0].y, 0);
  assert.equal(tick.state.cooldown, 1.4);
});

test('impact resolution reports hit damage and releases reservation', () => {
  const target = airTarget({ x: 60 });
  const launch = launchAirDefenseMissile(createAirDefenseState(), defender, target, {}, { missileSpeed: 100 });
  const tick = tickAirDefense(launch.state, 1, [target], () => 0.1);
  assert.equal(tick.events[0].type, 'missile-impact');
  assert.equal(tick.events[0].hit, true);
  assert.equal(tick.events[0].damage, 90);
  assert.equal(tick.state.missiles.length, 0);
  assert.deepEqual(tick.state.reservations, {});
});

test('evasion can defeat a missile without changing deterministic travel', () => {
  const target = airTarget({ x: 60, evasion: 0.7 });
  const launch = launchAirDefenseMissile(createAirDefenseState(), defender, target, {}, { missileSpeed: 100 });
  const tick = tickAirDefense(launch.state, 1, [target], () => 0.1);
  assert.ok(Math.abs(tick.events[0].probability - 0.02) < 1e-12);
  assert.equal(tick.events[0].hit, false);
});

test('target loss removes missiles and overkill reservations', () => {
  const target = airTarget({ x: 300 });
  const launch = launchAirDefenseMissile(createAirDefenseState(), defender, target);
  const tick = tickAirDefense(launch.state, 0.5, []);
  assert.equal(tick.events[0].reason, 'target-lost');
  assert.deepEqual(tick.state.reservations, {});
});

test('drone interception adapter exposes the UFR-038 threat contract', () => {
  const threat = createDroneInterceptionThreat(defender, airTarget(), {}, { interceptionChance: 0.64 });
  assert.equal(threat.canEngage, true);
  assert.equal(threat.interceptionChance, 0.64);
  const blocked = createDroneInterceptionThreat(defender, airTarget({ x: 500 }));
  assert.equal(blocked.canEngage, false);
});
