import assert from 'node:assert/strict';
import test from 'node:test';

import { ENGLISH_CATALOG, LOCALIZATION_CATALOGS, UKRAINIAN_CATALOG } from '../../src/localization/catalogs.js';
import {
  DEFAULT_LOCALE,
  LOCALIZATION_SCHEMA,
  createCatalog,
  createLocalizer,
  localizationMessageEntries,
  localizationPlaceholders,
  normalizeLocale,
  validateCatalogs,
} from '../../src/localization/localization.js';

test('normalizes supported locale tags and rejects unsupported or malformed tags', () => {
  assert.equal(normalizeLocale('en-US'), 'en');
  assert.equal(normalizeLocale('uk_UA'), 'uk');
  assert.equal(normalizeLocale('  UK  '), 'uk');
  assert.equal(normalizeLocale('pl-PL'), null);
  assert.equal(normalizeLocale('not a locale'), null);
  assert.equal(normalizeLocale(null), null);
});

test('ships frozen English and Ukrainian catalogs with exact key and placeholder parity', () => {
  const result = validateCatalogs(LOCALIZATION_CATALOGS);
  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.catalogs.length, 2);
  assert.ok(result.messageCount >= 70);
  assert.ok(Object.isFrozen(ENGLISH_CATALOG));
  assert.ok(Object.isFrozen(UKRAINIAN_CATALOG.messages.commandCard.groups));

  const englishKeys = localizationMessageEntries(ENGLISH_CATALOG).map(([key]) => key);
  const ukrainianKeys = localizationMessageEntries(UKRAINIAN_CATALOG).map(([key]) => key);
  assert.deepEqual(ukrainianKeys, englishKeys);
  assert.deepEqual(localizationPlaceholders(ENGLISH_CATALOG.messages.mission.objectiveProgress), ['completed', 'total']);
});

test('reports missing, extra, shape, placeholder, empty, and forbidden-character defects actionably', () => {
  const broken = createCatalog('uk', {
    common: {
      back: 'Назад {unexpected}',
      extra: 'Зайве',
      empty: '',
      forbidden: 'Некоректно\uE000',
      plural: { other: '{count} елементів' },
    },
  });
  const base = createCatalog('en', {
    common: {
      back: 'Back',
      missing: 'Missing',
      empty: 'Not empty',
      forbidden: 'Valid',
      plural: 'Items',
    },
  });
  const result = validateCatalogs([base, broken]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('Missing message "common.missing"')));
  assert.ok(result.errors.some((error) => error.includes('Extra message "common.extra"')));
  assert.ok(result.errors.some((error) => error.includes('placeholders differ')));
  assert.ok(result.errors.some((error) => error.includes('must use string form')));
  assert.ok(result.errors.some((error) => error.includes('(message) is empty')));
  assert.ok(result.errors.some((error) => error.includes('unsupported control/private-use')));
});

test('translates strings with deterministic fallback and missing-key diagnostics', () => {
  const missing = [];
  const localizer = createLocalizer(LOCALIZATION_CATALOGS, {
    locale: 'uk-UA',
    onMissing: (entry) => missing.push(entry),
  });
  assert.equal(localizer.schema, LOCALIZATION_SCHEMA);
  assert.equal(localizer.locale, 'uk');
  assert.equal(localizer.t('common.cancel'), 'Скасувати');
  assert.equal(localizer.t('mission.objectiveProgress', { completed: 2, total: 4 }), 'Виконано завдань: 2 з 4');
  assert.equal(localizer.t('unknown.key'), '[unknown.key]');
  assert.deepEqual(missing, [{ key: 'unknown.key', locale: 'uk', fallbackUsed: false }]);
  assert.equal(localizer.setLocale('fr'), false);
  assert.equal(localizer.locale, 'uk');
  assert.equal(localizer.setLocale('en-GB'), true);
  assert.equal(localizer.t('common.cancel'), 'Cancel');
});

test('uses locale plural rules and localized count formatting', () => {
  const localizer = createLocalizer(LOCALIZATION_CATALOGS, { locale: 'uk' });
  assert.equal(localizer.t('resources.workers', { count: 1 }), '1 робітник');
  assert.equal(localizer.t('resources.workers', { count: 2 }), '2 робітники');
  assert.equal(localizer.t('resources.workers', { count: 5 }), '5 робітників');
  localizer.setLocale('en');
  assert.equal(localizer.t('resources.workers', { count: 1 }), '1 worker');
  assert.equal(localizer.t('resources.workers', { count: 2 }), '2 workers');
});

test('formats numbers, dates, and lists using the active locale', () => {
  const localizer = createLocalizer(LOCALIZATION_CATALOGS, { locale: 'en' });
  assert.equal(localizer.number(1234.5, { maximumFractionDigits: 1 }), '1,234.5');
  assert.match(localizer.date(new Date('2026-08-05T00:00:00Z'), { timeZone: 'UTC', year: 'numeric' }), /2026/);
  assert.match(localizer.list(['Metal', 'Fuel'], { type: 'conjunction' }), /Metal/);
  localizer.setLocale('uk');
  assert.match(localizer.number(1234.5, { maximumFractionDigits: 1 }), /1[\s ]234,5/);
  assert.match(localizer.list(['Метал', 'Пальне'], { type: 'conjunction' }), /Метал/);
});

test('requires interpolation and plural variables instead of silently corrupting copy', () => {
  const localizer = createLocalizer(LOCALIZATION_CATALOGS);
  assert.throws(() => localizer.t('mission.elapsed'), /requires variable "time"/);
  assert.throws(() => localizer.t('operations.count'), /requires variable "count"/);
  assert.throws(() => localizer.t('operations.count', { count: Number.NaN }), /finite count/);
  assert.throws(() => localizer.number(Infinity), /must be finite/);
  assert.throws(() => localizer.date('invalid'), /must be valid/);
  assert.throws(() => localizer.list('not a list'), /must be an array/);
});

test('exposes immutable diagnostics without leaking mutable catalog internals', () => {
  const localizer = createLocalizer(LOCALIZATION_CATALOGS, { locale: DEFAULT_LOCALE });
  const diagnostics = localizer.diagnostics();
  assert.equal(diagnostics.locale, 'en');
  assert.equal(diagnostics.fallbackLocale, 'en');
  assert.deepEqual(diagnostics.supportedLocales, ['en', 'uk']);
  assert.ok(diagnostics.messageCount >= 70);
  assert.ok(Object.isFrozen(diagnostics));
  assert.ok(Object.isFrozen(diagnostics.supportedLocales));
});
