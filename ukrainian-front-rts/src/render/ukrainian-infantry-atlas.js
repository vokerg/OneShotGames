import { loadSpriteAtlas } from './sprite-atlas-runtime.js';
import {
  generateUkrainianInfantryAtlas,
  UKRAINIAN_INFANTRY_DIRECTIONS,
  UKRAINIAN_INFANTRY_REQUIRED_STATES,
} from './ukrainian-infantry-atlas-generator.js';

export { UKRAINIAN_INFANTRY_DIRECTIONS };

export const UKRAINIAN_INFANTRY_SOURCE_URL = new URL(
  '../../art-src/units/ukraine/infantry/ukrainian-infantry-source.json',
  import.meta.url,
);

export const UKRAINIAN_INFANTRY_STATES = UKRAINIAN_INFANTRY_REQUIRED_STATES;
export const UKRAINIAN_INFANTRY_UNIT_IDS = Object.freeze([
  'ua.combat-engineers',
  'ua.line-infantry',
  'ua.anti-armor-team',
  'ua.recon-team',
  'ua.casevac-team',
  'ua.mobile-sam',
  'ua.command-team',
]);
export const UKRAINIAN_INFANTRY_TYPE_ALIASES = Object.freeze({
  'ua.combat-engineers': 'ua.combat-engineers',
  uaEngineer: 'ua.combat-engineers',
  'ua.line-infantry': 'ua.line-infantry',
  uaInfantry: 'ua.line-infantry',
  'ua.anti-armor-team': 'ua.anti-armor-team',
  uaAntiArmor: 'ua.anti-armor-team',
  'ua.recon-team': 'ua.recon-team',
  uaRecon: 'ua.recon-team',
  'ua.casevac-team': 'ua.casevac-team',
  uaMedic: 'ua.casevac-team',
  'ua.mobile-sam': 'ua.mobile-sam',
  uaAirDefense: 'ua.mobile-sam',
  'ua.command-team': 'ua.command-team',
  uaCommand: 'ua.command-team',
});

const ROLE_TO_UNIT_ID = Object.freeze({
  engineer: 'ua.combat-engineers',
  worker: 'ua.combat-engineers',
  infantry: 'ua.line-infantry',
  'line-infantry': 'ua.line-infantry',
  'anti-armor': 'ua.anti-armor-team',
  reconnaissance: 'ua.recon-team',
  recon: 'ua.recon-team',
  medic: 'ua.casevac-team',
  medical: 'ua.casevac-team',
  'air-defense': 'ua.mobile-sam',
  'command-support': 'ua.command-team',
  command: 'ua.command-team',
});

function candidateStrings(type, stats) {
  return [type, stats?.id, stats?.rosterNodeId, stats?.visual]
    .filter((value) => typeof value === 'string' && value.length > 0);
}

function hasUkrainianIdentity(type, stats) {
  if (candidateStrings(type, stats).some((candidate) => (
    UKRAINIAN_INFANTRY_TYPE_ALIASES[candidate]
    || candidate.startsWith('ua.')
    || /^ua[A-Z]/.test(candidate)
  ))) return true;
  return [stats?.faction, stats?.factionId, stats?.side]
    .some((candidate) => typeof candidate === 'string' && candidate.trim().toLowerCase() === 'ukraine');
}

function svgDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function resolveUkrainianInfantryAtlasUnitId(type, stats = null) {
  for (const candidate of candidateStrings(type, stats)) {
    const resolved = UKRAINIAN_INFANTRY_TYPE_ALIASES[candidate];
    if (resolved) return resolved;
  }
  if (!hasUkrainianIdentity(type, stats)) return null;
  for (const candidate of [stats?.roleId, stats?.role, stats?.archetype]) {
    if (typeof candidate !== 'string') continue;
    const normalized = candidate.trim().toLowerCase().replaceAll('_', '-');
    if (ROLE_TO_UNIT_ID[normalized]) return ROLE_TO_UNIT_ID[normalized];
  }
  if (stats?.worker === true) return 'ua.combat-engineers';
  if (stats?.medic === true) return 'ua.casevac-team';
  return null;
}

export function resolveUkrainianInfantryIdentity(type, stats = {}, catalog = null) {
  const catalogResolved = typeof type === 'string' ? catalog?.aliases?.[type] : null;
  return catalogResolved ?? resolveUkrainianInfantryAtlasUnitId(type, stats);
}

export function ukrainianInfantryDirectionFromAngle(angleRadians) {
  if (!Number.isFinite(angleRadians)) return UKRAINIAN_INFANTRY_DIRECTIONS[0];
  const index = Math.round((angleRadians + Math.PI / 2) / (Math.PI / 4));
  const normalized = ((index % UKRAINIAN_INFANTRY_DIRECTIONS.length)
    + UKRAINIAN_INFANTRY_DIRECTIONS.length) % UKRAINIAN_INFANTRY_DIRECTIONS.length;
  return UKRAINIAN_INFANTRY_DIRECTIONS[normalized];
}

export function ukrainianInfantryStateForEntity(entity) {
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

export function ukrainianInfantryVisualState(entity) {
  return ukrainianInfantryStateForEntity(entity);
}

export function ukrainianInfantryAnimationId(unitId, state = 'idle') {
  const resolvedUnitId = UKRAINIAN_INFANTRY_TYPE_ALIASES[unitId] ?? unitId;
  const resolvedState = UKRAINIAN_INFANTRY_STATES.includes(state) ? state : 'idle';
  return `${resolvedUnitId}.${resolvedState}`;
}

export function ukrainianInfantryPortraitFrameId(unitId) {
  const resolvedUnitId = UKRAINIAN_INFANTRY_TYPE_ALIASES[unitId] ?? unitId;
  return `${resolvedUnitId}.portrait`;
}

export function ukrainianInfantryIconFrameId(unitId) {
  const resolvedUnitId = UKRAINIAN_INFANTRY_TYPE_ALIASES[unitId] ?? unitId;
  return `${resolvedUnitId}.icon`;
}

export function ukrainianInfantryAnimationElapsedMs(entity, state, gameTimeSeconds = 0) {
  if (state === 'attack') {
    const flash = Math.max(0, Math.min(0.1, Number(entity?.flash) || 0));
    return (1 - flash / 0.1) * 300;
  }
  if (state === 'hit') return Math.max(0, (1 - Math.min(1, Number(entity?.recentHit) || 0)) * 150);
  return Math.max(0, Number(gameTimeSeconds) || 0) * 1000;
}

export async function loadUkrainianInfantryAtlas({
  source = UKRAINIAN_INFANTRY_SOURCE_URL,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  imageFactory,
  fallbackRuntime = null,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('No fetch implementation is available for Ukrainian infantry art.');
  const response = await fetchImpl(String(source));
  if (!response?.ok) {
    throw new Error(`Unable to load Ukrainian infantry art source: ${String(source)} (${response?.status ?? 'unknown'})`);
  }
  const generated = generateUkrainianInfantryAtlas(await response.json());
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
