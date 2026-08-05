import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  FONT_COVERAGE_PROBE,
  LOCALIZATION_STYLE_ID,
  LOCALIZED_FONT_STACK,
  LOCALE_CHANGE_EVENT,
  LOCALE_STORAGE_KEY,
} from '../../src/localization/runtime-localization.js';
import { RUNTIME_LOCALIZATION_CATALOGS } from '../../src/localization/runtime-catalogs.js';
import {
  createLocalizer,
  localizationMessageEntries,
  validateCatalogs,
} from '../../src/localization/localization.js';

const projectUrl = new URL('../../', import.meta.url);
const readProjectFile = (path) => readFile(new URL(path, projectUrl), 'utf8');

test('runtime English and Ukrainian catalogs have exact key and placeholder parity', () => {
  const result = validateCatalogs(RUNTIME_LOCALIZATION_CATALOGS);
  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.catalogs.length, 2);
  assert.ok(result.messageCount >= 180);

  const locales = RUNTIME_LOCALIZATION_CATALOGS.map((catalog) => catalog.locale);
  assert.deepEqual(locales, ['en', 'uk']);
  assert.equal(new Set(locales).size, locales.length);

  const englishKeys = localizationMessageEntries(RUNTIME_LOCALIZATION_CATALOGS[0]).map(([key]) => key);
  const ukrainianKeys = localizationMessageEntries(RUNTIME_LOCALIZATION_CATALOGS[1]).map(([key]) => key);
  assert.deepEqual(ukrainianKeys, englishKeys);
});

test('runtime catalog switches reversibly and preserves interpolation contracts', () => {
  const localizer = createLocalizer(RUNTIME_LOCALIZATION_CATALOGS, { locale: 'en' });
  assert.equal(localizer.t('runtime.mission.begin'), 'Begin Operation');
  assert.equal(localizer.t('runtime.wave.countdown', { wave: 2, seconds: 14 }), 'wave 2 in 14s');

  assert.equal(localizer.setLocale('uk-UA'), true);
  assert.equal(localizer.t('runtime.mission.begin'), 'Почати операцію');
  assert.equal(localizer.t('runtime.wave.countdown', { wave: 2, seconds: 14 }), 'хвиля 2 через 14 с');

  assert.equal(localizer.setLocale('en-GB'), true);
  assert.equal(localizer.t('runtime.mission.begin'), 'Begin Operation');
  assert.throws(() => localizer.t('runtime.wave.countdown', { wave: 2 }), /requires variable "seconds"/);
});

test('declares stable persistence, event, style, and Cyrillic font-coverage contracts', () => {
  assert.equal(LOCALE_STORAGE_KEY, 'fields-of-resolve.locale.v1');
  assert.equal(LOCALE_CHANGE_EVENT, 'fields-of-resolve:localechange');
  assert.equal(LOCALIZATION_STYLE_ID, 'fields-of-resolve-localization-style');
  assert.match(FONT_COVERAGE_PROBE, /Україна/);
  assert.match(FONT_COVERAGE_PROBE, /ҐЄІЇ/);
  assert.match(LOCALIZED_FONT_STACK, /Noto Serif/);
  assert.match(LOCALIZED_FONT_STACK, /DejaVu Serif/);
  assert.match(LOCALIZED_FONT_STACK, /serif$/);
});

test('all statically referenced UI and binding keys exist in both runtime catalogs', async () => {
  const [uiSource, adapterSource] = await Promise.all([
    readProjectFile('src/ui.js'),
    readProjectFile('src/localization/runtime-localization.js'),
  ]);
  const knownKeys = new Set(localizationMessageEntries(RUNTIME_LOCALIZATION_CATALOGS[0]).map(([key]) => key));
  const referencedKeys = new Set([
    ...[...uiSource.matchAll(/this\.t\('([^']+)'/g)].map((match) => match[1]),
    ...[...adapterSource.matchAll(/'((?:app|resources|runtime)\.[A-Za-z0-9.]+)'/g)].map((match) => match[1]),
  ]);

  assert.ok(referencedKeys.size >= 80);
  for (const key of referencedKeys) {
    assert.ok(knownKeys.has(key), `Missing runtime catalog key referenced by integration: ${key}`);
  }
});

test('locale refresh rerenders copy without reinitializing mission state', async () => {
  const uiSource = await readProjectFile('src/ui.js');
  const subscription = uiSource.match(/this\.localization\.subscribe\(\(\) => \{([\s\S]*?)\n    \}\);/);
  assert.ok(subscription, 'Expected a localization subscription in UI construction.');
  assert.match(subscription[1], /this\.buildMissionCards/);
  assert.match(subscription[1], /this\.refresh\(\)/);
  assert.match(subscription[1], /if \(this\.g\.gameOver\) this\.lastOutcome = null/);
  assert.doesNotMatch(subscription[1], /this\.setMission\(\)/);
});
