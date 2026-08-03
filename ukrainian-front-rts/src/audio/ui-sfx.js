import { DOMAIN_EVENT_TYPES } from '../core/events.js';
import {
  AUDIO_EVENT_IDS,
  AUDIO_EVENT_PRIORITIES,
  createAudioEventMap,
  resolveAudioEvent,
  selectAudioAdmissions,
} from './audio-event-map.js';
import { buildUiSfxBanks } from './ui-sfx-synthesis.js';

export const UI_SFX_CATALOG_SCHEMA = 'fields-of-resolve.ui-sfx';
export const UI_SFX_CATALOG_VERSION = 1;

const SUPPORTED_EVENTS = new Set([
  AUDIO_EVENT_IDS.UNIT_SELECTION, AUDIO_EVENT_IDS.UNIT_ACKNOWLEDGEMENT,
  AUDIO_EVENT_IDS.PRODUCTION_QUEUED, AUDIO_EVENT_IDS.PRODUCTION_COMPLETE,
  AUDIO_EVENT_IDS.RESEARCH_COMPLETE, AUDIO_EVENT_IDS.UNIT_ERROR,
  AUDIO_EVENT_IDS.OBJECTIVE_UPDATE, AUDIO_EVENT_IDS.VICTORY, AUDIO_EVENT_IDS.DEFEAT,
  AUDIO_EVENT_IDS.UI_CONFIRM, AUDIO_EVENT_IDS.UI_CANCEL, AUDIO_EVENT_IDS.UI_ERROR, AUDIO_EVENT_IDS.UI_ALERT,
]);
const FAMILIES = new Set(['selection', 'acknowledgement', 'command', 'queue', 'complete', 'error', 'alert', 'objective', 'victory', 'defeat', 'menu', 'save', 'load']);
const ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const SHA_PATTERN = /^[0-9a-f]{64}$/;

