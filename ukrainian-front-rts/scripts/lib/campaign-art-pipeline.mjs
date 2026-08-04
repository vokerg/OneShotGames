import {
  CAMPAIGN_ART_CATALOG,
  CAMPAIGN_ART_PALETTE,
  validateCampaignArtCatalog,
} from '../../src/ui/campaign-art-catalog.js';

const SOURCE_SCHEMA = 'fields-of-resolve.campaign-art-source';
const RUNTIME_SCHEMA = 'fields-of-resolve.campaign-art-runtime';

function esc(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
}

function frame(width, height, { transparent = false } = {}) {
  const p = CAMPAIGN_ART_PALETTE;
  return `${transparent ? '' : `<rect width="${width}" height="${height}" fill="${p.panel}"/>`}`
    + `<path d="M0 ${height * 0.72} L${width} ${height * 0.42} L${width} ${height} L0 ${height}Z" fill="${p.ink}" opacity=".46"/>`
    + `<path d="M0 ${height * 0.82} L${width} ${height * 0.55}" stroke="${p.neutral}" stroke-width="${Math.max(2, width / 240)}" opacity=".28"/>`
    + `<rect x="${width * 0.025}" y="${height * 0.045}" width="${width * 0.95}" height="${height * 0.91}" fill="none" stroke="${p.pale}" stroke-width="${Math.max(2, width / 320)}" opacity=".46"/>`;
}

function operationMotif(id, width, height) {
  const p = CAMPAIGN_ART_PALETTE;
  const sw = Math.max(3, width / 150);
  if (id === 'operation-safe-passage') {
    return `<path d="M${width * .12} ${height * .72} C${width * .34} ${height * .48} ${width * .55} ${height * .68} ${width * .84} ${height * .28}" fill="none" stroke="${p.route}" stroke-width="${sw * 2.2}" stroke-dasharray="${sw * 4} ${sw * 2}"/>`
      + `<g fill="${p.panelRaised}" stroke="${p.neutral}" stroke-width="${sw}"><rect x="${width * .42}" y="${height * .35}" width="${width * .12}" height="${height * .22}"/><rect x="${width * .58}" y="${height * .29}" width="${width * .1}" height="${height * .27}"/><rect x="${width * .7}" y="${height * .4}" width="${width * .09}" height="${height * .17}"/></g>`
      + `<circle cx="${width * .16}" cy="${height * .71}" r="${sw * 3.4}" fill="${p.benefit}"/>`;
  }
  if (id === 'operation-lantern-gate') {
    return `<path d="M${width * .1} ${height * .62} H${width * .42} L${width * .5} ${height * .48} L${width * .58} ${height * .62} H${width * .9}" fill="none" stroke="${p.danger}" stroke-width="${sw * 3}"/>`
      + `<path d="M${width * .18} ${height * .78} L${width * .47} ${height * .53} M${width * .82} ${height * .78} L${width * .53} ${height * .53}" stroke="${p.route}" stroke-width="${sw * 1.6}" stroke-dasharray="${sw * 5} ${sw * 2}"/>`
      + `<circle cx="${width * .5}" cy="${height * .48}" r="${sw * 4}" fill="${p.objective}"/>`;
  }
  if (id === 'operation-silent-ledger') {
    return `<g fill="none" stroke="${p.route}" stroke-width="${sw * 1.5}"><path d="M${width * .16} ${height * .68} L${width * .42} ${height * .42} L${width * .72} ${height * .62} L${width * .86} ${height * .29}"/><path d="M${width * .42} ${height * .42} L${width * .62} ${height * .23}" stroke-dasharray="${sw * 3} ${sw * 2}"/></g>`
      + `<g fill="${p.panelRaised}" stroke="${p.pale}" stroke-width="${sw}"><rect x="${width * .12}" y="${height * .61}" width="${width * .09}" height="${height * .13}"/><rect x="${width * .38}" y="${height * .35}" width="${width * .09}" height="${height * .13}"/><rect x="${width * .68}" y="${height * .55}" width="${width * .09}" height="${height * .13}"/></g>`
      + `<circle cx="${width * .86}" cy="${height * .29}" r="${sw * 4}" fill="${p.objective}"/>`;
  }
  if (id === 'operation-ember-line') {
    return `<g stroke="${p.russiaPrimary}" stroke-width="${sw * 2.4}"><path d="M${width * .2} ${height * .28} L${width * .74} ${height * .28}"/><path d="M${width * .28} ${height * .49} L${width * .67} ${height * .49}"/><path d="M${width * .36} ${height * .69} L${width * .58} ${height * .69}"/></g>`
      + `<path d="M${width * .78} ${height * .2} C${width * .63} ${height * .37} ${width * .58} ${height * .55} ${width * .47} ${height * .79}" fill="none" stroke="${p.route}" stroke-width="${sw * 2}" stroke-dasharray="${sw * 4} ${sw * 2}"/>`
      + `<circle cx="${width * .47}" cy="${height * .79}" r="${sw * 4}" fill="${p.benefit}"/>`;
  }
  return `<g fill="none" stroke-width="${sw * 2}"><path d="M${width * .12} ${height * .75} L${width * .4} ${height * .32}" stroke="${p.ukrainePrimary}"/><path d="M${width * .34} ${height * .78} L${width * .54} ${height * .3}" stroke="${p.ukraineSecondary}"/><path d="M${width * .57} ${height * .76} L${width * .68} ${height * .31}" stroke="${p.benefit}"/></g>`
    + `<g fill="${p.objective}"><circle cx="${width * .4}" cy="${height * .32}" r="${sw * 3.5}"/><circle cx="${width * .54}" cy="${height * .3}" r="${sw * 3.5}"/><circle cx="${width * .68}" cy="${height * .31}" r="${sw * 3.5}"/></g>`;
}

