import test from 'node:test';
import assert from 'node:assert/strict';

import {
  UI_SKIN,
  UI_SKIN_ASSETS,
  UI_SKIN_COMPONENTS,
  buildUiSkinArtifacts,
  renderUiSkinAssetSvg,
  resolveUiSkinAsset,
  validateUiSkin,
} from '../../src/ui/ui-skin.js';

test('production UI skin contract is versioned, complete, and deeply immutable', () => {
  assert.equal(validateUiSkin(), UI_SKIN);
  assert.equal(UI_SKIN_ASSETS.length, 9);
  assert.equal(UI_SKIN_COMPONENTS.length, 9);
  assert.ok(Object.isFrozen(UI_SKIN));
  assert.ok(Object.isFrozen(UI_SKIN.assets));
  assert.ok(Object.isFrozen(UI_SKIN.assets[0].colors));
  assert.equal(UI_SKIN.tokens.minimumTarget, 32);
  assert.equal(UI_SKIN.accessibility.reducedMotionSupported, true);
});

test('every skin asset has valid scalable nine-slice geometry and deterministic SVG', () => {
  for (const asset of UI_SKIN_ASSETS) {
    assert.ok(asset.slice * 2 < asset.width);
    assert.ok(asset.slice * 2 < asset.height);
    assert.ok(asset.borderWidth <= asset.slice);
    const first = renderUiSkinAssetSvg(asset);
    const second = renderUiSkinAssetSvg(asset.id);
    assert.equal(first, second);
    assert.match(first, /^<svg /);
    assert.match(first, /shape-rendering="crispEdges"/);
    assert.equal(first.includes('<text'), false);
    assert.equal(first.includes('http://') && !first.includes('http://www.w3.org/2000/svg'), false);
  }
});

test('generated SVG artifact set is deterministic and covers every production asset', () => {
  const first = buildUiSkinArtifacts();
  const second = buildUiSkinArtifacts();
  assert.deepEqual(first, second);
  assert.equal(first.length, UI_SKIN_ASSETS.length);
  for (const [index, artifact] of first.entries()) {
    assert.equal(artifact.id, UI_SKIN_ASSETS[index].id);
    assert.equal(artifact.path, `assets/ui/skin/${artifact.id}.svg`);
    assert.equal(artifact.content, renderUiSkinAssetSvg(artifact.id));
  }
});

test('unknown skin assets resolve to a visible diagnostic fallback', () => {
  assert.equal(resolveUiSkinAsset('panel').status, 'found');
  const missing = resolveUiSkinAsset('not-a-skin');
  assert.equal(missing.status, 'fallback');
  assert.equal(missing.asset.id, 'missing');
  assert.match(renderUiSkinAssetSvg('not-a-skin'), /#d65c46/i);
});

test('validator rejects duplicate IDs, broken slices, and missing component assets', () => {
  const duplicate = structuredClone(UI_SKIN);
  duplicate.assets[1].id = duplicate.assets[0].id;
  assert.throws(() => validateUiSkin(duplicate), /Duplicate UI skin asset ID/);

  const brokenSlice = structuredClone(UI_SKIN);
  brokenSlice.assets[0].slice = brokenSlice.assets[0].width / 2;
  assert.throws(() => validateUiSkin(brokenSlice), /nine-slice center/);

  const brokenComponent = structuredClone(UI_SKIN);
  brokenComponent.components[0].assetId = 'unknown';
  assert.throws(() => validateUiSkin(brokenComponent), /references unknown asset/);
});
