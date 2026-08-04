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

function svgBody(text) {
  const match = String(text).match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/i);
  if (!match) throw new TypeError('Effect source frame is missing an SVG root.');
  return match[1].replace(/<title>[\s\S]*?<\/title>/i, '').replace(/>\s+</g, '><').trim();
}

function compactAtlasSvg(layout, sourceById) {
  const groups = layout.frames.map((frame) => (
    `<g id="${frame.id}" transform="translate(${frame.x} ${frame.y})">${svgBody(sourceById.get(frame.id))}</g>`
  ));
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" shape-rendering="crispEdges"><title>Fields of Resolve effects atlas</title>${groups.join('')}</svg>\n`;
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
      [EFFECTS_ATLAS_IMAGE_PATH]: compactAtlasSvg(layout, sourceById),
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
