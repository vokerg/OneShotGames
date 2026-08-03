import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';

import { inspectRgbaPng, inspectSvgSource } from './art-source-image.mjs';

function inside(root, target) {
  const delta = relative(root, target);
  return delta === '' || (!delta.startsWith(`..${sep}`) && delta !== '..' && !isAbsolute(delta));
}

function sameBounds(left, right) {
  return left.x === right.x && left.y === right.y && left.w === right.w && left.h === right.h;
}

export async function inspectArtSourceFrame(root, catalog, frame) {
  const sourcePath = resolve(root, 'art-src', frame.path);
  if (!inside(resolve(root, 'art-src'), sourcePath)) throw new TypeError(`${frame.path}: source path escaped art-src.`);
  const data = await readFile(sourcePath);
  const extension = extname(frame.path).toLowerCase();
  let actual;
  if (extension === '.png') actual = inspectRgbaPng(data, { source: frame.path });
  else if (extension === '.svg') actual = inspectSvgSource(data.toString('utf8'), { source: frame.path });
  else throw new TypeError(`${frame.path}: unsupported source extension.`);
  if (actual.width !== frame.canvas.width || actual.height !== frame.canvas.height) {
    throw new TypeError(`${frame.path}: source dimensions ${actual.width}x${actual.height} do not match ${frame.canvas.width}x${frame.canvas.height}.`);
  }
  if (actual.contentBounds && !sameBounds(actual.contentBounds, frame.contentBounds)) {
    throw new TypeError(`${frame.path}: alpha bounds ${JSON.stringify(actual.contentBounds)} do not match declared ${JSON.stringify(frame.contentBounds)}.`);
  }
  const allowedColors = new Set(frame.paletteTokens.map((token) => catalog.paletteTokens[token]));
  for (const color of actual.colors) if (!allowedColors.has(color)) throw new TypeError(`${frame.path}: undeclared palette color ${color}.`);
  return Object.freeze({
    ...frame,
    sha256: createHash('sha256').update(data).digest('hex'),
    byteLength: data.length,
  });
}

export async function validateArtAtlasHandoff(root, catalog, asset, inspectedFrames) {
  const atlasPath = resolve(root, asset.atlasSource);
  if (!inside(root, atlasPath)) throw new TypeError(`${asset.id}: atlas source escaped the project root.`);
  const atlas = JSON.parse(await readFile(atlasPath, 'utf8'));
  if (atlas.schema !== 'fields-of-resolve.sprite-atlas-source' || atlas.version !== 1) throw new TypeError(`${asset.atlasSource}: unsupported atlas source contract.`);
  const atlasFrames = new Map((atlas.frames ?? []).map((frame) => [frame.id, frame]));
  const atlasDirectory = dirname(atlasPath);
  const directionOrder = atlas.directions?.order ?? ['n'];
  for (const frame of inspectedFrames) {
    const target = atlasFrames.get(frame.runtimeId);
    if (!target) throw new TypeError(`${asset.atlasSource}: missing runtime frame ${frame.runtimeId}.`);
    const resolvedSource = resolve(atlasDirectory, target.source);
    const expectedSource = resolve(root, 'art-src', frame.path);
    if (resolvedSource !== expectedSource) throw new TypeError(`${asset.atlasSource}#${frame.runtimeId}: source path does not match ${frame.path}.`);
    const anchor = target.anchor ?? { x: frame.canvas.width / 2, y: frame.canvas.height };
    if (anchor.x !== frame.anchor.x || anchor.y !== frame.anchor.y) throw new TypeError(`${asset.atlasSource}#${frame.runtimeId}: anchor drift.`);
    for (const token of frame.paletteTokens) {
      const expected = catalog.paletteTokens[token];
      const actual = atlas.paletteTokens?.[token]?.toLowerCase();
      if (actual !== expected) throw new TypeError(`${asset.atlasSource}#${frame.runtimeId}: palette token ${token} drift (${actual ?? 'missing'} != ${expected}).`);
    }
    const animation = atlas.animations?.[frame.animation];
    if (!animation) throw new TypeError(`${asset.atlasSource}: missing animation ${frame.animation}.`);
    const directionId = directionOrder[frame.direction];
    if (!directionId) throw new TypeError(`${asset.atlasSource}#${frame.runtimeId}: direction index ${frame.direction} exceeds atlas direction order.`);
    const sequence = animation.frames ?? animation.directions?.[directionId];
    const entry = Array.isArray(sequence)
      ? sequence.find((candidate) => (typeof candidate === 'string' ? candidate : candidate.frame) === frame.runtimeId)
      : null;
    if (!entry) throw new TypeError(`${asset.atlasSource}: animation ${frame.animation} direction ${directionId} does not reference ${frame.runtimeId}.`);
    const duration = typeof entry === 'string' ? animation.defaultDurationMs ?? 100 : entry.durationMs ?? animation.defaultDurationMs ?? 100;
    if (duration !== frame.durationMs) throw new TypeError(`${asset.atlasSource}#${frame.runtimeId}: duration drift (${duration} != ${frame.durationMs}).`);
  }
}
