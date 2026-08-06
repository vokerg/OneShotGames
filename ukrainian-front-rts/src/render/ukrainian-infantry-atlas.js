import { loadSpriteAtlas } from './sprite-atlas-runtime.js';
import {
  generateUkrainianInfantryAtlas,
  UKRAINIAN_INFANTRY_DIRECTIONS,
  UKRAINIAN_INFANTRY_REQUIRED_STATES,
} from './ukrainian-infantry-atlas-generator.js';

export const UKRAINIAN_INFANTRY_SOURCE_URL = new URL(
  '../../art-src/units/ukraine/infantry/ukrainian-infantry-source.json',
  import.meta.url,
);

const ACTIVE_TYPE_ALIASES = Object.freeze({
  uaEngineer: 'ua.combat-engineers',
  uaInfantry: 'ua.line-infantry',
  uaMedic: 'ua.casevac-team',
  uaAntiArmor: 'ua.anti-armor-team',
  uaRecon: 'ua.recon-team',
  uaAirDefense: 'ua.mobile-sam',
  uaCommand: 'ua.command-team',
});

const ROLE_FALLBACKS = Object.freeze({
  engineer: 'ua.combat-engineers',
  worker: 'ua.combat-engineers',
  medic: 'ua.casevac-team',
  medical: 'ua.casevac-team',
  reconnaissance: 'ua.recon-team',
  recon: 'ua.recon-team',
  'anti-armor': 'ua.anti-armor-team',
  'air-defense': 'ua.mobile-sam',
  command: 'ua.command-team',
  'command-support': 'ua.command-team',
  infantry: 'ua.line-infantry',
  'line-infantry': 'ua.line-infantry',
});

function svgDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function ukrainianInfantryDirectionFromAngle(angle) {
  if (!Number.isFinite(angle)) return UKRAINIAN_INFANTRY_DIRECTIONS[0];
  const turn = Math.PI * 2;
  const normalized = ((angle + Math.PI / 2) % turn + turn) % turn;
  const index = Math.round(normalized / (turn / UKRAINIAN_INFANTRY_DIRECTIONS.length))
    % UKRAINIAN_INFANTRY_DIRECTIONS.length;
  return UKRAINIAN_INFANTRY_DIRECTIONS[index];
}

export function ukrainianInfantryVisualState(entity, stats = {}, gameTime = 0) {
  if (!entity || entity.hp <= 0) return 'wreck';
  if (entity.deathStartedAt != null) {
    return gameTime - entity.deathStartedAt > 0.5 ? 'wreck' : 'death';
  }
  if (entity.hitFlash > 0 || entity.lastHitAt === gameTime) return 'hit';
  if (entity.flash > 0) return 'attack';
  if (entity.hp < entity.maxHp * 0.42) return 'damaged';
  if (entity.order || entity.target) return 'move';
  return stats.defaultVisualState && UKRAINIAN_INFANTRY_REQUIRED_STATES.includes(stats.defaultVisualState)
    ? stats.defaultVisualState
    : 'idle';
}

export function resolveUkrainianInfantryIdentity(type, stats = {}, catalog = null) {
  const aliases = catalog?.aliases ?? ACTIVE_TYPE_ALIASES;
  if (typeof type === 'string' && aliases[type]) return aliases[type];
  if (typeof type === 'string' && catalog?.canonicalUnitIds?.includes(type)) return type;
  const role = stats.role ?? stats.archetype ?? (stats.worker ? 'worker' : stats.medic ? 'medic' : null);
  return ROLE_FALLBACKS[role] ?? (stats.armor || stats.air ? null : 'ua.line-infantry');
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
    image: {
      ...generated.manifestObject.image,
      src: svgDataUrl(generated.svg),
    },
  };
  const runtime = await loadSpriteAtlas(manifest, { fetchImpl, imageFactory, fallbackRuntime });
  return Object.freeze({
    ...runtime,
    catalog: generated.catalogObject,
    source: generated.source,
    generatedSvgBytes: generated.svg.length,
  });
}

export { ACTIVE_TYPE_ALIASES as UKRAINIAN_INFANTRY_ACTIVE_TYPE_ALIASES };
