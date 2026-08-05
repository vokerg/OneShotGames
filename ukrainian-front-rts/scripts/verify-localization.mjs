import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RUNTIME_LOCALIZATION_CATALOGS } from '../src/localization/runtime-catalogs.js';
import {
  FONT_COVERAGE_PROBE,
  LOCALIZATION_STYLE_ID,
  LOCALIZED_FONT_STACK,
  LOCALE_STORAGE_KEY,
} from '../src/localization/runtime-localization.js';
import { localizationMessageEntries, validateCatalogs } from '../src/localization/localization.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFile(resolve(projectRoot, path), 'utf8');
const fail = (message) => {
  console.error(`[localization] ${message}`);
  process.exitCode = 1;
};

const validation = validateCatalogs(RUNTIME_LOCALIZATION_CATALOGS);
if (!validation.valid) {
  for (const error of validation.errors) fail(error);
}
if (validation.catalogs.length !== 2) fail(`Expected exactly 2 runtime catalogs, found ${validation.catalogs.length}.`);
if (validation.messageCount < 180) fail(`Expected at least 180 localized messages, found ${validation.messageCount}.`);

const locales = RUNTIME_LOCALIZATION_CATALOGS.map((catalog) => catalog.locale);
if (locales.join(',') !== 'en,uk') fail(`Runtime locale order must be en,uk; found ${locales.join(',')}.`);
if (new Set(locales).size !== locales.length) fail('Runtime catalog contains a duplicate locale entry.');

const requiredKeys = [
  'app.title',
  'runtime.locale.switchToEnglish',
  'runtime.locale.switchToUkrainian',
  'runtime.shell.disclaimer',
  'runtime.audio.subtitles',
  'runtime.mission.begin',
  'runtime.commands.attackMove',
  'runtime.selection.guidance',
  'runtime.wave.countdown',
  'runtime.endgame.victory',
];
for (const catalog of RUNTIME_LOCALIZATION_CATALOGS) {
  const keys = new Set(localizationMessageEntries(catalog).map(([key]) => key));
  for (const key of requiredKeys) {
    if (!keys.has(key)) fail(`${catalog.locale} is missing required key ${key}.`);
  }
}

const [indexSource, uiSource, adapterSource, catalogSource] = await Promise.all([
  read('index.html'),
  read('src/ui.js'),
  read('src/localization/runtime-localization.js'),
  read('src/localization/runtime-catalogs.js'),
]);

for (const [path, source] of [
  ['index.html', indexSource],
  ['src/ui.js', uiSource],
  ['src/localization/runtime-localization.js', adapterSource],
  ['src/localization/runtime-catalogs.js', catalogSource],
]) {
  if (source.includes('\uFFFD')) fail(`${path} contains a Unicode replacement character.`);
}

if (!/<meta charset="utf-8"/i.test(indexSource)) fail('index.html must declare UTF-8 before player-facing copy.');
if (!uiSource.includes("installRuntimeLocalization({ documentTarget: document })")) {
  fail('src/ui.js does not install the runtime localization adapter.');
}
if (!uiSource.includes('this.localization.subscribe')) fail('src/ui.js does not subscribe to reversible locale changes.');
if (!uiSource.includes("this.t('runtime.commands.attackMove')")) fail('Core command-card copy is not localized.');
if (!uiSource.includes("this.t('runtime.mission.begin')")) fail('Mission entry copy is not localized.');
if (!adapterSource.includes(LOCALE_STORAGE_KEY)) fail('Runtime adapter does not expose the locale persistence key.');
if (!adapterSource.includes(LOCALIZATION_STYLE_ID)) fail('Runtime adapter does not own its localization style lifecycle.');
if (!adapterSource.includes(LOCALIZED_FONT_STACK)) fail('Runtime adapter does not install the tested Latin/Cyrillic font stack.');
if (!FONT_COVERAGE_PROBE.includes('Україна') || !FONT_COVERAGE_PROBE.includes('ҐЄІЇ')) {
  fail('Font coverage probe must include Ukrainian Cyrillic-specific glyphs.');
}
if (!/[А-ЯІЇЄҐа-яіїєґ]/u.test(catalogSource)) fail('Ukrainian catalog contains no Cyrillic copy.');

if (!process.exitCode) {
  console.log(`[localization] ${validation.catalogs.length} locales, ${validation.messageCount} messages, UTF-8 and runtime integration verified.`);
}
