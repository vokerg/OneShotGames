import { basename, isAbsolute } from 'node:path';

export const ART_SOURCE_SCHEMA = 'fields-of-resolve.art-source-catalog';
export const ART_SOURCE_VERSION = 1;
export const ART_EXPORT_SCHEMA = 'fields-of-resolve.art-export-manifest';
export const ART_EXPORT_VERSION = 1;

const ASSET_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const SEGMENT = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const FILE_NAME = /^(?<asset>[a-z0-9]+(?:[.-][a-z0-9]+)*)__(?<animation>[a-z0-9]+(?:[.-][a-z0-9]+)*)__d(?<direction>\d{2})__f(?<frame>\d{2,3})\.(?<extension>png|svg)$/;
const KINDS = new Set(['units', 'buildings', 'terrain', 'effects', 'ui', 'campaign', 'diagnostic']);
const REDISTRIBUTION = new Set(['allowed', 'restricted', 'internal-only']);
const APPROVAL = new Set(['diagnostic', 'pending', 'approved', 'rejected']);

function fail(source, path, message) {
  throw new TypeError(`${source}${path ? ` ${path}` : ''}: ${message}`);
}

function object(value, source, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(source, path, 'expected an object');
  return value;
}

function string(value, source, path) {
  if (typeof value !== 'string' || !value.trim()) fail(source, path, 'expected a non-empty string');
  return value;
}

function integer(value, source, path, min = 0) {
  if (!Number.isInteger(value) || value < min) fail(source, path, `expected an integer >= ${min}`);
  return value;
}

function boolean(value, source, path) {
  if (typeof value !== 'boolean') fail(source, path, 'expected a boolean');
  return value;
}

export function stableCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeHex(value, source, path) {
  const text = string(value, source, path).toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(text)) fail(source, path, 'expected a six-digit hexadecimal color');
  return text;
}

export function normalizeRelativePath(value, source, path) {
  const text = string(value, source, path).replaceAll('\\', '/');
  if (isAbsolute(text) || text.startsWith('/') || text.split('/').some((segment) => segment === '..' || segment === '')) {
    fail(source, path, 'expected a normalized repository-relative path without parent traversal');
  }
  return text;
}

function normalizePoint(value, source, path, canvas) {
  const input = object(value, source, path);
  const x = integer(input.x, source, `${path}.x`);
  const y = integer(input.y, source, `${path}.y`);
  if (x > canvas.width || y > canvas.height) fail(source, path, `point (${x}, ${y}) exceeds ${canvas.width}x${canvas.height}`);
  return Object.freeze({ x, y });
}

function normalizeBounds(value, source, path, canvas) {
  const input = object(value, source, path);
  const x = integer(input.x, source, `${path}.x`);
  const y = integer(input.y, source, `${path}.y`);
  const w = integer(input.w, source, `${path}.w`, 1);
  const h = integer(input.h, source, `${path}.h`, 1);
  if (x + w > canvas.width || y + h > canvas.height) fail(source, path, 'content bounds exceed the declared canvas');
  return Object.freeze({ x, y, w, h });
}

function normalizeProvenance(value, source, path) {
  const input = object(value, source, path);
  const createdAt = string(input.createdAt, source, `${path}.createdAt`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(createdAt)) fail(source, `${path}.createdAt`, 'expected YYYY-MM-DD');
  const redistribution = string(input.redistribution, source, `${path}.redistribution`);
  if (!REDISTRIBUTION.has(redistribution)) fail(source, `${path}.redistribution`, `expected one of ${[...REDISTRIBUTION].join(', ')}`);
  const approval = string(input.approval, source, `${path}.approval`);
  if (!APPROVAL.has(approval)) fail(source, `${path}.approval`, `expected one of ${[...APPROVAL].join(', ')}`);
  const transformations = input.transformations ?? [];
  if (!Array.isArray(transformations)) fail(source, `${path}.transformations`, 'expected an array');
  const generatedTools = object(input.generatedTools, source, `${path}.generatedTools`);
  return Object.freeze({
    creator: string(input.creator, source, `${path}.creator`),
    createdAt,
    source: string(input.source, source, `${path}.source`),
    license: string(input.license, source, `${path}.license`),
    redistribution,
    transformations: Object.freeze(transformations.map((entry, index) => string(entry, source, `${path}.transformations[${index}]`))),
    generatedTools: Object.freeze({
      used: boolean(generatedTools.used, source, `${path}.generatedTools.used`),
      details: string(generatedTools.details, source, `${path}.generatedTools.details`),
      humanCorrections: string(generatedTools.humanCorrections, source, `${path}.generatedTools.humanCorrections`),
    }),
    reviewer: string(input.reviewer, source, `${path}.reviewer`),
    approval,
  });
}

