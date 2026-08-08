import { loadSpriteAtlas } from './sprite-atlas-runtime.js';
import {
  generateRussianInfantryAtlas,
  RUSSIAN_INFANTRY_DIRECTIONS,
  RUSSIAN_INFANTRY_REQUIRED_STATES,
} from './russian-infantry-atlas-generator.js';

export { RUSSIAN_INFANTRY_DIRECTIONS };

export const RUSSIAN_INFANTRY_SOURCE_URL = new URL(
  '../../art-src/units/russia/infantry/russian-infantry-source.json',
  import.meta.url,
);

export const RUSSIAN_INFANTRY_STATES = RUSSIAN_INFANTRY_REQUIRED_STATES;
export const RUSSIAN_INFANTRY_UNIT_IDS = Object.freeze([
  'ru.engineer-sappers',
  'ru.command-group',
  'ru.motor-rifle-squad',
  'ru.assault-group.shock',
  'ru.assault-group.anti-armor',
  'ru.scout-section',
  'ru.medical-team',
  'ru.air-defense-team',
]);
export const RUSSIAN_INFANTRY_TYPE_ALIASES = Object.freeze({
  'ru.engineer-sappers': 'ru.engineer-sappers',
  ruEngineer: 'ru.engineer-sappers',
  'ru.command-group': 'ru.command-group',
  ruCommand: 'ru.command-group',
  'ru.motor-rifle-squad': 'ru.motor-rifle-squad',
  ruInfantry: 'ru.motor-rifle-squad',
  'ru.assault-group.shock': 'ru.assault-group.shock',
  ruAssault: 'ru.assault-group.shock',
  'ru.assault-group.anti-armor': 'ru.assault-group.anti-armor',
  ruAntiArmor: 'ru.assault-group.anti-armor',
  'ru.scout-section': 'ru.scout-section',
  ruRecon: 'ru.scout-section',
  'ru.medical-team': 'ru.medical-team',
  ruMedic: 'ru.medical-team',
  'ru.air-defense-team': 'ru.air-defense-team',
  ruAirDefense: 'ru.air-defense-team',
});

const ROLE_TO_UNIT_ID = Object.freeze({
  engineering: 'ru.engineer-sappers',
  engineer: 'ru.engineer-sappers',
  worker: 'ru.engineer-sappers',
  'command-support': 'ru.command-group',
  command: 'ru.command-group',
  'line-infantry': 'ru.motor-rifle-squad',
  infantry: 'ru.motor-rifle-squad',
  assault: 'ru.assault-group.shock',
  'anti-armor': 'ru.assault-group.anti-armor',
  reconnaissance: 'ru.scout-section',
  recon: 'ru.scout-section',
  medical: 'ru.medical-team',
  medic: 'ru.medical-team',
  'air-defense': 'ru.air-defense-team',
  airdefense: 'ru.air-defense-team',
});

function svgDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function hasRussianIdentity(type, stats) {
  const identifiers = [type, stats?.id, stats?.rosterNodeId, stats?.visual];
  if (identifiers.some((candidate) => typeof candidate === 'string' && (
    RUSSIAN_INFANTRY_TYPE_ALIASES[candidate] || candidate.startsWith('ru.') || /^ru[A-Z]/.test(candidate)
  ))) return true;
  return [stats?.faction, stats?.factionId, stats?.side]
    .some((candidate) => typeof candidate === 'string' && candidate.trim().toLowerCase() === 'russia');
}

export function resolveRussianInfantryAtlasUnitId(type, stats = null) {
  for (const candidate of [type, stats?.id, stats?.rosterNodeId, stats?.visual]) {
    if (typeof candidate !== 'string') continue;
    const resolved = RUSSIAN_INFANTRY_TYPE_ALIASES[candidate];
    if (resolved) return resolved;
  }
  if (!hasRussianIdentity(type, stats)) return null;
  for (const candidate of [stats?.roleId, stats?.role, stats?.archetype]) {
    if (typeof candidate !== 'string') continue;
    const normalized = candidate.trim().toLowerCase().replaceAll('_', '-');
    if (ROLE_TO_UNIT_ID[normalized]) return ROLE_TO_UNIT_ID[normalized];
  }
  if (stats?.worker) return 'ru.engineer-sappers';
  if (stats?.medic) return 'ru.medical-team';
  return null;
}

