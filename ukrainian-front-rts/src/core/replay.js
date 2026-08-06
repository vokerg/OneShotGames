export const REPLAY_SCHEMA = 'fields-of-resolve.replay';
export const REPLAY_VERSION = 1;
export const REPLAY_EVENT_TYPES = Object.freeze(['command', 'choice', 'checksum']);

const EVENT_TYPES = new Set(REPLAY_EVENT_TYPES);
const PLAIN_OBJECT = Object.getPrototypeOf({});

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== PLAIN_OBJECT) {
    throw new TypeError(`${label} must be a plain object`);
  }
  return value;
}

function string(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string`);
  return value.trim();
}

function integer(value, label, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) throw new RangeError(`${label} must be an integer >= ${minimum}`);
  return value;
}

function finite(value, label, minimum = 0) {
  if (!Number.isFinite(value) || value < minimum) throw new RangeError(`${label} must be a finite number >= ${minimum}`);
  return value;
}

function canonicalize(value, path = '$') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${path} contains a non-finite number`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map((entry, index) => canonicalize(entry, `${path}[${index}]`));
  object(value, path);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key], `${path}.${key}`)]));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function normalizeJson(value, label) {
  return deepFreeze(canonicalize(value, label));
}

function normalizeChecksum(value, label = 'checksum') {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}$/i.test(value)) {
    throw new TypeError(`${label} must be an eight-character hexadecimal checksum`);
  }
  return value.toLowerCase();
}

export function stableReplayStringify(value) {
  return JSON.stringify(canonicalize(value));
}

