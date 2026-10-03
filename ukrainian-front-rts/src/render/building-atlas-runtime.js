import { TEAM } from '../config.js';
import { buildingAtlasAnimation, buildingAtlasFaction } from './building-atlas.js';
import { generateBuildingArt } from './building-atlas-generator.js';
import { loadSpriteAtlas } from './sprite-atlas-runtime.js';

export const BUILDING_ART_SOURCE_URL = new URL(
  '../../art-src/buildings/building-art-source.json',
  import.meta.url,
);

export const ACTIVE_BUILDING_ATLAS_IDS = Object.freeze({
  [TEAM.UA]: Object.freeze({
    hq: 'ua.command-post',
    depot: 'ua.logistics-hub',
    barracks: 'ua.infantry-center',
    workshop: 'ua.motor-pool',
  }),
  [TEAM.RU]: Object.freeze({
    hq: 'ru.regimental-command',
    depot: 'ru.supply-depot',
    barracks: 'ru.motor-rifle-barracks',
    workshop: 'ru.armored-park',
  }),
});

const CANONICAL_IDS = new Set(Object.values(ACTIVE_BUILDING_ATLAS_IDS).flatMap((record) => Object.values(record)));

function svgDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function progressFraction(building) {
  const progress = building?.constructionProgress;
  if (progress && Number.isFinite(progress.requiredWork) && progress.requiredWork > 0) {
    const completed = Number(progress.completedWork ?? progress.appliedWork ?? progress.workApplied ?? 0);
    return Math.max(0, Math.min(1, completed / progress.requiredWork));
  }
  const hp = Number(building?.hp);
  const maxHp = Number(building?.maxHp);
  if (Number.isFinite(hp) && Number.isFinite(maxHp) && maxHp > 0) {
    return Math.max(0, Math.min(1, hp / maxHp));
  }
  return 0;
}

export function resolveBuildingAtlasId(type, team) {
  if (typeof type !== 'string' || !type) return null;
  if (CANONICAL_IDS.has(type)) return type;
  return ACTIVE_BUILDING_ATLAS_IDS[team]?.[type] ?? null;
}

export function buildingAtlasStateForEntity(building) {
  if (!building || typeof building !== 'object') return 'idle';
  const lifecyclePhase = building.buildingLifecycleState?.phase;
  if (lifecyclePhase === 'rubble') return 'rubble';
  if (['destroyed', 'scuttled'].includes(lifecyclePhase) || Number(building.hp) <= 0) return 'destruction';
  if (building.underConstruction) {
    const fraction = progressFraction(building);
    if (fraction < 0.25) return 'foundation';
    if (fraction < 0.65) return 'frame';
    return 'fitout';
  }
  const hp = Number(building.hp);
  const maxHp = Number(building.maxHp);
  if (Number.isFinite(hp) && Number.isFinite(maxHp) && maxHp > 0) {
    const integrity = Math.max(0, hp / maxHp);
    if (integrity <= 0.3) return 'critical';
    if (integrity <= 0.65) return 'damaged';
  }
  if (
    lifecyclePhase === 'capturing'
    || (Array.isArray(building.queue) && building.queue.length > 0)
    || (Array.isArray(building.researchQueue) && building.researchQueue.length > 0)
    || building.productionActive === true
  ) return 'active';
  return 'idle';
}

export function buildingAtlasElapsedMs(building, state, gameTimeSeconds = 0) {
  if (state === 'destruction') {
    const started = Number(building?.destructionStartedAt ?? building?.destroyedAt);
    if (Number.isFinite(started)) return Math.max(0, (Number(gameTimeSeconds) - started) * 1000);
  }
  return Math.max(0, Number(gameTimeSeconds) || 0) * 1000;
}

export function buildingAtlasScale(buildingStats, zoom = 1) {
  const width = Number(buildingStats?.w);
  const footprintScale = Number.isFinite(width) && width > 0 ? width / 88 : 1;
  return Math.max(0.72, Math.min(1.28, footprintScale)) * Math.max(0.05, Number(zoom) || 1);
}

export async function loadBuildingAtlasSet({
  source = BUILDING_ART_SOURCE_URL,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  imageFactory,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('No fetch implementation is available for building art.');
  const response = await fetchImpl(String(source));
  if (!response?.ok) {
    throw new Error(`Unable to load building art source: ${String(source)} (${response?.status ?? 'unknown'})`);
  }
  const generated = generateBuildingArt(await response.json());
  const entries = await Promise.all(generated.atlases.map(async (atlas) => {
    const manifest = {
      ...atlas.manifestValue,
      image: { ...atlas.manifestValue.image, src: svgDataUrl(atlas.svg) },
    };
    const runtime = await loadSpriteAtlas(manifest, { fetchImpl, imageFactory });
    return [atlas.faction, Object.freeze({
      ...runtime,
      source: generated.source,
      generatedSvgBytes: atlas.svg.length,
    })];
  }));
  return Object.freeze(Object.fromEntries(entries));
}

export function buildingAtlasAnimationId(type, team, state = 'idle') {
  const buildingId = resolveBuildingAtlasId(type, team);
  if (!buildingId) return null;
  return buildingAtlasAnimation(buildingId, state);
}

export function buildingAtlasRuntimeFor(runtimes, buildingId) {
  if (!buildingId || !runtimes) return null;
  return runtimes[buildingAtlasFaction(buildingId)] ?? null;
}
