import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ARMOR_CLASSES,
  DAMAGE_CLASSES,
  RESISTANCE_CLASSES,
  SPLASH_CLASSES,
  TARGET_DOMAINS,
  createDefenseProfile,
  createWeaponProfile,
  resolveDamageMultiplier,
} from '../../src/combat/combat-schema.js';
import {
  CONCEALMENT_TYPES,
  COVER_TYPES,
  applyCoverToAttack,
  resolveCoverModifiers,
} from '../../src/combat/cover-concealment.js';
import {
  MORALE_STATES,
  applySuppression,
  createSuppressionStatus,
  emitStatusTransition,
  recoverSuppression,
  setCommandAura,
} from '../../src/status/suppression-morale.js';
import { createDomainEventStream, DOMAIN_EVENT_TYPES } from '../../src/core/events.js';
import {
  ABILITY_TARGET_MODES,
  TARGET_ALLEGIANCES,
  beginAbilityTargeting,
  confirmAbilityTarget,
  createAbilityTargetingProfile,
  createAbilityTargetingState,
  tickAbilityChannel,
} from '../../src/combat/ability-targeting-system.js';
import {
  DESTRUCTION_PHASES,
  applyDestructionDamage,
  applyWreckSalvage,
  clearWreckObstruction,
  createDestructionPolicy,
  createDestructionState,
  damageWreck,
  materializeWreck,
  tickBurning,
} from '../../src/combat/destruction-system.js';
import {
  createAreaDamagePolicy,
  FRIENDLY_FIRE_MODES,
  resolveAreaDamage,
  STRUCTURE_DAMAGE_MODES,
} from '../../src/combat/area-damage-policy.js';
import {
  createVisibilityField,
  resolveLineOfSight,
} from '../../src/visibility/line-of-sight.js';
import { selectTarget } from '../../src/combat/target-policy.js';
import { updateProjectiles } from '../../src/systems/projectile-system.js';
import {
  createArtilleryState,
  beginSetup,
  canFire,
  fireSalvoRound,
  startSalvo,
  tickArtillery,
} from '../../src/combat/artillery-system.js';
import {
  DRONE_STATES,
  beginDroneLaunch,
  createDroneState,
  resolveDroneInterception,
  tickDrone,
} from '../../src/combat/drone-ew-system.js';
import {
  AIR_TARGET_CLASSES,
  createAirDefenseState,
  createDroneInterceptionThreat,
  launchAirDefenseMissile,
  selectAirDefenseTarget,
  tickAirDefense,
} from '../../src/combat/air-defense-system.js';
import {
  createRepairOrder,
  resolveRepairTick,
} from '../../src/combat/repair-system.js';
import {
  awardVeterancyXp,
  createVeterancyState,
  recordDamageSource,
} from '../../src/core/veterancy.js';
import { processVeterancyDeaths } from '../../src/systems/veterancy-system.js';
import {
  COMBAT_STANCES,
  recordStanceRetaliation,
  resolveStanceTarget,
  setCombatStance,
} from '../../src/systems/stance-system.js';
import {
  GARRISON_RESULTS,
  createGarrisonState,
  enterGarrison,
  resolveGarrisonDestruction,
} from '../../src/combat/garrison-system.js';
import {
  ENGINEER_RESULTS,
  armDemolitionCharge,
  createEngineerMechanicsState,
  placeDemolitionCharge,
  tickEngineerMechanics,
} from '../../src/combat/engineer-mechanics-system.js';
import {
  COMBAT_CUE_KINDS,
  COMBAT_CUE_SEVERITIES,
  createCombatReadabilitySnapshot,
  createCombatReadabilityState,
  enqueueCombatCue,
} from '../../src/ui/combat-readability.js';

const values = (record) => Object.values(record);
const point = (cellX, cellY) => ({ x: cellX * 32 + 16, y: cellY * 32 + 16 });
const sequenceRandom = (...rolls) => {
  let index = 0;
  return () => rolls[Math.min(index++, rolls.length - 1)];
};

