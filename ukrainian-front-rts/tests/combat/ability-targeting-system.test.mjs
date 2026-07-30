import assert from 'node:assert/strict';
import test from 'node:test';

import { TARGET_DOMAINS } from '../../src/combat/combat-schema.js';
import {
  ABILITY_TARGET_MODES,
  ABILITY_TARGET_PHASES,
  beginAbilityTargeting,
  cancelAbilityTargeting,
  confirmAbilityTarget,
  createAbilityTargetingProfile,
  createAbilityTargetingState,
  previewAbilityTarget,
  TARGET_ALLEGIANCES,
  tickAbilityChannel,
} from '../../src/combat/ability-targeting-system.js';

const actor = (overrides = {}) => ({ id: 'caster', x: 0, y: 0, side: 'blue', domain: TARGET_DOMAINS.GROUND, hp: 100, ...overrides });
const begin = (profile, source = actor(), context = {}) => beginAbilityTargeting(createAbilityTargetingState(), profile, source, context).state;

function profile(mode, overrides = {}) {
  return createAbilityTargetingProfile({
    id: `ability-${mode}`,
    mode,
    range: [ABILITY_TARGET_MODES.SELF, ABILITY_TARGET_MODES.TOGGLE].includes(mode) ? 0 : 100,
    ...overrides,
  });
}

test('profiles validate all targeting modes and reject incomplete contracts', () => {
  for (const mode of Object.values(ABILITY_TARGET_MODES)) {
    const overrides = mode === ABILITY_TARGET_MODES.AREA
      ? { radius: 12 }
      : mode === ABILITY_TARGET_MODES.CHANNEL
        ? { range: 0, channelDuration: 3, channelTargetMode: ABILITY_TARGET_MODES.SELF }
        : {};
    assert.equal(profile(mode, overrides).mode, mode);
  }
  assert.throws(() => profile(ABILITY_TARGET_MODES.AREA), /positive radius/);
  assert.throws(() => profile(ABILITY_TARGET_MODES.CHANNEL, { channelDuration: 0 }), /positive channelDuration/);
  assert.throws(() => profile(ABILITY_TARGET_MODES.POINT, { range: 0 }), /positive range/);
});

test('begin enforces actor availability, cooldown, enabled state, and one active ability', () => {
  const point = profile(ABILITY_TARGET_MODES.POINT, { cooldown: 8 });
  const idle = createAbilityTargetingState();
  assert.equal(beginAbilityTargeting(idle, point, actor({ hp: 0 })).reason, 'actor-unavailable');
  assert.equal(beginAbilityTargeting(idle, point, actor(), { cooldownRemaining: 0.1 }).reason, 'cooldown');
  assert.equal(beginAbilityTargeting(idle, point, actor(), { abilityEnabled: false }).reason, 'ability-disabled');
  const started = beginAbilityTargeting(idle, point, actor());
  assert.equal(started.state.phase, ABILITY_TARGET_PHASES.TARGETING);
  assert.equal(beginAbilityTargeting(started.state, point, actor()).reason, 'ability-in-progress');
});

test('point targeting validates range, passability, line of sight, and returns a reference-free telegraph', () => {
  const point = profile(ABILITY_TARGET_MODES.POINT, { requiresPassablePoint: true, requiresLineOfSight: true });
  const state = begin(point);
  assert.equal(previewAbilityTarget(state, point, actor(), { x: 101, y: 0 }).reason, 'out-of-range');
  assert.equal(previewAbilityTarget(state, point, actor(), { x: 50, y: 0 }).reason, 'passability-unavailable');
  assert.equal(previewAbilityTarget(state, point, actor(), { x: 50, y: 0 }, { isPointPassable: () => false, hasLineOfSight: () => true }).reason, 'point-impassable');
  assert.equal(previewAbilityTarget(state, point, actor(), { x: 50, y: 0 }, { isPointPassable: () => true, hasLineOfSight: () => false }).reason, 'line-of-sight');
  const confirmed = confirmAbilityTarget(state, point, actor(), { x: 60, y: 80 }, { isPointPassable: () => true, hasLineOfSight: () => true });
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.activation.cooldown, 0);
  assert.deepEqual(confirmed.activation.target, { x: 60, y: 80 });
  assert.equal(confirmed.telegraph.owner, 'presentation');
  assert.equal(confirmed.telegraph.distance, 100);
  assert.equal('actor' in confirmed.telegraph, false);
});

test('unit targeting enforces allegiance, domain, availability, footprint range, and line of sight', () => {
  const unit = profile(ABILITY_TARGET_MODES.UNIT, {
    range: 80,
    targetAllegiance: TARGET_ALLEGIANCES.ENEMY,
    targetDomains: [TARGET_DOMAINS.AIR],
    requiresLineOfSight: true,
  });
  const state = begin(unit);
  const target = { id: 'drone', x: 90, y: 0, collisionRadius: 10, side: 'red', domain: TARGET_DOMAINS.AIR, hp: 10 };
  assert.equal(previewAbilityTarget(state, unit, actor(), { ...target, side: 'blue' }).reason, 'target-allegiance');
  assert.equal(previewAbilityTarget(state, unit, actor(), { ...target, domain: TARGET_DOMAINS.GROUND }).reason, 'target-domain');
  assert.equal(previewAbilityTarget(state, unit, actor(), { ...target, hp: 0 }).reason, 'target-unavailable');
  assert.equal(previewAbilityTarget(state, unit, actor(), target).reason, 'line-of-sight-unavailable');
  assert.equal(previewAbilityTarget(state, unit, actor(), target, { hasLineOfSight: () => false }).reason, 'line-of-sight');
  const confirmed = confirmAbilityTarget(state, unit, actor(), target, { hasLineOfSight: () => true });
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.telegraph.distance, 80);
  assert.equal(confirmed.activation.target.id, 'drone');
});

