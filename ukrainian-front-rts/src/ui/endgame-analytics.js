import { CAMPAIGN_MISSION_OUTCOMES } from '../core/campaign-profile.js';

export const ENDGAME_ANALYTICS_VERSION = 1;

export const ENDGAME_OBJECTIVE_STATUSES = Object.freeze({
  COMPLETED: 'completed',
  FAILED: 'failed',
  INCOMPLETE: 'incomplete',
});

export const ENDGAME_ACTION_IDS = Object.freeze({
  CONTINUE_CAMPAIGN: 'continue-campaign',
  RETURN_TO_OPERATIONS: 'return-to-operations',
  RETRY_MISSION: 'retry-mission',
  SAVE_GAME: 'save-game',
  VIEW_REPLAY: 'view-replay',
  SAVE_REPLAY: 'save-replay',
});

const OUTCOMES = new Set(Object.values(CAMPAIGN_MISSION_OUTCOMES));
const OBJECTIVE_STATUSES = new Set(Object.values(ENDGAME_OBJECTIVE_STATUSES));
const IDENTIFIER = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;

export const DEFAULT_ENDGAME_SCORE_POLICY = deepFreeze({
  outcome: {
    [CAMPAIGN_MISSION_OUTCOMES.VICTORY]: 4000,
    [CAMPAIGN_MISSION_OUTCOMES.WITHDRAWAL]: 1200,
    [CAMPAIGN_MISSION_OUTCOMES.DEFEAT]: 0,
  },
  requiredObjective: 800,
  optionalObjective: 500,
  technology: 200,
  timeBonusCap: 1500,
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function plainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  return value;
}

function stableId(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    throw new TypeError(`${label} must be a stable identifier.`);
  }
  return value;
}

function optionalId(value, label) {
  return value == null ? null : stableId(value, label);
}

function string(value, label, { empty = false, max = 900 } = {}) {
  if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > max) {
    throw new TypeError(`${label} must be ${empty ? 'a' : 'a non-empty'} string of at most ${max} characters.`);
  }
  return value;
}

function integer(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new TypeError(`${label} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function optionalInteger(value, label, options) {
  return value == null ? null : integer(value, label, options);
}

function array(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
  return value;
}

function unique(records, label, key = 'id') {
  const seen = new Set();
  for (const record of records) {
    const value = record[key];
    if (seen.has(value)) throw new TypeError(`${label} contains duplicate ${key}: ${value}`);
    seen.add(value);
  }
  return records;
}

function uniqueIds(values, label) {
  return Object.freeze([...new Set(array(values, label).map((value, index) => stableId(value, `${label}[${index}]`)))].sort());
}

function cloneJson(value, label, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${label} must contain finite numbers.`);
    return value;
  }
  if (typeof value !== 'object') throw new TypeError(`${label} must be JSON-compatible.`);
  if (ancestors.has(value)) throw new TypeError(`${label} must not contain circular references.`);
  const next = new Set(ancestors);
  next.add(value);
  if (Array.isArray(value)) return value.map((entry, index) => cloneJson(entry, `${label}[${index}]`, next));
  plainObject(value, label);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [
    stableId(key, `${label} key`),
    cloneJson(value[key], `${label}.${key}`, next),
  ]));
}

function normalizeOutcome(value) {
  if (!OUTCOMES.has(value)) throw new RangeError(`Unknown mission outcome: ${value}`);
  return value;
}

function normalizeScorePolicy(value = DEFAULT_ENDGAME_SCORE_POLICY) {
  plainObject(value, 'Endgame score policy');
  plainObject(value.outcome, 'Endgame score policy outcome values');
  const outcome = Object.fromEntries(Object.values(CAMPAIGN_MISSION_OUTCOMES).map((result) => [
    result,
    integer(value.outcome[result], `Score policy outcome.${result}`),
  ]));
  return deepFreeze({
    outcome,
    requiredObjective: integer(value.requiredObjective, 'Score policy required objective value'),
    optionalObjective: integer(value.optionalObjective, 'Score policy optional objective value'),
    technology: integer(value.technology, 'Score policy technology value'),
    timeBonusCap: integer(value.timeBonusCap, 'Score policy time bonus cap'),
  });
}

