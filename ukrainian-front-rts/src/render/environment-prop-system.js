export const ENVIRONMENT_PROP_SYSTEM_VERSION = 1;
export const ENVIRONMENT_PROP_ATLAS_ID = 'fields-of-resolve.environment-props.v1';
export const ENVIRONMENT_PROP_TILE_SIZE = 32;

export const ENVIRONMENT_PROP_FAMILIES = Object.freeze([
  'shelterbelt',
  'tree',
  'wall',
  'fence',
  'house',
  'industrial',
  'crater',
  'wreckage',
]);

export const ENVIRONMENT_PROP_LAYERS = Object.freeze([
  'ground-decal',
  'low-prop',
  'unit-height',
  'tall-occluder',
  'canopy-roof-fade',
  'foreground-effect',
]);

export const ENVIRONMENT_PROP_STATES = Object.freeze([
  'intact',
  'damaged',
  'disabled',
  'burning',
  'destroyed',
  'wreck',
  'salvaged',
  'cleared',
]);

export const ENVIRONMENT_PROP_SEASONS = Object.freeze([
  'green',
  'dry',
  'autumn',
  'leafless',
  'wet',
  'snow',
  'burned',
]);

export const ENVIRONMENT_PROP_BIOMES = Object.freeze(['donbas', 'zaporizhzhia', 'kherson']);
export const ENVIRONMENT_PROP_BLOCKING_LAYERS = Object.freeze(['air', 'amphibious', 'ground']);

