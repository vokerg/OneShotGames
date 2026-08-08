import { loadSpriteAtlas } from './sprite-atlas-runtime.js';
import {
  generateUkrainianVehicleAtlas,
  UKRAINIAN_VEHICLE_DIRECTIONS,
  UKRAINIAN_VEHICLE_REQUIRED_STATES,
} from './ukrainian-vehicle-atlas-generator.js';

export { UKRAINIAN_VEHICLE_DIRECTIONS };

export const UKRAINIAN_VEHICLE_SOURCE_URL = new URL(
  '../../art-src/units/ukraine/vehicles/ukrainian-vehicle-source.json',
  import.meta.url,
);

export const UKRAINIAN_VEHICLE_STATES = UKRAINIAN_VEHICLE_REQUIRED_STATES;
export const UKRAINIAN_VEHICLE_UNIT_IDS = Object.freeze([
  'ua.protected-mobility.apc',
  'ua.protected-mobility.ifv',
  'ua.tank.main-battle',
  'ua.recovery-vehicle.armored-recovery',
  'ua.breaching-section.engineering-vehicle',
]);
export const UKRAINIAN_VEHICLE_TYPE_ALIASES = Object.freeze({
  'ua.protected-mobility.apc': 'ua.protected-mobility.apc',
  uaApc: 'ua.protected-mobility.apc',
  'ua.protected-mobility.ifv': 'ua.protected-mobility.ifv',
  uaIfv: 'ua.protected-mobility.ifv',
  'ua.tank.main-battle': 'ua.tank.main-battle',
  uaTank: 'ua.tank.main-battle',
  'ua.recovery-vehicle.armored-recovery': 'ua.recovery-vehicle.armored-recovery',
  uaRecovery: 'ua.recovery-vehicle.armored-recovery',
  'ua.breaching-section.engineering-vehicle': 'ua.breaching-section.engineering-vehicle',
  uaEngineeringVehicle: 'ua.breaching-section.engineering-vehicle',
});

const ROLE_TO_UNIT_ID = Object.freeze({
  'protected-transport': 'ua.protected-mobility.apc',
  apc: 'ua.protected-mobility.apc',
  transport: 'ua.protected-mobility.apc',
  'infantry-fighting-vehicle': 'ua.protected-mobility.ifv',
  ifv: 'ua.protected-mobility.ifv',
  'main-battle-tank': 'ua.tank.main-battle',
  tank: 'ua.tank.main-battle',
  'armored-recovery': 'ua.recovery-vehicle.armored-recovery',
  recovery: 'ua.recovery-vehicle.armored-recovery',
  'combat-engineering-vehicle': 'ua.breaching-section.engineering-vehicle',
  engineering: 'ua.breaching-section.engineering-vehicle',
});

function svgDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function hasUkrainianIdentity(type, stats) {
  const identifiers = [type, stats?.id, stats?.rosterNodeId, stats?.visual];
  if (identifiers.some((candidate) => typeof candidate === 'string' && (
    UKRAINIAN_VEHICLE_TYPE_ALIASES[candidate] || candidate.startsWith('ua.') || /^ua[A-Z]/.test(candidate)
  ))) return true;
  return [stats?.faction, stats?.factionId, stats?.side]
    .some((candidate) => typeof candidate === 'string' && candidate.trim().toLowerCase() === 'ukraine');
}

export function resolveUkrainianVehicleAtlasUnitId(type, stats = null) {
  for (const candidate of [type, stats?.id, stats?.rosterNodeId, stats?.visual]) {
    if (typeof candidate !== 'string') continue;
    const resolved = UKRAINIAN_VEHICLE_TYPE_ALIASES[candidate];
    if (resolved) return resolved;
  }
  if (!hasUkrainianIdentity(type, stats)) return null;
  for (const candidate of [stats?.roleId, stats?.role, stats?.archetype]) {
    if (typeof candidate !== 'string') continue;
    const normalized = candidate.trim().toLowerCase().replaceAll('_', '-');
    if (ROLE_TO_UNIT_ID[normalized]) return ROLE_TO_UNIT_ID[normalized];
  }
  return null;
}

export function ukrainianVehicleDirectionFromAngle(angleRadians) {
  if (!Number.isFinite(angleRadians)) return UKRAINIAN_VEHICLE_DIRECTIONS[0];
  const index = Math.round((angleRadians + Math.PI / 2) / (Math.PI / 4));
  const normalized = ((index % UKRAINIAN_VEHICLE_DIRECTIONS.length) + UKRAINIAN_VEHICLE_DIRECTIONS.length) % UKRAINIAN_VEHICLE_DIRECTIONS.length;
  return UKRAINIAN_VEHICLE_DIRECTIONS[normalized];
}

export function ukrainianVehicleStateForEntity(entity) {
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

export function ukrainianVehicleAnimationId(unitId, state = 'idle') {
  const resolved = UKRAINIAN_VEHICLE_TYPE_ALIASES[unitId] ?? unitId;
  const visualState = UKRAINIAN_VEHICLE_STATES.includes(state) ? state : 'idle';
  return `${resolved}.${visualState}`;
}

export function ukrainianVehiclePortraitFrameId(unitId) {
  return `${UKRAINIAN_VEHICLE_TYPE_ALIASES[unitId] ?? unitId}.portrait`;
}

export function ukrainianVehicleIconFrameId(unitId) {
  return `${UKRAINIAN_VEHICLE_TYPE_ALIASES[unitId] ?? unitId}.icon`;
}

export function ukrainianVehicleAnimationElapsedMs(entity, state, gameTimeSeconds = 0) {
  if (state === 'attack') {
    const flash = Math.max(0, Math.min(0.1, Number(entity?.flash) || 0));
    return (1 - flash / 0.1) * 310;
  }
  if (state === 'hit') return Math.max(0, (1 - Math.min(1, Number(entity?.recentHit) || 0)) * 180);
  return Math.max(0, Number(gameTimeSeconds) || 0) * 1000;
}

export async function loadUkrainianVehicleAtlas({
  source = UKRAINIAN_VEHICLE_SOURCE_URL,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  imageFactory,
  fallbackRuntime = null,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('No fetch implementation is available for Ukrainian vehicle art.');
  const response = await fetchImpl(String(source));
  if (!response?.ok) throw new Error(`Unable to load Ukrainian vehicle art source: ${String(source)} (${response?.status ?? 'unknown'})`);
  const generated = generateUkrainianVehicleAtlas(await response.json());
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
