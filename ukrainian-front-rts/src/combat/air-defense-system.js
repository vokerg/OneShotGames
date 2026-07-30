const clamp = (value, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, value));

export const AIR_TARGET_CLASSES = Object.freeze({
  MISSILE: 'missile',
  LOITERING_MUNITION: 'loiteringMunition',
  STRIKE_DRONE: 'strikeDrone',
  RECON_DRONE: 'reconDrone',
  AIRCRAFT: 'aircraft',
  UNKNOWN: 'unknown',
});

export const DEFAULT_AIR_DEFENSE_CONFIG = Object.freeze({
  detectionRange: 420,
  opticalRange: 150,
  minimumRadarRange: 70,
  jammerRangePenalty: 0.55,
  radarHardening: 0,
  minimumRange: 35,
  maximumRange: 360,
  minimumAltitude: 8,
  maximumAltitude: 600,
  reloadTime: 2.4,
  ammunition: 4,
  maxInFlight: 3,
  maxMissilesPerTarget: 2,
  missileSpeed: 280,
  missileDamage: 90,
  missileLife: 5,
  seekerRange: 650,
  impactRadius: 8,
  hitChance: 0.72,
  overkillThreshold: 0.9,
});

const TARGET_PRIORITY = Object.freeze({
  [AIR_TARGET_CLASSES.MISSILE]: 500,
  [AIR_TARGET_CLASSES.LOITERING_MUNITION]: 460,
  [AIR_TARGET_CLASSES.STRIKE_DRONE]: 400,
  [AIR_TARGET_CLASSES.RECON_DRONE]: 300,
  [AIR_TARGET_CLASSES.AIRCRAFT]: 250,
  [AIR_TARGET_CLASSES.UNKNOWN]: 100,
});

function assertPoint(point, label) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new TypeError(`${label} must contain finite x and y coordinates.`);
  }
}

function assertState(state) {
  if (!state || !Array.isArray(state.missiles) || !Number.isInteger(state.nextMissileId)) {
    throw new TypeError('Air-defense state must be created by createAirDefenseState.');
  }
}

function targetId(target) {
  if (target?.id === undefined || target?.id === null || target.id === '') {
    throw new TypeError('Air targets require a stable id.');
  }
  return String(target.id);
}