const LAYER_RANK = Object.freeze(Object.fromEntries(
  ENVIRONMENT_PROP_LAYERS.map((layer, index) => [layer, index]),
));
const FAMILY_SET = new Set(ENVIRONMENT_PROP_FAMILIES);
const BIOME_SET = new Set(ENVIRONMENT_PROP_BIOMES);
const BLOCKING_LAYER_SET = new Set(ENVIRONMENT_PROP_BLOCKING_LAYERS);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function deepCloneJson(value, path = 'value') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${path} must contain only finite numbers.`);
    return value;
  }
  if (Array.isArray(value)) return value.map((entry, index) => deepCloneJson(entry, `${path}[${index}]`));
  if (value && typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      const child = value[key];
      if (child === undefined || typeof child === 'function' || typeof child === 'symbol' || typeof child === 'bigint') {
        throw new TypeError(`${path}.${key} must be JSON-compatible.`);
      }
      result[key] = deepCloneJson(child, `${path}.${key}`);
    }
    return result;
  }
  throw new TypeError(`${path} must be JSON-compatible.`);
}

const palette = (values) => deepFreeze(values);

export const ENVIRONMENT_PROP_BIOME_PALETTES = deepFreeze({
  donbas: palette({
    foliage: '#53684a', foliageLight: '#73805b', foliageDry: '#78704c', foliageAutumn: '#8d6241',
    bark: '#41362b', wood: '#725c43', masonry: '#827b69', roof: '#5a5144', metal: '#737b77',
    rust: '#8c5638', earth: '#665b43', mud: '#4d463a', snow: '#d8ddd4', ink: '#111512',
    flame: '#ef9c42', diagnostic: '#ff4fa3', highlight: '#d5c17a',
  }),
  zaporizhzhia: palette({
    foliage: '#68704a', foliageLight: '#85845b', foliageDry: '#8b794b', foliageAutumn: '#96633d',
    bark: '#4b3d2d', wood: '#7a6142', masonry: '#91816a', roof: '#665645', metal: '#7d8178',
    rust: '#955b38', earth: '#786648', mud: '#584a39', snow: '#dedfd4', ink: '#111512',
    flame: '#f0a042', diagnostic: '#ff4fa3', highlight: '#dac57b',
  }),
  kherson: palette({
    foliage: '#54705a', foliageLight: '#779071', foliageDry: '#7f774f', foliageAutumn: '#956a43',
    bark: '#45372a', wood: '#755d42', masonry: '#8a8170', roof: '#5e5548', metal: '#76817e',
    rust: '#8f583b', earth: '#6f6248', mud: '#4d493e', snow: '#d7ddd8', ink: '#111512',
    flame: '#f1a34b', diagnostic: '#ff4fa3', highlight: '#d8c681',
  }),
});

const profile = ({
  aliases,
  footprint,
  canvas,
  layer,
  states,
  seasons,
  variants,
  occlusion = null,
}) => deepFreeze({ aliases, footprint, canvas, layer, states, seasons, variants, occlusion });

export const ENVIRONMENT_PROP_PROFILES = deepFreeze({
  shelterbelt: profile({
    aliases: ['shelterbelt', 'windbreak', 'tree-line', 'hedgerow'],
    footprint: { width: 2, height: 1 }, canvas: { width: 72, height: 72 }, layer: 'tall-occluder',
    states: ['intact', 'damaged', 'destroyed'], seasons: ['green', 'dry', 'autumn', 'leafless', 'snow'], variants: 3,
    occlusion: { mode: 'fade', alpha: 0.38, region: { x: 2, y: 2, w: 68, h: 54 }, outline: true },
  }),
  tree: profile({
    aliases: ['tree', 'deciduous-tree', 'conifer', 'orchard-tree'],
    footprint: { width: 1, height: 1 }, canvas: { width: 56, height: 72 }, layer: 'tall-occluder',
    states: ['intact', 'damaged', 'destroyed'], seasons: ['green', 'dry', 'autumn', 'leafless', 'snow'], variants: 3,
    occlusion: { mode: 'fade', alpha: 0.36, region: { x: 3, y: 2, w: 50, h: 52 }, outline: true },
  }),
  wall: profile({
    aliases: ['wall', 'brick-wall', 'concrete-wall', 'revetment'],
    footprint: { width: 1, height: 1 }, canvas: { width: 40, height: 40 }, layer: 'low-prop',
    states: ['intact', 'damaged', 'destroyed'], seasons: ['dry', 'wet', 'snow'], variants: 2,
  }),
  fence: profile({
    aliases: ['fence', 'wire-fence', 'wood-fence', 'field-fence'],
    footprint: { width: 1, height: 1 }, canvas: { width: 40, height: 40 }, layer: 'low-prop',
    states: ['intact', 'damaged', 'destroyed'], seasons: ['dry', 'wet', 'snow'], variants: 2,
  }),
  house: profile({
    aliases: ['house', 'farmhouse', 'village-house', 'residential'],
    footprint: { width: 2, height: 2 }, canvas: { width: 76, height: 88 }, layer: 'tall-occluder',
    states: ['intact', 'damaged', 'destroyed'], seasons: ['dry', 'wet', 'snow'], variants: 2,
    occlusion: { mode: 'cutaway', alpha: 0.32, region: { x: 4, y: 4, w: 68, h: 62 }, outline: true },
  }),
  industrial: profile({
    aliases: ['industrial', 'tank', 'pipe-rack', 'warehouse-prop', 'machine-yard'],
    footprint: { width: 2, height: 2 }, canvas: { width: 88, height: 88 }, layer: 'tall-occluder',
    states: ['intact', 'damaged', 'destroyed'], seasons: ['dry', 'wet', 'snow'], variants: 2,
    occlusion: { mode: 'fade', alpha: 0.4, region: { x: 4, y: 4, w: 80, h: 62 }, outline: true },
  }),
  crater: profile({
    aliases: ['crater', 'shell-crater', 'blast-mark', 'scorch'],
    footprint: { width: 1, height: 1 }, canvas: { width: 36, height: 32 }, layer: 'ground-decal',
    states: ['intact'], seasons: ['dry', 'wet', 'snow'], variants: 3,
  }),
  wreckage: profile({
    aliases: ['wreckage', 'wreck', 'vehicle-wreck', 'debris-field', 'rubble-wreck'],
    footprint: { width: 2, height: 1 }, canvas: { width: 72, height: 56 }, layer: 'unit-height',
    states: ['intact', 'disabled', 'burning', 'destroyed', 'wreck', 'salvaged', 'cleared'],
    seasons: ['dry', 'wet', 'snow', 'burned'], variants: 3,
  }),
});

export const ENVIRONMENT_PROP_PROVENANCE = deepFreeze({
  creator: 'Fields of Resolve contributors',
  createdAt: '2026-08-04',
  source: 'Original repository-authored deterministic vector geometry',
  license: 'CC0-1.0',
  redistribution: 'allowed',
  generatedTools: {
    used: false,
    details: 'No generative image tool or external commercial-game asset was used.',
    humanCorrections: 'Geometry, palettes, state coverage, fade regions, and variants were manually designed and reviewed.',
  },
});

const TYPE_TO_FAMILY = deepFreeze(Object.fromEntries(
  Object.entries(ENVIRONMENT_PROP_PROFILES).flatMap(([family, value]) => (
    value.aliases.map((alias) => [alias, family])
  )),
));

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string.`);
  return value.trim();
}

