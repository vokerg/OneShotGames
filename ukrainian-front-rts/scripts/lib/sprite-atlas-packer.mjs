import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';

import {
  SPRITE_ATLAS_SCHEMA,
  SPRITE_ATLAS_VERSION,
  validateSpriteAtlasManifest,
} from '../../src/render/sprite-atlas-manifest.js';

export const SPRITE_ATLAS_SOURCE_SCHEMA = 'fields-of-resolve.sprite-atlas-source';
export const SPRITE_ATLAS_SOURCE_VERSION = 1;

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  return value;
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string.`);
  return value;
}

function requireInteger(value, label, min = 0) {
  if (!Number.isInteger(value) || value < min) throw new TypeError(`${label} must be an integer >= ${min}.`);
  return value;
}

function compareStableIds(left, right) {
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function sourceMime(path) {
  switch (extname(path).toLowerCase()) {
    case '.png': return 'image/png';
    case '.svg': return 'image/svg+xml';
    default: throw new TypeError(`Unsupported atlas source image type: ${path}`);
  }
}

export function probePngDimensions(buffer, source = 'PNG') {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) throw new TypeError(`${source}: invalid PNG data.`);
  const signature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== signature) throw new TypeError(`${source}: invalid PNG signature.`);
  return Object.freeze({ width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) });
}

export function probeSvgDimensions(text, source = 'SVG') {
  const opening = String(text).match(/<svg\b[^>]*>/i)?.[0];
  if (!opening) throw new TypeError(`${source}: missing <svg> root.`);
  const width = opening.match(/\bwidth=["']([0-9]+(?:\.[0-9]+)?)(?:px)?["']/i)?.[1];
  const height = opening.match(/\bheight=["']([0-9]+(?:\.[0-9]+)?)(?:px)?["']/i)?.[1];
  const viewBox = opening.match(/\bviewBox=["']\s*[-+]?\d*\.?\d+\s+[-+]?\d*\.?\d+\s+([0-9]+(?:\.[0-9]+)?)\s+([0-9]+(?:\.[0-9]+)?)\s*["']/i);
  const resolvedWidth = Number(width ?? viewBox?.[1]);
  const resolvedHeight = Number(height ?? viewBox?.[2]);
  if (!Number.isFinite(resolvedWidth) || !Number.isFinite(resolvedHeight) || resolvedWidth <= 0 || resolvedHeight <= 0) {
    throw new TypeError(`${source}: width and height (or viewBox) are required.`);
  }
  return Object.freeze({ width: resolvedWidth, height: resolvedHeight });
}

export async function probeImageDimensions(path) {
  const extension = extname(path).toLowerCase();
  const data = await readFile(path);
  if (extension === '.png') return probePngDimensions(data, path);
  if (extension === '.svg') return probeSvgDimensions(data.toString('utf8'), path);
  throw new TypeError(`Dimension probing is not supported for ${path}.`);
}

function normalizeSourceSpec(value) {
  const input = requireObject(value, 'Atlas source');
  if (input.schema !== SPRITE_ATLAS_SOURCE_SCHEMA) throw new TypeError(`Atlas source schema must be ${SPRITE_ATLAS_SOURCE_SCHEMA}.`);
  if (input.version !== SPRITE_ATLAS_SOURCE_VERSION) throw new TypeError(`Unsupported atlas source version: ${input.version}.`);
  if (!Array.isArray(input.frames) || !input.frames.length) throw new TypeError('Atlas source frames must be a non-empty array.');
  const output = requireObject(input.output, 'Atlas source output');
  const ids = new Set();
  const frames = input.frames.map((frame, index) => {
    const item = requireObject(frame, `Atlas source frame ${index}`);
    const id = requireString(item.id, `Atlas source frame ${index} id`);
    if (ids.has(id)) throw new TypeError(`Duplicate atlas source frame ID: ${id}.`);
    ids.add(id);
    return {
      ...item,
      id,
      source: requireString(item.source, `Atlas source frame ${id} source`),
      width: requireInteger(item.width, `Atlas source frame ${id} width`, 1),
      height: requireInteger(item.height, `Atlas source frame ${id} height`, 1),
    };
  }).sort(compareStableIds);
  return {
    ...input,
    id: requireString(input.id, 'Atlas source id'),
    frames,
    output: {
      image: requireString(output.image, 'Atlas output image'),
      manifest: requireString(output.manifest, 'Atlas output manifest'),
    },
    padding: requireInteger(input.padding ?? 1, 'Atlas source padding'),
    maxWidth: requireInteger(input.maxWidth ?? 2048, 'Atlas source maxWidth', 1),
  };
}

export function packSpriteAtlasSource(value) {
  const source = normalizeSourceSpec(value);
  const largest = Math.max(...source.frames.map((frame) => frame.width + source.padding * 2));
  if (largest > source.maxWidth) throw new RangeError(`Frame width ${largest} exceeds atlas maxWidth ${source.maxWidth}.`);
  let x = source.padding;
  let y = source.padding;
  let rowHeight = 0;
  let usedWidth = 0;
  const placed = [];
  for (const frame of source.frames) {
    if (x > source.padding && x + frame.width + source.padding > source.maxWidth) {
      x = source.padding;
      y += rowHeight + source.padding;
      rowHeight = 0;
    }
    placed.push(Object.freeze({ ...frame, x, y }));
    usedWidth = Math.max(usedWidth, x + frame.width + source.padding);
    rowHeight = Math.max(rowHeight, frame.height);
    x += frame.width + source.padding;
  }
  const width = Math.max(1, usedWidth);
  const height = Math.max(1, y + rowHeight + source.padding);
  const frames = Object.fromEntries(placed.map((frame) => [frame.id, {
    rect: { x: frame.x, y: frame.y, w: frame.width, h: frame.height },
    sourceSize: frame.sourceSize ?? { w: frame.width, h: frame.height },
    offset: frame.offset ?? { x: 0, y: 0 },
    anchor: frame.anchor ?? { x: frame.width / 2, y: frame.height },
    attachments: frame.attachments ?? {},
    masks: frame.masks ?? {},
    tags: frame.tags ?? [],
  }]));
  const manifest = validateSpriteAtlasManifest({
    schema: SPRITE_ATLAS_SCHEMA,
    version: SPRITE_ATLAS_VERSION,
    id: source.id,
    image: {
      src: source.output.image,
      width,
      height,
      pixelRatio: source.pixelRatio ?? 1,
    },
    directions: source.directions ?? { order: ['n'], zero: 'n', clockwise: true },
    paletteTokens: source.paletteTokens ?? {},
    frames,
    animations: source.animations ?? {},
    fallback: source.fallback,
  }, { source: `atlas source ${source.id}` });
  return Object.freeze({ source, width, height, frames: Object.freeze(placed), manifest });
}

export async function loadSpriteAtlasSource(path) {
  const root = resolve(path);
  const input = JSON.parse(await readFile(root, 'utf8'));
  const directory = dirname(root);
  const frames = [];
  for (const frame of input.frames ?? []) {
    const sourcePath = resolve(directory, frame.source);
    const dimensions = await probeImageDimensions(sourcePath);
    if (frame.width !== undefined && frame.width !== dimensions.width) {
      throw new TypeError(`${frame.id}: declared width ${frame.width} does not match ${dimensions.width}.`);
    }
    if (frame.height !== undefined && frame.height !== dimensions.height) {
      throw new TypeError(`${frame.id}: declared height ${frame.height} does not match ${dimensions.height}.`);
    }
    frames.push({ ...frame, width: dimensions.width, height: dimensions.height, sourcePath });
  }
  return packSpriteAtlasSource({ ...input, frames });
}

export async function renderSpriteAtlasSvg(layout) {
  const images = [];
  for (const frame of layout.frames) {
    const data = await readFile(frame.sourcePath);
    const mime = sourceMime(frame.sourcePath);
    images.push(`  <image id="${escapeXml(frame.id)}" x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}" href="data:${mime};base64,${data.toString('base64')}" image-rendering="pixelated"/>`);
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" shape-rendering="crispEdges">`,
    '  <title>Fields of Resolve packed sprite atlas</title>',
    ...images,
    '</svg>',
    '',
  ].join('\n');
}

export function serializeSpriteAtlasManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
