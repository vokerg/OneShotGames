import { loadSpriteAtlas } from './sprite-atlas-runtime.js';
import {
  generateRussianVehicleAtlas,
  RUSSIAN_VEHICLE_DIRECTIONS,
  RUSSIAN_VEHICLE_REQUIRED_STATES,
} from './russian-vehicle-atlas-generator.js';

export { RUSSIAN_VEHICLE_DIRECTIONS };

export const RUSSIAN_VEHICLE_SOURCE_URL = new URL(
  '../../art-src/units/russia/vehicles/russian-vehicle-source.json',
  import.meta.url,
);

export const RUSSIAN_VEHICLE_STATES = RUSSIAN_VEHICLE_REQUIRED_STATES;
export const RUSSIAN_VEHICLE_UNIT_IDS = Object.freeze([
  'ru.apc-carrier',
  'ru.apc-ifv',
  'ru.tank-breakthrough',
  'ru.repair-tractor',
  'ru.engineering-vehicle.breacher',
]);
export const RUSSIAN_VEHICLE_TYPE_ALIASES = Object.freeze({
  'ru.apc-carrier': 'ru.apc-carrier',
  ruApc: 'ru.apc-carrier',
  'ru.apc-ifv': 'ru.apc-ifv',
  ruIfv: 'ru.apc-ifv',
  'ru.tank-breakthrough': 'ru.tank-breakthrough',
  ruTank: 'ru.tank-breakthrough',
  'ru.repair-tractor': 'ru.repair-tractor',
  ruRecovery: 'ru.repair-tractor',
  'ru.engineering-vehicle.breacher': 'ru.engineering-vehicle.breacher',
  ruEngineeringVehicle: 'ru.engineering-vehicle.breacher',
});

const ROLE_TO_UNIT_ID = Object.freeze({
  'mass-protected-transport': 'ru.apc-carrier', apc: 'ru.apc-carrier', transport: 'ru.apc-carrier',
  'infantry-fighting-vehicle': 'ru.apc-ifv', ifv: 'ru.apc-ifv',
  'breakthrough-tank': 'ru.tank-breakthrough', 'main-battle-tank': 'ru.tank-breakthrough', tank: 'ru.tank-breakthrough',
  'armored-recovery': 'ru.repair-tractor', recovery: 'ru.repair-tractor', repair: 'ru.repair-tractor',
  'combat-engineering-vehicle': 'ru.engineering-vehicle.breacher', engineering: 'ru.engineering-vehicle.breacher',
});

function svgDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function hasRussianIdentity(type, stats) {
  const identifiers = [type, stats?.id, stats?.rosterNodeId, stats?.visual];
  if (identifiers.some((candidate) => typeof candidate === 'string' && (
    RUSSIAN_VEHICLE_TYPE_ALIASES[candidate] || candidate.startsWith('ru.') || /^ru[A-Z]/.test(candidate)
  ))) return true;
  return [stats?.faction, stats?.factionId, stats?.side]
    .some((candidate) => typeof candidate === 'string' && candidate.trim().toLowerCase() === 'russia');
}

export function resolveRussianVehicleAtlasUnitId(type, stats = null) {
  for (const candidate of [type, stats?.id, stats?.rosterNodeId, stats?.visual]) {
    if (typeof candidate !== 'string') continue;
    const resolved = RUSSIAN_VEHICLE_TYPE_ALIASES[candidate];
    if (resolved) return resolved;
  }
  if (!hasRussianIdentity(type, stats)) return null;
  for (const candidate of [stats?.roleId, stats?.role, stats?.archetype]) {
    if (typeof candidate !== 'string') continue;
    const normalized = candidate.trim().toLowerCase().replaceAll('_', '-');
    if (ROLE_TO_UNIT_ID[normalized]) return ROLE_TO_UNIT_ID[normalized];
  }
  return null;
}

export function russianVehicleDirectionFromAngle(angleRadians) {
  if (!Number.isFinite(angleRadians)) return RUSSIAN_VEHICLE_DIRECTIONS[0];
  const index = Math.round((angleRadians + Math.PI / 2) / (Math.PI / 4));
  const normalized = ((index % RUSSIAN_VEHICLE_DIRECTIONS.length) + RUSSIAN_VEHICLE_DIRECTIONS.length) % RUSSIAN_VEHICLE_DIRECTIONS.length;
  return RUSSIAN_VEHICLE_DIRECTIONS[normalized];
}

export function russianVehicleStateForEntity(entity) {
  if (!entity || typeof entity !== 'object') return 'idle';
  if (entity.wreck === true || entity.destroyed === true) return 'wreck';
  if (entity.dying === true || entity.death === true || entity.hp <= 0) return 'death';
  if (Number(entity.flash) > 0 || entity.firing === true) return 'attack';
  if (entity.hit === true || entity.hitFlash === true || Number(entity.recentHit) > 0) return 'hit';
  const hp = Number(entity.hp);
  const maxHp = Number(entity.maxHp);
  if (Number.isFinite(hp) && Number.isFinite(maxHp) && maxHp > 0 && hp / maxHp < 0.5) return 'damaged';
  if (entity.order || entity.moving === true || Math.hypot(Number(entity.vx) || 0, Number(entity.vy) || 0) > 0.01) return 'move';
  return 'idle';
}

export function russianVehicleAnimationId(unitId, state = 'idle') {
  const resolved = RUSSIAN_VEHICLE_TYPE_ALIASES[unitId] ?? unitId;
  const visualState = RUSSIAN_VEHICLE_STATES.includes(state) ? state : 'idle';
  return `${resolved}.${visualState}`;
}
export function russianVehiclePortraitFrameId(unitId) { return `${RUSSIAN_VEHICLE_TYPE_ALIASES[unitId] ?? unitId}.portrait`; }
export function russianVehicleIconFrameId(unitId) { return `${RUSSIAN_VEHICLE_TYPE_ALIASES[unitId] ?? unitId}.icon`; }

export function russianVehicleAnimationElapsedMs(entity, state, gameTimeSeconds = 0) {
  if (state === 'attack') {
    const flash = Math.max(0, Math.min(0.1, Number(entity?.flash) || 0));
    return (1 - flash / 0.1) * 310;
  }
  if (state === 'hit') return Math.max(0, (1 - Math.min(1, Number(entity?.recentHit) || 0)) * 180);
  return Math.max(0, Number(gameTimeSeconds) || 0) * 1000;
}

export async function loadRussianVehicleAtlas({
  source = RUSSIAN_VEHICLE_SOURCE_URL,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  imageFactory,
  fallbackRuntime = null,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('No fetch implementation is available for Russian vehicle art.');
  const response = await fetchImpl(String(source));
  if (!response?.ok) throw new Error(`Unable to load Russian vehicle art source: ${String(source)} (${response?.status ?? 'unknown'})`);
  const generated = generateRussianVehicleAtlas(await response.json());
  const manifest = { ...generated.manifestObject, image: { ...generated.manifestObject.image, src: svgDataUrl(generated.svg) } };
  const runtime = await loadSpriteAtlas(manifest, { fetchImpl, imageFactory, fallbackRuntime });
  return Object.freeze({ ...runtime, catalog: generated.catalogObject, source: generated.source, generatedSvgBytes: generated.svg.length });
}