function requireCell(value, label) {
  if (!value || !Number.isInteger(value.x) || !Number.isInteger(value.y) || value.x < 0 || value.y < 0) {
    throw new TypeError(`${label} must contain non-negative integer x and y.`);
  }
  return deepFreeze({ x: value.x, y: value.y });
}

function requireFootprint(value, fallback, label) {
  const source = value ?? fallback;
  if (!source || !Number.isInteger(source.width) || !Number.isInteger(source.height) || source.width <= 0 || source.height <= 0) {
    throw new TypeError(`${label} must contain positive integer width and height.`);
  }
  return deepFreeze({ width: source.width, height: source.height });
}

function normalizeBlockingLayers(value) {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) throw new TypeError('prop.blockingLayers must be an array.');
  const result = [...new Set(value.map((entry) => requireString(entry, 'blocking layer')))].sort();
  if (result.some((entry) => !BLOCKING_LAYER_SET.has(entry))) {
    throw new TypeError('prop.blockingLayers contains an unknown movement layer.');
  }
  return Object.freeze(result);
}

export function environmentPropFamilyForType(type) {
  const normalized = requireString(type, 'prop.type').toLowerCase();
  return TYPE_TO_FAMILY[normalized] ?? null;
}

export function environmentPropBiome(value = 'donbas') {
  const normalized = requireString(value, 'environment biome').toLowerCase();
  if (!BIOME_SET.has(normalized)) throw new TypeError(`Unknown environment biome: ${value}.`);
  return normalized;
}

function defaultSeason(profileValue, biome) {
  if (profileValue.seasons.includes('green') && biome !== 'zaporizhzhia') return 'green';
  if (profileValue.seasons.includes('dry')) return 'dry';
  return profileValue.seasons[0];
}

function normalizedLifecycleToken(value) {
  const source = typeof value === 'string'
    ? value
    : value?.phase ?? value?.state ?? value?.condition ?? value?.lifecycle ?? null;
  if (source == null) return 'intact';
  const token = String(source).trim().toLowerCase();
  const aliases = {
    active: 'intact', healthy: 'intact', operational: 'intact', complete: 'intact',
    rubble: 'wreck', salvaged: 'salvaged', cleared: 'cleared',
  };
  return aliases[token] ?? token;
}

export function environmentPropState(family, lifecycle = 'intact') {
  if (!FAMILY_SET.has(family)) throw new TypeError(`Unknown environment prop family: ${family}.`);
  const profileValue = ENVIRONMENT_PROP_PROFILES[family];
  const token = normalizedLifecycleToken(lifecycle);
  if (profileValue.states.includes(token)) return token;
  const fallbackOrder = {
    damaged: ['damaged', 'intact'],
    disabled: ['disabled', 'damaged', 'intact'],
    burning: ['burning', 'damaged', 'destroyed', 'intact'],
    destroyed: ['destroyed', 'wreck', 'damaged', 'intact'],
    wreck: ['wreck', 'destroyed', 'damaged', 'intact'],
    salvaged: ['salvaged', 'destroyed', 'intact'],
    cleared: ['cleared'],
  }[token] ?? ['intact'];
  const resolved = fallbackOrder.find((candidate) => profileValue.states.includes(candidate));
  if (resolved) return resolved;
  throw new TypeError(`Unsupported lifecycle state ${token} for ${family}.`);
}

