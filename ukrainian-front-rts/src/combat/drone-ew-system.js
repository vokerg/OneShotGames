export const DRONE_STATES = Object.freeze({
  DOCKED: 'docked',
  LAUNCHING: 'launching',
  AIRBORNE: 'airborne',
  RETURNING: 'returning',
  RECOVERING: 'recovering',
  LOST: 'lost',
});

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function activeDrone(state) {
  return state.state === DRONE_STATES.AIRBORNE || state.state === DRONE_STATES.RETURNING;
}

export function createDroneState(config = {}) {
  return {
    state: DRONE_STATES.DOCKED,
    timer: 0,
    loiterRemaining: 0,
    payload: config.payload ?? 1,
    cooldown: 0,
    signature: 0,
    linkLostFor: 0,
    linkConnected: true,
    linkReason: null,
    lastTransitionReason: null,
  };
}

export function beginDroneLaunch(state, config = {}) {
  if (state.state !== DRONE_STATES.DOCKED) return state;
  return {
    ...state,
    state: DRONE_STATES.LAUNCHING,
    timer: config.launchTime ?? 1,
    loiterRemaining: config.loiterDuration ?? 30,
    linkLostFor: 0,
    linkConnected: true,
    linkReason: null,
    lastTransitionReason: 'launch-commanded',
  };
}

export function beginDroneRecovery(state, config = {}) {
  if (state.state !== DRONE_STATES.AIRBORNE) return state;
  return {
    ...state,
    state: DRONE_STATES.RETURNING,
    timer: config.returnTime ?? 3,
    linkLostFor: 0,
    lastTransitionReason: 'recovery-commanded',
  };
}

export function evaluateDroneLink(telemetry = {}, config = {}) {
  const distance = Math.max(0, telemetry.distance ?? 0);
  const relayBonus = Math.max(0, telemetry.relayBonus ?? 0);
  const jammerStrength = clamp(telemetry.jammerStrength ?? 0);
  const hardening = clamp(telemetry.linkHardening ?? config.linkHardening ?? 0);
  const baseRange = Math.max(0, config.linkRange ?? 500);
  const unjammedRange = baseRange + relayBonus;
  const jamPenalty = jammerStrength * (config.jamRangePenalty ?? baseRange * 0.6) * (1 - hardening);
  const effectiveRange = Math.max(config.minimumEffectiveRange ?? 0, unjammedRange - jamPenalty);
  const connected = distance <= effectiveRange;
  const jammed = jammerStrength > 0 && distance <= unjammedRange && !connected;
  const quality = effectiveRange > 0
    ? clamp(1 - distance / effectiveRange - jammerStrength * (1 - hardening) * (config.qualityJamPenalty ?? 0.25))
    : 0;

  return {
    connected,
    jammed,
    reason: connected ? null : jammed ? 'jammed' : 'link-range',
    distance,
    effectiveRange,
    unjammedRange,
    quality,
  };
}

export function canDroneStrike(state, context = {}, config = {}) {
  if (state.state !== DRONE_STATES.AIRBORNE) return { ok: false, reason: 'not-airborne' };
  if (state.cooldown > 0) return { ok: false, reason: 'cooldown' };
  if (state.payload <= 0) return { ok: false, reason: 'no-payload' };
  const link = evaluateDroneLink(context, config);
  if (!link.connected && !config.autonomousStrike) return { ok: false, reason: link.reason, link };
  if (config.requiresSpottedTarget && !context.targetSpotted) {
    return { ok: false, reason: 'target-not-spotted', link };
  }
  return { ok: true, reason: null, link };
}

