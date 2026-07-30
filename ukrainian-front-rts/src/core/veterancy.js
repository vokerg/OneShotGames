export const VETERANCY_SCHEMA_VERSION = 1;

export const VETERANCY_RANKS = Object.freeze([
  Object.freeze({
    id: 'recruit',
    label: 'Recruit',
    badge: 'I',
    threshold: 0,
    modifiers: Object.freeze({ damage: 1, rate: 1, sight: 1 }),
  }),
  Object.freeze({
    id: 'trained',
    label: 'Trained',
    badge: 'II',
    threshold: 80,
    modifiers: Object.freeze({ damage: 1.03, rate: 0.98, sight: 1.02 }),
  }),
  Object.freeze({
    id: 'veteran',
    label: 'Veteran',
    badge: 'III',
    threshold: 220,
    modifiers: Object.freeze({ damage: 1.07, rate: 0.95, sight: 1.04 }),
  }),
  Object.freeze({
    id: 'elite',
    label: 'Elite',
    badge: '★',
    threshold: 480,
    modifiers: Object.freeze({ damage: 1.12, rate: 0.9, sight: 1.07 }),
  }),
]);

export const VETERANCY_BONUS_LIMITS = Object.freeze({
  damage: Object.freeze({ minimum: 1, maximum: 1.15 }),
  rate: Object.freeze({ minimum: 0.85, maximum: 1 }),
  sight: Object.freeze({ minimum: 1, maximum: 1.1 }),
});

const LAST_RANK_INDEX = VETERANCY_RANKS.length - 1;

function finiteNonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0) throw new TypeError(`${label} must be a non-negative finite number.`);
  return value;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function rankIndexForXp(xp) {
  let rankIndex = 0;
  for (let index = 1; index < VETERANCY_RANKS.length; index += 1) {
    if (xp < VETERANCY_RANKS[index].threshold) break;
    rankIndex = index;
  }
  return rankIndex;
}

function normalizeRankIndex(rank, xp) {
  if (rank === undefined || rank === null) return rankIndexForXp(xp);
  if (!Number.isInteger(rank) || rank < 0 || rank > LAST_RANK_INDEX) {
    throw new TypeError('Veterancy rank must be a valid rank index.');
  }
  return rankIndexForXp(xp);
}

function freezeState(xp, rank) {
  return Object.freeze({ version: VETERANCY_SCHEMA_VERSION, xp, rank });
}

export function createVeterancyState({ xp = 0, rank } = {}) {
  const normalizedXp = finiteNonNegative(xp, 'Veterancy XP');
  return freezeState(normalizedXp, normalizeRankIndex(rank, normalizedXp));
}

export function normalizeVeterancyState(state) {
  if (state === undefined || state === null) return createVeterancyState();
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new TypeError('Veterancy state must be an object.');
  }
  if (state.version !== undefined && state.version !== VETERANCY_SCHEMA_VERSION) {
    throw new Error(`Unsupported veterancy schema version: ${state.version}`);
  }
  return createVeterancyState({ xp: state.xp ?? 0, rank: state.rank });
}

export function awardVeterancyXp(unit, amount) {
  if (!unit || typeof unit !== 'object') throw new TypeError('Veterancy XP requires a unit object.');
  const award = finiteNonNegative(amount, 'Veterancy XP award');
  const previous = normalizeVeterancyState(unit.veterancy);
  const next = createVeterancyState({ xp: previous.xp + award });
  unit.veterancy = next;
  return Object.freeze({
    amount: award,
    previous,
    next,
    rankChanged: previous.rank !== next.rank,
    ranksGained: Math.max(0, next.rank - previous.rank),
  });
}

function boundedModifier(modifiers, key) {
  const bounds = VETERANCY_BONUS_LIMITS[key];
  return clamp(modifiers[key] ?? 1, bounds.minimum, bounds.maximum);
}

export function applyVeterancyModifiers(stats, state) {
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) {
    throw new TypeError('Veterancy modifiers require a stats object.');
  }
  const normalized = normalizeVeterancyState(state);
  const rank = VETERANCY_RANKS[normalized.rank];
  const result = { ...stats };
  if (Number.isFinite(result.damage)) result.damage *= boundedModifier(rank.modifiers, 'damage');
  if (Number.isFinite(result.rate)) result.rate *= boundedModifier(rank.modifiers, 'rate');
  if (Number.isFinite(result.sight)) result.sight *= boundedModifier(rank.modifiers, 'sight');
  return result;
}