function normalizeForceCategory(entry, index, side) {
  plainObject(entry, `${side} force category ${index}`);
  const deployed = integer(entry.deployed ?? 0, `${side} force category ${index}.deployed`);
  const removedKey = side === 'friendly' ? 'lost' : 'destroyed';
  const removed = integer(entry[removedKey] ?? 0, `${side} force category ${index}.${removedKey}`);
  const captured = side === 'enemy'
    ? integer(entry.captured ?? 0, `Enemy force category ${index}.captured`)
    : 0;
  const escaped = side === 'enemy'
    ? integer(entry.escaped ?? 0, `Enemy force category ${index}.escaped`)
    : 0;
  if (removed + captured + escaped > deployed) {
    throw new RangeError(`${side} force category ${entry.id ?? index} accounts for more entities than deployed.`);
  }
  const remaining = deployed - removed - captured - escaped;
  return {
    id: stableId(entry.id, `${side} force category ${index}.id`),
    label: string(entry.label, `${side} force category ${index}.label`, { max: 160 }),
    deployed,
    lost: side === 'friendly' ? removed : 0,
    destroyed: side === 'enemy' ? removed : 0,
    captured,
    escaped,
    survived: side === 'friendly' ? remaining : 0,
    remaining: side === 'enemy' ? remaining : 0,
    scoreValue: integer(entry.scoreValue ?? 0, `${side} force category ${index}.scoreValue`),
  };
}

function normalizeCombat(value = {}) {
  plainObject(value, 'Endgame combat analytics');
  const friendly = unique(array(value.friendly ?? [], 'Friendly force categories')
    .map((entry, index) => normalizeForceCategory(entry, index, 'friendly'))
    .sort((left, right) => left.id.localeCompare(right.id)), 'Friendly force categories');
  const enemy = unique(array(value.enemy ?? [], 'Enemy force categories')
    .map((entry, index) => normalizeForceCategory(entry, index, 'enemy'))
    .sort((left, right) => left.id.localeCompare(right.id)), 'Enemy force categories');
  const friendlyTotals = friendly.reduce((totals, entry) => ({
    deployed: totals.deployed + entry.deployed,
    lost: totals.lost + entry.lost,
    survived: totals.survived + entry.survived,
    lossValue: totals.lossValue + entry.scoreValue,
  }), { deployed: 0, lost: 0, survived: 0, lossValue: 0 });
  const enemyTotals = enemy.reduce((totals, entry) => ({
    deployed: totals.deployed + entry.deployed,
    destroyed: totals.destroyed + entry.destroyed,
    captured: totals.captured + entry.captured,
    escaped: totals.escaped + entry.escaped,
    remaining: totals.remaining + entry.remaining,
    destroyedValue: totals.destroyedValue + entry.scoreValue,
  }), { deployed: 0, destroyed: 0, captured: 0, escaped: 0, remaining: 0, destroyedValue: 0 });
  return deepFreeze({
    friendly,
    enemy,
    friendlyTotals,
    enemyTotals,
    damageDealt: integer(value.damageDealt ?? 0, 'Endgame damage dealt'),
    damageTaken: integer(value.damageTaken ?? 0, 'Endgame damage taken'),
    healingDone: integer(value.healingDone ?? 0, 'Endgame healing done'),
    repairDone: integer(value.repairDone ?? 0, 'Endgame repair done'),
    friendlyFireIncidents: integer(value.friendlyFireIncidents ?? 0, 'Endgame friendly-fire incidents'),
  });
}

function normalizeResource(entry, resourceId) {
  plainObject(entry, `Economy resource ${resourceId}`);
  const result = {
    id: resourceId,
    starting: integer(entry.starting ?? 0, `Economy resource ${resourceId}.starting`),
    gathered: integer(entry.gathered ?? 0, `Economy resource ${resourceId}.gathered`),
    salvaged: integer(entry.salvaged ?? 0, `Economy resource ${resourceId}.salvaged`),
    spent: integer(entry.spent ?? 0, `Economy resource ${resourceId}.spent`),
    remaining: integer(entry.remaining ?? 0, `Economy resource ${resourceId}.remaining`),
    lost: integer(entry.lost ?? 0, `Economy resource ${resourceId}.lost`),
  };
  result.available = result.starting + result.gathered + result.salvaged;
  result.accounted = result.spent + result.remaining + result.lost;
  if (result.available !== result.accounted) {
    throw new RangeError(`Economy resource ${resourceId} is not conserved: ${result.available} available, ${result.accounted} accounted.`);
  }
  return result;
}

