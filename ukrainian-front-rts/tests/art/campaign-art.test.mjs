import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  CAMPAIGN_ART_CATALOG,
  CAMPAIGN_OPERATION_IDS,
  campaignArtHref,
  listCampaignArtAssets,
  resolveCampaignArtAsset,
  resolveOperationCampaignArt,
  validateCampaignArtCatalog,
} from '../../src/ui/campaign-art-catalog.js';
import {
  buildCampaignArtRuntimeManifest,
  renderCampaignArtContactSheet,
  renderCampaignArtSymbols,
  verifyCampaignArtArtifacts,
} from '../../scripts/lib/campaign-art-pipeline.mjs';

const sourceUrl = new URL('../../art-src/campaign/campaign-art-source.json', import.meta.url);

test('campaign art catalog is complete, immutable, and dimension-safe', () => {
  assert.equal(validateCampaignArtCatalog(), CAMPAIGN_ART_CATALOG);
  assert.equal(CAMPAIGN_ART_CATALOG.assets.length, 34);
  assert.deepEqual(CAMPAIGN_ART_CATALOG.familyCounts, {
    operationIllustrations: 5,
    mapOverlays: 5,
    briefingPanels: 5,
    loadingArt: 5,
    endingPanels: 3,
    creditsVisuals: 2,
    debriefMedalFrames: 8,
    fallback: 1,
  });
  assert.ok(Object.isFrozen(CAMPAIGN_ART_CATALOG));
  assert.ok(CAMPAIGN_ART_CATALOG.assets.every((asset) => Object.isFrozen(asset) && Object.isFrozen(asset.safeArea)));
  assert.ok(CAMPAIGN_ART_CATALOG.assets.every((asset) => asset.safeArea.x + asset.safeArea.w <= asset.width));
  assert.ok(listCampaignArtAssets('mapOverlays').every((asset) => asset.background === 'transparent'));
});

test('operation bundles resolve exact art and unknown identities fail visibly', () => {
  for (const operationId of CAMPAIGN_OPERATION_IDS) {
    const bundle = resolveOperationCampaignArt(operationId);
    assert.deepEqual(Object.keys(bundle), ['operationIllustrations', 'mapOverlays', 'briefingPanels', 'loadingArt']);
    assert.ok(Object.values(bundle).every((result) => result.status === 'found' && result.asset.operationId === operationId));
  }
  const missing = resolveCampaignArtAsset('briefingPanels', 'operation-unknown');
  assert.equal(missing.status, 'fallback');
  assert.equal(missing.asset.key, 'fallback:missing');
  assert.match(campaignArtHref(missing), /campaign-art-symbols\.svg#campaign-fallback-missing$/);
});

test('SVG and runtime outputs are deterministic, self-contained, and complete', () => {
  const symbols = renderCampaignArtSymbols();
  const contact = renderCampaignArtContactSheet();
  const manifest = buildCampaignArtRuntimeManifest();
  assert.equal(symbols, renderCampaignArtSymbols());
  assert.equal(contact, renderCampaignArtContactSheet());
  assert.equal(manifest, buildCampaignArtRuntimeManifest());
  assert.doesNotMatch(symbols + contact, /<text\b|<script\b|<foreignObject\b|(?:href|src)="https?:\/\/|data:image/i);
  for (const asset of CAMPAIGN_ART_CATALOG.assets) assert.equal(symbols.split(`id="${asset.symbolId}"`).length, 2);
  const runtime = JSON.parse(manifest);
  assert.equal(runtime.assets.length, 34);
  assert.equal(runtime.assets.filter((asset) => asset.operationId).length, 20);
  assert.equal(runtime.fallbackKey, 'fallback:missing');
});

test('source manifest verification enforces provenance and exact family coverage', async () => {
  const sourceManifest = await readFile(sourceUrl, 'utf8');
  const result = verifyCampaignArtArtifacts({ sourceManifest });
  assert.equal(result.assetCount, 34);
  assert.ok(result.symbolBytes > 10_000);
  assert.ok(result.runtimeManifestBytes > 10_000);
  assert.ok(result.contactSheetBytes > result.symbolBytes);

  const unsafe = JSON.parse(sourceManifest);
  unsafe.provenance.externalInputs = ['third-party-image.png'];
  assert.throws(() => verifyCampaignArtArtifacts({ sourceManifest: JSON.stringify(unsafe) }), /provenance/i);

  const drifted = JSON.parse(sourceManifest);
  drifted.familyCounts.loadingArt = 4;
  assert.throws(() => verifyCampaignArtArtifacts({ sourceManifest: JSON.stringify(drifted) }), /family count drift/i);
});