export function veterancyPresentation(state) {
  const normalized = normalizeVeterancyState(state);
  const rank = VETERANCY_RANKS[normalized.rank];
  const next = VETERANCY_RANKS[normalized.rank + 1] ?? null;
  const lower = rank.threshold;
  const upper = next?.threshold ?? lower;
  const progress = next ? clamp((normalized.xp - lower) / (upper - lower), 0, 1) : 1;
  return Object.freeze({
    ...normalized,
    rankId: rank.id,
    label: rank.label,
    badge: rank.badge,
    nextRankId: next?.id ?? null,
    nextLabel: next?.label ?? null,
    nextThreshold: next?.threshold ?? null,
    progress,
    xpToNext: next ? Math.max(0, next.threshold - normalized.xp) : 0,
  });
}

export function defeatVeterancyValue(target = {}) {
  if (Number.isFinite(target.veterancyXpValue)) {
    return Math.round(clamp(target.veterancyXpValue, 0, 240));
  }
  const maxHp = Math.max(0, Number(target.maxHp) || 0);
  const population = Math.max(0, Number(target.pop) || 0);
  const structureBonus = target.entityKind === 'building' ? 20 : 0;
  const heroBonus = target.hero ? 40 : 0;
  return Math.round(clamp(maxHp * 0.08 + population * 12 + structureBonus + heroBonus, 10, 240));
}

export function recordDamageSource(target, source) {
  if (!target || typeof target !== 'object') throw new TypeError('Damage attribution requires a target object.');
  if (!source || !Number.isInteger(source.id)) return false;
  target.lastDamageSourceId = source.id;
  return true;
}

export function serializeVeterancyState(state) {
  const normalized = normalizeVeterancyState(state);
  return { version: VETERANCY_SCHEMA_VERSION, xp: normalized.xp, rank: normalized.rank };
}

export function restoreVeterancyState(snapshot) {
  return normalizeVeterancyState(snapshot);
}

function normalizedRosterSnapshot(snapshot, scope) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new TypeError('Veterancy roster snapshot must be an object.');
  }
  if (snapshot.version !== VETERANCY_SCHEMA_VERSION) {
    throw new Error(`Unsupported veterancy roster version: ${snapshot.version}`);
  }
  if (snapshot.scope !== scope || !Array.isArray(snapshot.units)) {
    throw new TypeError(`Veterancy roster snapshot must use ${scope} scope and contain units.`);
  }
  return snapshot;
}

function serializeRoster(units, scope, keyOf) {
  if (!Array.isArray(units)) throw new TypeError('Veterancy roster serialization requires a units array.');
  const records = units
    .map((unit) => {
      const key = keyOf(unit);
      if (key === undefined || key === null || key === '') return null;
      return {
        key: String(key),
        type: unit.type ?? null,
        veterancy: serializeVeterancyState(unit.veterancy),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.key.localeCompare(right.key));
  return { version: VETERANCY_SCHEMA_VERSION, scope, units: records };
}

function restoreRoster(units, snapshot, scope, keyOf) {
  if (!Array.isArray(units)) throw new TypeError('Veterancy roster restoration requires a units array.');
  const normalized = normalizedRosterSnapshot(snapshot, scope);
  const byKey = new Map(units.map((unit) => [String(keyOf(unit)), unit]));
  let applied = 0;
  const missing = [];
  for (const record of normalized.units) {
    const unit = byKey.get(String(record.key));
    if (!unit || (record.type && unit.type !== record.type)) {
      missing.push(String(record.key));
      continue;
    }
    unit.veterancy = restoreVeterancyState(record.veterancy);
    applied += 1;
  }
  return Object.freeze({ applied, missing: Object.freeze(missing) });
}

export function serializeVeterancyRoster(units) {
  return serializeRoster(units, 'mission', (unit) => unit.id);
}

export function restoreVeterancyRoster(units, snapshot) {
  return restoreRoster(units, snapshot, 'mission', (unit) => unit.id);
}

export function createCampaignVeterancySnapshot(units) {
  return serializeRoster(units, 'campaign', (unit) => unit.campaignId);
}

export function applyCampaignVeterancySnapshot(units, snapshot) {
  return restoreRoster(units, snapshot, 'campaign', (unit) => unit.campaignId);
}