export function stableEnvironmentPropHash(...parts) {
  let hash = 2166136261;
  for (const character of parts.join('|')) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function environmentPropFrameId({ biome, family, state, season, variant }) {
  const normalizedBiome = environmentPropBiome(biome);
  if (!FAMILY_SET.has(family)) throw new TypeError(`Unknown environment prop family: ${family}.`);
  const profileValue = ENVIRONMENT_PROP_PROFILES[family];
  if (!profileValue.states.includes(state) || state === 'cleared') {
    throw new TypeError(`State ${state} has no visible frame for ${family}.`);
  }
  if (!profileValue.seasons.includes(season)) throw new TypeError(`Season ${season} is unsupported for ${family}.`);
  if (!Number.isInteger(variant) || variant < 0 || variant >= profileValue.variants) {
    throw new TypeError(`Variant must be an integer in [0, ${profileValue.variants}).`);
  }
  return `environment.${normalizedBiome}.${family}.${state}.${season}.v${variant}`;
}

function fallbackPresentation(prop, reason, biome) {
  const id = requireString(prop.id, 'prop.id');
  const type = requireString(prop.type, 'prop.type');
  const cell = requireCell(prop.cell, 'prop.cell');
  const footprint = requireFootprint(prop.footprint, { width: 1, height: 1 }, 'prop.footprint');
  const blockingLayers = normalizeBlockingLayers(prop.blockingLayers);
  const metadata = deepFreeze(deepCloneJson(prop.metadata ?? {}, 'prop.metadata'));
  return deepFreeze({
    schemaVersion: ENVIRONMENT_PROP_SYSTEM_VERSION,
    id, type, family: 'missing', biome, state: 'intact', season: 'diagnostic', variant: 0,
    cell, footprint, blockingLayers, metadata,
    layer: 'low-prop', layerRank: LAYER_RANK['low-prop'],
    frameId: 'environment.missing', visible: true, fallback: true, diagnosticReason: reason,
    canvas: { width: 32, height: 32 }, anchor: { x: 16, y: 32 },
    masks: { footprint: { x: 1, y: 18, w: 30, h: 13 } }, occlusion: null,
    depth: cell.y + footprint.height,
  });
}

export function projectEnvironmentProp(prop, {
  biome = prop?.metadata?.biome ?? 'donbas',
  season = prop?.metadata?.season ?? null,
  lifecycle = prop?.metadata?.lifecycle ?? prop?.metadata?.state ?? 'intact',
  mapId = 'map',
} = {}) {
  if (!prop || typeof prop !== 'object' || Array.isArray(prop)) throw new TypeError('prop must be an object.');
  const normalizedBiome = environmentPropBiome(biome);
  const id = requireString(prop.id, 'prop.id');
  const type = requireString(prop.type, 'prop.type');
  const cell = requireCell(prop.cell, 'prop.cell');
  const family = environmentPropFamilyForType(type);
  if (!family) return fallbackPresentation(prop, `Unknown authored prop type: ${type}.`, normalizedBiome);
  const profileValue = ENVIRONMENT_PROP_PROFILES[family];
  const footprint = requireFootprint(prop.footprint, profileValue.footprint, 'prop.footprint');
  const blockingLayers = normalizeBlockingLayers(prop.blockingLayers);
  const metadata = deepFreeze(deepCloneJson(prop.metadata ?? {}, 'prop.metadata'));
  const state = environmentPropState(family, lifecycle);
  const selectedSeason = season == null ? defaultSeason(profileValue, normalizedBiome) : String(season).trim().toLowerCase();
  if (!profileValue.seasons.includes(selectedSeason)) {
    return fallbackPresentation(prop, `Unsupported season ${selectedSeason} for ${family}.`, normalizedBiome);
  }
  const variant = stableEnvironmentPropHash(mapId, normalizedBiome, id, type, cell.x, cell.y, state, selectedSeason) % profileValue.variants;
  const visible = state !== 'cleared';
  const frameId = visible
    ? environmentPropFrameId({ biome: normalizedBiome, family, state, season: selectedSeason, variant })
    : null;
  return deepFreeze({
    schemaVersion: ENVIRONMENT_PROP_SYSTEM_VERSION,
    id, type, family, biome: normalizedBiome, state, season: selectedSeason, variant,
    cell, footprint, blockingLayers, metadata,
    layer: profileValue.layer, layerRank: LAYER_RANK[profileValue.layer], frameId, visible,
    fallback: false, diagnosticReason: null,
    canvas: profileValue.canvas,
    anchor: { x: profileValue.canvas.width / 2, y: profileValue.canvas.height },
    masks: {
      footprint: {
        x: Math.max(0, Math.floor((profileValue.canvas.width - footprint.width * ENVIRONMENT_PROP_TILE_SIZE) / 2)),
        y: Math.max(0, profileValue.canvas.height - footprint.height * ENVIRONMENT_PROP_TILE_SIZE),
        w: Math.min(profileValue.canvas.width, footprint.width * ENVIRONMENT_PROP_TILE_SIZE),
        h: Math.min(profileValue.canvas.height, footprint.height * ENVIRONMENT_PROP_TILE_SIZE),
      },
      ...(profileValue.occlusion ? { occlusion: profileValue.occlusion.region } : {}),
    },
    occlusion: profileValue.occlusion,
    depth: cell.y + footprint.height,
  });
}

export function compareEnvironmentPropPresentation(left, right) {
  return left.layerRank - right.layerRank
    || left.depth - right.depth
    || left.cell.x - right.cell.x
    || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

export function projectEnvironmentProps(props, options = {}) {
  if (!Array.isArray(props)) throw new TypeError('props must be an array.');
  const ids = new Set();
  const result = props.map((prop) => {
    const projected = projectEnvironmentProp(prop, options);
    if (ids.has(projected.id)) throw new TypeError(`Duplicate environment prop id: ${projected.id}.`);
    ids.add(projected.id);
    return projected;
  });
  result.sort(compareEnvironmentPropPresentation);
  return Object.freeze(result);
}

function cellInsideFootprint(cell, prop) {
  return cell
    && Number.isInteger(cell.x)
    && Number.isInteger(cell.y)
    && cell.x >= prop.cell.x
    && cell.y >= prop.cell.y
    && cell.x < prop.cell.x + prop.footprint.width
    && cell.y < prop.cell.y + prop.footprint.height;
}

export function environmentPropVisibility(prop, {
  focusCell = null,
  selected = false,
  forceReveal = false,
} = {}) {
  if (!prop || prop.schemaVersion !== ENVIRONMENT_PROP_SYSTEM_VERSION) {
    throw new TypeError('Environment prop visibility requires a projected prop.');
  }
  if (!prop.visible) return deepFreeze({ draw: false, alpha: 0, cutaway: false, outline: false });
  if (!prop.occlusion) return deepFreeze({ draw: true, alpha: 1, cutaway: false, outline: false });
  const reveal = Boolean(forceReveal || selected || cellInsideFootprint(focusCell, prop));
  return deepFreeze({
    draw: true,
    alpha: reveal ? prop.occlusion.alpha : 1,
    cutaway: reveal && prop.occlusion.mode === 'cutaway',
    outline: reveal && Boolean(prop.occlusion.outline),
  });
}

export function validateEnvironmentPropPresentation(value) {
  const errors = [];
  if (!value || typeof value !== 'object') return ['presentation must be an object'];
  if (value.schemaVersion !== ENVIRONMENT_PROP_SYSTEM_VERSION) errors.push(`schemaVersion must be ${ENVIRONMENT_PROP_SYSTEM_VERSION}`);
  if (typeof value.id !== 'string' || !value.id) errors.push('id must be a non-empty string');
  if (value.family !== 'missing' && !FAMILY_SET.has(value.family)) errors.push(`unknown family: ${value.family}`);
  if (!BIOME_SET.has(value.biome)) errors.push(`unknown biome: ${value.biome}`);
  if (!ENVIRONMENT_PROP_LAYERS.includes(value.layer)) errors.push(`unknown layer: ${value.layer}`);
  if (!Number.isInteger(value.cell?.x) || !Number.isInteger(value.cell?.y)) errors.push('cell must contain integer x and y');
  if (!Number.isInteger(value.footprint?.width) || value.footprint.width <= 0) errors.push('footprint.width must be positive');
  if (!Number.isInteger(value.footprint?.height) || value.footprint.height <= 0) errors.push('footprint.height must be positive');
  if (!Array.isArray(value.blockingLayers) || value.blockingLayers.some((entry) => !BLOCKING_LAYER_SET.has(entry))) {
    errors.push('blockingLayers must contain known movement layers');
  }
  if (value.visible && (typeof value.frameId !== 'string' || !value.frameId)) errors.push('visible props require a frameId');
  if (!value.visible && value.frameId !== null) errors.push('hidden props require frameId null');
  if (value.layer === 'tall-occluder' && !value.occlusion) errors.push('tall occluders require occlusion metadata');
  return errors;
}
