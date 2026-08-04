import { UI_ART_PALETTE } from './ui-art-catalog.js';

export const UI_SKIN_SCHEMA = 'fields-of-resolve.ui-skin';
export const UI_SKIN_VERSION = 1;
export const UI_SKIN_SOURCE_PATH = 'art-src/ui/ui-skin-source.json';
export const UI_SKIN_ASSET_CSS_PATH = 'ui-skin-assets.css';
export const UI_SKIN_STYLESHEET_PATH = 'ui-skin.css';

const ID = /^[a-z][a-z0-9-]{0,63}$/;
const CSS_VARIABLE = /^--[a-z][a-z0-9-]{1,63}$/;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function asset(id, role, {
  width = 48,
  height = 48,
  slice = 12,
  borderWidth = 8,
  outer,
  inner,
  light,
  shadow,
  accent,
  motif = 'riveted',
} = {}) {
  return {
    id,
    role,
    cssVariable: `--ui-skin-${id}`,
    width,
    height,
    slice,
    borderWidth,
    colors: { outer, inner, light, shadow, accent },
    motif,
  };
}

const p = UI_ART_PALETTE;

export const UI_SKIN_ASSETS = deepFreeze([
  asset('panel', 'panel', {
    outer: p.ink, inner: '#273129', light: '#73806c', shadow: '#171d18', accent: '#9b8551',
  }),
  asset('panel-accent', 'accent-panel', {
    outer: p.ink, inner: '#24313b', light: '#527fa1', shadow: '#151e24', accent: p.ukraineSecondary,
  }),
  asset('overlay', 'modal-overlay', {
    outer: '#0c100d', inner: '#1d251f', light: '#65735f', shadow: '#090c0a', accent: p.objective,
    motif: 'bracketed',
  }),
  asset('parchment', 'operation-screen', {
    outer: '#382919', inner: '#bca66f', light: '#eadcae', shadow: '#6c532c', accent: '#806538',
    motif: 'stitched',
  }),
  asset('button', 'control', {
    width: 36, height: 36, slice: 9, borderWidth: 6,
    outer: p.ink, inner: '#303a31', light: '#87927c', shadow: '#1b211c', accent: '#9b8551',
    motif: 'beveled',
  }),
  asset('tab', 'tab', {
    width: 36, height: 36, slice: 9, borderWidth: 6,
    outer: p.ink, inner: '#36483f', light: '#7f9b86', shadow: '#1a261f', accent: p.selection,
    motif: 'notched',
  }),
  asset('tooltip', 'tooltip', {
    width: 40, height: 40, slice: 10, borderWidth: 7,
    outer: '#080b09', inner: '#202820', light: '#667064', shadow: '#101511', accent: p.objective,
    motif: 'bracketed',
  }),
  asset('scroll-thumb', 'scrollbar-thumb', {
    width: 24, height: 36, slice: 8, borderWidth: 5,
    outer: p.ink, inner: '#4a584b', light: '#8b987f', shadow: '#202821', accent: '#b39a5c',
    motif: 'grip',
  }),
  asset('missing', 'diagnostic-fallback', {
    width: 32, height: 32, slice: 8, borderWidth: 6,
    outer: '#220b08', inner: '#561a12', light: '#f3d1c9', shadow: '#160504', accent: p.danger,
    motif: 'fallback',
  }),
]);

const byId = Object.create(null);
for (const entry of UI_SKIN_ASSETS) byId[entry.id] = entry;

export const UI_SKIN_COMPONENTS = deepFreeze([
  { id: 'topbar', selector: '#topbar', assetId: 'panel-accent', region: 'hud', density: 'compact' },
  { id: 'command-panel', selector: '#commandPanel', assetId: 'panel', region: 'hud', density: 'dense' },
  { id: 'objectives', selector: '#objectives', assetId: 'overlay', region: 'overlay', density: 'standard' },
  { id: 'economy', selector: '#economyHud', assetId: 'overlay', region: 'overlay', density: 'dense' },
  { id: 'operation-book', selector: '.book', assetId: 'parchment', region: 'screen', density: 'standard' },
  { id: 'endgame', selector: '.endgameCard', assetId: 'parchment', region: 'modal', density: 'standard' },
  { id: 'control', selector: 'button', assetId: 'button', region: 'control', density: 'compact' },
  { id: 'tab', selector: '.selectionSubgroupTab', assetId: 'tab', region: 'control', density: 'compact' },
  { id: 'tooltip', selector: '[data-tooltip]', assetId: 'tooltip', region: 'overlay', density: 'compact' },
]);

export const UI_SKIN_STATES = deepFreeze({
  control: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  selection: ['selected', 'primary', 'researched'],
  semantic: ['neutral', 'objective', 'benefit', 'warning', 'danger'],
});