function normalizeFrame(value, asset, paletteTokens, source, path) {
  const input = object(value, source, path);
  const framePath = normalizeRelativePath(input.path, source, `${path}.path`);
  if (!framePath.startsWith(`${asset.sourceDirectory}/`)) fail(source, `${path}.path`, `must be inside ${asset.sourceDirectory}`);
  const match = FILE_NAME.exec(basename(framePath));
  if (!match) fail(source, `${path}.path`, 'must use <asset-id>__<animation>__dNN__fNN.(png|svg)');
  const animation = string(input.animation, source, `${path}.animation`);
  if (!SEGMENT.test(animation)) fail(source, `${path}.animation`, 'must be a stable lowercase ID');
  const direction = integer(input.direction, source, `${path}.direction`);
  const frame = integer(input.frame, source, `${path}.frame`);
  if (match.groups.asset !== asset.id || match.groups.animation !== animation || Number(match.groups.direction) !== direction || Number(match.groups.frame) !== frame) {
    fail(source, `${path}.path`, 'filename fields must match asset, animation, direction, and frame metadata');
  }
  const canvasInput = object(input.canvas, source, `${path}.canvas`);
  const canvas = Object.freeze({
    width: integer(canvasInput.width, source, `${path}.canvas.width`, 1),
    height: integer(canvasInput.height, source, `${path}.canvas.height`, 1),
  });
  const contentBounds = normalizeBounds(input.contentBounds, source, `${path}.contentBounds`, canvas);
  const requiredPadding = integer(input.requiredPadding, source, `${path}.requiredPadding`);
  if (
    contentBounds.x < requiredPadding || contentBounds.y < requiredPadding ||
    canvas.width - (contentBounds.x + contentBounds.w) < requiredPadding ||
    canvas.height - (contentBounds.y + contentBounds.h) < requiredPadding
  ) fail(source, `${path}.contentBounds`, `does not preserve ${requiredPadding}px transparent padding`);
  const tokenNames = input.paletteTokens;
  if (!Array.isArray(tokenNames) || !tokenNames.length) fail(source, `${path}.paletteTokens`, 'expected at least one palette token');
  const normalizedTokens = [...new Set(tokenNames.map((name, index) => {
    const token = string(name, source, `${path}.paletteTokens[${index}]`);
    if (!paletteTokens[token]) fail(source, `${path}.paletteTokens[${index}]`, `unknown palette token ${token}`);
    return token;
  }))].sort(stableCompare);
  const attachmentsInput = input.attachments ?? {};
  object(attachmentsInput, source, `${path}.attachments`);
  const attachments = Object.freeze(Object.fromEntries(Object.keys(attachmentsInput).sort(stableCompare).map((name) => [
    string(name, source, `${path}.attachments key`),
    normalizePoint(attachmentsInput[name], source, `${path}.attachments.${name}`, canvas),
  ])));
  return Object.freeze({
    path: framePath,
    runtimeId: string(input.runtimeId, source, `${path}.runtimeId`),
    animation,
    direction,
    frame,
    durationMs: integer(input.durationMs, source, `${path}.durationMs`, 1),
    canvas,
    contentBounds,
    requiredPadding,
    paletteTokens: Object.freeze(normalizedTokens),
    anchor: normalizePoint(input.anchor, source, `${path}.anchor`, canvas),
    attachments,
  });
}

