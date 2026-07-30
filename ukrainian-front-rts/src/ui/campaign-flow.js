import { CAMPAIGN_DIFFICULTIES, CAMPAIGN_MISSION_OUTCOMES } from '../core/campaign-profile.js';
import { DEFAULT_UI_SCREENS } from './ui-contract.js';

export const CAMPAIGN_FLOW_VERSION = 1;
export const CAMPAIGN_FLOW_STAGES = Object.freeze({
  BRIEFING: 'briefing', LOADING: 'loading', BATTLEFIELD: 'battlefield',
  DEBRIEF: 'debrief', OPERATIONS: 'operations',
});
export const CAMPAIGN_FLOW_ACTIONS = Object.freeze({
  BEGIN_LOADING: 'begin-loading', UPDATE_LOADING: 'update-loading',
  START_MISSION: 'start-mission', SHOW_DEBRIEF: 'show-debrief',
  SELECT_NEXT_OPERATION: 'select-next-operation', RETURN_TO_OPERATIONS: 'return-to-operations',
});

const ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const DIFFICULTIES = new Set(Object.values(CAMPAIGN_DIFFICULTIES));
const OUTCOMES = new Set(Object.values(CAMPAIGN_MISSION_OUTCOMES));
const STAGES = new Set(Object.values(CAMPAIGN_FLOW_STAGES));
const ACTIONS = new Set(Object.values(CAMPAIGN_FLOW_ACTIONS));
const CONFIDENCE = new Set(['confirmed', 'likely', 'uncertain']);
const LOAD_STATUSES = new Set(['preparing', 'loading-map', 'loading-forces', 'ready', 'failed']);

const freeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
};

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  return value;
}

function id(value, label) {
  if (typeof value !== 'string' || !ID.test(value)) throw new TypeError(`${label} must be a stable identifier.`);
  return value;
}

function text(value, label, { empty = false, max = 900 } = {}) {
  if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > max) {
    throw new TypeError(`${label} must be ${empty ? 'a' : 'a non-empty'} string of at most ${max} characters.`);
  }
  return value;
}

