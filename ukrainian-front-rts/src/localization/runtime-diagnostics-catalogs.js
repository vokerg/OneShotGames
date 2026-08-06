import { createCatalog } from './localization.js';

const ENGLISH_MESSAGES = {
  diagnostics: {
    ui: {
      eyebrow: 'FIELDS OF RESOLVE — RECOVERY MODE',
      title: 'The operation could not continue',
      technicalReport: 'Technical report',
      copyReport: 'Copy debug report',
      exportRecovery: 'Export saves and settings',
      exportAndReset: 'Export, then reset local data',
      reload: 'Reload application',
      working: '{label}…',
      complete: '{label} complete.',
      failed: '{label} failed: {error}',
      copyLabel: 'Copy',
      exportLabel: 'Export',
      resetLabel: 'Export and reset',
      copied: 'Debug report copied.',
      exportedEntries: {
        one: 'Exported {count} local data entry.',
        other: 'Exported {count} local data entries.',
      },
      confirmReset: 'The recovery export has been prepared. Reset all Fields of Resolve local data now?',
      resetCancelled: 'Reset cancelled; local data was not changed.',
      resetEntries: {
        one: 'Reset {count} local data entry. Reload to restart cleanly.',
        other: 'Reset {count} local data entries. Reload to restart cleanly.',
      },
      clipboardUnavailable: 'Clipboard access is unavailable.',
      clipboardFailed: 'Clipboard copy failed.',
      downloadUnavailable: 'File download is unavailable.',
    },
  },
};

const UKRAINIAN_MESSAGES = {
  diagnostics: {
    ui: {
      eyebrow: 'ПОЛЯ РІШУЧОСТІ — РЕЖИМ ВІДНОВЛЕННЯ',
      title: 'Операцію неможливо продовжити',
      technicalReport: 'Технічний звіт',
      copyReport: 'Копіювати звіт налагодження',
      exportRecovery: 'Експортувати збереження й налаштування',
      exportAndReset: 'Експортувати й скинути локальні дані',
      reload: 'Перезавантажити застосунок',
      working: '{label}…',
      complete: '{label}: завершено.',
      failed: '{label}: помилка — {error}',
      copyLabel: 'Копіювання',
      exportLabel: 'Експорт',
      resetLabel: 'Експорт і скидання',
      copied: 'Звіт налагодження скопійовано.',
      exportedEntries: {
        one: 'Експортовано {count} запис локальних даних.',
        few: 'Експортовано {count} записи локальних даних.',
        many: 'Експортовано {count} записів локальних даних.',
        other: 'Експортовано {count} запису локальних даних.',
      },
      confirmReset: 'Експорт відновлення підготовлено. Скинути всі локальні дані «Полів рішучості» зараз?',
      resetCancelled: 'Скидання скасовано; локальні дані не змінено.',
      resetEntries: {
        one: 'Скинуто {count} запис локальних даних. Перезавантажте застосунок для чистого запуску.',
        few: 'Скинуто {count} записи локальних даних. Перезавантажте застосунок для чистого запуску.',
        many: 'Скинуто {count} записів локальних даних. Перезавантажте застосунок для чистого запуску.',
        other: 'Скинуто {count} запису локальних даних. Перезавантажте застосунок для чистого запуску.',
      },
      clipboardUnavailable: 'Буфер обміну недоступний.',
      clipboardFailed: 'Не вдалося скопіювати в буфер обміну.',
      downloadUnavailable: 'Завантаження файлу недоступне.',
    },
  },
};

export const RUNTIME_DIAGNOSTICS_CATALOGS = Object.freeze([
  createCatalog('en', ENGLISH_MESSAGES),
  createCatalog('uk', UKRAINIAN_MESSAGES),
]);
