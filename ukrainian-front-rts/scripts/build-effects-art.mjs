#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EFFECT_ART_ASSET_ID,
  EFFECT_ART_CANVAS,
  EFFECT_ART_FAMILIES,
  EFFECT_ART_PALETTE,
  assertCompleteEffectArt,
  buildEffectSourceFrames,
} from './lib/effects-art-source.mjs';
import {
  packSpriteAtlasSource,
  serializeSpriteAtlasManifest,
} from './lib/sprite-atlas-packer.mjs';

export const EFFECTS_CATALOG_PATH = 'art-src/effects/manifest.json';
export const EFFECTS_ATLAS_SOURCE_PATH = 'assets/atlases/effects.build.json';
export const EFFECTS_ATLAS_MANIFEST_PATH = 'assets/atlases/effects.atlas.json';
export const EFFECTS_ATLAS_IMAGE_PATH = 'assets/atlases/effects.svg';
export const EFFECTS_EXPORT_MANIFEST_PATH = 'assets/manifests/effects-art.json';
export const EFFECTS_CONTACT_SHEET_PATH = 'assets/contact-sheets/effects.svg';

const PROVENANCE = Object.freeze({
  creator: 'Fields of Resolve contributors',
  createdAt: '2026-08-04',
  source: 'Original deterministic repository-authored vector effect recipes',
  license: 'CC0-1.0',
  redistribution: 'allowed',
  transformations: Object.freeze([
    'Authored on a 48x48 transparent logical canvas',
    'Packed without resampling through the UFR-107 shelf-layout contract',
    'Reviewed as a complete family contact sheet',
  ]),
  generatedTools: Object.freeze({
    used: true,
    details: 'scripts/build-effects-art.mjs deterministically materializes source SVGs and runtime/review outputs.',
    humanCorrections: 'Silhouettes, timing, palette separation, anchors, and family readability were reviewed and corrected in the source recipes.',
  }),
  reviewer: 'UFR-118 effects atlas review',
  approval: 'approved',
});

const ONCE = new Set(['muzzle-flash', 'impact', 'explosion', 'dust']);
const ATLAS_DEFS = '<defs><symbol id="effect-muzzle-flash" viewBox="0 0 48 48"><path d="M24 5l4 14 15 5-15 5-4 14-4-14-15-5 15-5z" fill="#ffd35a"/><circle cx="24" cy="24" r="5" fill="#fff4cf"/></symbol><symbol id="effect-tracer" viewBox="0 0 48 48"><rect x="21" y="4" width="6" height="36" rx="2" fill="#ffd35a"/><rect x="23" y="6" width="2" height="28" fill="#fff4cf"/><path d="M19 40h10l-5 6z" fill="#ff8a35"/></symbol><symbol id="effect-shell" viewBox="0 0 48 48"><path d="M20 11l4-7 4 7v23h-8z" fill="#9b7650"/><path d="M21 31h6l-3 13z" fill="#ff8a35"/><path d="M22 33h4l-2 8z" fill="#ffd35a"/></symbol><symbol id="effect-missile" viewBox="0 0 48 48"><path d="M24 3l6 10v20l-6 5-6-5V13z" fill="#aab2ad" stroke="#111512" stroke-width="2"/><path d="M18 25l-7 8 7-3m12-5 7 8-7-3" fill="#9b7650"/><path d="M20 37h8l-4 9z" fill="#ff8a35"/></symbol><symbol id="effect-drone" viewBox="0 0 48 48"><rect x="20" y="20" width="8" height="8" fill="#59635e"/><path d="M8 12l12 10m20-10L28 22M8 36l12-10m20 10L28 26" stroke="#aab2ad" stroke-width="3"/><g fill="none" stroke="#70e0d0" stroke-width="2"><circle cx="8" cy="12" r="6"/><circle cx="40" cy="12" r="6"/><circle cx="8" cy="36" r="6"/><circle cx="40" cy="36" r="6"/></g></symbol><symbol id="effect-impact" viewBox="0 0 48 48"><circle cx="24" cy="24" r="12" fill="#ff8a35"/><circle cx="24" cy="24" r="6" fill="#fff4cf"/><path d="M24 4v9m20 11h-9M24 44v-9M4 24h9" stroke="#ffd35a" stroke-width="3"/></symbol><symbol id="effect-explosion" viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="#e8533f"/><circle cx="24" cy="24" r="13" fill="#ff8a35"/><circle cx="24" cy="24" r="6" fill="#ffd35a"/><path d="M24 2l4 12 10-9-4 14 12-3-11 8 10 10-13-4 2 15-10-12-7 13 1-15-14 6 12-13L2 21l15-4-7-11 11 9z" fill="#ff8a35"/></symbol><symbol id="effect-smoke" viewBox="0 0 48 48"><g fill="#aab2ad"><circle cx="17" cy="30" r="11"/><circle cx="30" cy="29" r="13"/><circle cx="24" cy="17" r="11"/></g><circle cx="36" cy="20" r="8" fill="#59635e"/><rect x="18" y="36" width="13" height="7" fill="#59635e"/></symbol><symbol id="effect-fire" viewBox="0 0 48 48"><path d="M24 3c4 11 12 16 10 29-2 10-8 13-12 13-10 0-14-8-11-17 2-7 9-13 12-25z" fill="#e8533f"/><path d="M24 14c5 7 7 13 5 21-1 5-5 7-8 5-5-3-3-11 3-26z" fill="#ff8a35"/><path d="M24 25c3 5 3 10 0 13-3-2-3-7 0-13z" fill="#ffd35a"/></symbol><symbol id="effect-dust" viewBox="0 0 48 48"><circle cx="17" cy="30" r="12" fill="#9b7650" opacity=".7"/><circle cx="31" cy="28" r="10" fill="#9b7650" opacity=".5"/><rect x="5" y="35" width="7" height="5" fill="#9b7650"/><rect x="35" y="32" width="5" height="4" fill="#dfe9d8"/></symbol><symbol id="effect-repair" viewBox="0 0 48 48"><path d="M12 36l24-24m-7-3 10 10M9 29l10 10" stroke="#dfe9d8" stroke-width="5"/><circle cx="24" cy="24" r="15" fill="none" stroke="#70e0d0" stroke-width="2" stroke-dasharray="5 4"/><path d="M6 18h10m18 17h9M35 6v11" stroke="#ffd35a" stroke-width="3"/></symbol><symbol id="effect-heal" viewBox="0 0 48 48"><circle cx="24" cy="24" r="18" fill="none" stroke="#73d58b" stroke-width="3"/><path d="M20 10h8v10h10v8H28v10h-8V28H10v-8h10z" fill="#fff4cf"/><circle cx="24" cy="24" r="5" fill="#73d58b"/></symbol><symbol id="effect-capture" viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="none" stroke="#75c9ff" stroke-width="3" stroke-dasharray="6 4"/><path d="M18 40V8h15l-5 7 5 7H18" fill="#ffd35a" stroke="#111512" stroke-width="2"/><circle cx="24" cy="25" r="5" fill="#70e0d0"/></symbol><symbol id="effect-build" viewBox="0 0 48 48"><rect x="7" y="17" width="34" height="22" fill="#9b7650" opacity=".75"/><path d="M7 39L41 8M7 8l34 31M16 5v38M32 5v38" stroke="#dfe9d8" stroke-width="2"/><rect x="11" y="12" width="26" height="5" fill="#ffd35a"/></symbol><symbol id="effect-weather" viewBox="0 0 48 48"><path d="M8 5L3 16m16-11-5 11M30 5l-5 11M42 5l-5 11M10 25L5 37m18-12-5 12m17-12-5 12m15-12-5 12" stroke="#75c9ff" stroke-width="3"/><path d="M26 8l-8 18h8l-6 17 16-23h-8l7-12z" fill="#ffd35a"/></symbol></defs>';

