import { TEAM, UNIT_TYPES } from '../config.js';
import { DOMAIN_EVENT_TYPES, createDomainEventStream } from '../core/events.js';
import {
  COMBAT_CUE_KINDS,
  COMBAT_CUE_SEVERITIES,
  COMBAT_IMPACT_OUTCOMES,
  advanceCombatReadability,
  createCombatReadabilitySnapshot,
  createCombatReadabilityState,
  enqueueCombatCue,
  setDamageNumbersVisible,
} from './combat-readability.js';

export const COMBAT_READABILITY_SETTINGS_KEY = 'fields-of-resolve:combat-readability';
export const COMBAT_READABILITY_SETTINGS_VERSION = 1;

const IMPACT_OUTCOMES = new Set(Object.values(COMBAT_IMPACT_OUTCOMES));

function safeReadPreference(storage, key) {
  if (!storage || typeof storage.getItem !== 'function') return true;
  try {
    const raw = storage.getItem(key);
    if (raw === null) return true;
    const parsed = JSON.parse(raw);
    return parsed?.version === COMBAT_READABILITY_SETTINGS_VERSION && typeof parsed.showDamageNumbers === 'boolean'
      ? parsed.showDamageNumbers
      : true;
  } catch {
    return true;
  }
}

function safeWritePreference(storage, key, visible) {
  if (!storage || typeof storage.setItem !== 'function') return false;
  try {
    storage.setItem(key, JSON.stringify({
      version: COMBAT_READABILITY_SETTINGS_VERSION,
      showDamageNumbers: visible,
    }));
    return true;
  } catch {
    return false;
  }
}

function point(entity) {
  return { x: Number(entity?.x) || 0, y: Number(entity?.y) || 0 };
}

function cueSeverityForShot(payload) {
  return payload.projectileKind === 'shell' || payload.impact === 'explosive'
    ? COMBAT_CUE_SEVERITIES.CRITICAL
    : COMBAT_CUE_SEVERITIES.WARNING;
}

function impactOutcome(payload) {
  return IMPACT_OUTCOMES.has(payload.outcome)
    ? payload.outcome
    : payload.hit === false
      ? COMBAT_IMPACT_OUTCOMES.MISS
      : COMBAT_IMPACT_OUTCOMES.HIT;
}

function selectedCombatSources(game) {
  return (game.selectedUnits?.() || [])
    .filter((unit) => unit?.hp > 0)
    .map((unit) => {
      const stats = unit.team === TEAM.UA ? game.unitStats?.(unit.type) ?? UNIT_TYPES[unit.type] : UNIT_TYPES[unit.type];
      if (!(Number(stats?.damage) > 0) || !(Number(stats?.range) >= 0)) return null;
      return {
        id: unit.id,
        x: unit.x,
        y: unit.y,
        selected: true,
        visible: unit.visible !== false,
        minRange: Number(
          stats.minRange
          ?? stats.minimumRange
          ?? unit.artilleryConfig?.minimumRange
          ?? unit.artillery?.minimumRange
          ?? stats.artillery?.minimumRange
          ?? 0
        ),
        maxRange: Number(stats.range),
        domain: stats.air ? 'air' : stats.armor ? 'armor' : 'ground',
      };
    })
    .filter(Boolean);
}

function selectedTargetSources(game) {
  return (game.selectedUnits?.() || [])
    .map((unit) => {
      const order = unit.order;
      const target = order?.target?.hp > 0 ? order.target : unit.target?.hp > 0 ? unit.target : null;
      const targetPosition = target
        ? point(target)
        : Number.isFinite(order?.x) && Number.isFinite(order?.y)
          ? { x: order.x, y: order.y }
          : null;
      if (!targetPosition) return null;
      return {
        id: unit.id,
        position: point(unit),
        selected: true,
        visible: unit.visible !== false,
        targetId: target?.id ?? null,
        targetPosition,
        command: order?.kind ?? (unit.target ? 'auto-fire' : null),
      };
    })
    .filter(Boolean);
}

