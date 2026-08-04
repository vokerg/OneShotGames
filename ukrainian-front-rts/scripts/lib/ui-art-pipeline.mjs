import {
  UI_ART_CATALOG,
  UI_ART_PALETTE,
  validateUiArtCatalog,
} from '../../src/ui/ui-art-catalog.js';

export const UI_ART_SOURCE_SCHEMA = 'fields-of-resolve.ui-art-source';
export const UI_ART_SOURCE_VERSION = 1;
export const UI_ART_RUNTIME_MANIFEST_SCHEMA = 'fields-of-resolve.ui-art-runtime-manifest';

function xml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function hash(value) {
  let result = 2166136261;
  for (const character of String(value)) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function colors(asset) {
  if (asset.faction === 'ukraine') return [UI_ART_PALETTE.ukrainePrimary, UI_ART_PALETTE.ukraineSecondary];
  if (asset.faction === 'russia') return [UI_ART_PALETTE.russiaPrimary, UI_ART_PALETTE.russiaSecondary];
  if (asset.family === 'objectiveIcons' || asset.family === 'medals') return [UI_ART_PALETTE.objective, UI_ART_PALETTE.selection];
  if (asset.family === 'pings' && ['hostile', 'underAttack'].includes(asset.id)) return [UI_ART_PALETTE.danger, UI_ART_PALETTE.selection];
  if (asset.family === 'cursors' && asset.id === 'buildInvalid') return [UI_ART_PALETTE.danger, UI_ART_PALETTE.pale];
  return [UI_ART_PALETTE.neutral, UI_ART_PALETTE.benefit];
}

const TEMPLATE_IDS = Object.freeze({
  portraits: 'tpl-portrait',
  unitIcons: 'tpl-unit',
  buildingIcons: 'tpl-building',
  abilityIcons: 'tpl-ability',
  upgradeIcons: 'tpl-upgrade',
  objectiveIcons: 'tpl-objective',
  cursors: 'tpl-cursor',
  pings: 'tpl-ping',
  medals: 'tpl-medal',
  fallback: 'tpl-fallback',
});

function templates() {
  const p = UI_ART_PALETTE;
  return [
    `<symbol id="tpl-portrait" viewBox="0 0 144 112"><rect x="2" y="2" width="140" height="108" rx="4" fill="${p.panel}" stroke="${p.ink}" stroke-width="4"/><path d="M14 98L28 72L50 62H94L116 72L130 98Z" fill="var(--primary)" stroke="${p.ink}" stroke-width="4"/><rect x="54" y="48" width="36" height="28" fill="var(--secondary)" stroke="${p.ink}" stroke-width="4"/><circle cx="72" cy="35" r="22" fill="${p.pale}" stroke="${p.ink}" stroke-width="4"/><path d="M52 31Q72 9 92 31L88 19Q72 7 56 19Z" fill="var(--primary)"/><rect x="60" y="34" width="5" height="4" fill="${p.ink}"/><rect x="79" y="34" width="5" height="4" fill="${p.ink}"/><path d="M62 50H82" stroke="${p.ink}" stroke-width="4"/><rect x="10" y="100" width="124" height="6" fill="var(--secondary)"/></symbol>`,
    `<symbol id="tpl-unit" viewBox="0 0 32 32"><rect x="1" y="1" width="30" height="30" rx="3" fill="${p.panel}" stroke="${p.ink}" stroke-width="2"/><path d="M16 4L27 10L24 24L16 29L8 24L5 10Z" fill="var(--primary)" stroke="${p.ink}" stroke-width="2"/><path d="M9 22L23 10" stroke="var(--secondary)" stroke-width="4"/><circle cx="16" cy="16" r="4" fill="${p.pale}" stroke="${p.ink}" stroke-width="2"/></symbol>`,
    `<symbol id="tpl-building" viewBox="0 0 32 32"><rect x="1" y="1" width="30" height="30" fill="${p.panel}" stroke="${p.ink}" stroke-width="2"/><path d="M4 14L16 5L28 14V28H4Z" fill="var(--primary)" stroke="${p.ink}" stroke-width="2"/><rect x="13" y="18" width="6" height="10" fill="var(--secondary)" stroke="${p.ink}" stroke-width="2"/><rect x="7" y="15" width="5" height="5" fill="${p.pale}"/><rect x="20" y="15" width="5" height="5" fill="${p.pale}"/></symbol>`,
    `<symbol id="tpl-ability" viewBox="0 0 32 32"><rect x="1" y="1" width="30" height="30" rx="4" fill="${p.panel}" stroke="${p.ink}" stroke-width="2"/><path d="M16 4L28 16L16 28L4 16Z" fill="var(--primary)" stroke="${p.ink}" stroke-width="2"/><path d="M10 21L16 7L22 21L16 17Z" fill="var(--secondary)" stroke="${p.ink}" stroke-width="2"/></symbol>`,
    `<symbol id="tpl-upgrade" viewBox="0 0 32 32"><rect x="1" y="1" width="30" height="30" rx="4" fill="${p.panel}" stroke="${p.ink}" stroke-width="2"/><circle cx="16" cy="16" r="11" fill="var(--primary)" stroke="${p.ink}" stroke-width="2"/><circle cx="16" cy="16" r="4" fill="${p.panel}"/><path d="M16 4V10M16 22V28M4 16H10M22 16H28" stroke="var(--secondary)" stroke-width="3"/><path d="M12 19L16 9L20 19L16 16Z" fill="var(--secondary)"/></symbol>`,
    `<symbol id="tpl-objective" viewBox="0 0 32 32"><rect x="1" y="1" width="30" height="30" rx="4" fill="${p.panel}" stroke="${p.ink}" stroke-width="2"/><circle cx="16" cy="16" r="11" fill="none" stroke="var(--primary)" stroke-width="3"/><path d="M11 27V6H25L20 12H11" fill="var(--secondary)" stroke="${p.ink}" stroke-width="2"/><circle cx="16" cy="16" r="3" fill="${p.pale}"/></symbol>`,
    `<symbol id="tpl-cursor" viewBox="0 0 32 32"><path d="M3 2L25 17L16 19L20 29L14 31L10 21L3 27Z" fill="var(--primary)" stroke="${p.ink}" stroke-width="2"/><circle cx="25" cy="25" r="5" fill="var(--secondary)" stroke="${p.ink}" stroke-width="2"/></symbol>`,
    `<symbol id="tpl-ping" viewBox="0 0 48 48"><circle cx="24" cy="24" r="21" fill="none" stroke="var(--primary)" stroke-width="3"/><circle cx="24" cy="24" r="15" fill="none" stroke="var(--secondary)" stroke-width="2"/><path d="M24 12L28 20L37 21L30 27L32 36L24 31L16 36L18 27L11 21L20 20Z" fill="var(--primary)" stroke="${p.ink}" stroke-width="2"/></symbol>`,
    `<symbol id="tpl-medal" viewBox="0 0 64 64"><path d="M14 4H30L36 25L24 33Z" fill="var(--primary)" stroke="${p.ink}" stroke-width="3"/><path d="M34 4H50L40 33L28 25Z" fill="var(--secondary)" stroke="${p.ink}" stroke-width="3"/><circle cx="32" cy="40" r="19" fill="var(--primary)" stroke="${p.ink}" stroke-width="4"/><path d="M32 23L36 35H46L38 41L41 51L32 45L23 51L26 41L18 35H28Z" fill="var(--secondary)" stroke="${p.ink}" stroke-width="2"/></symbol>`,
    `<symbol id="tpl-fallback" viewBox="0 0 32 32"><rect x="1" y="1" width="30" height="30" fill="#ff4fa3" stroke="${p.ink}" stroke-width="2"/><path d="M7 7L25 25M25 7L7 25" stroke="#fff" stroke-width="4"/></symbol>`,
  ].join('');
}

export function renderUiArtSymbol(asset) {
  const [primary, secondary] = colors(asset);
  const seed = hash(asset.key);
  const markX = 4 + (seed % Math.max(1, asset.width - 8));
  const markY = 4 + ((seed >>> 4) % Math.max(1, asset.height - 8));
  const templateId = TEMPLATE_IDS[asset.family];
  if (!templateId) throw new RangeError(`Unsupported UI art family: ${asset.family}`);
  const invalid = asset.family === 'cursors' && asset.id === 'buildInvalid'
    ? `<path d="M20 20L30 30M30 20L20 30" stroke="${UI_ART_PALETTE.danger}" stroke-width="4"/>`
    : '';
  return `<symbol id="${xml(asset.symbolId)}" viewBox="${asset.viewBox}" style="--primary:${primary};--secondary:${secondary}"><use href="#${templateId}"/><rect x="${markX}" y="${markY}" width="2" height="2" fill="${secondary}"/>${invalid}</symbol>`;
}

export function renderUiArtSymbols(catalog = UI_ART_CATALOG) {
  validateUiArtCatalog(catalog);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" style="shape-rendering:crispEdges"><defs>${templates()}${catalog.assets.map(renderUiArtSymbol).join('')}</defs></svg>\n`;
}

export function renderUiArtContactSheet(catalog = UI_ART_CATALOG) {
  validateUiArtCatalog(catalog);
  const columns = 8;
  const cellWidth = 96;
  const cellHeight = 80;
  const rows = Math.ceil(catalog.assets.length / columns);
  const uses = catalog.assets.map((asset, index) => {
    const x = (index % columns) * cellWidth;
    const y = Math.floor(index / columns) * cellHeight;
    return `<rect x="${x + 1}" y="${y + 1}" width="94" height="78" fill="${UI_ART_PALETTE.panel}" stroke="${UI_ART_PALETTE.ink}" stroke-width="2"/><svg x="${x + 8}" y="${y + 8}" width="80" height="64" viewBox="${asset.viewBox}" preserveAspectRatio="xMidYMid meet"><use href="../ui/ui-art-symbols.svg#${xml(asset.symbolId)}"/></svg>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${columns * cellWidth}" height="${rows * cellHeight}" viewBox="0 0 ${columns * cellWidth} ${rows * cellHeight}" style="shape-rendering:crispEdges">${uses}</svg>\n`;
}

export function buildUiArtRuntimeManifest(catalog = UI_ART_CATALOG) {
  validateUiArtCatalog(catalog);
  return `${JSON.stringify({
    schema: UI_ART_RUNTIME_MANIFEST_SCHEMA,
    version: UI_ART_SOURCE_VERSION,
    id: catalog.id,
    source: catalog.source,
    sheet: catalog.sheet,
    assetCount: catalog.assets.length,
    familyCounts: catalog.familyCounts,
    palette: catalog.palette,
    assets: catalog.assets.map((asset) => ({
      family: asset.family,
      id: asset.id,
      symbolId: asset.symbolId,
      width: asset.width,
      height: asset.height,
      faction: asset.faction,
      ...(asset.hotspot ? { hotspot: asset.hotspot } : {}),
      ...(asset.durationMs ? { durationMs: asset.durationMs, reducedMotion: asset.reducedMotion } : {}),
      ...(asset.safeArea ? { safeArea: asset.safeArea } : {}),
    })),
  })}\n`;
}

function parseJson(value, label) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new SyntaxError(`${label} is not valid JSON: ${error.message}`);
  }
}

export function validateUiArtSourceManifest(value, catalog = UI_ART_CATALOG) {
  const source = parseJson(value, 'UI art source manifest');
  if (!source || source.schema !== UI_ART_SOURCE_SCHEMA || source.version !== UI_ART_SOURCE_VERSION) throw new TypeError('Unsupported UI art source manifest.');
  if (source.id !== catalog.id) throw new Error('UI art source ID does not match the runtime catalog.');
  if (source.authority !== 'src/ui/ui-art-catalog.js') throw new Error('UI art source authority is invalid.');
  if (source.generator !== catalog.provenance.generator) throw new Error('UI art generator drift.');
  if (source.provenance?.license !== catalog.provenance.license) throw new Error('UI art license drift.');
  if (source.provenance?.fictionalSubjectsOnly !== true || source.provenance?.externalInputs?.length !== 0) throw new Error('UI art provenance must remain fictional and repository-authored.');
  for (const [family, count] of Object.entries(catalog.familyCounts)) {
    if (source.familyCounts?.[family] !== count) throw new Error(`UI art source count drift for ${family}.`);
  }
  if (source.outputs?.symbols !== catalog.sheet) throw new Error('UI art symbol output drift.');
  return source;
}

export function verifyUiArtArtifacts({ sourceManifest, runtimeManifest, symbols, contactSheet, catalog = UI_ART_CATALOG }) {
  validateUiArtCatalog(catalog);
  const source = validateUiArtSourceManifest(sourceManifest, catalog);
  const runtime = parseJson(runtimeManifest, 'UI art runtime manifest');
  if (runtime.schema !== UI_ART_RUNTIME_MANIFEST_SCHEMA || runtime.version !== UI_ART_SOURCE_VERSION) throw new TypeError('Unsupported UI art runtime manifest.');
  if (runtime.assetCount !== catalog.assets.length || runtime.assets?.length !== catalog.assets.length) throw new Error('UI art runtime asset count drift.');
  if (runtimeManifest !== buildUiArtRuntimeManifest(catalog)) throw new Error('UI art runtime manifest is stale.');
  if (symbols !== renderUiArtSymbols(catalog)) throw new Error('UI art symbol sheet is stale.');
  if (contactSheet !== renderUiArtContactSheet(catalog)) throw new Error('UI art contact sheet is stale.');
  return Object.freeze({ sourceId: source.id, assetCount: catalog.assets.length, familyCounts: catalog.familyCounts });
}