function combatUnit(id, team, x, y, overrides = {}) {
  return {
    id,
    type: overrides.type ?? 'integration-unit',
    team,
    x,
    y,
    hp: overrides.hp ?? 100,
    maxHp: overrides.maxHp ?? 100,
    order: null,
    target: null,
    orderQueue: [],
    autoFire: true,
    veterancy: overrides.veterancy ?? createVeterancyState(),
    ...overrides,
  };
}

function stanceGame(units) {
  return {
    units,
    buildings: [],
    time: 0,
    gameOver: false,
    unitStats: () => ({ range: 120, sight: 240, damage: 15 }),
  };
}

test('counter matrix covers every damage, armor, resistance, target, and splash class', () => {
  const armorBest = new Map();
  for (const damageClass of values(DAMAGE_CLASSES)) {
    const weapon = createWeaponProfile({
      damageClass,
      targetDomains: values(TARGET_DOMAINS),
      splashClass: SPLASH_CLASSES.NONE,
    });
    for (const armorClass of values(ARMOR_CLASSES)) {
      const defense = createDefenseProfile({ armorClass, resistanceClass: RESISTANCE_CLASSES.NONE });
      const multiplier = resolveDamageMultiplier(weapon, defense, TARGET_DOMAINS.GROUND);
      assert.equal(Number.isFinite(multiplier), true, `${damageClass} -> ${armorClass} must be finite`);
      assert.ok(multiplier > 0, `${damageClass} -> ${armorClass} must remain damageable`);
      armorBest.set(armorClass, Math.max(armorBest.get(armorClass) ?? 0, multiplier));
    }
  }
  for (const armorClass of values(ARMOR_CLASSES)) {
    assert.ok(armorBest.get(armorClass) >= 1, `${armorClass} needs at least one effective counter`);
  }
  for (const resistanceClass of values(RESISTANCE_CLASSES)) {
    const defense = createDefenseProfile({ armorClass: ARMOR_CLASSES.SOFT, resistanceClass });
    assert.ok(resolveDamageMultiplier(
      createWeaponProfile({ damageClass: DAMAGE_CLASSES.SMALL_ARMS, targetDomains: [TARGET_DOMAINS.GROUND], splashClass: SPLASH_CLASSES.NONE }),
      defense,
    ) > 0);
  }
  assert.deepEqual(new Set(values(SPLASH_CLASSES)), new Set(['none', 'point', 'small', 'medium', 'large']));
  assert.deepEqual(new Set(values(TARGET_DOMAINS)), new Set(['ground', 'air', 'structure']));
});

test('all cover and concealment states produce monotonic, readable protection', () => {
  const coverOrder = [COVER_TYPES.NONE, COVER_TYPES.LIGHT, COVER_TYPES.HEAVY, COVER_TYPES.FORTIFIED];
  const coverResults = coverOrder.map((cover) => resolveCoverModifiers({ cover, concealment: CONCEALMENT_TYPES.NONE }));
  for (let index = 1; index < coverResults.length; index += 1) {
    assert.ok(coverResults[index].accuracyMultiplier < coverResults[index - 1].accuracyMultiplier);
    assert.ok(coverResults[index].damageMultiplier < coverResults[index - 1].damageMultiplier);
  }
  const concealmentOrder = [CONCEALMENT_TYPES.NONE, CONCEALMENT_TYPES.PARTIAL, CONCEALMENT_TYPES.DENSE];
  const concealmentResults = concealmentOrder.map((concealment) => applyCoverToAttack({
    accuracy: 1,
    damage: 100,
    cover: COVER_TYPES.NONE,
    concealment,
  }));
  assert.deepEqual(concealmentResults.map((entry) => entry.damage), [100, 100, 100]);
  assert.ok(concealmentResults[2].accuracy < concealmentResults[1].accuracy);
  assert.ok(concealmentResults[1].accuracy < concealmentResults[0].accuracy);
  assert.equal(resolveCoverModifiers({ terrain: 'trench' }).feedback.protected, true);
  assert.equal(resolveCoverModifiers({ terrain: 'shelterbelt' }).feedback.concealed, true);
});

