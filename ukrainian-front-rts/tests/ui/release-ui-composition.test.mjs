import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ABILITIES, UNIT_TYPES } from '../../src/config.js';
import { resolveCommandCardIcon } from '../../src/ui/command-card-icons.js';

const projectRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));

test('UFR-160 command cards resolve catalog-backed icons before diagnostic fallback', () => {
  const patrol = resolveCommandCardIcon({ id: 'patrol', title: 'Patrol', group: 'targeting' });
  assert.equal(patrol.status, 'found');
  assert.equal(patrol.asset.key, 'cursors:patrol');

  const infantry = resolveCommandCardIcon({ id: 'train-infantry', title: UNIT_TYPES.uaInfantry.name, group: 'production' });
  assert.equal(infantry.status, 'found');
  assert.equal(infantry.asset.key, 'unitIcons:uaInfantry');

  const buildBarracks = resolveCommandCardIcon({ id: 'build-barracks', title: ABILITIES.buildBarracks.name, group: 'construction' });
  assert.equal(buildBarracks.status, 'found');
  assert.equal(buildBarracks.asset.key, 'abilityIcons:buildBarracks');

  const unknown = resolveCommandCardIcon({ id: 'not-real', title: 'Not real', group: 'ability' });
  assert.equal(unknown.status, 'fallback');
  assert.equal(unknown.asset.key, 'fallback:missing');
});

test('UFR-160 release UI keeps the action card compact and bounds top-HUD growth', async () => {
  const css = await readFile(resolve(projectRoot, 'release-ui.css'), 'utf8');
  assert.match(css, /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /grid-template-rows:\s*repeat\(3,\s*minmax\(34px,\s*1fr\)\)/);
  assert.match(css, /\.commandCardIcon\s*\{/);
  assert.match(css, /\.commandDescription,\s*\n\.commandCardAction \.commandGroupLabel\s*\{[^}]*clip:/s);
  assert.match(css, /--release-topbar-height:\s*64px/);
  assert.match(css, /#workerOverview\.workerOverview\s*\{[^}]*width:\s*0 !important[^}]*visibility:\s*hidden/s);
  assert.match(css, /@media \(min-width:\s*2240px\)[\s\S]*visibility:\s*visible[\s\S]*grid-template-columns:\s*repeat\(8,/);
  assert.match(css, /@media \(max-width:\s*1600px\) and \(min-width:\s*761px\)[\s\S]*#topbar \.resource\.threat\s*\{[^}]*display:\s*none/s);
  assert.match(css, /@media \(max-width:\s*1100px\) and \(min-width:\s*761px\)[\s\S]*#topbar \.crest,\s*\n\s*#economyHudToggle,\s*\n\s*#techTreeToggle\s*\{[^}]*display:\s*none/s);
  assert.match(css, /\.notificationCenter\s*\{[^}]*top:\s*calc\(var\(--release-topbar-height\) \+ 18px\)/s);
});

test('UFR-160 active tactical seam installs release presentation after production command card', async () => {
  const source = await readFile(resolve(projectRoot, 'src/ui/tactical-command-card.js'), 'utf8');
  const productionInstall = source.indexOf('const disposeProductionCommandCard = installProductionCommandCard(ui);');
  const presentationInstall = source.indexOf('const disposeReleaseUiStylesheet = installReleaseUiStylesheet(documentTarget);');
  assert.ok(productionInstall >= 0, 'production command card must remain installed');
  assert.ok(presentationInstall > productionInstall, 'release presentation must layer after production command-card ownership');
  assert.match(source, /decorateCommandCard\(this\.e\?\.abilities, documentTarget\)/);
  assert.match(source, /disabledReasonNode\.textContent = 'Blocked'/);
});
