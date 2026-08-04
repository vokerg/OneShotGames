import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { ABILITIES, BUILDING_TYPES, UNIT_TYPES, UPGRADES } from '../../src/config.js';
import { reconcileActiveRuntimeContent } from '../../src/content/runtime-content-reconciliation.js';
import { OBJECTIVE_TYPES } from '../../src/systems/objective-library.js';
import {
  UI_ART_CANONICAL_IDS,
  UI_ART_CATALOG,
  listUiArtAssets,
  resolveUiArtAsset,
  uiArtHref,
  validateUiArtCatalog,
} from '../../src/ui/ui-art-catalog.js';
import {
  buildUiArtRuntimeManifest,
  renderUiArtContactSheet,
  renderUiArtSymbols,
  verifyUiArtArtifacts,
} from '../../scripts/lib/ui-art-pipeline.mjs';

const projectRoot = resolve(new URL('../..', import.meta.url).pathname);
const read = (path) => readFile(resolve(projectRoot, path), 'utf8');
const sorted = (values) => [...values].sort();

test('catalog exactly covers current runtime units, buildings, abilities, upgrades, and objective types', () => {
  reconcileActiveRuntimeContent();
  assert.deepEqual(UI_ART_CANONICAL_IDS.portraits, sorted(Object.keys(UNIT_TYPES)));
  assert.deepEqual(UI_ART_CANONICAL_IDS.unitIcons, sorted(Object.keys(UNIT_TYPES)));
  assert.deepEqual(UI_ART_CANONICAL_IDS.buildingIcons, sorted(Object.keys(BUILDING_TYPES)));
  assert.deepEqual(UI_ART_CANONICAL_IDS.abilityIcons, sorted(Object.keys(ABILITIES)));
  assert.deepEqual(UI_ART_CANONICAL_IDS.upgradeIcons, sorted(Object.keys(UPGRADES)));
  assert.deepEqual(UI_ART_CANONICAL_IDS.objectiveIcons, sorted(OBJECTIVE_TYPES));
});

test('art families preserve production dimensions, cursor hotspots, portrait safe areas, and reduced-motion pings', () => {
  validateUiArtCatalog();
  assert.equal(listUiArtAssets('portraits').every((asset) => asset.width === 144 && asset.height === 112), true);
  assert.equal(
    ['unitIcons', 'buildingIcons', 'abilityIcons', 'upgradeIcons', 'objectiveIcons']
      .flatMap((family) => listUiArtAssets(family))
      .every((asset) => asset.width === 32 && asset.height === 32),
    true,
  );
  for (const cursor of listUiArtAssets('cursors')) {
    assert.ok(cursor.hotspot.x >= 0 && cursor.hotspot.x < cursor.width);
    assert.ok(cursor.hotspot.y >= 0 && cursor.hotspot.y < cursor.height);
    assert.deepEqual(cursor.pixelRatios, [1, 2]);
  }
  for (const ping of listUiArtAssets('pings')) {
    assert.equal(ping.durationMs, 900);
    assert.equal(ping.reducedMotion, 'static');
  }
  for (const portrait of listUiArtAssets('portraits')) {
    assert.deepEqual(portrait.safeArea, { x: 12, y: 8, w: 120, h: 92 });
  }
});

test('lookup returns immutable exact assets and a visible explicit fallback', () => {
  const exact = resolveUiArtAsset('abilityIcons', 'barrage');
  assert.equal(exact.status, 'found');
  assert.equal(exact.asset.id, 'barrage');
  assert.equal(uiArtHref(exact), 'assets/ui/ui-art-symbols.svg#ui-ability-icons-barrage');
  const fallback = resolveUiArtAsset('abilityIcons', 'unknown');
  assert.equal(fallback.status, 'fallback');
  assert.equal(fallback.asset.key, 'fallback:missing');
  assert.equal(Object.isFrozen(UI_ART_CATALOG), true);
  assert.equal(Object.isFrozen(exact.asset), true);
});

test('runtime manifest, symbol sheet, and contact sheet are deterministic complete build outputs', async () => {
  const sourceManifest = await read('art-src/ui/ui-art-source.json');
  const first = {
    runtimeManifest: buildUiArtRuntimeManifest(),
    symbols: renderUiArtSymbols(),
    contactSheet: renderUiArtContactSheet(),
  };
  const second = {
    runtimeManifest: buildUiArtRuntimeManifest(),
    symbols: renderUiArtSymbols(),
    contactSheet: renderUiArtContactSheet(),
  };
  assert.deepEqual(first, second);
  const result = verifyUiArtArtifacts({ sourceManifest, ...first });
  assert.equal(result.assetCount, UI_ART_CATALOG.assets.length);
  assert.ok(result.symbolBytes > 0);
  assert.ok(result.contactSheetBytes > 0);
});

test('source and generated artifacts remain original, fictional, text-free, and public-figure-free', async () => {
  const source = await read('art-src/ui/ui-art-source.json');
  const symbols = renderUiArtSymbols();
  const lower = `${source}\n${symbols}`.toLowerCase();
  for (const token of ['zelenskyy', 'zaluzhnyi', 'putin', 'prigozhin']) {
    assert.equal(lower.includes(token), false, `Forbidden public-figure token: ${token}`);
  }
  assert.equal(symbols.includes('<text'), false);
  assert.equal(JSON.parse(source).provenance.externalInputs.length, 0);
  assert.equal(JSON.parse(source).provenance.fictionalSubjectsOnly, true);
});