test('visibility, smoke, target policy, and projectile resolution share one deterministic combat picture', () => {
  const clearField = createVisibilityField({ width: 5, height: 1 });
  const smokeField = createVisibilityField({ width: 5, height: 1, smoke: [{ x: 2, y: 0, density: 0.8 }] });
  const source = point(0, 0);
  const near = { id: 'near', domain: 'infantry', visible: true, destroyed: false, friendly: false, distance: 2, threat: 0.5, damagePotential: 0.5, health: 100, maxHealth: 100 };
  const hidden = { ...near, id: 'hidden', distance: 1, visible: resolveLineOfSight(smokeField, source, point(4, 0)).visible };
  assert.equal(resolveLineOfSight(clearField, source, point(4, 0)).visible, true);
  assert.equal(hidden.visible, false);
  assert.equal(selectTarget([hidden, near], { maxRange: 20 }).id, 'near');

  const target = { id: 'target', x: 64, y: 0, hp: 100, buffs: { smoke: 8 } };
  const game = {
    projectiles: [{ x: 0, y: 0, target, damage: 5.5, life: 2, kind: 'bullet' }],
    effects: [{ kind: 'smoke', x: 32, y: 0, radius: 60, life: 8, max: 8 }],
    nextProjectileSeed: 6,
  };
  updateProjectiles(game, 0.001);
  assert.ok(game.projectiles[0].smokeDensity > 0);
  assert.equal(game.projectiles[0].hit, false);
  assert.equal(target.hp, 100);
});

test('suppression traverses every morale state, emits diagnostics, and recovers under command', () => {
  const stream = createDomainEventStream();
  let status = createSuppressionStatus({ unitId: 'squad-1' });
  assert.equal(status.morale, MORALE_STATES.STEADY);
  const shaken = applySuppression(status, 35);
  assert.equal(shaken.current.morale, MORALE_STATES.SHAKEN);
  status = shaken.current;
  const pinned = applySuppression(status, 25);
  assert.equal(pinned.current.morale, MORALE_STATES.PINNED);
  assert.equal(pinned.orderRestrictions.canAdvance, false);
  emitStatusTransition(stream, pinned, { tick: 10 });
  assert.equal(stream.peek()[0].type, DOMAIN_EVENT_TYPES.ALERT);
  const broken = applySuppression(pinned.current, 30);
  assert.equal(broken.current.morale, MORALE_STATES.BROKEN);
  const commanded = setCommandAura(broken.current, true);
  assert.equal(commanded.current.commandAura, true);
  const recovered = recoverSuppression(commanded.current, 4);
  assert.ok(recovered.current.suppression < commanded.current.suppression);
  assert.notEqual(recovered.current.morale, MORALE_STATES.BROKEN);
});

test('all seven ability modes acquire, validate, activate, toggle, or channel deterministically', () => {
  const actor = { id: 'caster', x: 0, y: 0, side: 'ua', domain: TARGET_DOMAINS.GROUND, cooldowns: {} };
  const enemy = { id: 'enemy', x: 50, y: 0, side: 'ru', domain: TARGET_DOMAINS.GROUND, hp: 100 };
  const context = { isPointPassable: () => true, hasLineOfSight: () => true };
  const profiles = [
    createAbilityTargetingProfile({ id: 'point', mode: ABILITY_TARGET_MODES.POINT, range: 100, requiresPassablePoint: true }),
    createAbilityTargetingProfile({ id: 'unit', mode: ABILITY_TARGET_MODES.UNIT, range: 100, targetAllegiance: TARGET_ALLEGIANCES.ENEMY, targetDomains: [TARGET_DOMAINS.GROUND] }),
    createAbilityTargetingProfile({ id: 'area', mode: ABILITY_TARGET_MODES.AREA, range: 100, radius: 20 }),
    createAbilityTargetingProfile({ id: 'direction', mode: ABILITY_TARGET_MODES.DIRECTION, range: 100, directionLength: 80 }),
    createAbilityTargetingProfile({ id: 'self', mode: ABILITY_TARGET_MODES.SELF }),
    createAbilityTargetingProfile({ id: 'toggle', mode: ABILITY_TARGET_MODES.TOGGLE }),
    createAbilityTargetingProfile({ id: 'channel', mode: ABILITY_TARGET_MODES.CHANNEL, channelTargetMode: ABILITY_TARGET_MODES.SELF, channelDuration: 2, cooldown: 4 }),
  ];
  const targets = [{ x: 40, y: 0 }, enemy, { x: 40, y: 0 }, { x: 40, y: 40 }, actor, null, actor];
  const activatedModes = [];
  for (let index = 0; index < profiles.length; index += 1) {
    const profile = profiles[index];
    const begun = beginAbilityTargeting(createAbilityTargetingState(), profile, actor, context);
    assert.equal(begun.ok, true, profile.mode);
    const confirmed = confirmAbilityTarget(begun.state, profile, actor, targets[index], context);
    assert.equal(confirmed.ok, true, profile.mode);
    activatedModes.push(profile.mode);
    if (profile.mode === ABILITY_TARGET_MODES.TOGGLE) assert.equal(confirmed.state.toggles.toggle, true);
    if (profile.mode === ABILITY_TARGET_MODES.CHANNEL) {
      const partial = tickAbilityChannel(confirmed.state, profile, 1);
      assert.equal(partial.completion, null);
      const complete = tickAbilityChannel(partial.state, profile, 1);
      assert.equal(complete.completion.cooldown, 4);
    }
  }
  assert.deepEqual(activatedModes, values(ABILITY_TARGET_MODES));
});

