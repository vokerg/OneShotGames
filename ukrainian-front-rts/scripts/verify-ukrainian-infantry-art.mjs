#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateSpriteAtlasManifest } from '../src/render/sprite-atlas-manifest.js';
import {
  generateUkrainianInfantryAtlas,
  UKRAINIAN_INFANTRY_DIRECTIONS,
  UKRAINIAN_INFANTRY_REQUIRED_STATES,
} from './lib/ukrainian-infantry-atlas-generator.mjs';

const EXPECTED_CANONICAL_IDS = Object.freeze([
  'ua.combat-engineers',
  'ua.line-infantry',
  'ua.anti-armor-team',
  'ua.recon-team',
  'ua.casevac-team',
  'ua.mobile-sam',
  'ua.command-team',
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export async function verifyUkrainianInfantryArt(projectRoot) {
  const root = resolve(projectRoot);
  const sourcePath = resolve(root, 'art-src/units/ukraine/infantry/ukrainian-infantry-source.json');
  const catalogPath = resolve(root, 'assets/manifests/ukrainian-infantry-art.json');
  const source = JSON.parse(await readFile(sourcePath, 'utf8'));
  const generated = generateUkrainianInfantryAtlas(source);
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  assert(generated.catalog === `${JSON.stringify(catalog)}\n`, 'committed Ukrainian infantry catalog is stale; regenerate it');
  const manifest = validateSpriteAtlasManifest(generated.manifestObject, { source: 'generated Ukrainian infantry atlas' });
  assert(JSON.stringify(catalog.canonicalUnitIds) === JSON.stringify(EXPECTED_CANONICAL_IDS), 'canonical Ukrainian infantry coverage drifted');
  assert(JSON.stringify(catalog.states) === JSON.stringify(UKRAINIAN_INFANTRY_REQUIRED_STATES), 'state coverage is incomplete');
  assert(JSON.stringify(catalog.directions) === JSON.stringify(UKRAINIAN_INFANTRY_DIRECTIONS), 'direction coverage is incomplete');
  const minimumFrames = Object.freeze({ idle: 2, move: 6, attack: 3, hit: 2, damaged: 2, death: 5, wreck: 1 });
  for (const [state, minimum] of Object.entries(minimumFrames)) {
    const definition = source.states[state];
    assert(definition.frames >= minimum, `${state} must meet the art-bible minimum of ${minimum} frames`);
  }
  assert(source.states.idle.durationsMs.every((value) => value >= 160 && value <= 320), 'idle timing must stay inside the art-bible range');
  assert(source.states.move.durationsMs.every((value) => value >= 80 && value <= 130), 'movement timing must stay inside the art-bible range');
  assert(source.states.attack.durationsMs.every((value) => value >= 40 && value <= 120), 'attack timing must stay inside the art-bible range');
  assert(source.states.death.durationsMs.slice(0, -1).every((value) => value >= 60 && value <= 140), 'death transition timing must stay inside the art-bible range');
  assert(catalog.counts.units === 7, 'expected seven canonical Ukrainian infantry/support identities');
  assert(catalog.counts.battleFrames === 1176, 'expected 1176 directional battlefield frames');
  assert(catalog.counts.animations === 49, 'expected 49 state animations');
  assert(catalog.counts.totalFrames === 1191, 'expected 1191 total atlas frames');
  assert(Object.keys(manifest.frames).length === catalog.counts.totalFrames, 'manifest frame count does not match catalog');
  assert(Object.keys(manifest.animations).length === catalog.counts.animations, 'manifest animation count does not match catalog');
  assert(generated.svg.includes('shape-rendering="crispEdges"'), 'atlas SVG must request crisp-edge rendering');
  assert(generated.svg.includes('<use '), 'atlas SVG must reuse deterministic source definitions');
  assert(!/<text\b/i.test(generated.svg), 'battle atlas must remain text-free');
  assert(!/<script\b|<foreignObject\b|(?:href|src)=["']https?:\/\//i.test(generated.svg), 'atlas must not contain executable or remote content');
  assert(source.provenance.license === 'CC0-1.0' && source.provenance.redistribution === 'allowed', 'provenance must permit redistribution');
  assert(source.provenance.externalInputs.length === 0 && source.provenance.publicFigures.length === 0, 'art source must be original and fictional');
  return Object.freeze({ ...catalog.counts, svgBytes: generated.svg.length, manifestBytes: generated.manifest.length });
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  verifyUkrainianInfantryArt(projectRoot)
    .then((result) => console.log(
      `[ua-infantry-art] verified ${result.units} units, ${result.battleFrames} battlefield frames, `
      + `${result.animations} animations, ${result.totalFrames} total frames`,
    ))
    .catch((error) => {
      console.error(`[ua-infantry-art] ${error.message}`);
      process.exitCode = 1;
    });
}