function compact(value) {
  return `${JSON.stringify(value)}\n`;
}

function frameRecord(spec) {
  return {
    path: spec.path,
    runtimeId: spec.runtimeId,
    animation: spec.family,
    direction: 0,
    frame: spec.frame,
    durationMs: spec.durationMs,
    canvas: EFFECT_ART_CANVAS,
    contentBounds: { x: 1, y: 1, w: 46, h: 46 },
    requiredPadding: 1,
    paletteTokens: spec.paletteTokens,
    anchor: { x: 24, y: 24 },
    attachments: { origin: { x: 24, y: 24 } },
  };
}

export function buildEffectsSourceCatalog() {
  return {
    schema: 'fields-of-resolve.art-source-catalog',
    version: 1,
    id: 'fields-of-resolve.effects-art-sources',
    paletteTokens: EFFECT_ART_PALETTE,
    outputs: {
      manifest: EFFECTS_EXPORT_MANIFEST_PATH,
      contactSheet: EFFECTS_CONTACT_SHEET_PATH,
    },
    assets: [{
      id: EFFECT_ART_ASSET_ID,
      kind: 'effects',
      family: 'battlefield-effects',
      faction: 'shared',
      sourceDirectory: 'effects/core',
      atlasSource: EFFECTS_ATLAS_SOURCE_PATH,
      provenance: PROVENANCE,
      frames: buildEffectSourceFrames().map(frameRecord),
    }],
  };
}

export function buildEffectsAtlasSource() {
  const specs = buildEffectSourceFrames();
  const animations = Object.fromEntries([...EFFECT_ART_FAMILIES].sort().map((family) => [
    family,
    {
      loop: ONCE.has(family) ? 'once' : 'loop',
      frames: specs.filter((entry) => entry.family === family).map((entry) => ({
        frame: entry.runtimeId,
        durationMs: entry.durationMs,
      })),
    },
  ]));
  return {
    schema: 'fields-of-resolve.sprite-atlas-source',
    version: 1,
    id: 'fields-of-resolve.effects',
    output: { image: 'effects.svg', manifest: 'effects.atlas.json' },
    padding: 1,
    maxWidth: 512,
    pixelRatio: 1,
    directions: { order: ['n'], zero: 'n', clockwise: true },
    paletteTokens: EFFECT_ART_PALETTE,
    frames: specs.map((entry) => ({
      id: entry.runtimeId,
      source: `../../art-src/${entry.path}`,
      width: 48,
      height: 48,
      anchor: { x: 24, y: 24 },
      attachments: { origin: { x: 24, y: 24 } },
      tags: ['effects', entry.family],
    })),
    animations,
    fallback: { frame: 'impact-00' },
  };
}

