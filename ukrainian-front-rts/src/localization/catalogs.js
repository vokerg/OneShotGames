import { createCatalog } from './localization.js';

const ENGLISH_MESSAGES = {
  app: {
    title: 'Fields of Resolve',
    subtitle: 'Tactical command on a changing front',
    description: 'A fictionalized single-player real-time strategy campaign.',
    loading: 'Loading…',
    continue: 'Continue',
    newGame: 'New Campaign',
    settings: 'Settings',
    help: 'Help',
    credits: 'Credits',
  },
  common: {
    back: 'Back', cancel: 'Cancel', close: 'Close', confirm: 'Confirm', apply: 'Apply', reset: 'Reset',
    save: 'Save', load: 'Load', delete: 'Delete', retry: 'Retry', continue: 'Continue', yes: 'Yes', no: 'No',
    enabled: 'Enabled', disabled: 'Disabled', unavailable: 'Unavailable',
  },
  navigation: {
    operations: 'Operations', battlefield: 'Battlefield', campaign: 'Campaign', skirmish: 'Skirmish',
    technology: 'Technology', economy: 'Economy', audio: 'Audio', accessibility: 'Accessibility', controls: 'Controls',
  },
  mission: {
    objectiveProgress: 'Objectives completed: {completed} of {total}', elapsed: 'Elapsed time: {time}',
    paused: 'Mission paused', victory: 'Victory', defeat: 'Defeat', primary: 'Primary objective',
    secondary: 'Secondary objective', optional: 'Optional objective', completed: 'Objective completed',
    failed: 'Objective failed', locked: 'Objective locked',
  },
  operations: {
    count: { one: '{count} operation', other: '{count} operations' }, available: 'Available operation',
    completed: 'Completed operation', locked: 'Locked operation', resume: 'Resume operation',
    begin: 'Begin operation', debrief: 'View debrief',
  },
  resources: {
    metal: 'metal', fuel: 'fuel', intel: 'intel', command: 'command',
    workers: { one: '{count} worker', other: '{count} workers' }, capacity: 'capacity', income: 'income', stored: 'stored',
  },
  status: {
    ready: 'Ready', busy: 'Busy', queued: 'Queued', constructing: 'Constructing', researching: 'Researching',
    damaged: 'Damaged', destroyed: 'Destroyed', selected: 'Selected', unselected: 'Not selected', unknown: 'Unknown',
  },
  commandCard: {
    groups: { movement: 'Movement', combat: 'Combat', abilities: 'Abilities', build: 'Construction', production: 'Production', research: 'Research' },
  },
};

const UKRAINIAN_MESSAGES = {
  app: {
    title: 'Поля рішучості', subtitle: 'Тактичне командування на мінливому фронті',
    description: 'Вигадана однокористувацька кампанія в жанрі стратегії реального часу.',
    loading: 'Завантаження…', continue: 'Продовжити', newGame: 'Нова кампанія', settings: 'Налаштування',
    help: 'Довідка', credits: 'Автори',
  },
  common: {
    back: 'Назад', cancel: 'Скасувати', close: 'Закрити', confirm: 'Підтвердити', apply: 'Застосувати',
    reset: 'Скинути', save: 'Зберегти', load: 'Завантажити', delete: 'Видалити', retry: 'Повторити',
    continue: 'Продовжити', yes: 'Так', no: 'Ні', enabled: 'Увімкнено', disabled: 'Вимкнено', unavailable: 'Недоступно',
  },
  navigation: {
    operations: 'Операції', battlefield: 'Поле бою', campaign: 'Кампанія', skirmish: 'Сутичка',
    technology: 'Технології', economy: 'Економіка', audio: 'Звук', accessibility: 'Доступність', controls: 'Керування',
  },
  mission: {
    objectiveProgress: 'Виконано завдань: {completed} з {total}', elapsed: 'Минуло часу: {time}',
    paused: 'Місію призупинено', victory: 'Перемога', defeat: 'Поразка', primary: 'Основне завдання',
    secondary: 'Додаткове завдання', optional: 'Необов’язкове завдання', completed: 'Завдання виконано',
    failed: 'Завдання провалено', locked: 'Завдання заблоковано',
  },
  operations: {
    count: { one: '{count} операція', few: '{count} операції', many: '{count} операцій', other: '{count} операції' },
    available: 'Доступна операція', completed: 'Завершена операція', locked: 'Заблокована операція',
    resume: 'Продовжити операцію', begin: 'Почати операцію', debrief: 'Переглянути звіт',
  },
  resources: {
    metal: 'метал', fuel: 'пальне', intel: 'розвіддані', command: 'командування',
    workers: { one: '{count} робітник', few: '{count} робітники', many: '{count} робітників', other: '{count} робітника' },
    capacity: 'місткість', income: 'надходження', stored: 'у запасі',
  },
  status: {
    ready: 'Готово', busy: 'Зайнято', queued: 'У черзі', constructing: 'Будується', researching: 'Досліджується',
    damaged: 'Пошкоджено', destroyed: 'Знищено', selected: 'Вибрано', unselected: 'Не вибрано', unknown: 'Невідомо',
  },
  commandCard: {
    groups: { movement: 'Рух', combat: 'Бій', abilities: 'Здібності', build: 'Будівництво', production: 'Виробництво', research: 'Дослідження' },
  },
};

export const ENGLISH_CATALOG = createCatalog('en', ENGLISH_MESSAGES);
export const UKRAINIAN_CATALOG = createCatalog('uk', UKRAINIAN_MESSAGES);
export const LOCALIZATION_CATALOGS = Object.freeze([ENGLISH_CATALOG, UKRAINIAN_CATALOG]);