export function checksumReplayState(value) {
  const text = stableReplayStringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function createReplayHeader({
  gameVersion,
  buildCommit = 'unknown',
  contentVersion = 'unknown',
  seed,
  missionIndex,
  tickSeconds,
  viewport,
  metadata = {},
} = {}) {
  const bounds = object(viewport, 'viewport');
  return deepFreeze({
    gameVersion: string(gameVersion, 'gameVersion'),
    buildCommit: string(buildCommit, 'buildCommit'),
    contentVersion: string(contentVersion, 'contentVersion'),
    seed: integer(seed, 'seed'),
    missionIndex: integer(missionIndex, 'missionIndex'),
    tickSeconds: finite(tickSeconds, 'tickSeconds', Number.EPSILON),
    viewport: deepFreeze({
      width: finite(bounds.width, 'viewport.width', Number.EPSILON),
      height: finite(bounds.height, 'viewport.height', Number.EPSILON),
    }),
    metadata: normalizeJson(metadata, 'metadata'),
  });
}

function normalizeEvent(value, index) {
  const event = object(value, `events[${index}]`);
  const type = string(event.type, `events[${index}].type`);
  if (!EVENT_TYPES.has(type)) throw new RangeError(`events[${index}].type is unsupported: ${type}`);
  const normalized = {
    tick: integer(event.tick, `events[${index}].tick`),
    sequence: integer(event.sequence, `events[${index}].sequence`),
    type,
  };
  if (type === 'command') {
    normalized.command = normalizeJson(event.command, `events[${index}].command`);
    if (event.result !== undefined) normalized.result = normalizeJson(event.result, `events[${index}].result`);
  } else if (type === 'choice') {
    normalized.choice = normalizeJson(event.choice, `events[${index}].choice`);
  } else {
    normalized.checksum = normalizeChecksum(event.checksum, `events[${index}].checksum`);
    if (event.label !== undefined) normalized.label = string(event.label, `events[${index}].label`);
  }
  return deepFreeze(normalized);
}

export function validateReplay(value) {
  const replay = object(value, 'replay');
  if (replay.schema !== REPLAY_SCHEMA) throw new TypeError(`replay.schema must be ${REPLAY_SCHEMA}`);
  if (replay.version !== REPLAY_VERSION) throw new TypeError(`Unsupported replay version: ${replay.version}`);
  const header = createReplayHeader(replay.header);
  if (!Array.isArray(replay.events)) throw new TypeError('replay.events must be an array');
  const events = replay.events.map(normalizeEvent).sort((left, right) => left.tick - right.tick || left.sequence - right.sequence);
  for (let index = 1; index < events.length; index += 1) {
    const previous = events[index - 1];
    const current = events[index];
    if (previous.tick === current.tick && previous.sequence === current.sequence) {
      throw new TypeError(`Duplicate replay event order at tick ${current.tick}, sequence ${current.sequence}`);
    }
  }
  const finalTick = integer(replay.finalTick, 'replay.finalTick');
  if (events.some((event) => event.tick > finalTick)) throw new RangeError('Replay event occurs after finalTick');
  const outcome = replay.outcome === undefined ? null : normalizeJson(replay.outcome, 'replay.outcome');
  return deepFreeze({ schema: REPLAY_SCHEMA, version: REPLAY_VERSION, header, events: deepFreeze(events), finalTick, outcome });
}

export function createReplayRecorder({ header } = {}) {
  const normalizedHeader = createReplayHeader(header);
  const events = [];
  let nextSequence = 0;
  let finalized = false;

  function append(tick, type, payload) {
    if (finalized) throw new Error('Replay recorder has already been finalized');
    const event = normalizeEvent({ tick, sequence: nextSequence, type, ...payload }, events.length);
    nextSequence += 1;
    events.push(event);
    return event;
  }

  return Object.freeze({
    header: normalizedHeader,
    recordCommand(tick, command, result) {
      const payload = { command };
      if (result !== undefined) payload.result = result;
      return append(tick, 'command', payload);
    },
    recordChoice(tick, choice) {
      return append(tick, 'choice', { choice });
    },
    recordChecksum(tick, stateOrChecksum, label) {
      const checksum = typeof stateOrChecksum === 'string'
        ? normalizeChecksum(stateOrChecksum)
        : checksumReplayState(stateOrChecksum);
      const payload = { checksum };
      if (label !== undefined) payload.label = label;
      return append(tick, 'checksum', payload);
    },
    snapshot() {
      return deepFreeze([...events]);
    },
    finalize({ finalTick, outcome = null } = {}) {
      finalized = true;
      return validateReplay({
        schema: REPLAY_SCHEMA,
        version: REPLAY_VERSION,
        header: normalizedHeader,
        events,
        finalTick,
        outcome,
      });
    },
  });
}

export function serializeReplay(replay) {
  return stableReplayStringify(validateReplay(replay));
}

export function parseReplay(serialized) {
  if (typeof serialized !== 'string' || !serialized.trim()) throw new TypeError('serialized replay must be a non-empty string');
  return validateReplay(JSON.parse(serialized));
}

export function createReplayTimeline(replay) {
  const normalized = validateReplay(replay);
  const byTick = new Map();
  for (const event of normalized.events) {
    const tickEvents = byTick.get(event.tick) ?? [];
    tickEvents.push(event);
    byTick.set(event.tick, tickEvents);
  }
  return Object.freeze({
    replay: normalized,
    maxTick: normalized.finalTick,
    eventsAtTick(tick) {
      integer(tick, 'tick');
      return deepFreeze([...(byTick.get(tick) ?? [])]);
    },
    eventsThroughTick(tick) {
      integer(tick, 'tick');
      return deepFreeze(normalized.events.filter((event) => event.tick <= tick));
    },
    scrub(tick) {
      integer(tick, 'tick');
      if (tick > normalized.finalTick) throw new RangeError(`tick must be <= ${normalized.finalTick}`);
      return deepFreeze({ tick, progress: normalized.finalTick === 0 ? 1 : tick / normalized.finalTick, events: this.eventsThroughTick(tick) });
    },
  });
}

export function compareReplayChecksum({ tick, expected, actual, label = 'simulation' } = {}) {
  const expectedChecksum = normalizeChecksum(expected, 'expected checksum');
  const actualChecksum = typeof actual === 'string' ? normalizeChecksum(actual, 'actual checksum') : checksumReplayState(actual);
  return deepFreeze({
    tick: integer(tick, 'tick'),
    label: string(label, 'label'),
    expected: expectedChecksum,
    actual: actualChecksum,
    diverged: expectedChecksum !== actualChecksum,
  });
}

export function createReplayDefectReport({ replay, divergence, actualState = null, notes = '' } = {}) {
  const normalizedReplay = validateReplay(replay);
  const normalizedDivergence = object(divergence, 'divergence');
  return deepFreeze({
    schema: 'fields-of-resolve.replay-defect',
    version: 1,
    replayChecksum: checksumReplayState(normalizedReplay),
    header: normalizedReplay.header,
    divergence: normalizeJson(normalizedDivergence, 'divergence'),
    actualStateChecksum: actualState === null ? null : checksumReplayState(actualState),
    notes: typeof notes === 'string' ? notes : String(notes),
    replay: normalizedReplay,
  });
}

export function assertReplayCompatibility(replay, { gameVersion, contentVersion } = {}) {
  const normalized = validateReplay(replay);
  const failures = [];
  if (gameVersion !== undefined && normalized.header.gameVersion !== gameVersion) {
    failures.push(`gameVersion ${normalized.header.gameVersion} !== ${gameVersion}`);
  }
  if (contentVersion !== undefined && normalized.header.contentVersion !== contentVersion) {
    failures.push(`contentVersion ${normalized.header.contentVersion} !== ${contentVersion}`);
  }
  if (failures.length) throw new Error(`Replay is incompatible: ${failures.join('; ')}`);
  return normalized;
}