export function createCombatReadabilityController(game, {
  eventStream = null,
  storage = null,
  settingsKey = COMBAT_READABILITY_SETTINGS_KEY,
} = {}) {
  for (const method of ['shoot', 'start', 'update', 'selectedUnits', 'unitStats']) {
    if (typeof game?.[method] !== 'function') {
      throw new TypeError(`Combat readability controller requires game.${method}().`);
    }
  }

  const previousEventStream = game.events;
  const activeEventStream = eventStream ?? previousEventStream ?? createDomainEventStream();
  const ownsEventStream = previousEventStream === undefined;
  const originalShoot = game.shoot;
  const originalStart = game.start;
  const originalUpdate = game.update;
  let currentTick = 0;
  let state = createCombatReadabilityState({
    preferences: {
      showDamageNumbers: safeReadPreference(storage, settingsKey),
      maxTransientCues: 96,
    },
  });

  const enqueue = (cue) => {
    state = enqueueCombatCue(state, { ...cue, createdTick: currentTick });
  };

  const unsubscribeShot = activeEventStream.subscribe(DOMAIN_EVENT_TYPES.SHOT, ({ payload }) => {
    if (payload.targetTeam !== TEAM.UA) return;
    enqueue({
      kind: COMBAT_CUE_KINDS.INCOMING,
      severity: cueSeverityForShot(payload),
      sourceId: payload.sourceId ?? null,
      targetId: payload.targetId ?? null,
      position: payload.targetPosition ?? payload.position,
      targetPosition: payload.targetPosition ?? null,
      text: payload.projectileKind === 'shell' ? 'Incoming heavy fire' : 'Incoming fire',
      dedupeKey: `incoming:${payload.targetId ?? 'unknown'}:${payload.projectileKind ?? 'weapon'}`,
    });
  });

  const unsubscribeImpact = activeEventStream.subscribe(DOMAIN_EVENT_TYPES.IMPACT, ({ payload }) => {
    const outcome = impactOutcome(payload);
    const position = payload.position ?? payload.targetPosition;
    enqueue({
      kind: COMBAT_CUE_KINDS.IMPACT,
      severity: outcome === COMBAT_IMPACT_OUTCOMES.MISS ? COMBAT_CUE_SEVERITIES.INFO : COMBAT_CUE_SEVERITIES.WARNING,
      sourceId: payload.sourceId ?? null,
      targetId: payload.targetId ?? null,
      position,
      targetPosition: payload.targetPosition ?? null,
      text: outcome === COMBAT_IMPACT_OUTCOMES.MISS ? 'MISS' : 'HIT',
      outcome,
    });
    if ([COMBAT_IMPACT_OUTCOMES.DEFLECT, COMBAT_IMPACT_OUTCOMES.PENETRATE].includes(outcome)) {
      enqueue({
        kind: COMBAT_CUE_KINDS.ARMOR,
        severity: outcome === COMBAT_IMPACT_OUTCOMES.PENETRATE
          ? COMBAT_CUE_SEVERITIES.CRITICAL
          : COMBAT_CUE_SEVERITIES.INFO,
        sourceId: payload.sourceId ?? null,
        targetId: payload.targetId ?? null,
        position: payload.targetPosition ?? position,
        text: outcome === COMBAT_IMPACT_OUTCOMES.PENETRATE ? 'PENETRATION' : 'DEFLECT',
        outcome,
      });
    }
    if (Number(payload.damage) > 0) {
      enqueue({
        kind: COMBAT_CUE_KINDS.DAMAGE,
        severity: COMBAT_CUE_SEVERITIES.INFO,
        sourceId: payload.sourceId ?? null,
        targetId: payload.targetId ?? null,
        position: payload.targetPosition ?? position,
        value: Math.round(Number(payload.damage) * 10) / 10,
        text: null,
      });
    }
  });

  const unsubscribeAlert = activeEventStream.subscribe(DOMAIN_EVENT_TYPES.ALERT, ({ payload }) => {
    const targetId = payload.targetId ?? payload.unitId ?? null;
    const entity = [...(game.units || []), ...(game.buildings || [])]
      .find((candidate) => String(candidate.id) === String(targetId));
    const morale = payload.morale ?? null;
    const severity = payload.severity
      ?? (morale === 'broken' ? COMBAT_CUE_SEVERITIES.CRITICAL
        : morale === 'pinned' ? COMBAT_CUE_SEVERITIES.WARNING
          : COMBAT_CUE_SEVERITIES.INFO);
    enqueue({
      kind: payload.kind === COMBAT_CUE_KINDS.INCOMING ? COMBAT_CUE_KINDS.INCOMING : COMBAT_CUE_KINDS.STATUS,
      severity,
      sourceId: payload.sourceId ?? null,
      targetId,
      position: payload.position ?? point(entity),
      targetPosition: payload.targetPosition ?? null,
      text: payload.text ?? (morale ? `Morale: ${morale}` : 'Combat alert'),
      dedupeKey: payload.dedupeKey
        ?? (payload.category === 'unit-status' ? `status:${targetId ?? 'unknown'}:${morale ?? 'changed'}` : null),
    });
  });

  game.events = activeEventStream;
  game.shoot = (unit, target) => {
    const before = game.projectiles?.length ?? 0;
    const result = originalShoot.call(game, unit, target);
    const projectile = game.projectiles?.[before];
    if (projectile) {
      activeEventStream.emit(DOMAIN_EVENT_TYPES.SHOT, {
        sourceId: unit?.id ?? null,
        targetId: target?.id ?? null,
        sourceTeam: unit?.team ?? null,
        targetTeam: target?.team ?? null,
        position: point(unit),
        targetPosition: point(target),
        projectileKind: projectile.kind ?? null,
        impact: projectile.impact ?? null,
      }, { source: 'combat-readability-shot-adapter' });
    }
    return result;
  };

  game.start = (...args) => {
    const result = originalStart.apply(game, args);
    currentTick = 0;
    if (ownsEventStream) activeEventStream.clear();
    state = createCombatReadabilityState({ preferences: state.preferences });
    return result;
  };

  game.update = (stepSeconds) => {
    currentTick += 1;
    activeEventStream.setTick(currentTick);
    const result = originalUpdate.call(game, stepSeconds);
    state = advanceCombatReadability(state, currentTick);
    if (ownsEventStream) game.lastDomainEvents = Object.freeze(activeEventStream.drain());
    return result;
  };

  game.setDamageNumbersVisible = (visible) => {
    state = setDamageNumbersVisible(state, visible);
    safeWritePreference(storage, settingsKey, visible);
    return state.preferences.showDamageNumbers;
  };
  game.toggleDamageNumbers = () => game.setDamageNumbersVisible(!state.preferences.showDamageNumbers);
  game.combatReadabilitySnapshot = () => createCombatReadabilitySnapshot({
    state,
    currentTick,
    rangeSources: selectedCombatSources(game),
    targetSources: selectedTargetSources(game),
  });

  return () => {
    unsubscribeAlert();
    unsubscribeImpact();
    unsubscribeShot();
    game.shoot = originalShoot;
    game.start = originalStart;
    game.update = originalUpdate;
    if (previousEventStream === undefined) delete game.events;
    else game.events = previousEventStream;
    if (ownsEventStream) delete game.lastDomainEvents;
    delete game.setDamageNumbersVisible;
    delete game.toggleDamageNumbers;
    delete game.combatReadabilitySnapshot;
  };
}
