export const AUDIO_RELEASE_QA_SCHEMA = 'fields-of-resolve.audio-release-qa';
export const AUDIO_RELEASE_QA_VERSION = 1;
export const AUDIO_RELEASE_BUSES = Object.freeze(['music', 'sfx', 'voice', 'ambience']);

const BUS_SET = new Set(AUDIO_RELEASE_BUSES);
const KIND_SET = new Set(['manifest', 'procedural', 'hook']);
const DROP_POLICY = 'priority-oldest-id';
const REDISTRIBUTION_POLICIES = new Set(['allowed', 'restricted']);
const ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;

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

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string.`);
  return value.trim();
}

function id(value, label) {
  const normalized = text(value, label);
  if (!ID_PATTERN.test(normalized)) throw new TypeError(`${label} must be a stable identifier.`);
  return normalized;
}

function number(value, label, minimum = 0, maximum = Infinity) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < minimum || normalized > maximum) {
    throw new TypeError(`${label} must be a finite number between ${minimum} and ${maximum}.`);
  }
  return normalized;
}

function integer(value, label, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) throw new TypeError(`${label} must be an integer >= ${minimum}.`);
  return value;
}

function stringArray(value, label, { allowEmpty = true } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) throw new TypeError(`${label} must be ${allowEmpty ? 'an' : 'a non-empty'} array.`);
  return value.map((entry, index) => text(entry, `${label}[${index}]`));
}

function relativePath(value, label) {
  const path = text(value, label).replaceAll('\\', '/');
  if (path.startsWith('/') || path.split('/').includes('..')) throw new TypeError(`${label} must be a repository-relative path.`);
  return path.replace(/^\.\//, '');
}

function normalizeFamily(value, index) {
  const source = plainObject(value, `Audio QA family ${index}`);
  const familyId = id(source.id, `Audio QA family ${index}.id`);
  const bus = id(source.bus, `Audio QA family ${familyId}.bus`);
  if (!BUS_SET.has(bus)) throw new RangeError(`Audio QA family ${familyId} uses unknown bus ${bus}.`);
  const kind = id(source.kind, `Audio QA family ${familyId}.kind`);
  if (!KIND_SET.has(kind)) throw new RangeError(`Audio QA family ${familyId} uses unknown kind ${kind}.`);
  const peakCeiling = source.peakCeiling === null ? null : number(source.peakCeiling, `Audio QA family ${familyId}.peakCeiling`, 0, 1);
  const redistribution = id(source.redistribution, `Audio QA family ${familyId}.redistribution`);
  if (!REDISTRIBUTION_POLICIES.has(redistribution)) throw new RangeError(`Audio QA family ${familyId}.redistribution must be allowed or restricted.`);
  return deepFreeze({
    id: familyId,
    bus,
    kind,
    sourcePath: relativePath(source.sourcePath, `Audio QA family ${familyId}.sourcePath`),
    owner: text(source.owner, `Audio QA family ${familyId}.owner`),
    license: text(source.license, `Audio QA family ${familyId}.license`),
    redistribution,
    generatedTool: text(source.generatedTool, `Audio QA family ${familyId}.generatedTool`),
    externalInputs: stringArray(source.externalInputs ?? [], `Audio QA family ${familyId}.externalInputs`),
    peakCeiling,
    minimumRecords: integer(source.minimumRecords, `Audio QA family ${familyId}.minimumRecords`, 1),
  });
}

function normalizeBudgets(value) {
  const source = plainObject(value, 'Audio QA voiceBudgets');
  const buses = plainObject(source.buses, 'Audio QA voiceBudgets.buses');
  const normalizedBuses = {};
  for (const bus of AUDIO_RELEASE_BUSES) normalizedBuses[bus] = integer(buses[bus], `Audio QA voiceBudgets.buses.${bus}`);
  const total = integer(source.total, 'Audio QA voiceBudgets.total', 1);
  const reserved = Object.values(normalizedBuses).reduce((sum, value) => sum + value, 0);
  if (reserved > total) throw new RangeError(`Audio QA bus budgets reserve ${reserved} voices but total is ${total}.`);
  if (source.dropPolicy !== DROP_POLICY) throw new RangeError(`Audio QA dropPolicy must be ${DROP_POLICY}.`);
  return deepFreeze({ total, buses: normalizedBuses, dropPolicy: DROP_POLICY, unreserved: total - reserved });
}

function normalizeContext(value, index) {
  const source = plainObject(value, `Audio QA campaign context ${index}`);
  return deepFreeze({
    id: id(source.id, `Audio QA campaign context ${index}.id`),
    musicStates: stringArray(source.musicStates, `Audio QA campaign context ${index}.musicStates`, { allowEmpty: false }),
    ambienceBiomes: stringArray(source.ambienceBiomes ?? [], `Audio QA campaign context ${index}.ambienceBiomes`),
  });
}

export function validateAudioReleaseQaLedger(value) {
  const source = plainObject(value, 'Audio QA ledger');
  if (source.schema !== AUDIO_RELEASE_QA_SCHEMA) throw new TypeError(`Audio QA ledger.schema must be ${AUDIO_RELEASE_QA_SCHEMA}.`);
  if (source.version !== AUDIO_RELEASE_QA_VERSION) throw new TypeError(`Audio QA ledger.version must be ${AUDIO_RELEASE_QA_VERSION}.`);
  if (!Array.isArray(source.families) || source.families.length === 0) throw new TypeError('Audio QA ledger.families must be non-empty.');
  if (!Array.isArray(source.campaignContexts) || source.campaignContexts.length === 0) throw new TypeError('Audio QA ledger.campaignContexts must be non-empty.');
  const families = source.families.map(normalizeFamily);
  const contexts = source.campaignContexts.map(normalizeContext);
  for (const [label, values] of [['family', families.map((entry) => entry.id)], ['campaign context', contexts.map((entry) => entry.id)]]) {
    if (new Set(values).size !== values.length) throw new Error(`Audio QA ${label} IDs must be unique.`);
  }
  return deepFreeze({
    schema: AUDIO_RELEASE_QA_SCHEMA,
    version: AUDIO_RELEASE_QA_VERSION,
    releasePeakCeiling: number(source.releasePeakCeiling, 'Audio QA ledger.releasePeakCeiling', 0, 1),
    minimumHeadroomDb: number(source.minimumHeadroomDb, 'Audio QA ledger.minimumHeadroomDb', 0, 24),
    families,
    voiceBudgets: normalizeBudgets(source.voiceBudgets),
    campaignContexts: contexts,
  });
}

function normalizeInventoryRecord(value, family, index) {
  const source = plainObject(value, `Audio QA ${family.id} record ${index}`);
  const recordId = id(source.id, `Audio QA ${family.id} record ${index}.id`);
  const mode = source.mode === undefined ? 'generated' : id(source.mode, `Audio QA ${family.id} record ${recordId}.mode`);
  const path = source.path === null || source.path === undefined ? null : relativePath(source.path, `Audio QA ${family.id} record ${recordId}.path`);
  const peak = source.peak === null || source.peak === undefined ? null : number(source.peak, `Audio QA ${family.id} record ${recordId}.peak`, 0, 1);
  const provenance = plainObject(source.provenance, `Audio QA ${family.id} record ${recordId}.provenance`);
  return deepFreeze({
    id: recordId,
    mode,
    path,
    peak,
    provenance: {
      creator: text(provenance.creator, `Audio QA ${family.id} record ${recordId}.provenance.creator`),
      source: text(provenance.source, `Audio QA ${family.id} record ${recordId}.provenance.source`),
      license: text(provenance.license, `Audio QA ${family.id} record ${recordId}.provenance.license`),
      redistribution: text(provenance.redistribution, `Audio QA ${family.id} record ${recordId}.provenance.redistribution`),
      generatedTool: text(provenance.generatedTool, `Audio QA ${family.id} record ${recordId}.provenance.generatedTool`),
      externalInputs: stringArray(provenance.externalInputs ?? [], `Audio QA ${family.id} record ${recordId}.provenance.externalInputs`),
      publicFigureImpersonation: Boolean(provenance.publicFigureImpersonation),
    },
  });
}

function redistributionPolicy(value) {
  const normalized = value.toLowerCase();
  return normalized.includes('allow') || normalized.includes('permit') || normalized.includes('redistribut') ? 'allowed' : 'restricted';
}

function issue(code, familyId, recordId, message) {
  return Object.freeze({ code, familyId, recordId, message });
}

export function auditAudioRelease({
  ledger,
  inventories = {},
  committedPaths = [],
  generatedPaths = [],
  committedMediaPaths = [],
  coverage = {},
} = {}) {
  const qa = validateAudioReleaseQaLedger(ledger);
  const committed = new Set(stringArray(committedPaths, 'Audio QA committedPaths').map((path) => relativePath(path, 'Audio QA committed path')));
  const generated = new Set(stringArray(generatedPaths, 'Audio QA generatedPaths').map((path) => relativePath(path, 'Audio QA generated path')));
  const committedMedia = new Set(stringArray(committedMediaPaths, 'Audio QA committedMediaPaths').map((path) => relativePath(path, 'Audio QA committed media path')));
  const declaredOutputs = new Set();
  const errors = [];
  let recordCount = 0;

  for (const family of qa.families) {
    if (!committed.has(family.sourcePath)) errors.push(issue('missing-source', family.id, null, `${family.sourcePath} is not committed.`));
    const rawInventory = inventories[family.id];
    if (!Array.isArray(rawInventory)) {
      errors.push(issue('missing-inventory', family.id, null, `No release inventory was supplied for ${family.id}.`));
      continue;
    }
    const records = rawInventory.map((record, index) => normalizeInventoryRecord(record, family, index));
    recordCount += records.length;
    if (records.length < family.minimumRecords) errors.push(issue('insufficient-coverage', family.id, null, `${family.id} has ${records.length}; expected at least ${family.minimumRecords}.`));
    if (new Set(records.map((record) => record.id)).size !== records.length) errors.push(issue('duplicate-id', family.id, null, `${family.id} contains duplicate record IDs.`));

    for (const record of records) {
      const provenance = record.provenance;
      if (provenance.license !== family.license) errors.push(issue('license-mismatch', family.id, record.id, `${record.id} uses ${provenance.license}; expected ${family.license}.`));
      if (redistributionPolicy(provenance.redistribution) !== family.redistribution) errors.push(issue('redistribution-mismatch', family.id, record.id, `${record.id} redistribution differs from the ledger policy.`));
      if (provenance.generatedTool !== family.generatedTool) errors.push(issue('generator-mismatch', family.id, record.id, `${record.id} generator differs from the ledger.`));
      if (provenance.externalInputs.length !== family.externalInputs.length || provenance.externalInputs.some((entry, index) => entry !== family.externalInputs[index])) {
        errors.push(issue('external-input-mismatch', family.id, record.id, `${record.id} external inputs differ from the ledger.`));
      }
      if (provenance.publicFigureImpersonation) errors.push(issue('public-figure-impersonation', family.id, record.id, `${record.id} permits public-figure impersonation.`));
      if (family.kind === 'hook' && record.mode !== 'hook-only') errors.push(issue('hook-mode', family.id, record.id, `${record.id} must remain hook-only until a licensed binary asset is declared.`));
      if (family.kind !== 'hook' && record.mode === 'hook-only') errors.push(issue('unexpected-hook', family.id, record.id, `${record.id} cannot be hook-only in ${family.kind} inventory.`));
      if (record.mode === 'hook-only' && record.path !== null) errors.push(issue('hook-path', family.id, record.id, `${record.id} is hook-only but declares a binary path.`));
      if (record.mode !== 'hook-only' && record.path === null) errors.push(issue('missing-path', family.id, record.id, `${record.id} requires a generated or committed path.`));
      if (record.path !== null) {
        declaredOutputs.add(record.path);
        if (!generated.has(record.path) && !committed.has(record.path) && !committedMedia.has(record.path)) errors.push(issue('missing-output', family.id, record.id, `${record.path} is neither generated nor committed.`));
      }
      if (record.peak !== null) {
        const ceiling = Math.min(qa.releasePeakCeiling, family.peakCeiling ?? qa.releasePeakCeiling);
        if (record.peak > ceiling + Number.EPSILON) errors.push(issue('peak-ceiling', family.id, record.id, `${record.id} peak ${record.peak} exceeds ${ceiling}.`));
        const headroomDb = record.peak === 0 ? Infinity : -20 * Math.log10(record.peak);
        if (headroomDb + 1e-9 < qa.minimumHeadroomDb) errors.push(issue('headroom', family.id, record.id, `${record.id} has ${headroomDb.toFixed(3)} dB headroom; expected ${qa.minimumHeadroomDb} dB.`));
      }
    }
  }

  for (const path of generated) {
    if (!declaredOutputs.has(path)) errors.push(issue('orphan-output', null, null, `${path} is generated but not declared by an audio inventory.`));
  }
  for (const path of committedMedia) {
    if (!declaredOutputs.has(path)) errors.push(issue('orphan-media', null, null, `${path} is committed media but not declared by an audio inventory.`));
  }

  const musicStates = new Set(stringArray(coverage.musicStates ?? [], 'Audio QA coverage.musicStates'));
  const ambienceBiomes = new Set(stringArray(coverage.ambienceBiomes ?? [], 'Audio QA coverage.ambienceBiomes'));
  for (const context of qa.campaignContexts) {
    for (const state of context.musicStates) if (!musicStates.has(state)) errors.push(issue('missing-music-context', null, context.id, `${context.id} requires music state ${state}.`));
    for (const biome of context.ambienceBiomes) if (!ambienceBiomes.has(biome)) errors.push(issue('missing-ambience-context', null, context.id, `${context.id} requires ambience biome ${biome}.`));
  }

  errors.sort((left, right) => `${left.code}:${left.familyId ?? ''}:${left.recordId ?? ''}:${left.message}`.localeCompare(`${right.code}:${right.familyId ?? ''}:${right.recordId ?? ''}:${right.message}`));
  return deepFreeze({
    ok: errors.length === 0,
    familyCount: qa.families.length,
    recordCount,
    generatedOutputCount: generated.size,
    committedMediaCount: committedMedia.size,
    declaredOutputCount: declaredOutputs.size,
    campaignContextCount: qa.campaignContexts.length,
    budgets: qa.voiceBudgets,
    errors,
  });
}

function normalizeVoiceRequest(value, index) {
  const source = plainObject(value, `Audio voice request ${index}`);
  const bus = id(source.bus, `Audio voice request ${index}.bus`);
  if (!BUS_SET.has(bus)) throw new RangeError(`Audio voice request ${index} uses unknown bus ${bus}.`);
  return deepFreeze({
    id: id(source.id, `Audio voice request ${index}.id`),
    bus,
    priority: number(source.priority, `Audio voice request ${index}.priority`, 0, 1_000_000),
    startedAt: number(source.startedAt, `Audio voice request ${index}.startedAt`, 0),
  });
}

export function selectReleaseVoices(requests, voiceBudgets) {
  if (!Array.isArray(requests)) throw new TypeError('Audio voice requests must be an array.');
  const budgets = normalizeBudgets(voiceBudgets);
  const normalized = requests.map(normalizeVoiceRequest);
  if (new Set(normalized.map((request) => request.id)).size !== normalized.length) throw new Error('Audio voice request IDs must be unique.');
  const ranked = [...normalized].sort((left, right) =>
    right.priority - left.priority || left.startedAt - right.startedAt || left.id.localeCompare(right.id));
  const admitted = [];
  const rejected = [];
  const busCounts = Object.fromEntries(AUDIO_RELEASE_BUSES.map((bus) => [bus, 0]));
  for (const request of ranked) {
    if (busCounts[request.bus] >= budgets.buses[request.bus]) {
      rejected.push(deepFreeze({ ...request, reason: 'bus-budget' }));
    } else if (admitted.length >= budgets.total) {
      rejected.push(deepFreeze({ ...request, reason: 'global-budget' }));
    } else {
      admitted.push(request);
      busCounts[request.bus] += 1;
    }
  }
  return deepFreeze({ admitted, rejected, busCounts, budgets });
}

export function validateAutoplayResumeTrace(trace) {
  if (!Array.isArray(trace) || trace.length < 4) throw new TypeError('Audio autoplay trace must contain at least four entries.');
  const entries = trace.map((value, index) => {
    const source = plainObject(value, `Audio autoplay trace ${index}`);
    return deepFreeze({ state: id(source.state, `Audio autoplay trace ${index}.state`), cause: id(source.cause, `Audio autoplay trace ${index}.cause`), error: source.error == null ? null : text(source.error, `Audio autoplay trace ${index}.error`) });
  });
  const errors = [];
  if (entries[0].state !== 'locked') errors.push('Trace must begin locked before a user gesture.');
  if (entries.some((entry) => entry.error !== null)) errors.push('Trace contains an audio lifecycle error.');
  const running = entries.findIndex((entry) => entry.state === 'running' && entry.cause === 'user-gesture');
  if (running < 1) errors.push('Trace never unlocked from a user gesture.');
  const paused = entries.findIndex((entry, index) => index > running && entry.state === 'paused');
  if (paused < 0) errors.push('Trace never entered a paused state.');
  const resumed = entries.findIndex((entry, index) => index > paused && entry.state === 'running' && (entry.cause === 'resume' || entry.cause === 'user-gesture'));
  if (resumed < 0) errors.push('Trace never resumed after pause.');
  return deepFreeze({ ok: errors.length === 0, entries, errors });
}
