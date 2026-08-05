import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COMMAND_CARD_COLUMNS,
  COMMAND_CARD_PAGE_SIZE,
  COMMAND_CARD_ROWS,
  COMMAND_CARD_SCHEMA,
  COMMAND_CARD_STYLESHEET,
  createCommandCardModel,
  navigateCommandCard,
} from '../src/ui/command-card.js';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (path) => readFile(resolve(projectRoot, path), 'utf8');
const fail = (message) => { throw new Error(message); };

const [stylesheet, tacticalInstaller, mainSource] = await Promise.all([
  read(COMMAND_CARD_STYLESHEET),
  read('src/ui/tactical-command-card.js'),
  read('src/main.js'),
]);

const fixture = Array.from({ length: COMMAND_CARD_PAGE_SIZE + 1 }, (_, index) => ({
  id: `fixture-${index}`,
  title: `Fixture ${index}`,
  description: 'Verification action.',
  group: index % 2 ? 'ability' : 'order',
  disabled: index === 2,
  disabledReason: index === 2 ? 'Fixture disabled reason.' : '',
  onClick() {},
}));
const model = createCommandCardModel(fixture);
if (model.schema !== COMMAND_CARD_SCHEMA) fail('Command card schema drifted.');
if (model.columns !== COMMAND_CARD_COLUMNS || model.rows !== COMMAND_CARD_ROWS) fail('Command card grid geometry drifted.');
if (model.pageCount !== 2 || model.actions.length !== COMMAND_CARD_PAGE_SIZE) fail('Command card paging contract is incomplete.');
if (!Object.isFrozen(model) || !Object.isFrozen(model.actions[0])) fail('Command card model must be deeply immutable.');
if (!model.allActions.find((action) => action.disabled)?.disabledReason) fail('Disabled commands must expose a reason.');
const navigation = navigateCommandCard(model, model.actions[0].id, 'ArrowDown');
if (!navigation.actionId || navigation.pageDelta !== 0) fail('Command card grid navigation is invalid.');

const requiredCss = [
  ['4-column grid', /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/],
  ['three rows', /grid-template-rows:\s*repeat\(3,/],
  ['minimum action target', /\.commandCardAction\s*\{[^}]*min-height:\s*var\(--ui-target-min,\s*32px\)/s],
  ['targeting state', /\[data-targeting='true'\]/],
  ['group labels', /\.commandGroupLabel/],
  ['hotkey labels', /\.commandHotkey/],
  ['disabled reasons', /\.commandDisabledReason/],
  ['page controls', /\.commandCardPager/],
  ['reduced motion', /prefers-reduced-motion:\s*reduce/],
  ['forced colors', /forced-colors:\s*active/],
];
for (const [label, pattern] of requiredCss) {
  if (!pattern.test(stylesheet)) fail(`Command card stylesheet is missing ${label}.`);
}

if (!tacticalInstaller.includes("import { installProductionCommandCard } from './command-card.js';")) {
  fail('Tactical command-card composition does not import the production command card.');
}
if (!tacticalInstaller.includes('const disposeProductionCommandCard = installProductionCommandCard(ui);')) {
  fail('Production command card is not installed through the active UI composition seam.');
}
if (!tacticalInstaller.includes("title: 'Attack Ground'")) fail('Existing attack-ground semantics are not exposed in the command card.');
if (!tacticalInstaller.includes('disabledReason:')) fail('Command-card extensions do not provide disabled reasons.');
if (!mainSource.includes("module('tactical-command-card', () => installTacticalCommandCard(ui))")) {
  fail('Active runtime no longer installs the tactical command-card seam.');
}
if (mainSource.indexOf("module('tactical-command-card'") > mainSource.indexOf("module('stance-command-card'")) {
  fail('Production command-card capture must install before stance-card extensions.');
}

process.stdout.write(
  `[command-card] verified ${COMMAND_CARD_COLUMNS}x${COMMAND_CARD_ROWS} grid, ${model.pageCount} pages, `
  + 'grouping, hotkeys, disabled reasons, targeting/stance states, keyboard navigation, styling, and active composition\n',
);