function normalizeEconomy(value = {}) {
  plainObject(value, 'Endgame economy analytics');
  plainObject(value.resources ?? {}, 'Endgame economy resources');
  const resources = Object.keys(value.resources ?? {}).sort().map((resourceId) =>
    normalizeResource(value.resources[resourceId], stableId(resourceId, 'Economy resource ID')),
  );
  const totals = resources.reduce((summary, entry) => ({
    starting: summary.starting + entry.starting,
    gathered: summary.gathered + entry.gathered,
    salvaged: summary.salvaged + entry.salvaged,
    spent: summary.spent + entry.spent,
    remaining: summary.remaining + entry.remaining,
    lost: summary.lost + entry.lost,
  }), { starting: 0, gathered: 0, salvaged: 0, spent: 0, remaining: 0, lost: 0 });
  return deepFreeze({
    resources,
    totals,
    unitsProduced: integer(value.unitsProduced ?? 0, 'Endgame units produced'),
    structuresBuilt: integer(value.structuresBuilt ?? 0, 'Endgame structures built'),
    peakWorkers: integer(value.peakWorkers ?? 0, 'Endgame peak workers'),
    peakCommandUsed: integer(value.peakCommandUsed ?? 0, 'Endgame peak command used'),
    peakCommandCapacity: integer(value.peakCommandCapacity ?? 0, 'Endgame peak command capacity'),
    scoreValue: integer(value.scoreValue ?? 0, 'Endgame economy score value'),
  });
}

function normalizeTechnology(values, policy) {
  const technology = unique(array(values ?? [], 'Endgame technology')
    .map((entry, index) => {
      plainObject(entry, `Technology item ${index}`);
      plainObject(entry.cost ?? {}, `Technology item ${index}.cost`);
      const cost = Object.fromEntries(Object.keys(entry.cost ?? {}).sort().map((resourceId) => [
        stableId(resourceId, `Technology item ${index} cost resource`),
        integer(entry.cost[resourceId], `Technology item ${index}.cost.${resourceId}`),
      ]));
      return {
        id: stableId(entry.id, `Technology item ${index}.id`),
        label: string(entry.label, `Technology item ${index}.label`, { max: 180 }),
        completedTick: integer(entry.completedTick, `Technology item ${index}.completedTick`),
        cost,
        scoreValue: integer(entry.scoreValue ?? policy.technology, `Technology item ${index}.scoreValue`),
      };
    })
    .sort((left, right) => left.completedTick - right.completedTick || left.id.localeCompare(right.id)), 'Endgame technology');
  const totalCost = {};
  for (const item of technology) {
    for (const [resourceId, amount] of Object.entries(item.cost)) {
      totalCost[resourceId] = (totalCost[resourceId] ?? 0) + amount;
    }
  }
  return deepFreeze({
    completed: technology,
    count: technology.length,
    totalCost: Object.fromEntries(Object.entries(totalCost).sort(([left], [right]) => left.localeCompare(right))),
    scoreValue: technology.reduce((sum, entry) => sum + entry.scoreValue, 0),
  });
}

