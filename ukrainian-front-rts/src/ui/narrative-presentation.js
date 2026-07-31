import { UI_HUD_REGIONS } from './ui-contract.js';

export const NARRATIVE_PRESENTATION_VERSION = 1;
export const NARRATIVE_INTERRUPTION_POLICIES = Object.freeze({
  QUEUE: 'queue',
  REPLACE: 'replace',
  PRIORITY: 'priority',
  DROP: 'drop',
});
export const NARRATIVE_ACTIONS = Object.freeze({
  INGEST_DIALOGUE: 'ingest-dialogue',
  INGEST_CAMERA: 'ingest-camera',
  ADVANCE: 'advance',
  SKIP: 'skip',
  ACKNOWLEDGE_CAMERA: 'acknowledge-camera',
  CLEAR_LOG: 'clear-log',
  SET_SUBTITLES: 'set-subtitles',
});
export const NARRATIVE_LOG_RESULTS = Object.freeze({
  COMPLETED: 'completed',
  SKIPPED: 'skipped',
  INTERRUPTED: 'interrupted',
  DROPPED: 'dropped',
});

const ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const POLICIES = new Set(Object.values(NARRATIVE_INTERRUPTION_POLICIES));
const ACTIONS = new Set(Object.values(NARRATIVE_ACTIONS));
const LOG_RESULTS = new Set(Object.values(NARRATIVE_LOG_RESULTS));

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

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

function text(value, label, { empty = false, max = 2000 } = {}) {
  if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > max) {
    throw new TypeError(`${label} must be ${empty ? 'a' : 'a non-empty'} string of at most ${max} characters.`);
  }
  return value;
}

function number(value, label, { min = -Infinity, max = Infinity } = {}) {
  if (!Number.isFinite(value) || value < min || value > max) throw new TypeError(`${label} must be between ${min} and ${max}.`);
  return value;
}

function integer(value, label, { positive = false } = {}) {
  if (!Number.isInteger(value) || value < (positive ? 1 : 0)) {
    throw new TypeError(`${label} must be a ${positive ? 'positive' : 'non-negative'} integer.`);
  }
  return value;
}

function json(value, label, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return number(value, label);
  if (typeof value !== 'object') throw new TypeError(`${label} must be JSON-compatible.`);
  if (seen.has(value)) throw new TypeError(`${label} must not be circular.`);
  seen.add(value);
  let result;
  if (Array.isArray(value)) result = value.map((entry, index) => json(entry, `${label}[${index}]`, seen));
  else {
    object(value, label);
    result = {};
    for (const key of Object.keys(value).sort()) result[key] = json(value[key], `${label}.${key}`, seen);
  }
  seen.delete(value);
  return result;
}

function speaker(value, index) {
  object(value, `Narrative speaker ${index}`);
  const publicFigure = Boolean(value.publicFigure);
  const fictionalized = value.fictionalized === undefined ? !publicFigure : Boolean(value.fictionalized);
  const contentNote = text(value.contentNote ?? '', `Narrative speaker ${index}.contentNote`, { empty: true, max: 500 });
  if (publicFigure && (!fictionalized || !contentNote.trim())) {
    throw new TypeError(`Narrative speaker ${value.id ?? index} requires explicit fictionalization and a content note.`);
  }
  return {
    id: id(value.id, `Narrative speaker ${index}.id`),
    label: text(value.label, `Narrative speaker ${index}.label`, { max: 120 }),
    role: text(value.role ?? '', `Narrative speaker ${index}.role`, { empty: true, max: 180 }),
    faction: value.faction == null ? null : id(value.faction, `Narrative speaker ${index}.faction`),
    portraitId: value.portraitId == null ? null : id(value.portraitId, `Narrative speaker ${index}.portraitId`),
    publicFigure,
    fictionalized,
    contentNote,
    metadata: json(value.metadata ?? {}, `Narrative speaker ${index}.metadata`),
  };
}