test('area damage composes falloff, friendly fire, structure scaling, and stable presentation output', () => {
  const result = resolveAreaDamage({
    impactX: 0,
    impactY: 0,
    radius: 100,
    baseDamage: 100,
    source: { side: 'ua' },
    targets: [
      { id: 'enemy', x: 0, y: 0, side: 'ru', domain: TARGET_DOMAINS.GROUND },
      { id: 'friendly', x: 0, y: 0, side: 'ua', domain: TARGET_DOMAINS.GROUND },
      { id: 'structure', x: 50, y: 0, side: 'ru', domain: TARGET_DOMAINS.STRUCTURE },
    ],
    policy: createAreaDamagePolicy({
      friendlyFireMode: FRIENDLY_FIRE_MODES.SCALED,
      friendlyFireMultiplier: 0.25,
      structureDamageMode: STRUCTURE_DAMAGE_MODES.SCALED,
      structureDamageMultiplier: 0.5,
    }),
  });
  assert.deepEqual(result.applications.map((entry) => entry.targetId), ['enemy', 'friendly', 'structure']);
  assert.equal(result.applications.find((entry) => entry.targetId === 'enemy').damage, 100);
  assert.equal(result.applications.find((entry) => entry.targetId === 'friendly').damage, 25);
  assert.ok(result.applications.find((entry) => entry.targetId === 'structure').damage < 50);
  assert.deepEqual(result.effect.affectedTargetIds, ['enemy', 'friendly', 'structure']);
  assert.equal(Object.isFrozen(result), true);
});

test('reconnaissance, observed artillery, drone interception, and layered air defense form one chain', () => {
  const droneConfig = {
    payload: 1,
    launchTime: 0,
    loiterDuration: 30,
    linkRange: 500,
    linkLossGrace: 2,
    autonomousReturn: true,
  };
  let drone = beginDroneLaunch(createDroneState(droneConfig), droneConfig);
  drone = tickDrone(drone, 0, { distance: 100 }, droneConfig);
  assert.equal(drone.state, DRONE_STATES.AIRBORNE);

  const artilleryConfig = {
    ammo: 4,
    setupTime: 0,
    packTime: 2,
    minimumRange: 30,
    requiresSpotter: true,
    salvoSize: 2,
    shotCadence: 1,
    signaturePerShot: 0.25,
  };
  let artillery = beginSetup(createArtilleryState(artilleryConfig), artilleryConfig);
  artillery = tickArtillery(artillery, 0, artilleryConfig);
  assert.equal(canFire(artillery, { distance: 100, spotted: false }, artilleryConfig).reason, 'spotting-required');
  const salvo = startSalvo(artillery, { distance: 100, spotted: true }, artilleryConfig);
  artillery = fireSalvoRound(salvo.state, artilleryConfig);
  assert.equal(artillery.ammo, 3);
  assert.equal(artillery.signature, 0.25);

  const defender = { x: 0, y: 0 };
  const airTarget = {
    id: 'recon-drone',
    x: 120,
    y: 0,
    altitude: 80,
    domain: 'air',
    targetClass: AIR_TARGET_CLASSES.RECON_DRONE,
    hp: 60,
    signature: 0.7,
    inbound: true,
  };
  const airConfig = { minimumRange: 10, maximumRange: 200, detectionRange: 250, opticalRange: 40, ammunition: 2, missileDamage: 90, missileSpeed: 300, impactRadius: 3, hitChance: 1 };
  let airState = createAirDefenseState(airConfig);
  assert.equal(selectAirDefenseTarget(defender, [airTarget], airState, {}, airConfig).target.id, 'recon-drone');
  const launch = launchAirDefenseMissile(airState, defender, airTarget, {}, airConfig);
  assert.equal(launch.verdict.ok, true);
  airState = launch.state;
  const impact = tickAirDefense(airState, 1, [airTarget], () => 0);
  assert.equal(impact.events[0].type, 'missile-impact');
  assert.equal(impact.events[0].hit, true);

  const threat = createDroneInterceptionThreat(defender, airTarget, {}, { ...airConfig, interceptionChance: 1 });
  const intercepted = resolveDroneInterception(drone, threat, () => 0, { signatureInterceptionBonus: 0 });
  assert.equal(intercepted.intercepted, true);
  assert.equal(intercepted.state.state, DRONE_STATES.LOST);
});