function integer(value, label) {
  if (!Number.isInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative integer.`);
  return value;
}

function number(value, label, min = -Infinity, max = Infinity) {
  if (!Number.isFinite(value) || value < min || value > max) throw new TypeError(`${label} must be between ${min} and ${max}.`);
  return value;
}

function json(value, label, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return number(value, label);
  if (typeof value !== 'object') throw new TypeError(`${label} must be JSON-compatible.`);
  if (seen.has(value)) throw new TypeError(`${label} must not be circular.`);
  seen.add(value);
  let result;
  if (Array.isArray(value)) result = value.map((item, index) => json(item, `${label}[${index}]`, seen));
  else {
    object(value, label); result = {};
    for (const key of Object.keys(value).sort()) result[key] = json(value[key], `${label}.${key}`, seen);
  }
  seen.delete(value); return result;
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

function list(values, label, mapper, { required = false } = {}) {
  if (!Array.isArray(values) || (required && values.length === 0)) throw new TypeError(`${label} must be ${required ? 'a non-empty' : 'an'} array.`);
  return values.map(mapper);
}

function mapPreview(value) {
  object(value, 'Briefing map preview');
  const markers = unique(list(value.markers ?? [], 'Map markers', (entry, index) => {
    object(entry, `Map marker ${index}`);
    return { id: id(entry.id, `Map marker ${index}.id`), kind: id(entry.kind, `Map marker ${index}.kind`),
      label: text(entry.label, `Map marker ${index}.label`, { max: 120 }),
      x: number(entry.x, `Map marker ${index}.x`, 0, 1), y: number(entry.y, `Map marker ${index}.y`, 0, 1) };
  }), 'Map markers');
  return { mapId: id(value.mapId, 'Briefing map ID'), imageId: value.imageId === undefined ? null : id(value.imageId, 'Briefing image ID'),
    caption: text(value.caption ?? '', 'Briefing map caption', { empty: true, max: 240 }),
    aspectRatio: number(value.aspectRatio ?? 16 / 9, 'Briefing map aspect ratio', 0.25, 4), markers };
}

function forces(values) {
  return unique(list(values, 'Briefing forces', (entry, index) => {
    object(entry, `Briefing force ${index}`);
    return { id: id(entry.id, `Briefing force ${index}.id`), label: text(entry.label, `Briefing force ${index}.label`, { max: 160 }),
      category: id(entry.category, `Briefing force ${index}.category`), count: integer(entry.count, `Briefing force ${index}.count`),
      availability: id(entry.availability ?? 'available', `Briefing force ${index}.availability`),
      note: text(entry.note ?? '', `Briefing force ${index}.note`, { empty: true, max: 300 }) };
  }, { required: true }), 'Briefing forces');
}

function intelligence(values) {
  return unique(list(values, 'Briefing intelligence', (entry, index) => {
    object(entry, `Intelligence item ${index}`); const confidence = entry.confidence ?? 'uncertain';
    if (!CONFIDENCE.has(confidence)) throw new RangeError(`Unknown intelligence confidence: ${confidence}`);
    return { id: id(entry.id, `Intelligence item ${index}.id`), title: text(entry.title, `Intelligence item ${index}.title`, { max: 180 }),
      detail: text(entry.detail, `Intelligence item ${index}.detail`, { max: 600 }), confidence,
      source: text(entry.source ?? '', `Intelligence item ${index}.source`, { empty: true, max: 180 }) };
  }), 'Briefing intelligence');
}

function objectives(values) {
  return unique(list(values, 'Briefing objectives', (entry, index) => {
    object(entry, `Briefing objective ${index}`);
    return { id: id(entry.id, `Briefing objective ${index}.id`), title: text(entry.title, `Briefing objective ${index}.title`, { max: 180 }),
      description: text(entry.description, `Briefing objective ${index}.description`, { max: 600 }),
      optional: Boolean(entry.optional), hidden: Boolean(entry.hidden),
      timed: entry.timed == null ? null : json(entry.timed, `Briefing objective ${index}.timed`),
      failure: entry.failure == null ? null : text(entry.failure, `Briefing objective ${index}.failure`, { max: 300 }) };
  }, { required: true }), 'Briefing objectives');
}

function difficulty(value, notes) {
  if (!DIFFICULTIES.has(value)) throw new RangeError(`Unknown campaign difficulty: ${value}`);
  object(notes, 'Difficulty notes');
  return { id: value, label: text(notes.label ?? value, 'Difficulty label', { max: 80 }),
    summary: text(notes.summary ?? '', 'Difficulty summary', { empty: true, max: 360 }),
    modifiers: list(notes.modifiers ?? [], 'Difficulty modifiers', (entry, index) => text(entry, `Difficulty modifier ${index}`, { max: 220 })) };
}

function medals(values) {
  return unique(list(values, 'Debrief medals', (entry, index) => {
    object(entry, `Debrief medal ${index}`);
    return { id: id(entry.id, `Debrief medal ${index}.id`), title: text(entry.title, `Debrief medal ${index}.title`, { max: 160 }),
      description: text(entry.description ?? '', `Debrief medal ${index}.description`, { empty: true, max: 360 }),
      iconId: entry.iconId === undefined ? null : id(entry.iconId, `Debrief medal ${index}.iconId`) };
  }), 'Debrief medals');
}

function losses(value) {
  object(value, 'Debrief losses');
  const categories = unique(list(value.categories ?? [], 'Loss categories', (entry, index) => {
    object(entry, `Loss category ${index}`);
    return { id: id(entry.id, `Loss category ${index}.id`), label: text(entry.label, `Loss category ${index}.label`, { max: 140 }),
      lost: integer(entry.lost, `Loss category ${index}.lost`), deployed: integer(entry.deployed, `Loss category ${index}.deployed`) };
  }), 'Loss categories');
  return { totalLost: integer(value.totalLost ?? categories.reduce((sum, entry) => sum + entry.lost, 0), 'Debrief total losses'),
    totalDeployed: integer(value.totalDeployed ?? categories.reduce((sum, entry) => sum + entry.deployed, 0), 'Debrief total deployed'), categories };
}

function timeline(values) {
  let previous = -1;
  return unique(list(values, 'Debrief timeline', (entry, index) => {
    object(entry, `Timeline item ${index}`); const tick = integer(entry.tick, `Timeline item ${index}.tick`);
    if (tick < previous) throw new RangeError('Debrief timeline must be ordered by tick.'); previous = tick;
    return { id: id(entry.id, `Timeline item ${index}.id`), tick, kind: id(entry.kind, `Timeline item ${index}.kind`),
      title: text(entry.title, `Timeline item ${index}.title`, { max: 180 }),
      detail: text(entry.detail ?? '', `Timeline item ${index}.detail`, { empty: true, max: 420 }) };
  }), 'Debrief timeline');
}

function nextOperations(values) {
  return unique(list(values, 'Next operations', (entry, index) => {
    object(entry, `Next operation ${index}`);
    return { operationId: id(entry.operationId, `Next operation ${index}.operationId`),
      title: text(entry.title, `Next operation ${index}.title`, { max: 180 }),
      summary: text(entry.summary ?? '', `Next operation ${index}.summary`, { empty: true, max: 420 }),
      unlocked: entry.unlocked === undefined ? true : Boolean(entry.unlocked), recommended: Boolean(entry.recommended),
      lockReason: entry.lockReason == null ? null : text(entry.lockReason, `Next operation ${index}.lockReason`, { max: 260 }) };
  }), 'Next operations', 'operationId');
}

export function createMissionBriefingModel({ operationId, title, summary, mapPreview: preview, forces: forceList,
  intelligence: intel = [], objectives: objectiveList, difficulty: difficultyId = CAMPAIGN_DIFFICULTIES.STANDARD,
  difficultyNotes = {}, loadingHints = [], metadata = {} }) {
  if (!DEFAULT_UI_SCREENS.briefing) throw new Error('UI architecture must define the briefing screen.');
  return freeze({ version: CAMPAIGN_FLOW_VERSION, kind: 'mission-briefing', screenId: 'briefing',
    operationId: id(operationId, 'Briefing operation ID'), title: text(title, 'Briefing title', { max: 180 }),
    summary: text(summary, 'Briefing summary'), mapPreview: mapPreview(preview), forces: forces(forceList),
    intelligence: intelligence(intel), objectives: objectives(objectiveList), difficulty: difficulty(difficultyId, difficultyNotes),
    loadingHints: list(loadingHints, 'Loading hints', (entry, index) => text(entry, `Loading hint ${index}`, { max: 260 })),
    metadata: json(metadata, 'Briefing metadata'),
    actions: { primary: { id: 'begin-mission', label: 'Begin mission' }, secondary: { id: 'return-to-operations', label: 'Back to operations' } } });
}

export function createLoadingTransitionModel(briefing, { progress = 0, status = 'preparing', message = '', ready = status === 'ready', hintIndex = 0 } = {}) {
  if (briefing?.kind !== 'mission-briefing' || briefing.version !== CAMPAIGN_FLOW_VERSION) throw new TypeError('Loading transition requires a current mission briefing model.');
  if (!LOAD_STATUSES.has(status)) throw new RangeError(`Unknown loading status: ${status}`);
  const normalizedProgress = number(progress, 'Loading progress', 0, 1); const normalizedReady = Boolean(ready);
  if (status === 'ready' && normalizedProgress !== 1) throw new RangeError('Ready loading state requires progress 1.');
  if (normalizedReady && status !== 'ready') throw new RangeError('ready may only be true for ready loading status.');
  const hints = briefing.loadingHints ?? []; const index = hints.length ? integer(hintIndex, 'Loading hint index') % hints.length : 0;
  return freeze({ version: CAMPAIGN_FLOW_VERSION, kind: 'mission-loading', screenId: 'briefing', operationId: briefing.operationId,
    progress: normalizedProgress, percentage: Math.round(normalizedProgress * 100), status,
    message: text(message, 'Loading message', { empty: true, max: 260 }), ready: normalizedReady,
    hints: [...hints], hint: hints[index] ?? '', hintIndex: index });
}

export function updateLoadingTransition(loading, changes = {}) {
  if (loading?.kind !== 'mission-loading') throw new TypeError('updateLoadingTransition requires a loading model.');
  object(changes, 'Loading changes'); const status = changes.status ?? loading.status;
  return createLoadingTransitionModel({ version: CAMPAIGN_FLOW_VERSION, kind: 'mission-briefing', operationId: loading.operationId, loadingHints: loading.hints }, {
    status, progress: changes.progress ?? loading.progress, ready: changes.ready ?? status === 'ready',
    message: changes.message ?? loading.message, hintIndex: changes.hintIndex ?? loading.hintIndex,
  });
}

export function createMissionDebriefModel({ operationId, title, outcome, score = 0, completedTick = null, medals: medalList = [],
  losses: lossData = {}, timeline: timelineData = [], nextOperations: nextData = [], summary = '', campaignConsequences = {} }) {
  if (!DEFAULT_UI_SCREENS.endgame) throw new Error('UI architecture must define the endgame screen.');
  if (!OUTCOMES.has(outcome)) throw new RangeError(`Unknown mission outcome: ${outcome}`);
  const next = nextOperations(nextData);
  return freeze({ version: CAMPAIGN_FLOW_VERSION, kind: 'mission-debrief', screenId: 'endgame',
    operationId: id(operationId, 'Debrief operation ID'), title: text(title, 'Debrief title', { max: 180 }),
    summary: text(summary, 'Debrief summary', { empty: true }), outcome, score: integer(score, 'Debrief score'),
    completedTick: completedTick === null ? null : integer(completedTick, 'Debrief completed tick'), medals: medals(medalList),
    losses: losses(lossData), timeline: timeline(timelineData), nextOperations: next,
    campaignConsequences: json(campaignConsequences, 'Campaign consequences'),
    actions: { primary: { id: next.some((entry) => entry.unlocked) ? 'continue-campaign' : 'return-to-operations',
      label: next.some((entry) => entry.unlocked) ? 'Continue campaign' : 'Return to operations' },
      secondary: { id: 'replay-mission', label: 'Replay mission' } } });
}

export function createCampaignFlowState(briefing) {
  if (briefing?.kind !== 'mission-briefing') throw new TypeError('Campaign flow state requires a mission briefing model.');
  return freeze({ version: CAMPAIGN_FLOW_VERSION, revision: 0, stage: CAMPAIGN_FLOW_STAGES.BRIEFING,
    operationId: briefing.operationId, briefing, loading: null, debrief: null, selectedNextOperationId: null });
}

const nextState = (state, changes) => freeze({ ...state, ...changes, revision: state.revision + 1 });

export function reduceCampaignFlow(state, action) {
  object(state, 'Campaign flow state'); object(action, 'Campaign flow action');
  if (state.version !== CAMPAIGN_FLOW_VERSION || !STAGES.has(state.stage)) throw new RangeError('Invalid campaign flow state.');
  if (!ACTIONS.has(action.type)) throw new RangeError(`Unknown campaign flow action: ${action.type}`);
  if (action.type === CAMPAIGN_FLOW_ACTIONS.BEGIN_LOADING) {
    if (state.stage !== CAMPAIGN_FLOW_STAGES.BRIEFING) throw new Error('Loading may begin only from briefing.');
    return nextState(state, { stage: CAMPAIGN_FLOW_STAGES.LOADING, loading: createLoadingTransitionModel(state.briefing, action.loading) });
  }
  if (action.type === CAMPAIGN_FLOW_ACTIONS.UPDATE_LOADING) {
    if (state.stage !== CAMPAIGN_FLOW_STAGES.LOADING) throw new Error('Loading may be updated only during loading.');
    return nextState(state, { loading: updateLoadingTransition(state.loading, action.changes ?? {}) });
  }
  if (action.type === CAMPAIGN_FLOW_ACTIONS.START_MISSION) {
    if (state.stage !== CAMPAIGN_FLOW_STAGES.LOADING || !state.loading?.ready) throw new Error('Mission may start only after loading is ready.');
    return nextState(state, { stage: CAMPAIGN_FLOW_STAGES.BATTLEFIELD });
  }
  if (action.type === CAMPAIGN_FLOW_ACTIONS.SHOW_DEBRIEF) {
    if (state.stage !== CAMPAIGN_FLOW_STAGES.BATTLEFIELD) throw new Error('Debrief may be shown only after battlefield play.');
    const debrief = action.debrief?.kind === 'mission-debrief' ? action.debrief : createMissionDebriefModel(action.debrief);
    if (debrief.operationId !== state.operationId) throw new Error('Debrief operation must match the active operation.');
    return nextState(state, { stage: CAMPAIGN_FLOW_STAGES.DEBRIEF, debrief,
      selectedNextOperationId: debrief.nextOperations.find((entry) => entry.recommended && entry.unlocked)?.operationId
        ?? debrief.nextOperations.find((entry) => entry.unlocked)?.operationId ?? null });
  }
  if (action.type === CAMPAIGN_FLOW_ACTIONS.SELECT_NEXT_OPERATION) {
    if (state.stage !== CAMPAIGN_FLOW_STAGES.DEBRIEF) throw new Error('Next operation may be selected only from debrief.');
    const operationId = id(action.operationId, 'Selected next operation ID');
    const candidate = state.debrief.nextOperations.find((entry) => entry.operationId === operationId);
    if (!candidate) throw new RangeError(`Unknown next operation: ${operationId}`);
    if (!candidate.unlocked) throw new Error(`Next operation is locked: ${operationId}`);
    return state.selectedNextOperationId === operationId ? state : nextState(state, { selectedNextOperationId: operationId });
  }
  return state.stage === CAMPAIGN_FLOW_STAGES.OPERATIONS ? state : nextState(state, { stage: CAMPAIGN_FLOW_STAGES.OPERATIONS });
}
