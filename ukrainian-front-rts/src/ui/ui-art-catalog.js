export const UI_ART_SCHEMA = 'fields-of-resolve.ui-art-catalog';
export const UI_ART_VERSION = 1;
export const UI_ART_SHEET_PATH = 'assets/ui/ui-art-symbols.svg';
export const UI_ART_SOURCE_PATH = 'art-src/ui/ui-art-source.json';

const ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const FAMILY = /^[a-z][a-zA-Z0-9]*$/;

const UNIT_IDS = Object.freeze([
  'ruArtillery',
  'ruCommandBastion',
  'ruDrone',
  'ruEngineer',
  'ruIfv',
  'ruInfantry',
  'ruMedic',
  'ruTank',
  'uaArtillery',
  'uaCommandVarta',
  'uaDrone',
  'uaEngineer',
  'uaIfv',
  'uaInfantry',
  'uaMedic',
  'uaTank',
]);

const BUILDING_IDS = Object.freeze(['barracks', 'depot', 'hq', 'workshop']);

const ABILITY_IDS = Object.freeze([
  'address',
  'barrage',
  'buildBarracks',
  'buildDepot',
  'buildWorkshop',
  'combinedArms',
  'counterBattery',
  'deployInfantry',
  'fieldDress',
  'grenade',
  'rally',
  'reconPulse',
  'smokeLaunchers',
  'strike',
]);

const UPGRADE_IDS = Object.freeze([
  'activeProtection',
  'cageArmor',
  'digitalC2',
  'mineRoller',
  'natoAmmo',
  'thermal',
]);

const OBJECTIVE_IDS = Object.freeze([
  'build',
  'capture',
  'defend',
  'destroy',
  'disable',
  'escort',
  'extract',
  'gather',
  'recon',
  'rescue',
  'survive',
]);

export const UI_CURSOR_IDS = Object.freeze([
  'attack',
  'attackMove',
  'buildInvalid',
  'buildValid',
  'embark',
  'follow',
  'garrison',
  'gather',
  'guard',
  'holdPosition',
  'move',
  'patrol',
  'repair',
  'select',
  'targetEntity',
  'targetGround',
]);

export const UI_PING_IDS = Object.freeze([
  'ally',
  'friendly',
  'hostile',
  'neutral',
  'objective',
  'productionComplete',
  'researchComplete',
  'underAttack',
]);

export const UI_MEDAL_IDS = Object.freeze([
  'combinedArms',
  'economyDiscipline',
  'forcePreservation',
  'missionVictory',
  'noLosses',
  'optionalObjectives',
  'rapidCompletion',
  'reconnaissance',
]);

export const UI_ART_CANONICAL_IDS = Object.freeze({
  portraits: UNIT_IDS,
  unitIcons: UNIT_IDS,
  buildingIcons: BUILDING_IDS,
  abilityIcons: ABILITY_IDS,
  upgradeIcons: UPGRADE_IDS,
  objectiveIcons: OBJECTIVE_IDS,
  cursors: UI_CURSOR_IDS,
  pings: UI_PING_IDS,
  medals: UI_MEDAL_IDS,
});

export const UI_ART_PALETTE = Object.freeze({
  ink: '#111512',
  panel: '#202820',
  neutral: '#9aa291',
  pale: '#d8dfcf',
  ukrainePrimary: '#3978ad',
  ukraineSecondary: '#e0c75b',
  russiaPrimary: '#7c5043',
  russiaSecondary: '#c9b998',
  selection: '#ffe47b',
  objective: '#d5ad4f',
  danger: '#d65c46',
  benefit: '#58a88b',
  unavailable: '#6d746b',
});

