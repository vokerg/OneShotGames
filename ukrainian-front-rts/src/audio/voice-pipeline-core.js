import {
  AUDIO_EVENT_IDS,
  AUDIO_EVENT_PRIORITIES,
  createAudioEventMap,
  resolveAudioEvent,
} from './audio-event-map.js';
import { DOMAIN_EVENT_TYPES } from '../core/events.js';

export const VOICE_CATALOG_SCHEMA = 'fields-of-resolve.voice-hooks';
export const VOICE_CATALOG_VERSION = 1;
export const VOICE_PIPELINE_TAG = 'voice-pipeline';
export const VOICE_HOOK_KINDS = Object.freeze({
  UNIT_ACKNOWLEDGEMENT: 'unit-acknowledgement',
  ALERT: 'alert',
  CAMPAIGN_DIALOGUE: 'campaign-dialogue',
});
export const VOICE_SOURCE_MODES = Object.freeze(['hook-only', 'synthetic', 'recorded']);
export const DEFAULT_VOICE_PREFERENCES = Object.freeze({
  language: 'en',
  voiceEnabled: true,
  subtitlesEnabled: true,
  speakerLabelsEnabled: true,
});

const ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const LANGUAGE_PATTERN = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/;
const SHA_PATTERN = /^[0-9a-f]{64}$/;
const HOOK_KIND_SET = new Set(Object.values(VOICE_HOOK_KINDS));
const SOURCE_MODE_SET = new Set(VOICE_SOURCE_MODES);
const EVENT_BY_KIND = Object.freeze({
  [VOICE_HOOK_KINDS.UNIT_ACKNOWLEDGEMENT]: AUDIO_EVENT_IDS.UNIT_ACKNOWLEDGEMENT,
  [VOICE_HOOK_KINDS.ALERT]: AUDIO_EVENT_IDS.UNDER_ATTACK,
  [VOICE_HOOK_KINDS.CAMPAIGN_DIALOGUE]: AUDIO_EVENT_IDS.VOICE_DIALOGUE,
});
const PRIORITY_BY_KIND = Object.freeze({
  [VOICE_HOOK_KINDS.UNIT_ACKNOWLEDGEMENT]: AUDIO_EVENT_PRIORITIES.NORMAL,
  [VOICE_HOOK_KINDS.ALERT]: AUDIO_EVENT_PRIORITIES.CRITICAL,
  [VOICE_HOOK_KINDS.CAMPAIGN_DIALOGUE]: AUDIO_EVENT_PRIORITIES.HIGH,
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
function text(value, label, { empty = false, max = 2000 } = {}) {
  if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > max) {
    throw new TypeError(`${label} must be ${empty ? 'a' : 'a non-empty'} string of at most ${max} characters.`);
  }
  return value;
}
function stableId(value, label) {
  const result = text(value, label, { max: 128 });
  if (!ID_PATTERN.test(result)) throw new TypeError(`${label} must be a stable identifier.`);
  return result;
}
function integer(value, label, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) throw new TypeError(`${label} must be an integer >= ${minimum}.`);
  return value;
}
function finite(value, label, minimum = -Infinity, maximum = Infinity) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new TypeError(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return number;
}
function compareText(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function errorMessage(error) { return error instanceof Error ? error.message : String(error); }

function normalizeLanguage(value, label = 'Voice language') {
  const normalized = text(value, label, { max: 64 }).trim().replaceAll('_', '-').toLowerCase();
  if (!LANGUAGE_PATTERN.test(normalized)) throw new TypeError(`${label} must be a BCP-47-like language tag.`);
  return normalized;
}
function normalizeLanguageLabels(value, languages, label) {
  const source = plainObject(value, label);
  const result = {};
  for (const [language, languageLabel] of Object.entries(source)) {
    const id = normalizeLanguage(language, `${label} key`);
    if (!languages.has(id)) throw new RangeError(`${label} references unknown language ${id}.`);
    result[id] = text(languageLabel, `${label}.${id}`, { max: 120 });
  }
  return Object.freeze(result);
}
function normalizeProvenance(value, label) {
  const source = plainObject(value, label);
  if (!Array.isArray(source.externalInputs)) throw new TypeError(`${label}.externalInputs must be an array.`);
  return deepFreeze({
    creator: text(source.creator, `${label}.creator`, { max: 180 }),
    source: text(source.source, `${label}.source`, { max: 500 }),
    license: text(source.license, `${label}.license`, { max: 120 }),
    redistribution: text(source.redistribution, `${label}.redistribution`, { max: 500 }),
    generatedTool: text(source.generatedTool ?? 'none', `${label}.generatedTool`, { max: 240 }),
    externalInputs: source.externalInputs.map((entry, index) => text(entry, `${label}.externalInputs[${index}]`, { max: 500 })),
    humanCorrections: text(source.humanCorrections ?? 'none', `${label}.humanCorrections`, { max: 500 }),
    publicFigureImpersonation: source.publicFigureImpersonation === undefined ? false : Boolean(source.publicFigureImpersonation),
  });
}
function normalizeAsset(value, label) {
  const source = plainObject(value, label);
  const mode = stableId(source.mode, `${label}.mode`);
  if (!SOURCE_MODE_SET.has(mode)) throw new RangeError(`${label}.mode is unsupported: ${mode}`);
  const path = source.path == null ? null : text(source.path, `${label}.path`, { max: 300 });
  const sha256 = source.sha256 == null ? null : text(source.sha256, `${label}.sha256`, { max: 64 });
  const durationMs = source.durationMs == null ? null : integer(source.durationMs, `${label}.durationMs`, 1);
  if (mode === 'hook-only') {
    if (path !== null || sha256 !== null || durationMs !== null) throw new Error(`${label} hook-only sources must not declare binary asset metadata.`);
  } else {
    if (!path || path.startsWith('/') || path.includes('..') || !/\.(wav|ogg|mp3)$/i.test(path)) {
      throw new TypeError(`${label}.path must be a safe relative audio path.`);
    }
    if (!sha256 || !SHA_PATTERN.test(sha256)) throw new TypeError(`${label}.sha256 must be lowercase SHA-256.`);
    if (durationMs === null) throw new TypeError(`${label}.durationMs is required for binary voice assets.`);
  }
  const provenance = normalizeProvenance(source.provenance, `${label}.provenance`);
  if (provenance.publicFigureImpersonation) throw new Error(`${label} must not impersonate a public figure.`);
  return deepFreeze({ mode, path, sha256, durationMs, provenance });
}

function validateFallbackGraph(languages) {
  const visiting = new Set();
  const visited = new Set();
  function visit(language) {
    if (visiting.has(language)) throw new Error(`Voice language fallback cycle includes ${language}.`);
    if (visited.has(language)) return;
    visiting.add(language);
    for (const fallback of languages[language].fallbacks) visit(fallback);
    visiting.delete(language);
    visited.add(language);
  }
  for (const language of Object.keys(languages)) visit(language);
}

export function validateVoiceCatalog(value, { source = 'voice catalog' } = {}) {
  const input = plainObject(value, source);
  if (input.schema !== VOICE_CATALOG_SCHEMA || input.version !== VOICE_CATALOG_VERSION) {
    throw new TypeError(`${source} has an unsupported schema/version.`);
  }
  const languageRows = (input.languages ?? []).map((value, index) => {
    const row = plainObject(value, `${source}.languages[${index}]`);
    const id = normalizeLanguage(row.id, `${source}.languages[${index}].id`);
    const fallbacks = (row.fallbacks ?? []).map((entry, fallbackIndex) => normalizeLanguage(entry, `${id}.fallbacks[${fallbackIndex}]`));
    if (new Set(fallbacks).size !== fallbacks.length || fallbacks.includes(id)) throw new Error(`${id}.fallbacks must be unique and exclude itself.`);
    return { id, label: text(row.label, `${id}.label`, { max: 120 }), fallbacks };
  });
  if (!languageRows.length || new Set(languageRows.map((row) => row.id)).size !== languageRows.length) {
    throw new Error('Voice catalog languages must be non-empty and unique.');
  }
  const languageIds = new Set(languageRows.map((row) => row.id));
  for (const row of languageRows) for (const fallback of row.fallbacks) if (!languageIds.has(fallback)) throw new Error(`${row.id} references unknown fallback ${fallback}.`);
  const languages = Object.fromEntries(languageRows.sort((left, right) => compareText(left.id, right.id)).map((row) => [row.id, deepFreeze(row)]));
  validateFallbackGraph(languages);
  const defaultLanguage = normalizeLanguage(input.defaultLanguage, `${source}.defaultLanguage`);
  if (!languages[defaultLanguage]) throw new Error(`Voice default language ${defaultLanguage} is not declared.`);

  const speakers = {};
  for (const [index, value] of (input.speakers ?? []).entries()) {
    const row = plainObject(value, `${source}.speakers[${index}]`);
    const id = stableId(row.id, `${source}.speakers[${index}].id`);
    if (speakers[id]) throw new Error(`Duplicate voice speaker: ${id}`);
    const labels = normalizeLanguageLabels(row.labels, languageIds, `${id}.labels`);
    if (!labels[defaultLanguage]) throw new Error(`${id}.labels must include the default language.`);
    const publicFigure = Boolean(row.publicFigure);
    const voiceAllowed = row.voiceAllowed === undefined ? !publicFigure : Boolean(row.voiceAllowed);
    if (publicFigure && voiceAllowed) throw new Error(`${id} is a public figure and must not be voice-enabled.`);
    speakers[id] = deepFreeze({ id, labels, publicFigure, voiceAllowed, fictional: row.fictional === undefined ? !publicFigure : Boolean(row.fictional) });
  }
  if (!Object.keys(speakers).length) throw new Error('Voice catalog must declare at least one speaker.');

  const hooks = {};
  const variantIds = new Set();
  for (const [index, value] of (input.hooks ?? []).entries()) {
    const row = plainObject(value, `${source}.hooks[${index}]`);
    const hookId = stableId(row.id, `${source}.hooks[${index}].id`);
    if (hooks[hookId]) throw new Error(`Duplicate voice hook: ${hookId}`);
    const kind = stableId(row.kind, `${hookId}.kind`);
    if (!HOOK_KIND_SET.has(kind)) throw new RangeError(`${hookId} uses unknown hook kind ${kind}.`);
    const eventId = stableId(row.eventId, `${hookId}.eventId`);
    if (eventId !== EVENT_BY_KIND[kind]) throw new Error(`${hookId}.eventId must be ${EVENT_BY_KIND[kind]}.`);
    const dynamicText = Boolean(row.dynamicText);
    const requestSpeaker = Boolean(row.requestSpeaker);
    const speakerId = row.speakerId == null ? null : stableId(row.speakerId, `${hookId}.speakerId`);
    if (requestSpeaker === (speakerId !== null)) throw new Error(`${hookId} must use exactly one of requestSpeaker or speakerId.`);
    if (speakerId && !speakers[speakerId]) throw new Error(`${hookId} references unknown speaker ${speakerId}.`);
    const repetition = plainObject(row.repetition ?? {}, `${hookId}.repetition`);
    const repetitionPolicy = deepFreeze({
      windowTicks: integer(repetition.windowTicks ?? 0, `${hookId}.repetition.windowTicks`),
      maxPlays: integer(repetition.maxPlays ?? 1, `${hookId}.repetition.maxPlays`, 1),
      variantAvoidance: integer(repetition.variantAvoidance ?? 0, `${hookId}.repetition.variantAvoidance`),
      requestKeyed: Boolean(repetition.requestKeyed),
    });
    const concurrency = plainObject(row.concurrency ?? {}, `${hookId}.concurrency`);
    const concurrencyPolicy = deepFreeze({
      key: stableId(concurrency.key ?? `voice-${kind}`, `${hookId}.concurrency.key`),
      limit: integer(concurrency.limit ?? 1, `${hookId}.concurrency.limit`, 1),
    });
    const languageSource = plainObject(row.variants, `${hookId}.variants`);
    const variants = {};
    for (const [languageValue, entriesValue] of Object.entries(languageSource)) {
      const language = normalizeLanguage(languageValue, `${hookId}.variants key`);
      if (!languages[language]) throw new Error(`${hookId} references unknown language ${language}.`);
      if (!Array.isArray(entriesValue) || entriesValue.length === 0) throw new Error(`${hookId}.variants.${language} must be a non-empty array.`);
      variants[language] = entriesValue.map((entryValue, variantIndex) => {
        const entry = plainObject(entryValue, `${hookId}.variants.${language}[${variantIndex}]`);
        const id = stableId(entry.id, `${hookId}.variants.${language}[${variantIndex}].id`);
        if (variantIds.has(id)) throw new Error(`Duplicate voice variant: ${id}`);
        variantIds.add(id);
        const subtitle = entry.subtitle == null ? null : text(entry.subtitle, `${id}.subtitle`, { max: 1000 });
        if (dynamicText && subtitle !== null) throw new Error(`${id} must not hard-code subtitle text for a dynamic hook.`);
        if (!dynamicText && subtitle === null) throw new Error(`${id} requires subtitle text.`);
        const asset = normalizeAsset(entry.asset, `${id}.asset`);
        const effectiveSpeaker = speakerId ? speakers[speakerId] : null;
        if (effectiveSpeaker?.publicFigure && asset.mode !== 'hook-only') throw new Error(`${id} must not voice a public figure.`);
        return deepFreeze({ id, subtitle, asset });
      });
    }
    if (!variants[defaultLanguage]) throw new Error(`${hookId} must include the default language.`);
    hooks[hookId] = deepFreeze({
      id: hookId,
      kind,
      eventId,
      dynamicText,
      requestSpeaker,
      speakerId,
      gain: finite(row.gain ?? 1, `${hookId}.gain`, 0, 1),
      repetition: repetitionPolicy,
      concurrency: concurrencyPolicy,
      variants: deepFreeze(variants),
    });
  }
  if (!Object.keys(hooks).length) throw new Error('Voice catalog must declare at least one hook.');
  const kinds = new Set(Object.values(hooks).map((hook) => hook.kind));
  for (const kind of HOOK_KIND_SET) if (!kinds.has(kind)) throw new Error(`Voice catalog is missing required hook kind ${kind}.`);
  return deepFreeze({
    schema: VOICE_CATALOG_SCHEMA,
    version: VOICE_CATALOG_VERSION,
    id: stableId(input.id, `${source}.id`),
    generatedAt: text(input.generatedAt, `${source}.generatedAt`, { max: 64 }),
    defaultLanguage,
    languages,
    languageIds: Object.freeze(Object.keys(languages).sort(compareText)),
    speakers: deepFreeze(speakers),
    hooks: deepFreeze(hooks),
    hookIds: Object.freeze(Object.keys(hooks).sort(compareText)),
  });
}

export async function loadVoiceCatalog(source, { fetchImpl = globalThis.fetch?.bind(globalThis) } = {}) {
  if (typeof source !== 'string' && !(source instanceof URL)) return validateVoiceCatalog(source);
  if (typeof fetchImpl !== 'function') throw new Error('No fetch implementation is available for voice hooks.');
  const response = await fetchImpl(String(source));
  if (!response?.ok) throw new Error(`Unable to load voice catalog (${response?.status ?? 'unknown'}).`);
  return validateVoiceCatalog(await response.json(), { source: String(source) });
}

export function resolveVoiceLanguage(catalog, requestedLanguage) {
  plainObject(catalog, 'Voice catalog');
  const requested = requestedLanguage == null ? catalog.defaultLanguage : normalizeLanguage(requestedLanguage);
  const queue = [];
  const add = (language) => { if (language && !queue.includes(language)) queue.push(language); };
  add(requested);
  const base = requested.split('-')[0];
  if (base !== requested) add(base);
  const visited = new Set();
  for (let index = 0; index < queue.length; index += 1) {
    const language = queue[index];
    if (visited.has(language)) continue;
    visited.add(language);
    const row = catalog.languages[language];
    if (row) {
      for (const fallback of row.fallbacks) add(fallback);
      return deepFreeze({ requested, language, fallbackUsed: language !== requested, chain: [...queue] });
    }
  }
  add(catalog.defaultLanguage);
  return deepFreeze({ requested, language: catalog.defaultLanguage, fallbackUsed: requested !== catalog.defaultLanguage, chain: [...queue] });
}

function stableHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function normalizePreferences(value = {}, defaults = DEFAULT_VOICE_PREFERENCES) {
  const source = plainObject(value, 'Voice preferences');
  return deepFreeze({
    language: normalizeLanguage(source.language ?? defaults.language, 'Voice preferences.language'),
    voiceEnabled: source.voiceEnabled === undefined ? defaults.voiceEnabled : Boolean(source.voiceEnabled),
    subtitlesEnabled: source.subtitlesEnabled === undefined ? defaults.subtitlesEnabled : Boolean(source.subtitlesEnabled),
    speakerLabelsEnabled: source.speakerLabelsEnabled === undefined ? defaults.speakerLabelsEnabled : Boolean(source.speakerLabelsEnabled),
  });
}
function normalizeHistory(value) {
  if (!Array.isArray(value)) throw new TypeError('Voice repetition history must be an array.');
  return value.map((entry, index) => {
    const row = plainObject(entry, `Voice history ${index}`);
    return Object.freeze({
      hookId: stableId(row.hookId, `Voice history ${index}.hookId`),
      repetitionKey: stableId(row.repetitionKey, `Voice history ${index}.repetitionKey`),
      variantId: stableId(row.variantId, `Voice history ${index}.variantId`),
      tick: integer(row.tick, `Voice history ${index}.tick`),
    });
  });
}
function speakerForRequest(catalog, hook, request, language) {
  const speakerId = hook.requestSpeaker
    ? stableId(request.speakerId, 'Voice request.speakerId')
    : hook.speakerId;
  const catalogSpeaker = catalog.speakers[speakerId] ?? null;
  if (!catalogSpeaker && !hook.requestSpeaker) throw new Error(`Voice hook ${hook.id} references a missing speaker.`);
  if (catalogSpeaker?.publicFigure && catalogSpeaker.voiceAllowed) throw new Error(`Voice speaker ${speakerId} violates public-figure policy.`);
  const requestedLabel = request.speakerLabel == null ? null : text(request.speakerLabel, 'Voice request.speakerLabel', { max: 120 });
  const label = requestedLabel ?? catalogSpeaker?.labels[language] ?? catalogSpeaker?.labels[catalog.defaultLanguage] ?? speakerId;
  return Object.freeze({
    id: speakerId,
    label,
    publicFigure: Boolean(catalogSpeaker?.publicFigure),
    voiceAllowed: catalogSpeaker ? catalogSpeaker.voiceAllowed : !hook.requestSpeaker,
  });
}
function variantsForLanguage(catalog, hook, languageResult) {
  const candidates = [languageResult.language, ...languageResult.chain, catalog.defaultLanguage];
  for (const language of candidates) {
    const variants = hook.variants[language];
    if (variants?.length) return Object.freeze({ language, variants });
  }
  throw new Error(`Voice hook ${hook.id} has no resolvable language variant.`);
}
function voiceEventMap(hook, variant) {
  return createAudioEventMap([{
    id: hook.eventId,
    bus: 'voice',
    priority: PRIORITY_BY_KIND[hook.kind],
    cooldownTicks: 0,
    concurrency: hook.concurrency,
    factionMode: 'shared',
    assets: { shared: [variant.id] },
    missingAsset: { policy: 'reject' },
    tag: hook.concurrency.key,
  }]);
}

export function resolveVoiceRequest(catalog, request, {
  preferences = DEFAULT_VOICE_PREFERENCES,
  history = [],
  availableAssetIds = [],
  activeCounts = {},
} = {}) {
  const validatedCatalog = catalog.schema === VOICE_CATALOG_SCHEMA && catalog.version === VOICE_CATALOG_VERSION
    ? catalog
    : validateVoiceCatalog(catalog);
  const input = plainObject(request, 'Voice request');
  const hookId = stableId(input.hookId, 'Voice request.hookId');
  const hook = validatedCatalog.hooks[hookId];
  if (!hook) return deepFreeze({ ok: false, hookId, reason: 'unknown-hook' });
  const tick = integer(input.tick ?? 0, 'Voice request.tick');
  const sequence = integer(input.sequence ?? 0, 'Voice request.sequence');
  const settings = normalizePreferences(input.preferences ?? {}, normalizePreferences(preferences));
  const languageResult = resolveVoiceLanguage(validatedCatalog, input.language ?? settings.language);
  const selectedLanguage = variantsForLanguage(validatedCatalog, hook, languageResult);
  const repetitionKey = hook.repetition.requestKeyed
    ? stableId(input.repetitionKey, 'Voice request.repetitionKey')
    : hook.id;
  const normalizedHistory = normalizeHistory(history);
  for (const entry of normalizedHistory) if (entry.tick > tick) throw new RangeError(`Voice history for ${entry.repetitionKey} is in the future.`);
  const recent = normalizedHistory
    .filter((entry) => entry.repetitionKey === repetitionKey && tick - entry.tick < hook.repetition.windowTicks)
    .sort((left, right) => left.tick - right.tick || compareText(left.variantId, right.variantId));
  if (hook.repetition.windowTicks > 0 && recent.length >= hook.repetition.maxPlays) {
    const retryAtTick = recent[recent.length - hook.repetition.maxPlays].tick + hook.repetition.windowTicks;
    return deepFreeze({ ok: false, hookId, tick, sequence, repetitionKey, reason: 'repetition-limit', retryAtTick });
  }
  let variantIndex = stableHash(`${hook.id}|${repetitionKey}|${sequence}|${input.variantKey ?? 'default'}|${selectedLanguage.language}`) % selectedLanguage.variants.length;
  if (selectedLanguage.variants.length > 1 && hook.repetition.variantAvoidance > 0) {
    const avoided = new Set(recent.slice(-hook.repetition.variantAvoidance).map((entry) => entry.variantId));
    for (let offset = 0; offset < selectedLanguage.variants.length; offset += 1) {
      const candidate = (variantIndex + offset) % selectedLanguage.variants.length;
      if (!avoided.has(selectedLanguage.variants[candidate].id)) { variantIndex = candidate; break; }
    }
  }
  const variant = selectedLanguage.variants[variantIndex];
  const speaker = speakerForRequest(validatedCatalog, hook, input, selectedLanguage.language);
  const subtitleText = hook.dynamicText
    ? text(input.subtitleText, 'Voice request.subtitleText', { max: 2000 })
    : variant.subtitle;
  const subtitle = deepFreeze({
    visible: settings.subtitlesEnabled,
    text: settings.subtitlesEnabled ? subtitleText : '',
    speakerId: speaker.id,
    speakerLabel: settings.subtitlesEnabled && settings.speakerLabelsEnabled ? speaker.label : '',
    language: selectedLanguage.language,
    fallbackUsed: selectedLanguage.language !== languageResult.requested,
  });
  let voice;
  if (!settings.voiceEnabled || !speaker.voiceAllowed) {
    voice = deepFreeze({ enabled: false, playable: false, reason: speaker.voiceAllowed ? 'voice-disabled' : 'speaker-voice-disabled', descriptor: null });
  } else if (variant.asset.mode === 'hook-only') {
    voice = deepFreeze({ enabled: true, playable: false, reason: 'hook-only', descriptor: null });
  } else {
    const resolved = resolveAudioEvent(voiceEventMap(hook, variant), {
      id: hook.eventId,
      tick,
      sequence,
      gain: finite(input.gain ?? hook.gain, 'Voice request.gain', 0, 1),
      distance: finite(input.distance ?? 0, 'Voice request.distance', 0),
      faction: input.faction ?? null,
      variantKey: input.variantKey ?? repetitionKey,
    }, { availableAssetIds, activeCounts });
    voice = deepFreeze({ enabled: true, playable: Boolean(resolved.ok), reason: resolved.ok ? null : resolved.reason, descriptor: resolved.ok ? resolved : null });
  }
  const deliverable = subtitle.visible || voice.playable;
  return deepFreeze({
    ok: true,
    accepted: deliverable,
    reason: deliverable ? null : (settings.voiceEnabled || settings.subtitlesEnabled ? voice.reason : 'all-output-disabled'),
    hookId,
    kind: hook.kind,
    eventId: hook.eventId,
    tick,
    sequence,
    repetitionKey,
    language: selectedLanguage.language,
    requestedLanguage: languageResult.requested,
    variantId: variant.id,
    subtitle,
    voice,
    historyEntry: deliverable ? { hookId, repetitionKey, variantId: variant.id, tick } : null,
  });
}

function mixerCounts(mixer) {
  if (!mixer) return {};
  const counts = {};
  for (const voice of mixer.snapshot().voices ?? []) if (voice.tag) counts[voice.tag] = (counts[voice.tag] ?? 0) + 1;
  return counts;
}
function requireMixer(mixer) {
  const methods = ['decodeAudioData', 'playBuffer', 'snapshot', 'stopAll'];
  if (!mixer || methods.some((method) => typeof mixer[method] !== 'function')) throw new TypeError('Voice pipeline requires a compatible audio mixer for binary assets.');
  return mixer;
}

export async function createVoicePipeline({
  catalogSource,
  fetchImpl,
  mixer = null,
  assetLoader = null,
  digestImpl = null,
  preferences = DEFAULT_VOICE_PREFERENCES,
  historyLimit = 128,
} = {}) {
  if (catalogSource === undefined) throw new TypeError('Voice pipeline requires catalogSource.');
  if (assetLoader !== null && typeof assetLoader !== 'function') throw new TypeError('assetLoader must be null or a function.');
  if (digestImpl !== null && typeof digestImpl !== 'function') throw new TypeError('digestImpl must be null or a function.');
  const limit = integer(historyLimit, 'Voice historyLimit', 1);
  const catalog = await loadVoiceCatalog(catalogSource, { fetchImpl });
  const binaryVariants = Object.values(catalog.hooks).flatMap((hook) => Object.values(hook.variants).flat()).filter((variant) => variant.asset.mode !== 'hook-only');
  const audioMixer = binaryVariants.length ? requireMixer(mixer) : mixer;
  let currentPreferences = normalizePreferences(preferences);
  const history = [];
  const buffers = new Map();
  const failures = new Map();
  let disposed = false;

  function snapshot() {
    return deepFreeze({
      catalogId: catalog.id,
      preferences: currentPreferences,
      history: history.map((entry) => ({ ...entry })),
      loadedAssetIds: [...buffers.keys()].sort(compareText),
      failures: Object.fromEntries([...failures.entries()].sort(([left], [right]) => compareText(left, right))),
      disposed,
    });
  }
  async function preload() {
    if (disposed) return deepFreeze({ ...snapshot(), reason: 'disposed' });
    for (const variant of binaryVariants) {
      if (buffers.has(variant.id)) continue;
      failures.delete(variant.id);
      try {
        if (!assetLoader) throw new Error('asset-loader-unavailable');
        const data = await assetLoader(variant);
        if (!(data instanceof ArrayBuffer)) throw new TypeError('Voice asset loader must return an ArrayBuffer.');
        if (digestImpl && await digestImpl(data) !== variant.asset.sha256) throw new Error('SHA-256 mismatch');
        const decoded = await audioMixer.decodeAudioData(data.slice(0));
        if (!decoded?.ok || !decoded.buffer) throw new Error(`decode failed: ${decoded?.reason ?? 'unknown'}`);
        buffers.set(variant.id, decoded.buffer);
      } catch (error) {
        failures.set(variant.id, errorMessage(error));
      }
    }
    return snapshot();
  }
  function setPreferences(changes) {
    if (disposed) return deepFreeze({ ok: false, reason: 'disposed' });
    const source = plainObject(changes, 'Voice preference changes');
    currentPreferences = normalizePreferences({ ...currentPreferences, ...source });
    return currentPreferences;
  }
  function requestVoice(request) {
    if (disposed) return deepFreeze({ ok: false, reason: 'disposed' });
    let result;
    try {
      result = resolveVoiceRequest(catalog, request, {
        preferences: currentPreferences,
        history,
        availableAssetIds: [...buffers.keys()],
        activeCounts: mixerCounts(audioMixer),
      });
    } catch (error) {
      return deepFreeze({ ok: false, reason: error instanceof TypeError || error instanceof RangeError ? 'invalid-request' : 'runtime-error' });
    }
    if (!result.ok || !result.accepted) return result;
    let playback = null;
    if (result.voice.playable) {
      const buffer = buffers.get(result.variantId);
      if (!buffer) {
        const accepted = result.subtitle.visible;
        return deepFreeze({
          ...result,
          accepted,
          reason: accepted ? null : 'missing-buffer',
          playback: { ok: false, reason: 'missing-buffer' },
        });
      }
      try {
        playback = audioMixer.playBuffer({
          buffer,
          bus: result.voice.descriptor.bus,
          volume: result.voice.descriptor.gain,
          tag: result.voice.descriptor.concurrencyKey,
        });
      } catch {
        playback = { ok: false, reason: 'runtime-error' };
      }
    }
    const delivered = result.subtitle.visible || playback?.ok;
    if (delivered && result.historyEntry) {
      history.push(result.historyEntry);
      if (history.length > limit) history.splice(0, history.length - limit);
    }
    return deepFreeze({
      ...result,
      accepted: Boolean(delivered),
      reason: delivered ? null : (playback?.reason ?? result.voice.reason ?? 'not-delivered'),
      playback: playback ? { ...playback } : null,
    });
  }
  function dispose() {
    if (disposed) return;
    if (audioMixer) {
      const tags = new Set(Object.values(catalog.hooks).map((hook) => hook.concurrency.key));
      for (const tag of tags) {
        try { audioMixer.stopAll({ bus: 'voice', tag }); } catch { /* presentation teardown is fail-closed */ }
      }
    }
    buffers.clear();
    failures.clear();
    history.length = 0;
    disposed = true;
  }
  return Object.freeze({ catalog, preload, request: requestVoice, setPreferences, snapshot, dispose });
}

export function createNarrativeVoiceRequest(cue, {
  hookId = 'campaign.dialogue',
  language = null,
  speakerLabel = null,
  gain = 1,
} = {}) {
  const source = plainObject(cue, 'Narrative cue');
  return deepFreeze({
    hookId: stableId(hookId, 'Narrative voice hookId'),
    tick: integer(source.tick ?? 0, 'Narrative cue.tick'),
    sequence: integer(source.sequence ?? 0, 'Narrative cue.sequence'),
    repetitionKey: stableId(source.id, 'Narrative cue.id'),
    speakerId: stableId(source.speakerId ?? source.speaker, 'Narrative cue.speakerId'),
    speakerLabel: text(speakerLabel ?? source.speakerLabel ?? source.speakerId ?? source.speaker, 'Narrative cue speaker label', { max: 120 }),
    subtitleText: text(source.text, 'Narrative cue.text', { max: 2000 }),
    language,
    gain: finite(gain, 'Narrative voice gain', 0, 1),
  });
}

export function installVoiceDomainAdapter({ events, pipeline } = {}) {
  if (!events || typeof events.subscribe !== 'function') throw new TypeError('Voice adapter requires a domain event stream.');
  if (!pipeline || typeof pipeline.request !== 'function') throw new TypeError('Voice adapter requires a voice pipeline.');
  return events.subscribe(DOMAIN_EVENT_TYPES.AUDIO, (event) => {
    const payload = event.payload ?? {};
    if (typeof payload.voiceHookId !== 'string' || !payload.voiceHookId) return;
    try {
      pipeline.request({
        hookId: payload.voiceHookId,
        tick: event.tick,
        sequence: event.sequence,
        language: payload.language ?? null,
        speakerId: payload.speakerId,
        speakerLabel: payload.speakerLabel,
        subtitleText: payload.subtitleText,
        repetitionKey: payload.repetitionKey,
        variantKey: payload.variantKey,
        gain: payload.gain ?? 1,
        distance: payload.distance ?? 0,
        faction: payload.faction ?? null,
      });
    } catch { /* presentation failures must not escape the event stream */ }
  });
}