export function executeDroneStrike(state, context = {}, config = {}) {
  const verdict = canDroneStrike(state, context, config);
  if (!verdict.ok) return { state, verdict };

  const consumedOnStrike = Boolean(config.consumedOnStrike);
  const payload = Math.max(0, state.payload - 1);
  const signature = clamp(state.signature + (config.signaturePerStrike ?? 0.65));
  const next = {
    ...state,
    state: consumedOnStrike ? DRONE_STATES.LOST : state.state,
    payload,
    cooldown: consumedOnStrike ? 0 : (config.strikeCooldown ?? 2),
    signature,
    lastTransitionReason: consumedOnStrike ? 'strike-consumed' : 'strike-executed',
  };

  return {
    state: next,
    verdict,
    counterplay: {
      revealed: signature > 0,
      signature,
      interceptionModifier: signature * (config.signatureInterceptionBonus ?? 0.25),
      consumedOnStrike,
    },
  };
}

export function resolveDroneInterception(state, threat = {}, random, config = {}) {
  if (typeof random !== 'function') throw new TypeError('Drone interception requires an injected random source.');
  if (!activeDrone(state)) {
    return { state, intercepted: false, probability: 0, roll: null, reason: 'not-airborne' };
  }
  if (!threat.canEngage) {
    return { state, intercepted: false, probability: 0, roll: null, reason: 'no-engagement' };
  }

  const evasion = clamp((threat.evasionBonus ?? 0) + (config.evasionBonus ?? 0));
  const signatureBonus = clamp(state.signature) * (config.signatureInterceptionBonus ?? 0.25);
  const probability = clamp((threat.interceptionChance ?? 0) + signatureBonus - evasion);
  const roll = random();
  const intercepted = roll < probability;
  return {
    state: intercepted
      ? { ...state, state: DRONE_STATES.LOST, timer: 0, lastTransitionReason: 'intercepted' }
      : state,
    intercepted,
    probability,
    roll,
    reason: intercepted ? 'intercepted' : 'evaded',
  };
}

export function tickDrone(state, dt, telemetry = {}, config = {}) {
  const elapsed = Math.max(0, dt);
  let next = {
    ...state,
    timer: Math.max(0, state.timer - elapsed),
    cooldown: Math.max(0, state.cooldown - elapsed),
    signature: Math.max(0, state.signature - (config.signatureDecay ?? 0.08) * elapsed),
  };

  if (state.state === DRONE_STATES.LAUNCHING && next.timer === 0) {
    next.state = DRONE_STATES.AIRBORNE;
    next.lastTransitionReason = 'launch-complete';
    return next;
  }

  if (state.state === DRONE_STATES.RETURNING && next.timer === 0) {
    next.state = DRONE_STATES.RECOVERING;
    next.timer = config.recoveryTime ?? 1;
    next.lastTransitionReason = 'return-complete';
    return next;
  }

  if (state.state === DRONE_STATES.RECOVERING && next.timer === 0) {
    return {
      ...next,
      state: DRONE_STATES.DOCKED,
      loiterRemaining: 0,
      linkLostFor: 0,
      linkConnected: true,
      linkReason: null,
      signature: 0,
      lastTransitionReason: 'recovered',
    };
  }

  if (state.state !== DRONE_STATES.AIRBORNE) return next;

  next.loiterRemaining = Math.max(0, state.loiterRemaining - elapsed);
  const link = evaluateDroneLink(telemetry, config);
  next.linkConnected = link.connected;
  next.linkReason = link.reason;
  next.linkLostFor = link.connected ? 0 : state.linkLostFor + elapsed;

  if (next.loiterRemaining === 0) {
    next.state = DRONE_STATES.RETURNING;
    next.timer = config.returnTime ?? 3;
    next.lastTransitionReason = 'loiter-expired';
    return next;
  }

  if (!link.connected && next.linkLostFor >= (config.linkLossGrace ?? 2)) {
    if (config.autonomousReturn ?? true) {
      next.state = DRONE_STATES.RETURNING;
      next.timer = config.returnTime ?? 3;
      next.lastTransitionReason = link.reason === 'jammed' ? 'jammed-return' : 'link-loss-return';
    } else {
      next.state = DRONE_STATES.LOST;
      next.timer = 0;
      next.lastTransitionReason = link.reason === 'jammed' ? 'jammed-lost' : 'link-loss-lost';
    }
  }

  return next;
}