export function createNarrativeSpeakerRegistry(values = []) {
  if (!Array.isArray(values)) throw new TypeError('Narrative speakers must be an array.');
  const registry = {};
  for (const [index, value] of values.entries()) {
    const record = speaker(value, index);
    if (registry[record.id]) throw new TypeError(`Duplicate narrative speaker id: ${record.id}`);
    registry[record.id] = record;
  }
  return freeze(registry);
}

function deriveDuration(cue, settings) {
  if (cue.durationSeconds > 0) return cue.durationSeconds;
  const calculated = cue.text.length / settings.readingCharactersPerSecond;
  return Math.min(settings.maximumDurationSeconds, Math.max(settings.minimumDurationSeconds, calculated));
}

function dialogueCue(value, sequence, settings) {
  object(value, 'Mission dialogue cue');
  const metadata = json(value.metadata ?? {}, 'Mission dialogue metadata');
  const policy = metadata.interruptionPolicy ?? NARRATIVE_INTERRUPTION_POLICIES.QUEUE;
  if (!POLICIES.has(policy)) throw new RangeError(`Unknown narrative interruption policy: ${policy}`);
  const tick = integer(value.tick ?? 0, 'Mission dialogue tick');
  const triggerId = value.triggerId == null ? null : id(value.triggerId, 'Mission dialogue triggerId');
  const speakerId = id(value.speaker, 'Mission dialogue speaker');
  const cueId = value.id == null
    ? `dialogue:${triggerId ?? 'script'}:${tick}:${sequence}`
    : id(value.id, 'Mission dialogue id');
  const normalized = {
    id: cueId,
    sequence,
    tick,
    triggerId,
    speakerId,
    text: text(value.text, 'Mission dialogue text'),
    portraitId: value.portrait == null ? null : id(value.portrait, 'Mission dialogue portrait'),
    durationSeconds: number(value.durationSeconds ?? 0, 'Mission dialogue duration', { min: 0 }),
    priority: integer(metadata.priority ?? 0, 'Mission dialogue priority'),
    interruptionPolicy: policy,
    skippable: metadata.skippable === undefined ? true : Boolean(metadata.skippable),
    blocking: Boolean(metadata.blocking),
    contentNote: text(metadata.contentNote ?? '', 'Mission dialogue content note', { empty: true, max: 500 }),
    metadata,
  };
  normalized.totalSeconds = deriveDuration(normalized, settings);
  normalized.remainingSeconds = normalized.totalSeconds;
  return normalized;
}

function cameraCue(value, sequence) {
  object(value, 'Mission camera cue');
  const tick = integer(value.tick ?? 0, 'Mission camera tick');
  const triggerId = value.triggerId == null ? null : id(value.triggerId, 'Mission camera triggerId');
  return {
    id: value.id == null ? `camera:${triggerId ?? 'script'}:${tick}:${sequence}` : id(value.id, 'Mission camera cue id'),
    sequence,
    tick,
    triggerId,
    x: number(value.x, 'Mission camera x'),
    y: number(value.y, 'Mission camera y'),
    zoom: value.zoom == null ? null : number(value.zoom, 'Mission camera zoom', { min: 0.01 }),
    durationSeconds: number(value.durationSeconds ?? 0, 'Mission camera duration', { min: 0 }),
    label: text(value.label ?? '', 'Mission camera label', { empty: true, max: 180 }),
  };
}

function validateSettings(value = {}) {
  object(value, 'Narrative presentation settings');
  return freeze({
    subtitlesEnabled: value.subtitlesEnabled === undefined ? true : Boolean(value.subtitlesEnabled),
    skippingEnabled: value.skippingEnabled === undefined ? true : Boolean(value.skippingEnabled),
    readingCharactersPerSecond: number(value.readingCharactersPerSecond ?? 16, 'Narrative reading rate', { min: 1, max: 100 }),
    minimumDurationSeconds: number(value.minimumDurationSeconds ?? 2, 'Narrative minimum duration', { min: 0.1, max: 60 }),
    maximumDurationSeconds: number(value.maximumDurationSeconds ?? 12, 'Narrative maximum duration', { min: 0.1, max: 120 }),
    maxLogEntries: integer(value.maxLogEntries ?? 100, 'Narrative log capacity', { positive: true }),
  });
}

