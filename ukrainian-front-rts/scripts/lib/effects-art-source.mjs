import { gunzipSync } from 'node:zlib';

export const EFFECT_ART_ASSET_ID = 'shared.effects-core';
export const EFFECT_ART_CANVAS = Object.freeze({ width: 48, height: 48 });
export const EFFECT_ART_FAMILIES = Object.freeze([
  'muzzle-flash', 'tracer', 'shell', 'missile', 'drone', 'impact', 'explosion',
  'smoke', 'fire', 'dust', 'repair', 'heal', 'capture', 'build', 'weather',
]);
export const EFFECT_ART_PALETTE = Object.freeze({
  'effect-blue': '#75c9ff',
  'effect-cyan': '#70e0d0',
  'effect-earth': '#9b7650',
  'effect-green': '#73d58b',
  'effect-orange': '#ff8a35',
  'effect-purple': '#b294d8',
  'effect-red': '#e8533f',
  'effect-smoke': '#aab2ad',
  'effect-smoke-dark': '#59635e',
  'effect-spark': '#dfe9d8',
  'effect-weather': '#b7d7e8',
  'effect-white': '#fff4cf',
  'effect-yellow': '#ffd35a',
  'ink': '#111512',
});

const FRAME_DATA_GZIP_BASE64 = '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';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

const FRAME_SPECS = deepFreeze(JSON.parse(
  gunzipSync(Buffer.from(FRAME_DATA_GZIP_BASE64, 'base64')).toString('utf8'),
));

function frameSvg(spec) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" shape-rendering="crispEdges">',
    `  <title>Fields of Resolve ${spec.family} frame ${spec.frame}</title>`,
    ...spec.body.map((line) => `  ${line}`),
    '</svg>',
    '',
  ].join('\n');
}

export function effectArtFrameSpecs() {
  return FRAME_SPECS;
}

export function buildEffectSourceFrames() {
  return Object.freeze(FRAME_SPECS.map((spec) => Object.freeze({
    ...spec,
    content: frameSvg(spec),
  })));
}

export function assertCompleteEffectArt() {
  const families = new Set(FRAME_SPECS.map((frame) => frame.family));
  for (const family of EFFECT_ART_FAMILIES) {
    if (!families.has(family)) throw new Error(`Missing effect source family: ${family}`);
  }
  if (families.size !== EFFECT_ART_FAMILIES.length) {
    throw new Error('Effect source definitions contain an undeclared family.');
  }
  const runtimeIds = new Set();
  const paths = new Set();
  for (const frame of FRAME_SPECS) {
    if (runtimeIds.has(frame.runtimeId)) throw new Error(`Duplicate effect runtime ID: ${frame.runtimeId}`);
    if (paths.has(frame.path)) throw new Error(`Duplicate effect source path: ${frame.path}`);
    runtimeIds.add(frame.runtimeId);
    paths.add(frame.path);
  }
  return Object.freeze({ families: families.size, frames: FRAME_SPECS.length });
}