function mapGrid(width, height) {
  const p = CAMPAIGN_ART_PALETTE;
  const vertical = Array.from({ length: 9 }, (_, i) => `<path d="M${(i + 1) * width / 10} 0 V${height}"/>`).join('');
  const horizontal = Array.from({ length: 5 }, (_, i) => `<path d="M0 ${(i + 1) * height / 6} H${width}"/>`).join('');
  return `<g fill="none" stroke="${p.neutral}" stroke-width="1" opacity=".22">${vertical}${horizontal}</g>`;
}

function endingMotif(id, width, height) {
  const p = CAMPAIGN_ART_PALETTE;
  if (id === 'victory') return `<circle cx="${width * .5}" cy="${height * .44}" r="${height * .16}" fill="${p.objective}" opacity=".9"/><path d="M${width * .2} ${height * .72} Q${width * .5} ${height * .48} ${width * .8} ${height * .72}" fill="none" stroke="${p.pale}" stroke-width="8"/>`;
  if (id === 'withdrawal') return `<path d="M${width * .18} ${height * .65} C${width * .37} ${height * .42} ${width * .58} ${height * .58} ${width * .82} ${height * .34}" fill="none" stroke="${p.route}" stroke-width="10" stroke-dasharray="24 12"/><path d="M${width * .23} ${height * .76} H${width * .77}" stroke="${p.neutral}" stroke-width="5"/>`;
  return `<path d="M${width * .23} ${height * .34} L${width * .45} ${height * .58} L${width * .55} ${height * .48} L${width * .78} ${height * .74}" fill="none" stroke="${p.danger}" stroke-width="11"/><path d="M${width * .18} ${height * .78} H${width * .82}" stroke="${p.neutral}" stroke-width="5" opacity=".5"/>`;
}