test('repair and destruction boundaries prevent repair-after-destruction and cover all wreck outcomes', () => {
  const repairOrder = createRepairOrder({ id: 'repair-1', team: 'ua', targetId: 'vehicle-1', repairerIds: ['eng-1'] });
  const damaged = { id: 'vehicle-1', team: 'ua', domain: TARGET_DOMAINS.GROUND, hp: 40, maxHp: 100 };
  const repaired = resolveRepairTick({
    order: repairOrder,
    target: damaged,
    repairers: [{ id: 'eng-1', team: 'ua' }],
    resources: { metal: 100 },
    dt: 1,
  });
  assert.ok(repaired.target.hp > damaged.hp);

  const entity = {
    ...repaired.target,
    x: 10,
    y: 20,
    position: { x: 10, y: 20 },
    radius: 12,
    crew: 4,
    cost: { metal: 200, fuel: 80 },
  };
  const policy = createDestructionPolicy({ autoIgniteWhenDisabled: false, burnDurationSeconds: 2, burnDamagePerSecond: 100 });
  const initial = createDestructionState(entity, policy);
  const burning = applyDestructionDamage(initial, entity, 10, { ignite: true }, policy);
  assert.equal(burning.state.phase, DESTRUCTION_PHASES.BURNING);
  const burnedOut = tickBurning(burning.state, entity, 2, policy);
  assert.equal(burnedOut.state.phase, DESTRUCTION_PHASES.DESTROYED);

  const wrecked = materializeWreck(burnedOut.state, entity, policy);
  assert.equal(wrecked.state.phase, DESTRUCTION_PHASES.WRECK);
  const salvaged = applyWreckSalvage(wrecked.state, policy.salvageWorkRequired, policy);
  assert.equal(salvaged.state.phase, DESTRUCTION_PHASES.SALVAGED);
  assert.equal(salvaged.state.wreck.obstruction.cleared, true);

  const directDestroyed = applyDestructionDamage(initial, entity, 999, {}, policy);
  const secondWreck = materializeWreck(directDestroyed.state, entity, policy);
  const destroyedWreck = damageWreck(secondWreck.state, secondWreck.state.wreck.hp);
  assert.equal(destroyedWreck.state.phase, DESTRUCTION_PHASES.CLEARED);

  const thirdWreck = materializeWreck(directDestroyed.state, entity, policy);
  const manuallyCleared = clearWreckObstruction(thirdWreck.state);
  assert.equal(manuallyCleared.state.phase, DESTRUCTION_PHASES.CLEARED);
});