function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; for (const child of Object.values(value)) deepFreeze(child); return Object.freeze(value); }
function object(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`); return value; }
function text(value, label) { if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string.`); return value; }
function id(value, label) { const result = text(value, label); if (!ID_PATTERN.test(result)) throw new TypeError(`${label} must be a stable identifier.`); return result; }
function integer(value, label, minimum = 0) { if (!Number.isInteger(value) || value < minimum) throw new TypeError(`${label} must be an integer >= ${minimum}.`); return value; }
function number(value, label, minimum = 0, maximum = Infinity) { if (!Number.isFinite(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be between ${minimum} and ${maximum}.`); return value; }
function compare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }

function provenance(value, label) {
  const source = object(value, label);
  if (!Array.isArray(source.externalInputs)) throw new TypeError(`${label}.externalInputs must be an array.`);
  return deepFreeze({
    creator: text(source.creator, `${label}.creator`), source: text(source.source, `${label}.source`),
    license: text(source.license, `${label}.license`), redistribution: text(source.redistribution, `${label}.redistribution`),
    generatedTool: text(source.generatedTool, `${label}.generatedTool`),
    externalInputs: source.externalInputs.map((entry, index) => text(entry, `${label}.externalInputs[${index}]`)),
    synthesis: text(source.synthesis, `${label}.synthesis`), seed: integer(source.seed, `${label}.seed`),
    humanCorrections: text(source.humanCorrections, `${label}.humanCorrections`),
  });
}

export function validateUiSfxCatalog(value, { source = 'UI SFX catalog' } = {}) {
  const input = object(value, source);
  if (input.schema !== UI_SFX_CATALOG_SCHEMA || input.version !== UI_SFX_CATALOG_VERSION) throw new TypeError(`${source} has an unsupported schema/version.`);
  const format = { sampleRate: integer(input.sampleRate, `${source}.sampleRate`, 1), channels: integer(input.channels, `${source}.channels`, 1), bitsPerSample: integer(input.bitsPerSample, `${source}.bitsPerSample`, 1) };
  const banks = (input.banks ?? []).map((value, index) => {
    const bank = object(value, `${source}.banks[${index}]`); const bankId = id(bank.id, `${source}.banks[${index}].id`); const path = text(bank.path, `${bankId}.path`);
    if (path.startsWith('/') || path.includes('..') || !path.endsWith('.wav')) throw new TypeError(`${bankId}.path must be a relative WAV path.`);
    if (!SHA_PATTERN.test(bank.sha256)) throw new TypeError(`${bankId}.sha256 must be lowercase SHA-256.`);
    return deepFreeze({ id: bankId, path, sampleCount: integer(bank.sampleCount, `${bankId}.sampleCount`, 1), byteLength: integer(bank.byteLength, `${bankId}.byteLength`, 45), sha256: bank.sha256, ...format });
  }).sort((left, right) => compare(left.id, right.id));
  if (!banks.length || new Set(banks.map((bank) => bank.id)).size !== banks.length) throw new Error('UI SFX banks must be non-empty and unique.');
  const bankMap = Object.fromEntries(banks.map((bank) => [bank.id, bank]));
  const assets = (input.assets ?? []).map((value, index) => {
    const asset = object(value, `${source}.assets[${index}]`); const assetId = id(asset.id, `asset ${index}.id`); const cue = id(asset.cue, `${assetId}.cue`); const eventId = id(asset.eventId, `${assetId}.eventId`); const family = id(asset.family, `${assetId}.family`); const bankId = id(asset.bankId, `${assetId}.bankId`);
    if (!SUPPORTED_EVENTS.has(eventId)) throw new RangeError(`${assetId} uses unsupported event ${eventId}.`);
    if (!FAMILIES.has(family)) throw new RangeError(`${assetId} uses unknown family ${family}.`);
    if (!bankMap[bankId]) throw new Error(`${assetId} references unknown bank ${bankId}.`);
    if (asset.loop !== false) throw new Error(`${assetId} must be a one-shot.`);
    const offsetMs = number(asset.offsetMs, `${assetId}.offsetMs`); const durationMs = integer(asset.durationMs, `${assetId}.durationMs`, 1);
    return deepFreeze({ id: assetId, cue, eventId, family, bankId, offsetMs, durationMs, offsetSeconds: offsetMs / 1000, durationSeconds: durationMs / 1000, sampleCount: integer(asset.sampleCount, `${assetId}.sampleCount`, 1), peak: number(asset.peak, `${assetId}.peak`, 0, 1), loop: false, provenance: provenance(asset.provenance, `${assetId}.provenance`) });
  }).sort((left, right) => compare(left.id, right.id));
  if (!assets.length || new Set(assets.map((asset) => asset.id)).size !== assets.length || new Set(assets.map((asset) => asset.cue)).size !== assets.length) throw new Error('UI SFX asset IDs and cues must be non-empty and unique.');
  for (const asset of assets) if (Math.round((asset.offsetSeconds + asset.durationSeconds) * format.sampleRate) > bankMap[asset.bankId].sampleCount) throw new Error(`${asset.id} exceeds bank ${asset.bankId}.`);
  return deepFreeze({ schema: UI_SFX_CATALOG_SCHEMA, version: UI_SFX_CATALOG_VERSION, id: id(input.id, `${source}.id`), generatedAt: text(input.generatedAt, `${source}.generatedAt`), gapMs: number(input.gapMs, `${source}.gapMs`), ...format, banks, assets, byBank: bankMap, byId: Object.fromEntries(assets.map((asset) => [asset.id, asset])), byCue: Object.fromEntries(assets.map((asset) => [asset.cue, asset])) });
}

export async function loadUiSfxCatalog(source, { fetchImpl = globalThis.fetch?.bind(globalThis) } = {}) {
  if (typeof source !== 'string' && !(source instanceof URL)) return validateUiSfxCatalog(source);
  if (typeof fetchImpl !== 'function') throw new Error('No fetch implementation is available for UI SFX.');
  const response = await fetchImpl(String(source));
  if (!response?.ok) throw new Error(`Unable to load UI SFX catalog (${response?.status ?? 'unknown'}).`);
  return validateUiSfxCatalog(await response.json(), { source: String(source) });
}

const POLICY = Object.freeze({
  [AUDIO_EVENT_IDS.UNIT_SELECTION]: [AUDIO_EVENT_PRIORITIES.NORMAL, 2, 'ui-selection', 3],
  [AUDIO_EVENT_IDS.UNIT_ACKNOWLEDGEMENT]: [AUDIO_EVENT_PRIORITIES.NORMAL, 3, 'ui-acknowledgement', 2],
  [AUDIO_EVENT_IDS.PRODUCTION_QUEUED]: [AUDIO_EVENT_PRIORITIES.NORMAL, 1, 'ui-queue', 4],
  [AUDIO_EVENT_IDS.PRODUCTION_COMPLETE]: [AUDIO_EVENT_PRIORITIES.HIGH, 2, 'ui-complete', 3],
  [AUDIO_EVENT_IDS.RESEARCH_COMPLETE]: [AUDIO_EVENT_PRIORITIES.HIGH, 2, 'ui-complete', 3],
  [AUDIO_EVENT_IDS.UNIT_ERROR]: [AUDIO_EVENT_PRIORITIES.HIGH, 3, 'ui-error', 2],
  [AUDIO_EVENT_IDS.UI_ERROR]: [AUDIO_EVENT_PRIORITIES.HIGH, 2, 'ui-error', 2],
  [AUDIO_EVENT_IDS.UI_ALERT]: [AUDIO_EVENT_PRIORITIES.CRITICAL, 4, 'ui-alert', 2],
  [AUDIO_EVENT_IDS.OBJECTIVE_UPDATE]: [AUDIO_EVENT_PRIORITIES.HIGH, 5, 'ui-objective', 2],
  [AUDIO_EVENT_IDS.VICTORY]: [AUDIO_EVENT_PRIORITIES.CRITICAL, 60, 'ui-outcome', 1],
  [AUDIO_EVENT_IDS.DEFEAT]: [AUDIO_EVENT_PRIORITIES.CRITICAL, 60, 'ui-outcome', 1],
  [AUDIO_EVENT_IDS.UI_CONFIRM]: [AUDIO_EVENT_PRIORITIES.NORMAL, 1, 'ui-confirm', 4],
  [AUDIO_EVENT_IDS.UI_CANCEL]: [AUDIO_EVENT_PRIORITIES.NORMAL, 1, 'ui-cancel', 3],
});

function mapFor(asset) {
  const [priority, cooldownTicks, key, limit] = POLICY[asset.eventId];
  return createAudioEventMap([{ id: asset.eventId, bus: 'sfx', priority, cooldownTicks, concurrency: { key, limit }, factionMode: 'shared', assets: { shared: [asset.id] }, missingAsset: { policy: 'reject' } }]);
}

export function createUiSfxResolver(value) {
  const catalog = validateUiSfxCatalog(value); const maps = new Map(catalog.assets.map((asset) => [asset.cue, mapFor(asset)]));
  return Object.freeze({ catalog, resolve(cue, request = {}, state = {}) { const asset = catalog.byCue[cue]; if (!asset) return deepFreeze({ ok: false, cue, reason: 'unknown-cue' }); return resolveAudioEvent(maps.get(cue), { ...request, id: asset.eventId }, state); }, admit(events, state) { return selectAudioAdmissions(events, state); } });
}

function requireMixer(mixer) { if (!mixer || ['decodeAudioData', 'playBuffer', 'snapshot'].some((method) => typeof mixer[method] !== 'function')) throw new TypeError('UI SFX runtime requires a compatible audio mixer.'); return mixer; }
export async function createUiSfxRuntime({ mixer, catalogSource, fetchImpl, digestImpl = null, bankFactory = buildUiSfxBanks } = {}) {
  const audioMixer = requireMixer(mixer); if (catalogSource === undefined) throw new TypeError('UI SFX runtime requires catalogSource.'); if (digestImpl !== null && typeof digestImpl !== 'function') throw new TypeError('digestImpl must be null or a function.');
  const catalog = await loadUiSfxCatalog(catalogSource, { fetchImpl }); const resolver = createUiSfxResolver(catalog); const buffers = new Map(); const failures = new Map(); const lastPlayedTicks = {};
  function snapshot() { return deepFreeze({ catalogId: catalog.id, assetCount: catalog.assets.length, loadedBankIds: [...buffers.keys()].sort(), loadedAssetIds: catalog.assets.filter((asset) => buffers.has(asset.bankId)).map((asset) => asset.id).sort(), failures: Object.fromEntries([...failures.entries()].sort()), lastPlayedTicks: { ...lastPlayedTicks } }); }
  async function preload() {
    let generated; try { generated = bankFactory(); if (!generated || !Array.isArray(generated.banks)) throw new TypeError('UI SFX synthesis must return banks.'); } catch (error) { for (const bank of catalog.banks) failures.set(bank.id, error instanceof Error ? error.message : String(error)); return snapshot(); }
    const byId = new Map(generated.banks.map((bank) => [bank.id, bank]));
    for (const bank of catalog.banks) { if (buffers.has(bank.id)) continue; failures.delete(bank.id); try { const output = byId.get(bank.id); if (!output || !(output.bytes instanceof Uint8Array)) throw new Error('synthesis bank missing'); const data = output.bytes.buffer.slice(output.bytes.byteOffset, output.bytes.byteOffset + output.bytes.byteLength); if (data.byteLength !== bank.byteLength) throw new Error('byte length mismatch'); if (digestImpl && await digestImpl(data) !== bank.sha256) throw new Error('SHA-256 mismatch'); const decoded = await audioMixer.decodeAudioData(data); if (!decoded?.ok || !decoded.buffer) throw new Error(`decode failed: ${decoded?.reason ?? 'unknown'}`); buffers.set(bank.id, decoded.buffer); } catch (error) { failures.set(bank.id, error instanceof Error ? error.message : String(error)); } }
    return snapshot();
  }
  function play(cue, request = {}) {
    const asset = catalog.byCue[cue]; if (!asset) return deepFreeze({ ok: false, cue, reason: 'unknown-cue' });
    try { const mixerState = audioMixer.snapshot(); const counts = {}; for (const voice of mixerState.voices ?? []) if (voice.tag) counts[voice.tag] = (counts[voice.tag] ?? 0) + 1; const availableAssetIds = catalog.assets.filter((entry) => buffers.has(entry.bankId)).map((entry) => entry.id); const resolved = resolver.resolve(cue, request, { availableAssetIds, lastPlayedTicks, activeCounts: counts }); if (!resolved.ok) return resolved; const admission = resolver.admit([resolved], { availableVoiceSlots: Math.max(0, mixerState.maxVoices - mixerState.activeVoiceCount), lastPlayedTicks, activeCounts: counts }); if (!admission.accepted.length) return deepFreeze({ ok: false, cue, eventId: resolved.eventId, reason: admission.rejected[0]?.reason ?? 'rejected' }); const buffer = buffers.get(asset.bankId); if (!buffer) return deepFreeze({ ok: false, cue, eventId: resolved.eventId, reason: 'missing-buffer' }); const playback = audioMixer.playBuffer({ buffer, bus: resolved.bus, volume: resolved.gain, tag: resolved.concurrencyKey, offset: asset.offsetSeconds, duration: asset.durationSeconds }); if (!playback.ok) return deepFreeze({ ...playback, cue, eventId: resolved.eventId, assetId: resolved.assetId }); lastPlayedTicks[resolved.eventId] = resolved.tick; return deepFreeze({ ok: true, cue, eventId: resolved.eventId, assetId: resolved.assetId, voiceId: playback.id, gain: resolved.gain, bus: resolved.bus, tag: resolved.concurrencyKey, offset: asset.offsetSeconds, duration: asset.durationSeconds }); } catch (error) { return deepFreeze({ ok: false, cue, reason: error instanceof TypeError || error instanceof RangeError ? 'invalid-request' : 'runtime-error' }); }
  }
  return Object.freeze({ catalog, preload, play, snapshot });
}

export function installUiSfxDomainAdapter({ events, runtime } = {}) {
  if (!events || typeof events.subscribe !== 'function') throw new TypeError('UI SFX adapter requires a domain event stream.'); if (!runtime || typeof runtime.play !== 'function') throw new TypeError('UI SFX adapter requires a UI SFX runtime.');
  return events.subscribe(DOMAIN_EVENT_TYPES.AUDIO, (event) => { const payload = event.payload ?? {}; if (typeof payload.cue !== 'string' || !payload.cue) return; try { runtime.play(payload.cue, { tick: event.tick, sequence: event.sequence, gain: payload.gain ?? 1, variantKey: payload.variantKey ?? null }); } catch { /* presentation failures must not escape */ } });
}