export function russianInfantryDirectionFromAngle(angleRadians) {
  if (!Number.isFinite(angleRadians)) return RUSSIAN_INFANTRY_DIRECTIONS[0];
  const index = Math.round((angleRadians + Math.PI / 2) / (Math.PI / 4));
  const normalized = ((index % RUSSIAN_INFANTRY_DIRECTIONS.length) + RUSSIAN_INFANTRY_DIRECTIONS.length) % RUSSIAN_INFANTRY_DIRECTIONS.length;
  return RUSSIAN_INFANTRY_DIRECTIONS[normalized];
}

export function russianInfantryStateForEntity(entity) {
  if (!entity || typeof entity !== 'object') return 'idle';
  if (entity.wreck === true || entity.destroyed === true) return 'wreck';
  if (entity.dying === true || entity.death === true || entity.hp <= 0) return 'death';
  if (Number(entity.flash) > 0 || entity.firing === true) return 'attack';
  if (entity.hit === true || entity.hitFlash === true || Number(entity.recentHit) > 0) return 'hit';
  const hp = Number(entity.hp);
  const maxHp = Number(entity.maxHp);
  if (Number.isFinite(hp) && Number.isFinite(maxHp) && maxHp > 0 && hp / maxHp < 0.48) return 'damaged';
  if (entity.order || entity.moving === true || Math.hypot(Number(entity.vx) || 0, Number(entity.vy) || 0) > 0.01) return 'move';
  return 'idle';
}

export function russianInfantryAnimationId(unitId, state = 'idle') {
  const resolved = RUSSIAN_INFANTRY_TYPE_ALIASES[unitId] ?? unitId;
  const visualState = RUSSIAN_INFANTRY_STATES.includes(state) ? state : 'idle';
  return `${resolved}.${visualState}`;
}

export function russianInfantryPortraitFrameId(unitId) {
  return `${RUSSIAN_INFANTRY_TYPE_ALIASES[unitId] ?? unitId}.portrait`;
}

export function russianInfantryIconFrameId(unitId) {
  return `${RUSSIAN_INFANTRY_TYPE_ALIASES[unitId] ?? unitId}.icon`;
}

export function russianInfantryAnimationElapsedMs(entity, state, gameTimeSeconds = 0) {
  if (state === 'attack') {
    const flash = Math.max(0, Math.min(0.1, Number(entity?.flash) || 0));
    return (1 - flash / 0.1) * 275;
  }
  if (state === 'hit') return Math.max(0, (1 - Math.min(1, Number(entity?.recentHit) || 0)) * 155);
  return Math.max(0, Number(gameTimeSeconds) || 0) * 1000;
}

export async function loadRussianInfantryAtlas({
  source = RUSSIAN_INFANTRY_SOURCE_URL,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  imageFactory,
  fallbackRuntime = null,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('No fetch implementation is available for Russian infantry art.');
  const response = await fetchImpl(String(source));
  if (!response?.ok) throw new Error(`Unable to load Russian infantry art source: ${String(source)} (${response?.status ?? 'unknown'})`);
  const generated = generateRussianInfantryAtlas(await response.json());
  const manifest = {
    ...generated.manifestObject,
    image: { ...generated.manifestObject.image, src: svgDataUrl(generated.svg) },
  };
  const runtime = await loadSpriteAtlas(manifest, { fetchImpl, imageFactory, fallbackRuntime });
  return Object.freeze({
    ...runtime,
    catalog: generated.catalogObject,
    source: generated.source,
    generatedSvgBytes: generated.svg.length,
  });
}