export function createNarrativePresentationState({ speakers = [], settings = {} } = {}) {
  if (!UI_HUD_REGIONS.includes('notifications')) throw new Error('UI architecture must expose the notifications HUD region.');
  const normalizedSettings = validateSettings(settings);
  if (normalizedSettings.maximumDurationSeconds < normalizedSettings.minimumDurationSeconds) {
    throw new RangeError('Narrative maximum duration must not be below the minimum duration.');
  }
  return freeze({
    version: NARRATIVE_PRESENTATION_VERSION,
    revision: 0,
    elapsedSeconds: 0,
    nextSequence: 1,
    speakers: createNarrativeSpeakerRegistry(speakers),
    settings: normalizedSettings,
    active: null,
    queue: [],
    cameraQueue: [],
    log: [],
  });
}

function assertState(state) {
  if (!state || state.version !== NARRATIVE_PRESENTATION_VERSION || !Number.isInteger(state.nextSequence)) {
    throw new TypeError('Narrative presentation state is invalid.');
  }
}

function appendLog(state, cue, result) {
  if (!LOG_RESULTS.has(result)) throw new RangeError(`Unknown narrative log result: ${result}`);
  const entry = freeze({
    id: cue.id,
    sequence: cue.sequence,
    tick: cue.tick,
    speakerId: cue.speakerId,
    text: cue.text,
    portraitId: cue.portraitId,
    result,
    elapsedSeconds: state.elapsedSeconds,
    contentNote: cue.contentNote,
  });
  return [...state.log, entry].slice(-state.settings.maxLogEntries);
}

function activateNext(state) {
  if (state.active || !state.queue.length) return state;
  const [active, ...queue] = state.queue;
  return { ...state, active, queue };
}

function stableQueue(queue) {
  return [...queue].sort((left, right) =>
    right.priority - left.priority || left.tick - right.tick || left.sequence - right.sequence);
}

function ingestDialogue(state, value) {
  const cue = freeze(dialogueCue(value, state.nextSequence, state.settings));
  let next = { ...state, nextSequence: state.nextSequence + 1 };
  if (!state.active) return { ...next, active: cue };
  if (cue.interruptionPolicy === NARRATIVE_INTERRUPTION_POLICIES.REPLACE ||
      (cue.interruptionPolicy === NARRATIVE_INTERRUPTION_POLICIES.PRIORITY && cue.priority > state.active.priority)) {
    return {
      ...next,
      active: cue,
      log: appendLog(state, state.active, NARRATIVE_LOG_RESULTS.INTERRUPTED),
    };
  }
  if (cue.interruptionPolicy === NARRATIVE_INTERRUPTION_POLICIES.DROP) {
    return { ...next, log: appendLog(state, cue, NARRATIVE_LOG_RESULTS.DROPPED) };
  }
  const queue = cue.interruptionPolicy === NARRATIVE_INTERRUPTION_POLICIES.PRIORITY
    ? stableQueue([...state.queue, cue])
    : [...state.queue, cue];
  return { ...next, queue };
}

function advance(state, elapsedSeconds) {
  let remaining = number(elapsedSeconds, 'Narrative elapsed seconds', { min: 0 });
  let next = { ...state, elapsedSeconds: state.elapsedSeconds + remaining };
  while (next.active && remaining > 0) {
    if (remaining < next.active.remainingSeconds) {
      next = { ...next, active: freeze({ ...next.active, remainingSeconds: next.active.remainingSeconds - remaining }) };
      remaining = 0;
    } else {
      remaining -= next.active.remainingSeconds;
      next = {
        ...next,
        log: appendLog(next, next.active, NARRATIVE_LOG_RESULTS.COMPLETED),
        active: null,
      };
      next = activateNext(next);
    }
  }
  return next;
}