const FAMILY_SPECS = Object.freeze({
  portraits: Object.freeze({ width: 144, height: 112, role: 'portrait', pixelRatios: Object.freeze([1, 2]) }),
  unitIcons: Object.freeze({ width: 32, height: 32, role: 'unit-icon', pixelRatios: Object.freeze([1, 2]) }),
  buildingIcons: Object.freeze({ width: 32, height: 32, role: 'building-icon', pixelRatios: Object.freeze([1, 2]) }),
  abilityIcons: Object.freeze({ width: 32, height: 32, role: 'ability-icon', pixelRatios: Object.freeze([1, 2]) }),
  upgradeIcons: Object.freeze({ width: 32, height: 32, role: 'upgrade-icon', pixelRatios: Object.freeze([1, 2]) }),
  objectiveIcons: Object.freeze({ width: 32, height: 32, role: 'objective-icon', pixelRatios: Object.freeze([1, 2]) }),
  cursors: Object.freeze({ width: 32, height: 32, role: 'cursor', pixelRatios: Object.freeze([1, 2]) }),
  pings: Object.freeze({ width: 48, height: 48, role: 'ping', pixelRatios: Object.freeze([1, 2]) }),
  medals: Object.freeze({ width: 64, height: 64, role: 'medal', pixelRatios: Object.freeze([1, 2]) }),
  fallback: Object.freeze({ width: 32, height: 32, role: 'fallback', pixelRatios: Object.freeze([1, 2]) }),
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function fragment(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function factionFor(id) {
  if (id.startsWith('ua')) return 'ukraine';
  if (id.startsWith('ru')) return 'russia';
  return 'shared';
}

function hotspotFor(id) {
  const presets = {
    attack: { x: 16, y: 16 },
    attackMove: { x: 16, y: 16 },
    buildInvalid: { x: 4, y: 4 },
    buildValid: { x: 4, y: 4 },
    embark: { x: 16, y: 16 },
    follow: { x: 16, y: 16 },
    garrison: { x: 16, y: 16 },
    gather: { x: 6, y: 6 },
    guard: { x: 16, y: 16 },
    holdPosition: { x: 16, y: 16 },
    move: { x: 4, y: 4 },
    patrol: { x: 16, y: 16 },
    repair: { x: 6, y: 6 },
    select: { x: 4, y: 4 },
    targetEntity: { x: 16, y: 16 },
    targetGround: { x: 16, y: 16 },
  };
  return presets[id] ?? { x: 0, y: 0 };
}

function createEntry(family, id, index) {
  if (!FAMILY.test(family)) throw new TypeError(`Invalid UI art family: ${family}`);
  if (!ID.test(id)) throw new TypeError(`Invalid UI art ID: ${id}`);
  const spec = FAMILY_SPECS[family];
  if (!spec) throw new RangeError(`Unknown UI art family: ${family}`);
  const entry = {
    family,
    id,
    key: `${family}:${id}`,
    symbolId: `ui-${fragment(family)}-${fragment(id)}`,
    width: spec.width,
    height: spec.height,
    viewBox: `0 0 ${spec.width} ${spec.height}`,
    role: spec.role,
    faction: factionFor(id),
    pixelRatios: [...spec.pixelRatios],
    order: index,
  };
  if (family === 'cursors') entry.hotspot = hotspotFor(id);
  if (family === 'pings') {
    entry.durationMs = 900;
    entry.reducedMotion = 'static';
  }
  if (family === 'portraits') entry.safeArea = { x: 12, y: 8, w: 120, h: 92 };
  return deepFreeze(entry);
}

const assets = [];
for (const [family, ids] of Object.entries(UI_ART_CANONICAL_IDS)) {
  ids.forEach((id, index) => assets.push(createEntry(family, id, index)));
}
assets.push(createEntry('fallback', 'missing', 0));

const byKey = Object.create(null);
for (const asset of assets) {
  if (byKey[asset.key]) throw new Error(`Duplicate UI art key: ${asset.key}`);
  byKey[asset.key] = asset;
}

const familyCounts = Object.freeze(
  Object.fromEntries(
    Object.keys(FAMILY_SPECS).map((family) => [
      family,
      assets.filter((asset) => asset.family === family).length,
    ]),
  ),
);

export const UI_ART_CATALOG = deepFreeze({
  schema: UI_ART_SCHEMA,
  version: UI_ART_VERSION,
  id: 'fields-of-resolve-ui-art-v1',
  sheet: UI_ART_SHEET_PATH,
  source: UI_ART_SOURCE_PATH,
  palette: UI_ART_PALETTE,
  families: FAMILY_SPECS,
  familyCounts,
  assets,
  byKey,
  fallbackKey: 'fallback:missing',
  provenance: {
    creator: 'OneShotGames contributors',
    source: 'Repository-authored deterministic vector recipes',
    license: 'CC0-1.0',
    redistribution: 'allowed',
    generator: 'scripts/build-ui-art.mjs',
    externalInputs: [],
    syntheticPeople: false,
    fictionalSubjectsOnly: true,
  },
});

export function listUiArtAssets(family = null) {
  if (family === null) return UI_ART_CATALOG.assets;
  if (!FAMILY_SPECS[family]) throw new RangeError(`Unknown UI art family: ${family}`);
  return Object.freeze(UI_ART_CATALOG.assets.filter((asset) => asset.family === family));
}

export function resolveUiArtAsset(family, id) {
  const exact = UI_ART_CATALOG.byKey[`${family}:${id}`];
  if (exact) return Object.freeze({ status: 'found', requested: `${family}:${id}`, asset: exact });
  return Object.freeze({
    status: 'fallback',
    requested: `${family}:${id}`,
    asset: UI_ART_CATALOG.byKey[UI_ART_CATALOG.fallbackKey],
  });
}

export function uiArtHref(assetOrResult) {
  const asset = assetOrResult?.asset ?? assetOrResult;
  if (!asset || typeof asset.symbolId !== 'string') throw new TypeError('UI art href requires a catalog asset.');
  return `${UI_ART_SHEET_PATH}#${asset.symbolId}`;
}

export function validateUiArtCatalog(catalog = UI_ART_CATALOG) {
  if (!catalog || catalog.schema !== UI_ART_SCHEMA || catalog.version !== UI_ART_VERSION) {
    throw new TypeError('Unsupported UI art catalog.');
  }
  const keys = new Set();
  const symbols = new Set();
  for (const asset of catalog.assets) {
    if (!FAMILY_SPECS[asset.family]) throw new Error(`Unknown family for ${asset.key}.`);
    if (keys.has(asset.key)) throw new Error(`Duplicate UI art key: ${asset.key}`);
    if (symbols.has(asset.symbolId)) throw new Error(`Duplicate UI art symbol: ${asset.symbolId}`);
    keys.add(asset.key);
    symbols.add(asset.symbolId);
    const spec = FAMILY_SPECS[asset.family];
    if (asset.width !== spec.width || asset.height !== spec.height) {
      throw new Error(`Dimension drift for ${asset.key}.`);
    }
    if (asset.family === 'cursors') {
      if (!Number.isInteger(asset.hotspot?.x) || !Number.isInteger(asset.hotspot?.y)) {
        throw new Error(`Cursor hotspot missing for ${asset.key}.`);
      }
      if (asset.hotspot.x < 0 || asset.hotspot.y < 0 || asset.hotspot.x >= asset.width || asset.hotspot.y >= asset.height) {
        throw new Error(`Cursor hotspot out of bounds for ${asset.key}.`);
      }
    }
    if (asset.family === 'pings' && (asset.durationMs <= 0 || asset.reducedMotion !== 'static')) {
      throw new Error(`Ping motion contract invalid for ${asset.key}.`);
    }
  }
  for (const [family, ids] of Object.entries(UI_ART_CANONICAL_IDS)) {
    const actual = catalog.assets.filter((asset) => asset.family === family).map((asset) => asset.id);
    if (actual.length !== ids.length || actual.some((id, index) => id !== ids[index])) {
      throw new Error(`Canonical ID drift for ${family}.`);
    }
  }
  if (!catalog.byKey[catalog.fallbackKey]) throw new Error('UI art fallback is missing.');
  return catalog;
}

validateUiArtCatalog();
