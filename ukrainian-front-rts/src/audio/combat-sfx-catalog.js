import {
  AUDIO_EVENT_IDS,
  AUDIO_EVENT_PRIORITIES,
  createAudioEventMap,
  resolveAudioEvent,
  selectAudioAdmissions,
} from './audio-event-map.js';

export const COMBAT_SFX_CATALOG_SCHEMA = 'fields-of-resolve.combat-sfx';
export const COMBAT_SFX_CATALOG_VERSION = 1;

const SUPPORTED_EVENT_IDS = new Set([
  AUDIO_EVENT_IDS.WEAPON_FIRE,
  AUDIO_EVENT_IDS.IMPACT,
  AUDIO_EVENT_IDS.EXPLOSION,
  AUDIO_EVENT_IDS.DESTRUCTION,
  AUDIO_EVENT_IDS.REPAIR,
  AUDIO_EVENT_IDS.CONSTRUCTION,
]);
const ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const FAMILY_SET = new Set(['weapon', 'impact', 'explosion', 'vehicle', 'drone', 'artillery', 'air-defense', 'destruction', 'repair', 'construction']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
function object(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`); return value; }
function string(value, label) { if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string.`); return value; }
function stableId(value, label) { const id = string(value, label); if (!ID_PATTERN.test(id)) throw new TypeError(`${label} must be a stable identifier.`); return id; }
function integer(value, label, minimum = 0) { if (!Number.isInteger(value) || value < minimum) throw new TypeError(`${label} must be an integer >= ${minimum}.`); return value; }
function number(value, label, minimum = 0, maximum = Infinity) { if (!Number.isFinite(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a finite number between ${minimum} and ${maximum}.`); return value; }
function compareStable(left, right) { if (left < right) return -1; if (left > right) return 1; return 0; }

function normalizeProvenance(value, label) {
  const source = object(value, label);
  const externalInputs = source.externalInputs ?? [];
  if (!Array.isArray(externalInputs)) throw new TypeError(`${label}.externalInputs must be an array.`);
  return deepFreeze({
    creator: string(source.creator, `${label}.creator`), source: string(source.source, `${label}.source`), license: string(source.license, `${label}.license`),
    redistribution: string(source.redistribution, `${label}.redistribution`), generatedTool: string(source.generatedTool, `${label}.generatedTool`),
    externalInputs: externalInputs.map((entry, index) => string(entry, `${label}.externalInputs[${index}]`)), synthesis: string(source.synthesis, `${label}.synthesis`),
    seed: integer(source.seed, `${label}.seed`), humanCorrections: string(source.humanCorrections, `${label}.humanCorrections`),
  });
}

function normalizeBank(value, index, format) {
  const source = object(value, `Combat SFX bank ${index}`);
  const id = stableId(source.id, `Combat SFX bank ${index}.id`);
  const path = string(source.path, `Combat SFX bank ${id}.path`);
  if (path.startsWith('/') || path.includes('..') || !path.endsWith('.wav')) throw new TypeError(`Combat SFX bank ${id}.path must be a relative WAV path.`);
  const sha256 = string(source.sha256, `Combat SFX bank ${id}.sha256`);
  if (!SHA256_PATTERN.test(sha256)) throw new TypeError(`Combat SFX bank ${id}.sha256 must be lowercase SHA-256.`);
  return deepFreeze({ id, path, sampleCount: integer(source.sampleCount, `Combat SFX bank ${id}.sampleCount`, 1), byteLength: integer(source.byteLength, `Combat SFX bank ${id}.byteLength`, 45), sha256, ...format });
}

function normalizeAsset(value, index, catalog, bankIds) {
  const source = object(value, `Combat SFX asset ${index}`);
  const id = stableId(source.id, `Combat SFX asset ${index}.id`);
  const cue = stableId(source.cue, `Combat SFX asset ${index}.cue`);
  const eventId = stableId(source.eventId, `Combat SFX asset ${index}.eventId`);
  if (!SUPPORTED_EVENT_IDS.has(eventId)) throw new RangeError(`Combat SFX asset ${id} uses unsupported event ${eventId}.`);
  const family = stableId(source.family, `Combat SFX asset ${index}.family`);
  if (!FAMILY_SET.has(family)) throw new RangeError(`Combat SFX asset ${id} uses unknown family ${family}.`);
  const bankId = stableId(source.bankId, `Combat SFX asset ${id}.bankId`);
  if (!bankIds.has(bankId)) throw new Error(`Combat SFX asset ${id} references unknown bank ${bankId}.`);
  if (source.loop !== false) throw new Error(`Combat SFX asset ${id} must be a one-shot in UFR-126.`);
  const offsetMs = number(source.offsetMs, `Combat SFX asset ${id}.offsetMs`);
  const durationMs = integer(source.durationMs, `Combat SFX asset ${id}.durationMs`, 1);
  return deepFreeze({
    id, cue, eventId, family, bankId, offsetMs, durationMs, sampleCount: integer(source.sampleCount, `Combat SFX asset ${id}.sampleCount`, 1),
    peak: number(source.peak, `Combat SFX asset ${id}.peak`, 0, 1), loop: false, provenance: normalizeProvenance(source.provenance, `Combat SFX asset ${id}.provenance`),
    offsetSeconds: offsetMs / 1000, durationSeconds: durationMs / 1000,
  });
}

export function validateCombatSfxCatalog(value, { source = 'combat SFX catalog' } = {}) {
  const input = object(value, source);
  if (input.schema !== COMBAT_SFX_CATALOG_SCHEMA) throw new TypeError(`${source}.schema must be ${COMBAT_SFX_CATALOG_SCHEMA}.`);
  if (input.version !== COMBAT_SFX_CATALOG_VERSION) throw new TypeError(`${source}.version must be ${COMBAT_SFX_CATALOG_VERSION}.`);
  if (!Array.isArray(input.banks) || !input.banks.length) throw new TypeError(`${source}.banks must be a non-empty array.`);
  if (!Array.isArray(input.assets) || !input.assets.length) throw new TypeError(`${source}.assets must be a non-empty array.`);
  const catalog = {
    schema: COMBAT_SFX_CATALOG_SCHEMA, version: COMBAT_SFX_CATALOG_VERSION, id: stableId(input.id, `${source}.id`), generatedAt: string(input.generatedAt, `${source}.generatedAt`),
    sampleRate: integer(input.sampleRate, `${source}.sampleRate`, 1), channels: integer(input.channels, `${source}.channels`, 1), bitsPerSample: integer(input.bitsPerSample, `${source}.bitsPerSample`, 1), gapMs: number(input.gapMs, `${source}.gapMs`),
  };
  const format = { sampleRate: catalog.sampleRate, channels: catalog.channels, bitsPerSample: catalog.bitsPerSample };
  const banks = input.banks.map((bank, index) => normalizeBank(bank, index, format)).sort((left, right) => compareStable(left.id, right.id));
  if (new Set(banks.map((bank) => bank.id)).size !== banks.length) throw new Error('Combat SFX bank IDs must be unique.');
  if (new Set(banks.map((bank) => bank.path)).size !== banks.length) throw new Error('Combat SFX bank paths must be unique.');
  const byBank = Object.fromEntries(banks.map((bank) => [bank.id, bank]));
  const assets = input.assets.map((asset, index) => normalizeAsset(asset, index, catalog, new Set(banks.map((bank) => bank.id)))).sort((left, right) => compareStable(left.id, right.id));
  for (const [label, values] of [['ID', assets.map((asset) => asset.id)], ['cue', assets.map((asset) => asset.cue)]]) if (new Set(values).size !== values.length) throw new Error(`Combat SFX ${label}s must be unique.`);
  for (const asset of assets) {
    const bank = byBank[asset.bankId];
    const endSample = Math.round((asset.offsetSeconds + asset.durationSeconds) * catalog.sampleRate);
    if (endSample > bank.sampleCount) throw new Error(`Combat SFX asset ${asset.id} exceeds bank ${bank.id}.`);
  }
  return deepFreeze({ ...catalog, banks, assets, byBank, byId: Object.fromEntries(assets.map((asset) => [asset.id, asset])), byCue: Object.fromEntries(assets.map((asset) => [asset.cue, asset])) });
}

export async function loadCombatSfxCatalog(source, { fetchImpl = globalThis.fetch?.bind(globalThis) } = {}) {
  if (typeof source !== 'string' && !(source instanceof URL)) return Object.freeze({ catalog: validateCombatSfxCatalog(source), sourceUrl: null });
  if (typeof fetchImpl !== 'function') throw new Error('No fetch implementation is available for the combat SFX catalog.');
  const sourceUrl = String(source); const response = await fetchImpl(sourceUrl);
  if (!response?.ok) throw new Error(`Unable to load combat SFX catalog: ${sourceUrl} (${response?.status ?? 'unknown'})`);
  return Object.freeze({ catalog: validateCombatSfxCatalog(await response.json(), { source: sourceUrl }), sourceUrl });
}

function policyFor(asset) {
  const common = { id: asset.eventId, bus: 'sfx', factionMode: 'shared', assets: { shared: [asset.id] }, missingAsset: { policy: 'reject' } };
  switch (asset.eventId) {
    case AUDIO_EVENT_IDS.WEAPON_FIRE: return { ...common, priority: AUDIO_EVENT_PRIORITIES.NORMAL, cooldownTicks: 1, concurrency: { key: 'combat-weapon-fire', limit: 8 }, attenuation: { mode: 'linear', nearDistance: 8, farDistance: 140, minimumGain: 0 } };
    case AUDIO_EVENT_IDS.IMPACT: return { ...common, priority: AUDIO_EVENT_PRIORITIES.LOW, cooldownTicks: 0, concurrency: { key: 'combat-impact', limit: 10 }, attenuation: { mode: 'linear', nearDistance: 6, farDistance: 110, minimumGain: 0 } };
    case AUDIO_EVENT_IDS.EXPLOSION: return { ...common, priority: AUDIO_EVENT_PRIORITIES.HIGH, cooldownTicks: 2, concurrency: { key: 'combat-explosion', limit: 5 }, attenuation: { mode: 'linear', nearDistance: 12, farDistance: 190, minimumGain: 0 } };
    case AUDIO_EVENT_IDS.DESTRUCTION: return { ...common, priority: AUDIO_EVENT_PRIORITIES.HIGH, cooldownTicks: 3, concurrency: { key: 'combat-destruction', limit: 4 }, attenuation: { mode: 'linear', nearDistance: 12, farDistance: 200, minimumGain: 0 } };
    case AUDIO_EVENT_IDS.REPAIR: return { ...common, priority: AUDIO_EVENT_PRIORITIES.LOW, cooldownTicks: 8, concurrency: { key: 'combat-repair', limit: 3 }, attenuation: { mode: 'linear', nearDistance: 5, farDistance: 85, minimumGain: 0 } };
    case AUDIO_EVENT_IDS.CONSTRUCTION: return { ...common, priority: AUDIO_EVENT_PRIORITIES.LOW, cooldownTicks: 10, concurrency: { key: 'economy-construction', limit: 3 }, attenuation: { mode: 'linear', nearDistance: 5, farDistance: 90, minimumGain: 0 } };
    default: throw new RangeError(`No combat SFX policy for ${asset.eventId}.`);
  }
}

export function createCombatSfxResolver(value) {
  const catalog = validateCombatSfxCatalog(value);
  const maps = new Map(catalog.assets.map((asset) => [asset.cue, createAudioEventMap([policyFor(asset)])]));
  return Object.freeze({
    catalog,
    resolve(cue, request = {}, state = {}) { const asset = catalog.byCue[cue]; if (!asset) return deepFreeze({ ok: false, cue, reason: 'unknown-cue' }); return resolveAudioEvent(maps.get(cue), { ...request, id: asset.eventId }, state); },
    admit(events, state) { return selectAudioAdmissions(events, state); },
  });
}
