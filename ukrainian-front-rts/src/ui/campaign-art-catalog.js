export const CAMPAIGN_ART_SCHEMA = 'fields-of-resolve.campaign-art-catalog';
export const CAMPAIGN_ART_VERSION = 1;
export const CAMPAIGN_ART_SHEET_PATH = 'assets/campaign/campaign-art-symbols.svg';
export const CAMPAIGN_ART_SOURCE_PATH = 'art-src/campaign/campaign-art-source.json';

const ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const FAMILY = /^[a-z][a-zA-Z0-9]*$/;

export const CAMPAIGN_OPERATION_IDS = Object.freeze([
  'operation-safe-passage',
  'operation-lantern-gate',
  'operation-silent-ledger',
  'operation-ember-line',
  'operation-iron-horizon',
]);

export const CAMPAIGN_ENDING_IDS = Object.freeze(['victory', 'withdrawal', 'defeat']);
export const CAMPAIGN_CREDITS_IDS = Object.freeze(['campaign', 'contributors']);
export const CAMPAIGN_MEDAL_FRAME_IDS = Object.freeze([
  'combinedArms',
  'economyDiscipline',
  'forcePreservation',
  'missionVictory',
  'noLosses',
  'optionalObjectives',
  'rapidCompletion',
  'reconnaissance',
]);

export const CAMPAIGN_ART_CANONICAL_IDS = Object.freeze({
  operationIllustrations: CAMPAIGN_OPERATION_IDS,
  mapOverlays: CAMPAIGN_OPERATION_IDS,
  briefingPanels: CAMPAIGN_OPERATION_IDS,
  loadingArt: CAMPAIGN_OPERATION_IDS,
  endingPanels: CAMPAIGN_ENDING_IDS,
  creditsVisuals: CAMPAIGN_CREDITS_IDS,
  debriefMedalFrames: CAMPAIGN_MEDAL_FRAME_IDS,
});

export const CAMPAIGN_ART_PALETTE = Object.freeze({
  ink: '#111512',
  panel: '#202820',
  panelRaised: '#2b352b',
  neutral: '#9aa291',
  pale: '#d8dfcf',
  ukrainePrimary: '#3978ad',
  ukraineSecondary: '#e0c75b',
  russiaPrimary: '#7c5043',
  russiaSecondary: '#c9b998',
  objective: '#d5ad4f',
  danger: '#d65c46',
  benefit: '#58a88b',
  route: '#f0d978',
});

const FAMILY_SPECS = Object.freeze({
  operationIllustrations: Object.freeze({ width: 640, height: 360, role: 'operation-illustration' }),
  mapOverlays: Object.freeze({ width: 512, height: 288, role: 'map-overlay' }),
  briefingPanels: Object.freeze({ width: 960, height: 540, role: 'briefing-panel' }),
  loadingArt: Object.freeze({ width: 960, height: 540, role: 'loading-art' }),
  endingPanels: Object.freeze({ width: 960, height: 540, role: 'ending-panel' }),
  creditsVisuals: Object.freeze({ width: 960, height: 540, role: 'credits-visual' }),
  debriefMedalFrames: Object.freeze({ width: 160, height: 200, role: 'debrief-medal-frame' }),
  fallback: Object.freeze({ width: 320, height: 180, role: 'fallback' }),
});

const OPERATION_ALT = Object.freeze({
  'operation-safe-passage': 'Abstract urban evacuation corridor with a protected western route.',
  'operation-lantern-gate': 'Abstract fortified breach with reconnaissance and engineer lanes.',
  'operation-silent-ledger': 'Abstract logistics network linking depots, air defense, and extraction.',
  'operation-ember-line': 'Abstract staged withdrawal through delay lines toward extraction.',
  'operation-iron-horizon': 'Abstract combined-arms offensive advancing across three sectors.',
});