function renderBody(asset) {
  const { family, id, width, height } = asset;
  const p = CAMPAIGN_ART_PALETTE;
  if (family === 'mapOverlays') return mapGrid(width, height) + operationMotif(id, width, height);
  if (family === 'operationIllustrations') return frame(width, height) + operationMotif(id, width, height);
  if (family === 'briefingPanels') {
    return frame(width, height) + `<rect x="${width * .65}" y="${height * .12}" width="${width * .26}" height="${height * .7}" fill="${p.ink}" opacity=".62"/>`
      + `<g transform="translate(${width * .04} ${height * .06}) scale(1.32)">${operationMotif(id, 640, 360)}</g>`;
  }
  if (family === 'loadingArt') {
    return frame(width, height) + `<g opacity=".78" transform="translate(${width * .08} ${height * .08}) scale(1.28)">${operationMotif(id, 640, 360)}</g>`
      + `<path d="M${width * .18} ${height * .88} H${width * .82}" stroke="${p.neutral}" stroke-width="8"/><path d="M${width * .18} ${height * .88} H${width * .54}" stroke="${p.objective}" stroke-width="8"/>`;
  }
  if (family === 'endingPanels') return frame(width, height) + endingMotif(id, width, height);
  if (family === 'creditsVisuals') {
    const mosaic = Array.from({ length: 24 }, (_, i) => {
      const x = width * (.12 + (i % 8) * .1);
      const y = height * (.22 + Math.floor(i / 8) * .2);
      const fill = [p.ukrainePrimary, p.ukraineSecondary, p.benefit, p.objective][i % 4];
      return `<path d="M${x} ${y} l${width * .035} ${height * .05} l-${width * .035} ${height * .05} l-${width * .035} -${height * .05}Z" fill="${fill}" opacity="${.45 + (i % 3) * .15}"/>`;
    }).join('');
    return frame(width, height) + mosaic + (id === 'campaign' ? `<path d="M${width * .16} ${height * .76} C${width * .4} ${height * .45} ${width * .56} ${height * .62} ${width * .82} ${height * .3}" fill="none" stroke="${p.route}" stroke-width="8"/>` : '');
  }
  if (family === 'debriefMedalFrames') {
    const rays = Array.from({ length: 8 }, (_, i) => `<path d="M80 82 L${80 + Math.cos(i * Math.PI / 4) * 55} ${82 + Math.sin(i * Math.PI / 4) * 55}" stroke="${p.objective}" stroke-width="4" opacity=".5"/>`).join('');
    return `<rect width="160" height="200" rx="12" fill="${p.panel}"/><path d="M54 110 L38 190 L80 168 L122 190 L106 110Z" fill="${p.russiaPrimary}"/>${rays}<circle cx="80" cy="82" r="48" fill="${p.panelRaised}" stroke="${p.objective}" stroke-width="7"/><circle cx="80" cy="82" r="26" fill="none" stroke="${p.pale}" stroke-width="5"/>`;
  }
  return `<rect width="${width}" height="${height}" fill="${p.danger}"/><path d="M0 0 L${width} ${height} M${width} 0 L0 ${height}" stroke="${p.pale}" stroke-width="14"/><rect x="12" y="12" width="${width - 24}" height="${height - 24}" fill="none" stroke="${p.ink}" stroke-width="6"/>`;
}

function symbolDefinitions(catalog = CAMPAIGN_ART_CATALOG) {
  return catalog.assets.map((asset) => `<symbol id="${esc(asset.symbolId)}" viewBox="${asset.viewBox}"><title>${esc(asset.alt)}</title>${renderBody(asset)}</symbol>`).join('');
}

export function renderCampaignArtSymbols(catalog = CAMPAIGN_ART_CATALOG) {
  validateCampaignArtCatalog(catalog);
  return `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>${symbolDefinitions(catalog)}</defs></svg>\n`;
}

export function buildCampaignArtRuntimeManifest(catalog = CAMPAIGN_ART_CATALOG) {
  validateCampaignArtCatalog(catalog);
  return `${JSON.stringify({
    schema: RUNTIME_SCHEMA,
    version: 1,
    id: catalog.id,
    sheet: catalog.sheet,
    fallbackKey: catalog.fallbackKey,
    familyCounts: catalog.familyCounts,
    assets: catalog.assets.map(({ key, family, id, symbolId, width, height, viewBox, role, alt, safeArea, focalPoint, operationId, background }) => ({
      key, family, id, symbolId, width, height, viewBox, role, alt, safeArea, focalPoint,
      ...(operationId ? { operationId } : {}),
      ...(background ? { background } : {}),
    })),
    provenance: catalog.provenance,
  }, null, 2)}\n`;
}

