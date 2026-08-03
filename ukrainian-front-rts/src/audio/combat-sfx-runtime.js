import { DOMAIN_EVENT_TYPES } from '../core/events.js';
import { createCombatSfxResolver, loadCombatSfxCatalog, validateCombatSfxCatalog } from './combat-sfx-catalog.js';

function requireMixer(mixer) { const methods = ['decodeAudioData', 'playBuffer', 'snapshot']; if (!mixer || methods.some((method) => typeof mixer[method] !== 'function')) throw new TypeError('Combat SFX runtime requires a compatible audio mixer.'); return mixer; }
function relativeAssetUrl(sourceUrl, path, baseUrl) { if (sourceUrl) return new URL(path, sourceUrl).href; if (baseUrl) return new URL(path, baseUrl).href; return path; }
async function defaultDigest(arrayBuffer) { if (!globalThis.crypto?.subtle) throw new Error('Web Crypto SHA-256 is unavailable.'); const digest = await globalThis.crypto.subtle.digest('SHA-256', arrayBuffer); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join(''); }

export async function createCombatSfxRuntime({ mixer, catalogSource, fetchImpl = globalThis.fetch?.bind(globalThis), baseUrl = null, digestImpl = defaultDigest } = {}) {
  const audioMixer = requireMixer(mixer);
  if (typeof digestImpl !== 'function') throw new TypeError('Combat SFX runtime digestImpl must be a function.');
  if (catalogSource === undefined) throw new TypeError('Combat SFX runtime requires catalogSource.');
  const loaded = await loadCombatSfxCatalog(catalogSource, { fetchImpl });
  const catalog = validateCombatSfxCatalog(loaded.catalog);
  const resolver = createCombatSfxResolver(catalog);
  const buffers = new Map(); const failures = new Map(); const lastPlayedTicks = {};

  async function preload() {
    if (typeof fetchImpl !== 'function') throw new Error('No fetch implementation is available for combat SFX assets.');
    for (const bank of catalog.banks) {
      if (buffers.has(bank.id) || failures.has(bank.id)) continue;
      try {
        const url = relativeAssetUrl(loaded.sourceUrl, bank.path, baseUrl); const response = await fetchImpl(url);
        if (!response?.ok) throw new Error(`HTTP ${response?.status ?? 'unknown'}`);
        const data = await response.arrayBuffer();
        if (data.byteLength !== bank.byteLength) throw new Error(`byte length ${data.byteLength} !== ${bank.byteLength}`);
        if (await digestImpl(data) !== bank.sha256) throw new Error('SHA-256 mismatch');
        const decoded = await audioMixer.decodeAudioData(data);
        if (!decoded?.ok || !decoded.buffer) throw new Error(`decode failed: ${decoded?.reason ?? 'unknown'}`);
        buffers.set(bank.id, decoded.buffer);
      } catch (error) { failures.set(bank.id, error instanceof Error ? error.message : String(error)); }
    }
    return snapshot();
  }

  function activeCounts(mixerSnapshot) { const counts = {}; for (const voice of mixerSnapshot.voices ?? []) { if (!voice.tag) continue; counts[voice.tag] = (counts[voice.tag] ?? 0) + 1; } return counts; }
  function play(cue, request = {}) {
    const asset = catalog.byCue[cue]; if (!asset) return Object.freeze({ ok: false, cue, reason: 'unknown-cue' });
    const mixerSnapshot = audioMixer.snapshot();
    const availableAssetIds = catalog.assets.filter((entry) => buffers.has(entry.bankId)).map((entry) => entry.id).sort();
    const resolved = resolver.resolve(cue, request, { availableAssetIds, lastPlayedTicks, activeCounts: activeCounts(mixerSnapshot) });
    if (!resolved.ok) return resolved;
    const admission = resolver.admit([resolved], { availableVoiceSlots: Math.max(0, mixerSnapshot.maxVoices - mixerSnapshot.activeVoiceCount), lastPlayedTicks, activeCounts: activeCounts(mixerSnapshot) });
    if (!admission.accepted.length) { const rejected = admission.rejected[0]; return Object.freeze({ ok: false, cue, eventId: resolved.eventId, reason: rejected?.reason ?? 'rejected', retryAtTick: rejected?.retryAtTick ?? null }); }
    const buffer = buffers.get(asset.bankId); if (!buffer) return Object.freeze({ ok: false, cue, eventId: resolved.eventId, reason: 'missing-buffer' });
    const playback = audioMixer.playBuffer({ buffer, bus: resolved.bus, volume: resolved.gain, tag: resolved.concurrencyKey, offset: asset.offsetSeconds, duration: asset.durationSeconds });
    if (!playback.ok) return Object.freeze({ ...playback, cue, eventId: resolved.eventId, assetId: resolved.assetId });
    lastPlayedTicks[resolved.eventId] = resolved.tick;
    return Object.freeze({ ok: true, cue, eventId: resolved.eventId, assetId: resolved.assetId, voiceId: playback.id, gain: resolved.gain, bus: resolved.bus, tag: resolved.concurrencyKey, offset: asset.offsetSeconds, duration: asset.durationSeconds });
  }
  function snapshot() { return Object.freeze({ catalogId: catalog.id, assetCount: catalog.assets.length, loadedBankIds: Object.freeze([...buffers.keys()].sort()), loadedAssetIds: Object.freeze(catalog.assets.filter((asset) => buffers.has(asset.bankId)).map((asset) => asset.id).sort()), failures: Object.freeze(Object.fromEntries([...failures.entries()].sort())), lastPlayedTicks: Object.freeze({ ...lastPlayedTicks }) }); }
  return Object.freeze({ catalog, preload, play, snapshot });
}

export function installCombatSfxDomainAdapter({ events, runtime } = {}) {
  if (!events || typeof events.subscribe !== 'function') throw new TypeError('Combat SFX adapter requires a domain event stream.');
  if (!runtime || typeof runtime.play !== 'function') throw new TypeError('Combat SFX adapter requires a combat SFX runtime.');
  return events.subscribe(DOMAIN_EVENT_TYPES.AUDIO, (event) => { const payload = event.payload ?? {}; if (typeof payload.cue !== 'string' || !payload.cue) return; runtime.play(payload.cue, { tick: event.tick, sequence: event.sequence, faction: payload.faction ?? null, distance: payload.distance ?? 0, gain: payload.gain ?? 1, variantKey: payload.variantKey ?? null }); });
}