const ENDING_ALT = Object.freeze({
  victory: 'Abstract sunrise over secured campaign lines.',
  withdrawal: 'Abstract orderly force withdrawal beneath a muted horizon.',
  defeat: 'Abstract broken line and darkened campaign horizon.',
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

function altFor(family, id) {
  if (OPERATION_ALT[id]) {
    const prefix = family === 'mapOverlays' ? 'Tactical overlay. '
      : family === 'briefingPanels' ? 'Briefing panel. '
        : family === 'loadingArt' ? 'Loading illustration. '
          : '';
    return `${prefix}${OPERATION_ALT[id]}`;
  }
  if (family === 'endingPanels') return ENDING_ALT[id];
  if (family === 'creditsVisuals') {
    return id === 'campaign'
      ? 'Abstract campaign route crossing a layered operational map.'
      : 'Abstract contributor mosaic built from interlocking campaign symbols.';
  }
  if (family === 'debriefMedalFrames') return `Decorative debrief frame for the ${fragment(id).replaceAll('-', ' ')} medal.`;
  return 'Visible diagnostic fallback for missing campaign artwork.';
}

function createEntry(family, id, index) {
  if (!FAMILY.test(family) || !FAMILY_SPECS[family]) throw new TypeError(`Invalid campaign art family: ${family}`);
  if (!ID.test(id)) throw new TypeError(`Invalid campaign art ID: ${id}`);
  const spec = FAMILY_SPECS[family];
  const inset = family === 'debriefMedalFrames' ? 12 : Math.max(16, Math.round(Math.min(spec.width, spec.height) * 0.06));
  const entry = {
    family,
    id,
    key: `${family}:${id}`,
    symbolId: `campaign-${fragment(family)}-${fragment(id)}`,
    width: spec.width,
    height: spec.height,
    viewBox: `0 0 ${spec.width} ${spec.height}`,
    role: spec.role,
    order: index,
    alt: altFor(family, id),
    safeArea: { x: inset, y: inset, w: spec.width - inset * 2, h: spec.height - inset * 2 },
    focalPoint: { x: Math.round(spec.width * 0.5), y: Math.round(spec.height * (family === 'mapOverlays' ? 0.5 : 0.46)) },
    pixelRatios: [1, 2],
    nearestNeighbor: false,
  };
  if (CAMPAIGN_OPERATION_IDS.includes(id)) entry.operationId = id;
  if (family === 'mapOverlays') entry.background = 'transparent';
  return deepFreeze(entry);
}

const assets = [];
for (const [family, ids] of Object.entries(CAMPAIGN_ART_CANONICAL_IDS)) {
  ids.forEach((id, index) => assets.push(createEntry(family, id, index)));
}
assets.push(createEntry('fallback', 'missing', 0));

const byKey = Object.create(null);
for (const asset of assets) {
  if (byKey[asset.key]) throw new Error(`Duplicate campaign art key: ${asset.key}`);
  byKey[asset.key] = asset;
}

const familyCounts = Object.freeze(
  Object.fromEntries(Object.keys(FAMILY_SPECS).map((family) => [family, assets.filter((asset) => asset.family === family).length])),
);

export const CAMPAIGN_ART_CATALOG = deepFreeze({
  schema: CAMPAIGN_ART_SCHEMA,
  version: CAMPAIGN_ART_VERSION,
  id: 'fields-of-resolve-campaign-art-v1',
  sheet: CAMPAIGN_ART_SHEET_PATH,
  source: CAMPAIGN_ART_SOURCE_PATH,
  palette: CAMPAIGN_ART_PALETTE,
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
    generator: 'scripts/build-campaign-art.mjs',
    externalInputs: [],
    fictionalSubjectsOnly: true,
    publicFigures: false,
  },
});

export function listCampaignArtAssets(family = null) {
  if (family === null) return CAMPAIGN_ART_CATALOG.assets;
  if (!FAMILY_SPECS[family]) throw new RangeError(`Unknown campaign art family: ${family}`);
  return Object.freeze(CAMPAIGN_ART_CATALOG.assets.filter((asset) => asset.family === family));
}

export function resolveCampaignArtAsset(family, id) {
  const requested = `${family}:${id}`;
  const exact = CAMPAIGN_ART_CATALOG.byKey[requested];
  if (exact) return Object.freeze({ status: 'found', requested, asset: exact });
  return Object.freeze({ status: 'fallback', requested, asset: CAMPAIGN_ART_CATALOG.byKey[CAMPAIGN_ART_CATALOG.fallbackKey] });
}

export function resolveOperationCampaignArt(operationId) {
  return deepFreeze(Object.fromEntries(
    ['operationIllustrations', 'mapOverlays', 'briefingPanels', 'loadingArt']
      .map((family) => [family, resolveCampaignArtAsset(family, operationId)]),
  ));
}

export function campaignArtHref(assetOrResult) {
  const asset = assetOrResult?.asset ?? assetOrResult;
  if (!asset || typeof asset.symbolId !== 'string') throw new TypeError('Campaign art href requires a catalog asset.');
  return `${CAMPAIGN_ART_SHEET_PATH}#${asset.symbolId}`;
}

export function validateCampaignArtCatalog(catalog = CAMPAIGN_ART_CATALOG) {
  if (!catalog || catalog.schema !== CAMPAIGN_ART_SCHEMA || catalog.version !== CAMPAIGN_ART_VERSION) {
    throw new TypeError('Unsupported campaign art catalog.');
  }
  const keys = new Set();
  const symbols = new Set();
  for (const asset of catalog.assets) {
    const spec = FAMILY_SPECS[asset.family];
    if (!spec) throw new Error(`Unknown family for ${asset.key}.`);
    if (keys.has(asset.key) || symbols.has(asset.symbolId)) throw new Error(`Duplicate campaign art identity: ${asset.key}.`);
    keys.add(asset.key);
    symbols.add(asset.symbolId);
    if (asset.width !== spec.width || asset.height !== spec.height || asset.viewBox !== `0 0 ${spec.width} ${spec.height}`) {
      throw new Error(`Dimension drift for ${asset.key}.`);
    }
    const { x, y, w, h } = asset.safeArea ?? {};
    if (![x, y, w, h].every(Number.isInteger) || x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > asset.width || y + h > asset.height) {
      throw new Error(`Safe area invalid for ${asset.key}.`);
    }
    if (!asset.alt || asset.alt.length < 24) throw new Error(`Accessible description missing for ${asset.key}.`);
    if (asset.background === 'transparent' && asset.family !== 'mapOverlays') throw new Error(`Transparent background is reserved for map overlays: ${asset.key}.`);
  }
  for (const [family, ids] of Object.entries(CAMPAIGN_ART_CANONICAL_IDS)) {
    const actual = catalog.assets.filter((asset) => asset.family === family).map((asset) => asset.id);
    if (actual.length !== ids.length || actual.some((id, index) => id !== ids[index])) throw new Error(`Canonical ID drift for ${family}.`);
  }
  if (!catalog.byKey[catalog.fallbackKey]) throw new Error('Campaign art fallback is missing.');
  if (catalog.provenance.externalInputs.length || !catalog.provenance.fictionalSubjectsOnly || catalog.provenance.publicFigures) {
    throw new Error('Campaign art provenance must remain original and fictional.');
  }
  return catalog;
}

validateCampaignArtCatalog();