function normalizeObjectives(values, policy) {
  const objectives = unique(array(values ?? [], 'Endgame objectives')
    .map((entry, index) => {
      plainObject(entry, `Objective result ${index}`);
      const status = entry.status ?? ENDGAME_OBJECTIVE_STATUSES.INCOMPLETE;
      if (!OBJECTIVE_STATUSES.has(status)) throw new RangeError(`Unknown objective status: ${status}`);
      const resolvedTick = optionalInteger(entry.resolvedTick, `Objective result ${index}.resolvedTick`);
      if (status !== ENDGAME_OBJECTIVE_STATUSES.INCOMPLETE && resolvedTick === null) {
        throw new RangeError(`Resolved objective ${entry.id ?? index} requires resolvedTick.`);
      }
      const optional = Boolean(entry.optional);
      return {
        id: stableId(entry.id, `Objective result ${index}.id`),
        title: string(entry.title, `Objective result ${index}.title`, { max: 180 }),
        optional,
        status,
        resolvedTick,
        scoreValue: integer(
          entry.scoreValue ?? (optional ? policy.optionalObjective : policy.requiredObjective),
          `Objective result ${index}.scoreValue`,
        ),
      };
    })
    .sort((left, right) => (left.resolvedTick ?? Number.MAX_SAFE_INTEGER) - (right.resolvedTick ?? Number.MAX_SAFE_INTEGER)
      || left.id.localeCompare(right.id)), 'Endgame objectives');
  const summary = objectives.reduce((result, objective) => {
    result.total += 1;
    result[objective.status] += 1;
    if (objective.optional) result.optional += 1;
    else result.required += 1;
    if (!objective.optional && objective.status === ENDGAME_OBJECTIVE_STATUSES.COMPLETED) result.requiredCompleted += 1;
    if (objective.optional && objective.status === ENDGAME_OBJECTIVE_STATUSES.COMPLETED) result.optionalCompleted += 1;
    return result;
  }, { total: 0, required: 0, optional: 0, requiredCompleted: 0, optionalCompleted: 0, completed: 0, failed: 0, incomplete: 0 });
  return deepFreeze({
    items: objectives,
    summary,
    scoreValue: objectives
      .filter((objective) => objective.status === ENDGAME_OBJECTIVE_STATUSES.COMPLETED)
      .reduce((sum, objective) => sum + objective.scoreValue, 0),
  });
}