function skip(state) {
  if (!state.active || !state.settings.skippingEnabled || !state.active.skippable) return state;
  return activateNext({
    ...state,
    log: appendLog(state, state.active, NARRATIVE_LOG_RESULTS.SKIPPED),
    active: null,
  });
}

export function reduceNarrativePresentation(state, action) {
  assertState(state);
  object(action, 'Narrative presentation action');
  if (!ACTIONS.has(action.type)) throw new RangeError(`Unknown narrative presentation action: ${action.type}`);
  let next;
  if (action.type === NARRATIVE_ACTIONS.INGEST_DIALOGUE) next = ingestDialogue(state, action.cue);
  else if (action.type === NARRATIVE_ACTIONS.INGEST_CAMERA) {
    const cue = freeze(cameraCue(action.cue, state.nextSequence));
    next = { ...state, nextSequence: state.nextSequence + 1, cameraQueue: [...state.cameraQueue, cue] };
  } else if (action.type === NARRATIVE_ACTIONS.ADVANCE) next = advance(state, action.elapsedSeconds);
  else if (action.type === NARRATIVE_ACTIONS.SKIP) next = skip(state);
  else if (action.type === NARRATIVE_ACTIONS.ACKNOWLEDGE_CAMERA) {
    const cueId = action.cueId == null ? state.cameraQueue[0]?.id : action.cueId;
    next = { ...state, cameraQueue: state.cameraQueue.filter((cue) => cue.id !== cueId) };
  } else if (action.type === NARRATIVE_ACTIONS.CLEAR_LOG) next = { ...state, log: [] };
  else next = { ...state, settings: freeze({ ...state.settings, subtitlesEnabled: Boolean(action.enabled) }) };
  if (next === state) return state;
  return freeze({ ...next, revision: state.revision + 1 });
}

export function ingestMissionNarrativeQueues(state, { dialogueQueue = [], cameraCues = [] } = {}) {
  assertState(state);
  if (!Array.isArray(dialogueQueue) || !Array.isArray(cameraCues)) throw new TypeError('Mission narrative queues must be arrays.');
  let next = state;
  for (const cue of dialogueQueue) next = reduceNarrativePresentation(next, { type: NARRATIVE_ACTIONS.INGEST_DIALOGUE, cue });
  for (const cue of cameraCues) next = reduceNarrativePresentation(next, { type: NARRATIVE_ACTIONS.INGEST_CAMERA, cue });
  return freeze({ state: next, consumed: freeze({ dialogue: dialogueQueue.length, camera: cameraCues.length }) });
}

function resolvedSpeaker(state, speakerId) {
  return state.speakers[speakerId] ?? freeze({
    id: speakerId,
    label: speakerId,
    role: '',
    faction: null,
    portraitId: null,
    publicFigure: false,
    fictionalized: true,
    contentNote: '',
    metadata: {},
  });
}

export function narrativePresentationSnapshot(state) {
  assertState(state);
  const speakerRecord = state.active ? resolvedSpeaker(state, state.active.speakerId) : null;
  return freeze({
    version: NARRATIVE_PRESENTATION_VERSION,
    revision: state.revision,
    regionId: 'notifications',
    subtitlesEnabled: state.settings.subtitlesEnabled,
    active: state.active && state.settings.subtitlesEnabled ? {
      id: state.active.id,
      speakerId: state.active.speakerId,
      speakerLabel: speakerRecord.label,
      speakerRole: speakerRecord.role,
      faction: speakerRecord.faction,
      portraitId: state.active.portraitId ?? speakerRecord.portraitId,
      text: state.active.text,
      remainingSeconds: state.active.remainingSeconds,
      totalSeconds: state.active.totalSeconds,
      blocking: state.active.blocking,
      contentNote: state.active.contentNote || speakerRecord.contentNote,
    } : null,
    queueLength: state.queue.length,
    cameraCue: state.cameraQueue[0] ?? null,
    logCount: state.log.length,
    controls: {
      canSkip: Boolean(state.active && state.settings.skippingEnabled && state.active.skippable),
      canOpenLog: state.log.length > 0,
    },
  });
}