export function validateArtSourceCatalog(value, { source = 'art source catalog' } = {}) {
  const input = object(value, source, '');
  if (input.schema !== ART_SOURCE_SCHEMA) fail(source, '.schema', `expected ${ART_SOURCE_SCHEMA}`);
  if (input.version !== ART_SOURCE_VERSION) fail(source, '.version', `unsupported version ${input.version}`);
  const paletteInput = object(input.paletteTokens, source, '.paletteTokens');
  const paletteTokens = Object.freeze(Object.fromEntries(Object.keys(paletteInput).sort(stableCompare).map((name) => [
    string(name, source, '.paletteTokens key'),
    normalizeHex(paletteInput[name], source, `.paletteTokens.${name}`),
  ])));
  const outputsInput = object(input.outputs, source, '.outputs');
  const outputs = Object.freeze({
    manifest: normalizeRelativePath(outputsInput.manifest, source, '.outputs.manifest'),
    contactSheet: normalizeRelativePath(outputsInput.contactSheet, source, '.outputs.contactSheet'),
  });
  if (!outputs.manifest.startsWith('assets/manifests/')) fail(source, '.outputs.manifest', 'must be under assets/manifests/');
  if (!outputs.contactSheet.startsWith('assets/contact-sheets/')) fail(source, '.outputs.contactSheet', 'must be under assets/contact-sheets/');
  if (!Array.isArray(input.assets) || !input.assets.length) fail(source, '.assets', 'expected at least one asset');
  const assetIds = new Set();
  const sourcePaths = new Set();
  const atlasKeys = new Set();
  const assets = input.assets.map((value, assetIndex) => {
    const path = `.assets[${assetIndex}]`;
    const assetInput = object(value, source, path);
    const id = string(assetInput.id, source, `${path}.id`);
    if (!ASSET_ID.test(id)) fail(source, `${path}.id`, 'must be a stable lowercase ID');
    if (assetIds.has(id)) fail(source, `${path}.id`, `duplicate asset ID ${id}`);
    assetIds.add(id);
    const kind = string(assetInput.kind, source, `${path}.kind`);
    if (!KINDS.has(kind)) fail(source, `${path}.kind`, `expected one of ${[...KINDS].join(', ')}`);
    const sourceDirectory = normalizeRelativePath(assetInput.sourceDirectory, source, `${path}.sourceDirectory`);
    if (!sourceDirectory.startsWith(`${kind}/`)) fail(source, `${path}.sourceDirectory`, `must begin with ${kind}/`);
    const asset = { id, kind, sourceDirectory };
    const frames = assetInput.frames;
    if (!Array.isArray(frames) || !frames.length) fail(source, `${path}.frames`, 'expected at least one frame');
    const normalizedFrames = frames.map((frame, frameIndex) => normalizeFrame(frame, asset, paletteTokens, source, `${path}.frames[${frameIndex}]`));
    for (const frame of normalizedFrames) {
      if (sourcePaths.has(frame.path)) fail(source, `${path}.frames`, `duplicate source path ${frame.path}`);
      sourcePaths.add(frame.path);
      const atlasKey = `${assetInput.atlasSource}#${frame.runtimeId}`;
      if (atlasKeys.has(atlasKey)) fail(source, `${path}.frames`, `duplicate atlas key ${atlasKey}`);
      atlasKeys.add(atlasKey);
    }
    return Object.freeze({
      id,
      kind,
      family: string(assetInput.family, source, `${path}.family`),
      faction: string(assetInput.faction, source, `${path}.faction`),
      sourceDirectory,
      atlasSource: normalizeRelativePath(assetInput.atlasSource, source, `${path}.atlasSource`),
      provenance: normalizeProvenance(assetInput.provenance, source, `${path}.provenance`),
      frames: Object.freeze(normalizedFrames.sort((left, right) => stableCompare(left.path, right.path))),
    });
  }).sort((left, right) => stableCompare(left.id, right.id));
  return Object.freeze({
    schema: ART_SOURCE_SCHEMA,
    version: ART_SOURCE_VERSION,
    id: string(input.id, source, '.id'),
    paletteTokens,
    outputs,
    assets: Object.freeze(assets),
  });
}
