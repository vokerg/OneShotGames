import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createCommandCardModel } from '../../src/ui/command-card.js';

const stylesheetUrl = new URL('../../command-card.css', import.meta.url);
const sourceUrl = new URL('../../src/ui/command-card.js', import.meta.url);

const representativeActions = [
  {
    id: 'production-long-en',
    title: 'Ukrainian Mechanized Infantry Section',
    description: 'Train a mechanized infantry section with transport-ready battlefield support.',
    meta: '120M 35F',
    className: 'production-command',
    group: 'production',
    onClick() {},
  },
  {
    id: 'return-for-repair',
    title: 'Return for Repair',
    description: 'Send damaged vehicles to the nearest operational repair workshop.',
    meta: 'R',
    hotkey: 'R',
    className: 'command',
    group: 'order',
    onClick() {},
  },
  {
    id: 'production-long-uk',
    title: 'Виробництво українського механізованого піхотного відділення',
    description: 'Підготувати механізоване піхотне відділення для підтримки на полі бою.',
    meta: '120М 35П',
    className: 'production-command',
    group: 'production',
    onClick() {},
  },
  {
    id: 'build-workshop',
    title: 'Build Repair Workshop',
    description: 'Place an operational repair and vehicle-support workshop.',
    meta: '180M 60F',
    className: 'build-command',
    group: 'construction',
    onClick() {},
  },
  {
    id: 'modernization',
    title: 'Advanced Battlefield Logistics',
    description: 'Improve sustained resupply and repair throughput.',
    meta: '90M 40I',
    className: 'upgrade-command',
    group: 'modernization',
    onClick() {},
  },
  {
    id: 'stance',
    title: 'Auto-Fire: ON',
    description: 'Automatically engage valid hostile contacts in weapon range.',
    meta: 'T',
    hotkey: 'T',
    className: 'command stance-on',
    group: 'stance',
    onClick() {},
  },
  {
    id: 'ability',
    title: 'Emergency Smoke Deployment',
    description: 'Deploy screening smoke around the selected formation.',
    meta: '30s',
    className: 'command',
    group: 'ability',
    onClick() {},
  },
];

test('command-card model preserves complete long English and Ukrainian copy for secondary detail surfaces', () => {
  const model = createCommandCardModel(representativeActions);
  const english = model.allActions.find((action) => action.id === 'production-long-en');
  const ukrainian = model.allActions.find((action) => action.id === 'production-long-uk');
  const repair = model.allActions.find((action) => action.id === 'return-for-repair');

  assert.equal(english.title, representativeActions[0].title);
  assert.equal(english.description, representativeActions[0].description);
  assert.equal(english.meta, representativeActions[0].meta);
  assert.equal(ukrainian.title, representativeActions[2].title);
  assert.equal(ukrainian.description, representativeActions[2].description);
  assert.equal(repair.hotkey, 'R');
});

test('compact command-card stylesheet uses one collision-proof information row and exposes full aria-label detail', async () => {
  const [stylesheet, source] = await Promise.all([
    readFile(stylesheetUrl, 'utf8'),
    readFile(sourceUrl, 'utf8'),
  ]);

  assert.match(stylesheet, /#abilities\s*\{[^}]*overflow:\s*visible/s);
  assert.match(
    stylesheet,
    /\.commandCardAction\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto[^}]*align-items:\s*center[^}]*overflow:\s*visible/s,
  );
  assert.match(
    stylesheet,
    /\.commandGroupLabel,[\s\S]*\.commandCardAction \.commandDescription,[\s\S]*\.commandDisabledReason\s*\{[^}]*display:\s*none/s,
  );
  assert.match(
    stylesheet,
    /\.commandCardAction \.commandTitle\s*\{[^}]*grid-column:\s*1[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/s,
  );
  assert.match(
    stylesheet,
    /\.commandCardAction \.abilityMeta\s*\{[^}]*position:\s*static[^}]*grid-column:\s*2[^}]*white-space:\s*nowrap/s,
  );
  assert.match(
    stylesheet,
    /\.commandHotkey\s*\{[^}]*position:\s*static[^}]*grid-column:\s*2[^}]*white-space:\s*nowrap/s,
  );
  assert.match(stylesheet, /\.commandCardAction::after\s*\{[^}]*content:\s*attr\(aria-label\)/s);
  assert.match(stylesheet, /\.commandCardAction:hover::after,[\s\S]*\.commandCardAction:focus-visible::after/);
  assert.match(stylesheet, /@media \(max-width:\s*1050px\)/);
  assert.match(stylesheet, /@media \(forced-colors:\s*active\)/);

  assert.match(
    source,
    /button\.setAttribute\('aria-label', `\$\{action\.title\}\. \$\{action\.description\}\$\{action\.disabledReason \? ` \$\{action\.disabledReason\}` : ''\}`\)/,
  );
});