export function renderCampaignArtContactSheet(catalog = CAMPAIGN_ART_CATALOG) {
  validateCampaignArtCatalog(catalog);
  const columns = 4;
  const cellWidth = 260;
  const cellHeight = 190;
  const rows = Math.ceil(catalog.assets.length / columns);
  const uses = catalog.assets.map((asset, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const scale = Math.min(220 / asset.width, 150 / asset.height);
    const drawWidth = asset.width * scale;
    const drawHeight = asset.height * scale;
    const x = col * cellWidth + (cellWidth - drawWidth) / 2;
    const y = row * cellHeight + (cellHeight - drawHeight) / 2;
    return `<g><rect x="${col * cellWidth + 5}" y="${row * cellHeight + 5}" width="250" height="180" fill="${CAMPAIGN_ART_PALETTE.ink}" stroke="${CAMPAIGN_ART_PALETTE.neutral}"/><use href="#${esc(asset.symbolId)}" x="${x}" y="${y}" width="${drawWidth}" height="${drawHeight}"/></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${columns * cellWidth}" height="${rows * cellHeight}" viewBox="0 0 ${columns * cellWidth} ${rows * cellHeight}"><defs>${symbolDefinitions(catalog)}</defs>${uses}</svg>\n`;
}

export function verifyCampaignArtArtifacts({ sourceManifest, catalog = CAMPAIGN_ART_CATALOG } = {}) {
  validateCampaignArtCatalog(catalog);
  let source;
  try { source = JSON.parse(sourceManifest); } catch { throw new TypeError('Campaign art source manifest must be valid JSON.'); }
  if (source.schema !== SOURCE_SCHEMA || source.version !== 1 || source.authority !== 'src/ui/campaign-art-catalog.js') {
    throw new Error('Campaign art source manifest contract mismatch.');
  }
  if (source.generator !== catalog.provenance.generator) throw new Error('Campaign art generator drift.');
  if (JSON.stringify(source.familyCounts) !== JSON.stringify(catalog.familyCounts)) throw new Error('Campaign art family count drift.');
  if (source.provenance?.license !== 'CC0-1.0' || source.provenance?.redistribution !== 'allowed'
    || source.provenance?.externalInputs?.length || source.provenance?.fictionalSubjectsOnly !== true
    || source.provenance?.publicFigures !== false || source.provenance?.approval !== 'approved') {
    throw new Error('Campaign art provenance is incomplete or unsafe.');
  }
  const symbols = renderCampaignArtSymbols(catalog);
  const runtimeManifest = buildCampaignArtRuntimeManifest(catalog);
  const contactSheet = renderCampaignArtContactSheet(catalog);
  if (symbols !== renderCampaignArtSymbols(catalog) || runtimeManifest !== buildCampaignArtRuntimeManifest(catalog) || contactSheet !== renderCampaignArtContactSheet(catalog)) {
    throw new Error('Campaign art generation is not deterministic.');
  }
  for (const output of [symbols, contactSheet]) {
    if (/<text\b/i.test(output) || /<script\b|<foreignObject\b|(?:href|src)="https?:\/\/|data:image/i.test(output)) throw new Error('Campaign art SVG contains forbidden embedded or external content.');
  }
  for (const asset of catalog.assets) {
    const token = `id="${asset.symbolId}"`;
    if (symbols.split(token).length !== 2) throw new Error(`Campaign art symbol coverage mismatch for ${asset.key}.`);
  }
  const runtime = JSON.parse(runtimeManifest);
  if (runtime.schema !== RUNTIME_SCHEMA || runtime.assets.length !== catalog.assets.length || runtime.fallbackKey !== catalog.fallbackKey) {
    throw new Error('Campaign art runtime manifest coverage mismatch.');
  }
  return Object.freeze({
    assetCount: catalog.assets.length,
    familyCounts: catalog.familyCounts,
    symbolBytes: Buffer.byteLength(symbols),
    runtimeManifestBytes: Buffer.byteLength(runtimeManifest),
    contactSheetBytes: Buffer.byteLength(contactSheet),
  });
}