function distance(left, right) {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function isAlive(target) {
  return target && !target.destroyed && (target.hp === undefined || target.hp > 0);
}

function isAirTarget(target) {
  return Boolean(
    target?.air === true ||
    target?.domain === 'air' ||
    target?.state === 'airborne' ||
    target?.state === 'returning',
  );
}

function configValue(config, key) {
  return config[key] ?? DEFAULT_AIR_DEFENSE_CONFIG[key];
}

function normalizeTargetClass(target) {
  const candidate = target?.targetClass ?? target?.airClass ?? target?.kind;
  return Object.values(AIR_TARGET_CLASSES).includes(candidate) ? candidate : AIR_TARGET_CLASSES.UNKNOWN;
}

export function createAirDefenseState(config = {}) {
  const ammunition = config.ammunition ?? DEFAULT_AIR_DEFENSE_CONFIG.ammunition;
  if (!Number.isInteger(ammunition) || ammunition < 0) {
    throw new TypeError('Air-defense ammunition must be a non-negative integer.');
  }
  return {
    cooldown: Math.max(0, Number(config.cooldown || 0)),
    ammunition,
    nextMissileId: 1,
    missiles: [],
    reservations: {},
  };
}

export function evaluateAirDetection(defender, target, context = {}, config = {}) {
  assertPoint(defender, 'Air-defense position');
  assertPoint(target, 'Air target position');
  const targetDistance = distance(defender, target);
  if (!isAlive(target)) return { detected: false, reason: 'target-destroyed', distance: targetDistance };
  if (!isAirTarget(target)) return { detected: false, reason: 'not-air-target', distance: targetDistance };

  const opticalRange = Math.max(0, configValue(config, 'opticalRange'));
  if (context.lineOfSight !== false && targetDistance <= opticalRange) {
    return {
      detected: true,
      reason: null,
      mode: 'optical',
      distance: targetDistance,
      effectiveRange: opticalRange,
    };
  }

  if (context.radarOnline === false) {
    return { detected: false, reason: 'radar-offline', distance: targetDistance, effectiveRange: opticalRange };
  }

  const signature = clamp(target.signature ?? 0.5);
  const stealth = clamp(target.stealth ?? 0);
  const radarQuality = clamp(context.radarQuality ?? 1);
  const jammerStrength = clamp(context.jammerStrength ?? 0);
  const hardening = clamp(context.radarHardening ?? configValue(config, 'radarHardening'));
  const signatureMultiplier = 0.55 + signature * 0.45;
  const stealthMultiplier = 1 - stealth * 0.55;
  const jammerMultiplier = 1 - jammerStrength * (1 - hardening) * configValue(config, 'jammerRangePenalty');
  const effectiveRange = Math.max(
    configValue(config, 'minimumRadarRange'),
    configValue(config, 'detectionRange') * signatureMultiplier * stealthMultiplier * radarQuality * jammerMultiplier,
  );
  const detected = targetDistance <= effectiveRange;
  return {
    detected,
    reason: detected ? null : jammerStrength > 0 ? 'jammed-or-out-of-range' : 'out-of-detection-range',
    mode: detected ? 'radar' : null,
    distance: targetDistance,
    effectiveRange,
    signature,
    jammerStrength,
  };
}

export function evaluateEngagementEnvelope(defender, target, config = {}) {
  assertPoint(defender, 'Air-defense position');
  assertPoint(target, 'Air target position');
  const targetDistance = distance(defender, target);
  const altitude = Math.max(0, Number(target.altitude ?? 40));
  const minimumRange = Math.max(0, configValue(config, 'minimumRange'));
  const maximumRange = Math.max(minimumRange, configValue(config, 'maximumRange'));
  const minimumAltitude = Math.max(0, configValue(config, 'minimumAltitude'));
  const maximumAltitude = Math.max(minimumAltitude, configValue(config, 'maximumAltitude'));

  if (targetDistance < minimumRange) return { ok: false, reason: 'inside-minimum-range', distance: targetDistance, altitude };
  if (targetDistance > maximumRange) return { ok: false, reason: 'outside-maximum-range', distance: targetDistance, altitude };
  if (altitude < minimumAltitude) return { ok: false, reason: 'below-minimum-altitude', distance: targetDistance, altitude };
  if (altitude > maximumAltitude) return { ok: false, reason: 'above-maximum-altitude', distance: targetDistance, altitude };
  return { ok: true, reason: null, distance: targetDistance, altitude };
}

export function reservedDamageFor(state, target) {
  assertState(state);
  return Math.max(0, Number(state.reservations[targetId(target)] || 0));
}

export function scoreAirTarget(defender, target, state, config = {}) {
  const targetClass = normalizeTargetClass(target);
  const envelope = evaluateEngagementEnvelope(defender, target, config);
  const maximumRange = Math.max(1, configValue(config, 'maximumRange'));
  const proximity = Math.max(0, 1 - envelope.distance / maximumRange) * 60;
  const inboundBonus = target.inbound ? 140 : 0;
  const payloadBonus = target.hasPayload || target.payload > 0 ? 80 : 0;
  const threatBonus = Math.max(0, Number(target.damagePotential || 0)) * 0.5;
  const signatureBonus = clamp(target.signature ?? 0.5) * 20;
  const reservationPenalty = reservedDamageFor(state, target) * 0.25;
  return (
    (TARGET_PRIORITY[targetClass] ?? TARGET_PRIORITY[AIR_TARGET_CLASSES.UNKNOWN]) +
    inboundBonus +
    payloadBonus +
    threatBonus +
    proximity +
    signatureBonus -
    reservationPenalty
  );
}

export function selectAirDefenseTarget(defender, targets, state, context = {}, config = {}) {
  assertState(state);
  if (!Array.isArray(targets)) throw new TypeError('Air-defense targets must be an array.');
  const candidates = [];
  for (const target of targets) {
    if (!isAlive(target) || !isAirTarget(target)) continue;
    const detection = evaluateAirDetection(defender, target, context, config);
    if (!detection.detected) continue;
    const envelope = evaluateEngagementEnvelope(defender, target, config);
    if (!envelope.ok) continue;
    const hp = Math.max(1, Number(target.hp ?? configValue(config, 'missileDamage')));
    const reservedDamage = reservedDamageFor(state, target);
    if (reservedDamage >= hp * configValue(config, 'overkillThreshold')) continue;
    candidates.push({
      target,
      detection,
      envelope,
      reservedDamage,
      score: scoreAirTarget(defender, target, state, config),
    });
  }
  candidates.sort((left, right) =>
    right.score - left.score ||
    left.envelope.distance - right.envelope.distance ||
    targetId(left.target).localeCompare(targetId(right.target)),
  );
  return candidates[0] ?? null;
}

function missilesForTarget(state, target) {
  const id = targetId(target);
  return state.missiles.filter((missile) => missile.targetId === id).length;
}

export function canLaunchAirDefenseMissile(state, defender, target, context = {}, config = {}) {
  assertState(state);
  if (state.cooldown > 0) return { ok: false, reason: 'reload' };
  if (state.ammunition <= 0) return { ok: false, reason: 'no-ammunition' };
  if (state.missiles.length >= configValue(config, 'maxInFlight')) return { ok: false, reason: 'in-flight-cap' };
  if (!isAlive(target)) return { ok: false, reason: 'target-destroyed' };
  const detection = evaluateAirDetection(defender, target, context, config);
  if (!detection.detected) return { ok: false, reason: detection.reason, detection };
  const envelope = evaluateEngagementEnvelope(defender, target, config);
  if (!envelope.ok) return { ok: false, reason: envelope.reason, detection, envelope };
  if (missilesForTarget(state, target) >= configValue(config, 'maxMissilesPerTarget')) {
    return { ok: false, reason: 'target-salvo-cap', detection, envelope };
  }
  const hp = Math.max(1, Number(target.hp ?? configValue(config, 'missileDamage')));
  const reservedDamage = reservedDamageFor(state, target);
  if (reservedDamage >= hp * configValue(config, 'overkillThreshold')) {
    return { ok: false, reason: 'overkill-reserved', detection, envelope, reservedDamage };
  }
  return { ok: true, reason: null, detection, envelope, reservedDamage };
}

export function launchAirDefenseMissile(state, defender, target, context = {}, config = {}) {
  const verdict = canLaunchAirDefenseMissile(state, defender, target, context, config);
  if (!verdict.ok) return { state, verdict, missile: null };
  const id = targetId(target);
  const damage = Math.max(0, configValue(config, 'missileDamage'));
  const missile = {
    id: `ad-${state.nextMissileId}`,
    targetId: id,
    x: defender.x,
    y: defender.y,
    speed: Math.max(1, configValue(config, 'missileSpeed')),
    damage,
    life: Math.max(0.01, configValue(config, 'missileLife')),
    seekerRange: Math.max(1, configValue(config, 'seekerRange')),
    impactRadius: Math.max(0, configValue(config, 'impactRadius')),
    hitChance: clamp(configValue(config, 'hitChance')),
  };
  const next = {
    ...state,
    cooldown: Math.max(0, configValue(config, 'reloadTime')),
    ammunition: state.ammunition - 1,
    nextMissileId: state.nextMissileId + 1,
    missiles: [...state.missiles, missile],
    reservations: {
      ...state.reservations,
      [id]: reservedDamageFor(state, target) + damage,
    },
  };
  return { state: next, verdict, missile };
}

function resolveTarget(targets, id) {
  if (typeof targets === 'function') return targets(id);
  if (targets instanceof Map) return targets.get(id) ?? targets.get(Number(id));
  if (Array.isArray(targets)) return targets.find((target) => String(target.id) === id);
  return null;
}

function rebuildReservations(missiles) {
  const reservations = {};
  for (const missile of missiles) {
    reservations[missile.targetId] = (reservations[missile.targetId] || 0) + missile.damage;
  }
  return reservations;
}

export function tickAirDefense(state, dt, targets, random = () => 0.5) {
  assertState(state);
  if (!Number.isFinite(dt) || dt < 0) throw new TypeError('Air-defense dt must be non-negative.');
  if (typeof random !== 'function') {
    throw new TypeError('Air-defense impact resolution requires an injected random source.');
  }
  const events = [];
  const missiles = [];

  for (const missile of state.missiles) {
    const target = resolveTarget(targets, missile.targetId);
    const remainingLife = missile.life - dt;
    if (!isAlive(target)) {
      events.push({ type: 'missile-lost', missileId: missile.id, targetId: missile.targetId, reason: 'target-lost' });
      continue;
    }
    const targetDistance = distance(missile, target);
    if (targetDistance > missile.seekerRange || remainingLife <= 0) {
      events.push({
        type: 'missile-lost',
        missileId: missile.id,
        targetId: missile.targetId,
        reason: remainingLife <= 0 ? 'expired' : 'seeker-break',
      });
      continue;
    }
    const travel = missile.speed * dt;
    if (targetDistance <= travel + missile.impactRadius) {
      const evasion = clamp(target.evasion ?? target.evasionBonus ?? 0);
      const probability = clamp(missile.hitChance - evasion);
      const roll = random();
      const hit = roll < probability;
      events.push({
        type: 'missile-impact',
        missileId: missile.id,
        targetId: missile.targetId,
        hit,
        damage: hit ? missile.damage : 0,
        probability,
        roll,
      });
      continue;
    }
    missiles.push({
      ...missile,
      x: missile.x + ((target.x - missile.x) / targetDistance) * travel,
      y: missile.y + ((target.y - missile.y) / targetDistance) * travel,
      life: remainingLife,
    });
  }

  return {
    state: {
      ...state,
      cooldown: Math.max(0, state.cooldown - dt),
      missiles,
      reservations: rebuildReservations(missiles),
    },
    events,
  };
}

export function createDroneInterceptionThreat(defender, target, context = {}, config = {}) {
  const detection = evaluateAirDetection(defender, target, context, config);
  const envelope = evaluateEngagementEnvelope(defender, target, config);
  const canEngage = detection.detected && envelope.ok;
  return {
    canEngage,
    reason: canEngage ? null : detection.detected ? envelope.reason : detection.reason,
    interceptionChance: canEngage ? clamp(config.interceptionChance ?? configValue(config, 'hitChance')) : 0,
    distance: envelope.distance,
    detection,
    envelope,
  };
}