test('area targeting includes radius while preserving the point range boundary', () => {
  const area = profile(ABILITY_TARGET_MODES.AREA, { range: 120, radius: 24, cooldown: 5 });
  const state = begin(area);
  const confirmed = confirmAbilityTarget(state, area, actor(), { x: 120, y: 0 });
  assert.equal(confirmed.telegraph.radius, 24);
  assert.equal(confirmed.activation.cooldown, 5);
  assert.equal(confirmed.state.phase, ABILITY_TARGET_PHASES.IDLE);
});

test('direction targeting normalizes vectors and rejects zero-length directions', () => {
  const direction = profile(ABILITY_TARGET_MODES.DIRECTION, { range: 50, directionLength: 30 });
  const state = begin(direction);
  assert.equal(previewAbilityTarget(state, direction, actor(), { x: 0, y: 0 }).reason, 'direction-required');
  const confirmed = confirmAbilityTarget(state, direction, actor(), { x: 3, y: 4 });
  assert.equal(confirmed.activation.target.directionX, 0.6);
  assert.equal(confirmed.activation.target.directionY, 0.8);
  assert.equal(confirmed.activation.target.endpointX, 18);
  assert.equal(confirmed.activation.target.endpointY, 24);
  assert.equal(confirmed.telegraph.length, 30);
});

test('self targeting locks the source without accepting a live target reference', () => {
  const self = profile(ABILITY_TARGET_MODES.SELF, { cooldown: 2 });
  const source = actor({ x: 10, y: 12 });
  const started = beginAbilityTargeting(createAbilityTargetingState(), self, source);
  assert.equal(started.preview.ok, true);
  const confirmed = confirmAbilityTarget(started.state, self, source, null);
  assert.deepEqual(confirmed.activation.target, { id: 'caster', x: 10, y: 12, side: 'blue', domain: TARGET_DOMAINS.GROUND });
  assert.equal('hp' in confirmed.activation.target, false);
});

test('toggle targeting flips deterministic per-ability state without a cursor target', () => {
  const toggle = profile(ABILITY_TARGET_MODES.TOGGLE, { toggleDefault: false });
  const firstState = begin(toggle);
  const first = confirmAbilityTarget(firstState, toggle, actor(), null);
  assert.equal(first.activation.target.enabled, true);
  assert.equal(first.state.toggles[toggle.id], true);
  const secondStart = beginAbilityTargeting(first.state, toggle, actor()).state;
  const second = confirmAbilityTarget(secondStart, toggle, actor(), null);
  assert.equal(second.activation.target.enabled, false);
  assert.equal(second.state.toggles[toggle.id], false);
});

test('channel targeting locks its acquisition target, ticks deterministically, and starts cooldown on completion', () => {
  const channel = profile(ABILITY_TARGET_MODES.CHANNEL, {
    range: 75,
    channelDuration: 3,
    channelTargetMode: ABILITY_TARGET_MODES.UNIT,
    targetAllegiance: TARGET_ALLEGIANCES.ALLY,
    cooldown: 6,
  });
  const source = actor();
  const ally = { id: 'ally', x: 50, y: 0, side: 'blue', domain: TARGET_DOMAINS.GROUND, hp: 50 };
  const state = begin(channel, source);
  const confirmed = confirmAbilityTarget(state, channel, source, ally);
  assert.equal(confirmed.state.phase, ABILITY_TARGET_PHASES.CHANNELING);
  assert.equal(confirmed.activation.phase, 'channel-start');
  assert.equal(confirmed.activation.cooldown, 0);
  const ticked = tickAbilityChannel(confirmed.state, channel, 1.25);
  assert.equal(ticked.state.channelRemaining, 1.75);
  const completed = tickAbilityChannel(ticked.state, channel, 2);
  assert.equal(completed.state.phase, ABILITY_TARGET_PHASES.IDLE);
  assert.equal(completed.completion.cooldown, 6);
  assert.equal(completed.completion.target.id, 'ally');
});

test('channel interruption and explicit cancellation return reason-specific immutable records', () => {
  const channel = profile(ABILITY_TARGET_MODES.CHANNEL, { range: 0, channelDuration: 2, channelTargetMode: ABILITY_TARGET_MODES.SELF });
  const state = begin(channel);
  const confirmed = confirmAbilityTarget(state, channel, actor(), null);
  const interrupted = tickAbilityChannel(confirmed.state, channel, 0.5, { hasLineOfSight: false });
  assert.equal(interrupted.cancellation.interrupted, true);
  assert.equal(interrupted.cancellation.reason, 'channel-line-of-sight');
  assert.ok(Object.isFrozen(interrupted.state));

  const point = profile(ABILITY_TARGET_MODES.POINT);
  const cancelled = cancelAbilityTargeting(begin(point), 'user-cancelled');
  assert.equal(cancelled.cancellation.interrupted, false);
  assert.equal(cancelled.state.lastTransitionReason, 'user-cancelled');
  assert.equal(cancelAbilityTargeting(cancelled.state).reason, 'nothing-to-cancel');
});