export const UI_SKIN_TOKENS = deepFreeze({
  spacingUnit: 4,
  compactControlHeight: 32,
  primaryControlHeight: 40,
  minimumTarget: 32,
  standardTarget: 40,
  panelBorder: 8,
  transitionMs: 90,
  fonts: {
    display: 'Georgia, Cambria, serif',
    body: 'Georgia, Cambria, serif',
    data: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  },
  colors: {
    ink: p.ink,
    panel: p.panel,
    panelRaised: '#303a31',
    panelDeep: '#111713',
    text: '#f3e8c2',
    textMuted: '#c8bea1',
    selection: p.selection,
    objective: p.objective,
    benefit: p.benefit,
    danger: p.danger,
    unavailable: p.unavailable,
    ukrainePrimary: p.ukrainePrimary,
    ukraineSecondary: p.ukraineSecondary,
    russiaPrimary: p.russiaPrimary,
    russiaSecondary: p.russiaSecondary,
  },
});

export const UI_SKIN = deepFreeze({
  schema: UI_SKIN_SCHEMA,
  version: UI_SKIN_VERSION,
  id: 'fields-of-resolve-production-ui-skin-v1',
  source: UI_SKIN_SOURCE_PATH,
  assetStylesheet: UI_SKIN_ASSET_CSS_PATH,
  stylesheet: UI_SKIN_STYLESHEET_PATH,
  assets: UI_SKIN_ASSETS,
  byId,
  components: UI_SKIN_COMPONENTS,
  states: UI_SKIN_STATES,
  tokens: UI_SKIN_TOKENS,
  accessibility: {
    textRemainsText: true,
    colorIndependentStates: true,
    focusRingWidth: 3,
    reducedMotionSupported: true,
    highContrastSupported: true,
    localizationExpansion: 1.4,
  },
  provenance: {
    creator: 'OneShotGames contributors',
    createdAt: '2026-08-04',
    source: 'Original repository-authored deterministic vector recipes',
    license: 'CC0-1.0',
    redistribution: 'allowed',
    externalInputs: [],
    embeddedText: false,
  },
});

function xml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function assetFor(assetOrId) {
  if (typeof assetOrId === 'string') return UI_SKIN.byId[assetOrId] ?? UI_SKIN.byId.missing;
  if (assetOrId && UI_SKIN.byId[assetOrId.id] === assetOrId) return assetOrId;
  return UI_SKIN.byId.missing;
}

function motifMarkup(entry) {
  const { width, height, slice, motif, colors } = entry;
  const { accent, outer, light } = colors;
  if (motif === 'stitched') {
    return `<path d="M${slice / 2} ${slice / 2}H${width - slice / 2}V${height - slice / 2}H${slice / 2}Z" fill="none" stroke="${xml(accent)}" stroke-width="1" stroke-dasharray="2 2" opacity=".72"/>`;
  }
  if (motif === 'grip') {
    return [0, 1, 2].map((index) => {
      const y = Math.round(height / 2) - 4 + index * 4;
      return `<path d="M${slice - 1} ${y}H${width - slice + 1}" stroke="${xml(light)}" stroke-width="1" opacity=".72"/>`;
    }).join('');
  }
  if (motif === 'fallback') {
    return `<path d="M${slice - 1} ${slice - 1}L${width - slice + 1} ${height - slice + 1}M${width - slice + 1} ${slice - 1}L${slice - 1} ${height - slice + 1}" stroke="${xml(accent)}" stroke-width="4"/><rect x="${width / 2 - 2}" y="${height / 2 - 2}" width="4" height="4" fill="${xml(light)}"/>`;
  }
  const corner = Math.max(2, Math.floor(slice / 3));
  const marks = [
    [corner, corner], [width - corner, corner], [corner, height - corner], [width - corner, height - corner],
  ].map(([x, y]) => `<rect x="${x - 1}" y="${y - 1}" width="2" height="2" fill="${xml(accent)}" stroke="${xml(outer)}" stroke-width="1"/>`).join('');
  if (motif === 'notched') {
    return `${marks}<path d="M${slice} 2H${width - slice}M${slice} ${height - 2}H${width - slice}" stroke="${xml(accent)}" stroke-width="2"/>`;
  }
  if (motif === 'bracketed') {
    return `${marks}<path d="M2 ${slice}V2H${slice}M${width - slice} 2H${width - 2}V${slice}M2 ${height - slice}V${height - 2}H${slice}M${width - slice} ${height - 2}H${width - 2}V${height - slice}" fill="none" stroke="${xml(accent)}" stroke-width="2"/>`;
  }
  if (motif === 'beveled') {
    return `${marks}<path d="M${slice - 1} ${slice - 1}H${width - slice + 1}" stroke="${xml(light)}" stroke-width="1" opacity=".8"/>`;
  }
  return marks;
}

