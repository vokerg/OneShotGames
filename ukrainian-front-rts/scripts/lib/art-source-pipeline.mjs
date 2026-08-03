import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

import {
  ART_EXPORT_SCHEMA,
  ART_EXPORT_VERSION,
  ART_SOURCE_SCHEMA,
  ART_SOURCE_VERSION,
  stableCompare,
  validateArtSourceCatalog,
} from './art-source-contract.mjs';
import { inspectRgbaPng } from './art-source-image.mjs';
import { inspectArtSourceFrame, validateArtAtlasHandoff } from './art-source-handoff.mjs';

export {
  ART_EXPORT_SCHEMA,
  ART_EXPORT_VERSION,
  ART_SOURCE_SCHEMA,
  ART_SOURCE_VERSION,
  inspectRgbaPng,
  validateArtSourceCatalog,
};

function xmlEscape(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

async function contactSheetSvg(root, assets) {
  const frames = assets.flatMap((asset) => asset.frames.map((frame) => ({ asset, frame })));
  const columns = Math.min(4, Math.max(1, frames.length));
  const cellWidth = 220;
  const cellHeight = 180;
  const rows = Math.ceil(frames.length / columns);
  const elements = [];
  for (let index = 0; index < frames.length; index += 1) {
    const { asset, frame } = frames[index];
    const data = await readFile(resolve(root, 'art-src', frame.path));
    const mime = extname(frame.path).toLowerCase() === '.png' ? 'image/png' : 'image/svg+xml';
    const x = (index % columns) * cellWidth;
    const y = Math.floor(index / columns) * cellHeight;
    const maxDraw = 112;
    const scale = Math.min(maxDraw / frame.canvas.width, maxDraw / frame.canvas.height, 4);
    const drawWidth = frame.canvas.width * scale;
    const drawHeight = frame.canvas.height * scale;
    const drawX = x + (cellWidth - drawWidth) / 2;
    const drawY = y + 20 + (maxDraw - drawHeight) / 2;
    elements.push(`  <g id="${xmlEscape(asset.id)}-${frame.direction}-${frame.frame}">`);
    elements.push(`    <rect x="${x}" y="${y}" width="${cellWidth}" height="${cellHeight}" fill="url(#checker)" stroke="#5b655c"/>`);
    elements.push(`    <image x="${drawX}" y="${drawY}" width="${drawWidth}" height="${drawHeight}" href="data:${mime};base64,${data.toString('base64')}" image-rendering="pixelated"/>`);
    elements.push(`    <text x="${x + 8}" y="${y + 148}" font-family="monospace" font-size="11" fill="#e5eadf">${xmlEscape(asset.id)}</text>`);
    elements.push(`    <text x="${x + 8}" y="${y + 164}" font-family="monospace" font-size="10" fill="#abb7aa">${xmlEscape(`${frame.animation} d${String(frame.direction).padStart(2, '0')} f${String(frame.frame).padStart(2, '0')} · ${frame.durationMs}ms`)}</text>`);
    elements.push('  </g>');
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${columns * cellWidth}" height="${rows * cellHeight}" viewBox="0 0 ${columns * cellWidth} ${rows * cellHeight}">`,
    '  <title>Fields of Resolve source asset contact sheet</title>',
    '  <defs><pattern id="checker" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#1b211d"/><path d="M0 0h8v8H0zm8 8h8v8H8z" fill="#29312b"/></pattern></defs>',
    ...elements,
    '</svg>',
    '',
  ].join('\n');
}

export async function buildArtSourceOutputs(projectRoot, catalogPath = 'art-src/manifest.json') {
  const root = resolve(projectRoot);
  const catalog = validateArtSourceCatalog(JSON.parse(await readFile(resolve(root, catalogPath), 'utf8')), { source: catalogPath });
  const assets = [];
  for (const asset of catalog.assets) {
    const frames = [];
    for (const frame of asset.frames) frames.push(await inspectArtSourceFrame(root, catalog, frame));
    await validateArtAtlasHandoff(root, catalog, asset, frames);
    assets.push(Object.freeze({ ...asset, frames: Object.freeze(frames) }));
  }
  assets.sort((left, right) => stableCompare(left.id, right.id));
  const exportManifest = Object.freeze({
    schema: ART_EXPORT_SCHEMA,
    version: ART_EXPORT_VERSION,
    sourceCatalog: catalogPath,
    sourceCatalogId: catalog.id,
    paletteTokens: catalog.paletteTokens,
    assets: Object.freeze(assets.map((asset) => Object.freeze({
      id: asset.id,
      kind: asset.kind,
      family: asset.family,
      faction: asset.faction,
      atlasSource: asset.atlasSource,
      provenance: asset.provenance,
      frames: Object.freeze(asset.frames.map((frame) => Object.freeze({
        path: frame.path,
        runtimeId: frame.runtimeId,
        animation: frame.animation,
        direction: frame.direction,
        frame: frame.frame,
        durationMs: frame.durationMs,
        canvas: frame.canvas,
        contentBounds: frame.contentBounds,
        requiredPadding: frame.requiredPadding,
        paletteTokens: frame.paletteTokens,
        anchor: frame.anchor,
        attachments: frame.attachments,
        sha256: frame.sha256,
        byteLength: frame.byteLength,
      }))),
    }))),
  });
  return Object.freeze({
    catalog,
    manifestPath: resolve(root, catalog.outputs.manifest),
    contactSheetPath: resolve(root, catalog.outputs.contactSheet),
    manifest: `${JSON.stringify(exportManifest, null, 2)}\n`,
    contactSheet: await contactSheetSvg(root, assets),
    assetCount: assets.length,
    frameCount: assets.reduce((sum, asset) => sum + asset.frames.length, 0),
  });
}