test('projectile kill attribution, veterancy, stances, and retaliation remain deterministic', () => {
  const source = combatUnit(1, 0, 0, 0);
  const target = combatUnit(2, 1, 20, 0, { hp: 10, veterancyXpValue: 90 });
  recordDamageSource(target, source);
  const game = {
    units: [source, target],
    buildings: [],
    projectiles: [{ x: 20, y: 0, aimX: 20, aimY: 0, target, source, speed: 100, damage: 20, life: 1, hit: true }],
    effects: [],
  };
  updateProjectiles(game, 0.1);
  assert.ok(target.hp <= 0);
  const events = processVeterancyDeaths(game);
  assert.equal(events.length, 1);
  assert.equal(source.veterancy.xp, 90);

  const secondEnemy = combatUnit(3, 1, 80, 0);
  const stanceContext = stanceGame([source, secondEnemy]);
  setCombatStance(source, COMBAT_STANCES.RETURN_FIRE);
  recordStanceRetaliation(source, secondEnemy, 5);
  assert.equal(resolveStanceTarget(stanceContext, source, 6).target.id, 3);
  awardVeterancyXp(source, 390);
  assert.equal(source.veterancy.rank, 3);
});

test('engineer demolition drives deterministic garrison-destruction evacuation', () => {
  const host = { id: 'bunker-1', x: 100, y: 100, team: 'ru', hp: 500 };
  const defenders = [
    { id: 'd1', x: 100, y: 100, team: 'ru', hp: 100, maxHp: 100, infantry: true },
    { id: 'd2', x: 100, y: 100, team: 'ru', hp: 100, maxHp: 100, infantry: true },
  ];
  const occupied = enterGarrison(createGarrisonState(host), defenders);
  assert.equal(occupied.ok, true);

  const engineer = { id: 'eng-1', side: 'ua', x: 90, y: 100, hp: 100, chargeDefusal: 0.8 };
  const placed = placeDemolitionCharge(createEngineerMechanicsState(), engineer, host);
  const armed = armDemolitionCharge(placed.state, placed.charge.id, engineer, { fuse: 1 });
  const detonated = tickEngineerMechanics(armed.state, 1);
  assert.equal(detonated.status, ENGINEER_RESULTS.DETONATED);
  assert.equal(detonated.events[0].targetId, 'bunker-1');

  const evacuated = resolveGarrisonDestruction(
    occupied.state,
    [{ id: 'safe', x: 130, y: 100 }],
    sequenceRandom(0.1, 0.9),
  );
  assert.equal(evacuated.ok, true);
  assert.equal(evacuated.status, GARRISON_RESULTS.DESTROYED);
  assert.deepEqual(evacuated.survivorIds, ['d1']);
  assert.deepEqual(evacuated.casualtyIds, ['d2']);
});

test('combat readability produces stable range, target, status, impact, and damage diagnostics', () => {
  let state = createCombatReadabilityState();
  state = enqueueCombatCue(state, {
    kind: COMBAT_CUE_KINDS.STATUS,
    severity: COMBAT_CUE_SEVERITIES.WARNING,
    createdTick: 10,
    targetId: 'squad-1',
    position: { x: 10, y: 20 },
    text: 'Pinned',
  });
  state = enqueueCombatCue(state, {
    kind: COMBAT_CUE_KINDS.DAMAGE,
    severity: COMBAT_CUE_SEVERITIES.INFO,
    createdTick: 11,
    sourceId: 'gun-1',
    targetId: 'vehicle-1',
    position: { x: 30, y: 40 },
    value: 42,
  });
  const snapshot = createCombatReadabilitySnapshot({
    state,
    currentTick: 12,
    rangeSources: [{ id: 'gun-1', x: 0, y: 0, selected: true, minRange: 30, maxRange: 300, domain: 'ground' }],
    targetSources: [{ id: 'gun-1', position: { x: 0, y: 0 }, selected: true, targetId: 'vehicle-1', targetPosition: { x: 30, y: 40 }, command: 'attack' }],
  });
  assert.deepEqual(snapshot.rangeRings.map((ring) => ring.entityId), ['gun-1']);
  assert.deepEqual(snapshot.targetLines.map((line) => line.targetId), ['vehicle-1']);
  assert.deepEqual(snapshot.cues.map((cue) => cue.kind), [COMBAT_CUE_KINDS.STATUS, COMBAT_CUE_KINDS.DAMAGE]);
  assert.equal(Object.isFrozen(snapshot), true);
});