export function renderUiSkinAssetSvg(assetOrId) {
  const entry = assetFor(assetOrId);
  const { width, height, slice, colors } = entry;
  const { outer, inner, light, shadow, accent } = colors;
  const innerWidth = width - slice * 2;
  const innerHeight = height - slice * 2;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">`,
    `<rect width="${width}" height="${height}" fill="${xml(outer)}"/>`,
    `<path d="M1 1H${width - 1}V${height - 1}H1Z" fill="none" stroke="${xml(light)}" stroke-width="2"/>`,
    `<path d="M3 ${height - 3}H${width - 3}V3" fill="none" stroke="${xml(shadow)}" stroke-width="3"/>`,
    `<rect x="${slice}" y="${slice}" width="${innerWidth}" height="${innerHeight}" fill="${xml(inner)}"/>`,
    `<rect x="${slice}" y="${slice}" width="${innerWidth}" height="1" fill="${xml(accent)}" opacity=".45"/>`,
    motifMarkup(entry),
    '</svg>',
  ].join('');
}

export function uiSkinAssetDataUri(assetOrId) {
  const svg = renderUiSkinAssetSvg(assetOrId);
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function buildUiSkinAssetCss(skin = UI_SKIN) {
  validateUiSkin(skin);
  const variables = skin.assets.map((entry) => `  ${entry.cssVariable}: url("${uiSkinAssetDataUri(entry)}");`);
  const tokenVariables = [
    `  --ui-space: ${skin.tokens.spacingUnit}px;`,
    `  --ui-control-compact: ${skin.tokens.compactControlHeight}px;`,
    `  --ui-control-primary: ${skin.tokens.primaryControlHeight}px;`,
    `  --ui-target-min: ${skin.tokens.minimumTarget}px;`,
    `  --ui-transition: ${skin.tokens.transitionMs}ms;`,
    ...Object.entries(skin.tokens.colors).map(([name, value]) => `  --ui-color-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}: ${value};`),
  ];
  return [
    '/* Generated by scripts/build-ui-skin.mjs from src/ui/ui-skin.js. */',
    ':root {',
    ...tokenVariables,
    ...variables,
    '}',
    '',
  ].join('\n');
}

export function resolveUiSkinAsset(id) {
  const exact = UI_SKIN.byId[id];
  if (exact) return Object.freeze({ status: 'found', requested: id, asset: exact });
  return Object.freeze({ status: 'fallback', requested: id, asset: UI_SKIN.byId.missing });
}

export function validateUiSkin(skin = UI_SKIN) {
  if (!skin || skin.schema !== UI_SKIN_SCHEMA || skin.version !== UI_SKIN_VERSION) {
    throw new TypeError('Unsupported UI skin contract.');
  }
  const ids = new Set();
  const variables = new Set();
  for (const entry of skin.assets) {
    if (!ID.test(entry.id)) throw new TypeError(`Invalid UI skin asset ID: ${entry.id}`);
    if (!CSS_VARIABLE.test(entry.cssVariable)) throw new TypeError(`Invalid UI skin CSS variable: ${entry.cssVariable}`);
    if (ids.has(entry.id)) throw new Error(`Duplicate UI skin asset ID: ${entry.id}`);
    if (variables.has(entry.cssVariable)) throw new Error(`Duplicate UI skin CSS variable: ${entry.cssVariable}`);
    ids.add(entry.id);
    variables.add(entry.cssVariable);
    for (const key of ['width', 'height', 'slice', 'borderWidth']) {
      if (!Number.isInteger(entry[key]) || entry[key] <= 0) throw new TypeError(`${entry.id}.${key} must be a positive integer.`);
    }
    if (entry.slice * 2 >= entry.width || entry.slice * 2 >= entry.height) {
      throw new RangeError(`${entry.id} nine-slice center must remain positive.`);
    }
    if (entry.borderWidth > entry.slice) throw new RangeError(`${entry.id} borderWidth exceeds its slice.`);
    for (const [name, color] of Object.entries(entry.colors)) {
      if (!/^#[0-9a-f]{6}$/i.test(color)) throw new TypeError(`${entry.id}.${name} must be an RGB hex color.`);
    }
  }
  if (!ids.has('missing')) throw new Error('UI skin diagnostic fallback is missing.');
  const componentIds = new Set();
  for (const component of skin.components) {
    if (!ID.test(component.id) || componentIds.has(component.id)) throw new Error(`Invalid or duplicate UI skin component: ${component.id}`);
    componentIds.add(component.id);
    if (typeof component.selector !== 'string' || !component.selector.trim()) throw new TypeError(`${component.id} selector is required.`);
    if (!ids.has(component.assetId)) throw new Error(`${component.id} references unknown asset ${component.assetId}.`);
  }
  if (skin.tokens.minimumTarget < 32 || skin.tokens.compactControlHeight < 28) {
    throw new Error('UI skin target and compact-control sizes violate the art bible.');
  }
  if (!skin.accessibility.textRemainsText || !skin.accessibility.colorIndependentStates) {
    throw new Error('UI skin accessibility contract is incomplete.');
  }
  return skin;
}

validateUiSkin();