function normalizeMedals(values) {
  const medals = unique(array(values ?? [], 'Endgame medals')
    .map((entry, index) => {
      plainObject(entry, `Medal ${index}`);
      return {
        id: stableId(entry.id, `Medal ${index}.id`),
        title: string(entry.title, `Medal ${index}.title`, { max: 160 }),
        description: string(entry.description ?? '', `Medal ${index}.description`, { empty: true, max: 420 }),
        iconId: optionalId(entry.iconId, `Medal ${index}.iconId`),
        scoreBonus: integer(entry.scoreBonus ?? 0, `Medal ${index}.scoreBonus`),
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id)), 'Endgame medals');
  return deepFreeze({
    awarded: medals,
    ids: Object.freeze(medals.map((medal) => medal.id)),
    scoreValue: medals.reduce((sum, medal) => sum + medal.scoreBonus, 0),
  });
}

function normalizePenalties(values) {
  return deepFreeze(unique(array(values ?? [], 'Endgame penalties')
    .map((entry, index) => {
      plainObject(entry, `Penalty ${index}`);
      return {
        id: stableId(entry.id, `Penalty ${index}.id`),
        label: string(entry.label, `Penalty ${index}.label`, { max: 180 }),
        points: integer(entry.points, `Penalty ${index}.points`),
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id)), 'Endgame penalties'));
}

function normalizeTimeline(values) {
  let previousTick = -1;
  return deepFreeze(unique(array(values ?? [], 'Endgame timeline').map((entry, index) => {
    plainObject(entry, `Timeline entry ${index}`);
    const tick = integer(entry.tick, `Timeline entry ${index}.tick`);
    if (tick < previousTick) throw new RangeError('Endgame timeline must be ordered by tick.');
    previousTick = tick;
    return {
      id: stableId(entry.id, `Timeline entry ${index}.id`),
      tick,
      kind: stableId(entry.kind, `Timeline entry ${index}.kind`),
      title: string(entry.title, `Timeline entry ${index}.title`, { max: 180 }),
      detail: string(entry.detail ?? '', `Timeline entry ${index}.detail`, { empty: true, max: 420 }),
    };
  }), 'Endgame timeline'));
}

function normalizeCampaignConsequences(value = {}, medalIds = []) {
  plainObject(value, 'Campaign consequences');
  const awardedMedalIds = uniqueIds([...(value.awardedMedalIds ?? []), ...medalIds], 'Campaign awarded medal IDs');
  const modifiers = unique(array(value.modifiers ?? [], 'Campaign modifiers').map((entry, index) => {
    plainObject(entry, `Campaign modifier ${index}`);
    return {
      id: stableId(entry.id, `Campaign modifier ${index}.id`),
      label: string(entry.label, `Campaign modifier ${index}.label`, { max: 180 }),
      description: string(entry.description ?? '', `Campaign modifier ${index}.description`, { empty: true, max: 420 }),
      value: cloneJson(entry.value ?? true, `Campaign modifier ${index}.value`),
    };
  }).sort((left, right) => left.id.localeCompare(right.id)), 'Campaign modifiers');
  const persistentLosses = unique(array(value.persistentLosses ?? [], 'Campaign persistent losses').map((entry, index) => {
    plainObject(entry, `Persistent loss ${index}`);
    return {
      id: stableId(entry.id, `Persistent loss ${index}.id`),
      label: string(entry.label, `Persistent loss ${index}.label`, { max: 180 }),
      count: integer(entry.count, `Persistent loss ${index}.count`),
    };
  }).sort((left, right) => left.id.localeCompare(right.id)), 'Campaign persistent losses');
  return deepFreeze({
    unlockedOperationIds: uniqueIds(value.unlockedOperationIds ?? [], 'Campaign unlocked operation IDs'),
    unlockedUpgradeIds: uniqueIds(value.unlockedUpgradeIds ?? [], 'Campaign unlocked upgrade IDs'),
    awardedMedalIds,
    choices: cloneJson(value.choices ?? {}, 'Campaign consequence choices'),
    modifiers,
    persistentLosses,
  });
}

function action(id, label, enabled, disabledReason, payload = {}) {
  return deepFreeze({
    id,
    label,
    enabled: Boolean(enabled),
    disabledReason: enabled ? null : disabledReason,
    payload: cloneJson(payload, `Endgame action ${id} payload`),
  });
}

function normalizeActions(value = {}) {
  plainObject(value, 'Endgame actions');
  const nextOperationId = optionalId(value.nextOperationId, 'Next operation ID');
  const saveId = optionalId(value.saveId, 'Endgame save ID');
  const replayId = optionalId(value.replayId, 'Endgame replay ID');
  const canContinue = Boolean(value.canContinue && nextOperationId);
  const primary = canContinue
    ? action(ENDGAME_ACTION_IDS.CONTINUE_CAMPAIGN, 'Continue campaign', true, null, { operationId: nextOperationId })
    : action(ENDGAME_ACTION_IDS.RETURN_TO_OPERATIONS, 'Return to operations', true, null);
  const secondary = [
    action(ENDGAME_ACTION_IDS.RETRY_MISSION, 'Retry mission', value.canRetry !== false, 'Mission retry is unavailable.'),
    action(ENDGAME_ACTION_IDS.SAVE_GAME, 'Save result', Boolean(value.canSaveGame && saveId), 'No writable save slot is available.', saveId ? { saveId } : {}),
    action(ENDGAME_ACTION_IDS.VIEW_REPLAY, 'View replay', Boolean(value.canViewReplay && replayId), 'No replay is available.', replayId ? { replayId } : {}),
    action(ENDGAME_ACTION_IDS.SAVE_REPLAY, 'Save replay', Boolean(value.canSaveReplay && replayId), 'Replay export is unavailable.', replayId ? { replayId } : {}),
  ];
  return deepFreeze({ primary, secondary, all: [primary, ...secondary] });
}

function duration(completedTick, ticksPerSecond) {
  const totalSeconds = Math.floor(completedTick / ticksPerSecond);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const clock = hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
  return deepFreeze({ ticks: completedTick, ticksPerSecond, totalSeconds, hours, minutes, seconds, clock });
}

function buildScore({ outcome, completedTick, parTick, combat, economy, technology, objectives, medals, penalties, policy }) {
  const timeBonus = parTick && outcome === CAMPAIGN_MISSION_OUTCOMES.VICTORY && completedTick < parTick
    ? Math.floor(policy.timeBonusCap * ((parTick - completedTick) / parTick))
    : 0;
  const entries = [
    { id: 'outcome', label: 'Mission outcome', points: policy.outcome[outcome] },
    { id: 'objectives', label: 'Objectives', points: objectives.scoreValue },
    { id: 'hostile-forces', label: 'Hostile forces neutralized', points: combat.enemyTotals.destroyedValue },
    { id: 'friendly-losses', label: 'Friendly losses', points: -combat.friendlyTotals.lossValue },
    { id: 'economy', label: 'Economy and logistics', points: economy.scoreValue },
    { id: 'technology', label: 'Technology completed', points: technology.scoreValue },
    { id: 'time', label: 'Completion time', points: timeBonus },
    { id: 'medals', label: 'Medals', points: medals.scoreValue },
    { id: 'penalties', label: 'Operational penalties', points: -penalties.reduce((sum, penalty) => sum + penalty.points, 0) },
  ];
  const rawTotal = entries.reduce((sum, entry) => sum + entry.points, 0);
  return deepFreeze({
    total: Math.max(0, rawTotal),
    rawTotal,
    entries,
    policy,
    parTick,
    timeBonus,
  });
}

export function createCampaignResultHandoff(report) {
  if (report?.kind !== 'endgame-analytics-report' || report.version !== ENDGAME_ANALYTICS_VERSION) {
    throw new TypeError('Campaign result handoff requires a current endgame analytics report.');
  }
  return deepFreeze({
    outcome: report.outcome,
    score: report.score.total,
    attempts: 1,
    completedTick: report.completedTick,
    medalIds: [...report.medals.ids],
  });
}

export function createEndgameAnalyticsReport({
  operationId,
  title,
  summary = '',
  outcome,
  completedTick,
  ticksPerSecond = 20,
  parTick = null,
  combat = {},
  economy = {},
  technology = [],
  objectives = [],
  medals = [],
  penalties = [],
  timeline = [],
  actions = {},
  campaignConsequences = {},
  metadata = {},
  scorePolicy = DEFAULT_ENDGAME_SCORE_POLICY,
} = {}) {
  const normalizedOutcome = normalizeOutcome(outcome);
  const normalizedCompletedTick = integer(completedTick, 'Endgame completed tick');
  const normalizedTicksPerSecond = integer(ticksPerSecond, 'Endgame ticks per second', { min: 1, max: 1000 });
  const normalizedParTick = optionalInteger(parTick, 'Endgame par tick', { min: 1 });
  const policy = normalizeScorePolicy(scorePolicy);
  const normalizedCombat = normalizeCombat(combat);
  const normalizedEconomy = normalizeEconomy(economy);
  const normalizedTechnology = normalizeTechnology(technology, policy);
  const normalizedObjectives = normalizeObjectives(objectives, policy);
  const normalizedMedals = normalizeMedals(medals);
  const normalizedPenalties = normalizePenalties(penalties);
  const normalizedTimeline = normalizeTimeline(timeline);
  const normalizedConsequences = normalizeCampaignConsequences(campaignConsequences, normalizedMedals.ids);
  const normalizedActions = normalizeActions(actions);
  const score = buildScore({
    outcome: normalizedOutcome,
    completedTick: normalizedCompletedTick,
    parTick: normalizedParTick,
    combat: normalizedCombat,
    economy: normalizedEconomy,
    technology: normalizedTechnology,
    objectives: normalizedObjectives,
    medals: normalizedMedals,
    penalties: normalizedPenalties,
    policy,
  });
  const report = {
    version: ENDGAME_ANALYTICS_VERSION,
    kind: 'endgame-analytics-report',
    screenId: 'endgame',
    operationId: stableId(operationId, 'Endgame operation ID'),
    title: string(title, 'Endgame title', { max: 180 }),
    summary: string(summary, 'Endgame summary', { empty: true }),
    outcome: normalizedOutcome,
    completedTick: normalizedCompletedTick,
    duration: duration(normalizedCompletedTick, normalizedTicksPerSecond),
    combat: normalizedCombat,
    economy: normalizedEconomy,
    technology: normalizedTechnology,
    objectives: normalizedObjectives,
    medals: normalizedMedals,
    penalties: normalizedPenalties,
    score,
    timeline: normalizedTimeline,
    actions: normalizedActions,
    campaignConsequences: normalizedConsequences,
    metadata: cloneJson(metadata, 'Endgame metadata'),
  };
  const frozen = deepFreeze(report);
  return deepFreeze({ ...frozen, campaignResult: createCampaignResultHandoff(frozen) });
}