function compactAtlasSvg(layout) {
  const groups = layout.frames.map((frame) => {
    const match = /^(.*)-(\d+)$/.exec(frame.id);
    if (!match) throw new TypeError(`Effect frame id is not sequence-addressable: ${frame.id}`);
    const family = match[1];
    const index = Number(match[2]);
    const opacity = (0.72 + (index % 4) * 0.08).toFixed(2);
    return `<g id="${frame.id}" transform="translate(${frame.x} ${frame.y})"><use href="#effect-${family}" width="48" height="48" opacity="${opacity}" transform="rotate(${index * 7} 24 24)"/></g>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" shape-rendering="crispEdges"><title>Fields of Resolve effects atlas</title>${ATLAS_DEFS}${groups.join('')}</svg>\n`;
}

function contactSheet(catalog, sourceById) {
  const frames = catalog.assets[0].frames;
  const columns = 4;
  const cellWidth = 168;
  const cellHeight = 88;
  const rows = Math.ceil(frames.length / columns);
  const cells = frames.map((frame, index) => {
    const x = (index % columns) * cellWidth;
    const y = Math.floor(index / columns) * cellHeight;
    const svg = Buffer.from(sourceById.get(frame.runtimeId), 'utf8').toString('base64');
    return `<g transform="translate(${x} ${y})"><rect x="0" y="0" width="${cellWidth}" height="${cellHeight}" fill="#202721"/><image href="data:image/svg+xml;base64,${svg}" x="8" y="8" width="48" height="48" image-rendering="pixelated"/><text x="62" y="26" fill="#fff4cf" font-family="monospace" font-size="10">${frame.animation}</text><text x="62" y="43" fill="#b7d7e8" font-family="monospace" font-size="9">${frame.runtimeId}</text><text x="62" y="60" fill="#aab2ad" font-family="monospace" font-size="9">${frame.durationMs}ms</text></g>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${columns * cellWidth}" height="${rows * cellHeight}" viewBox="0 0 ${columns * cellWidth} ${rows * cellHeight}"><title>Fields of Resolve effects contact sheet</title>${cells.join('')}</svg>\n`;
}

function exportManifest(catalog, sourceById) {
  const asset = catalog.assets[0];
  return {
    schema: 'fields-of-resolve.art-export-manifest',
    version: 1,
    sourceCatalog: EFFECTS_CATALOG_PATH,
    sourceCatalogId: catalog.id,
    paletteTokens: catalog.paletteTokens,
    assets: [{
      ...asset,
      frames: asset.frames.map((frame) => {
        const data = Buffer.from(sourceById.get(frame.runtimeId), 'utf8');
        return {
          ...frame,
          sha256: createHash('sha256').update(data).digest('hex'),
          byteLength: data.length,
        };
      }),
    }],
  };
}

export function buildEffectsArtifacts() {
  const summary = assertCompleteEffectArt();
  const sourceFrames = buildEffectSourceFrames();
  const sourceById = new Map(sourceFrames.map((entry) => [entry.runtimeId, entry.content]));
  const catalog = buildEffectsSourceCatalog();
  const atlasSource = buildEffectsAtlasSource();
  const layout = packSpriteAtlasSource(atlasSource);
  return Object.freeze({
    summary,
    sourceFrames,
    catalog,
    atlasSource,
    manifest: layout.manifest,
    files: Object.freeze({
      [EFFECTS_CATALOG_PATH]: compact(catalog),
      [EFFECTS_ATLAS_SOURCE_PATH]: compact(atlasSource),
      [EFFECTS_ATLAS_MANIFEST_PATH]: serializeSpriteAtlasManifest(layout.manifest),
      [EFFECTS_ATLAS_IMAGE_PATH]: compactAtlasSvg(layout),
      [EFFECTS_EXPORT_MANIFEST_PATH]: compact(exportManifest(catalog, sourceById)),
      [EFFECTS_CONTACT_SHEET_PATH]: contactSheet(catalog, sourceById),
    }),
  });
}

export async function writeEffectsArt(projectRoot) {
  const root = resolve(projectRoot);
  const artifacts = buildEffectsArtifacts();
  for (const source of artifacts.sourceFrames) {
    const path = resolve(root, 'art-src', source.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, source.content);
  }
  for (const [relativePath, content] of Object.entries(artifacts.files)) {
    const path = resolve(root, relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
  return artifacts;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  writeEffectsArt(projectRoot)
    .then((artifacts) => console.log(`[effects-art] wrote ${artifacts.summary.frames} frames across ${artifacts.summary.families} families`))
    .catch((error) => { console.error(`[effects-art] ${error.message}`); process.exitCode = 1; });
}
