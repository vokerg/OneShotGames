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
    groups: {
      movement: 'Movement', combat: 'Combat', abilities: 'Abilities', build: 'Construction',
      production: 'Production', research: 'Research',
    },
    blocked: 'Blocked',
    stance: {
      returnFire: {
        title: 'Return Fire',
        description: 'Engage only the most recent attacker while it remains in weapon range.',
      },
      holdFire: {
        title: 'Hold Fire',
        description: 'Do not acquire targets automatically; explicit attack orders still fire.',
      },
      fireAtWill: {
        title: 'Fire at Will',
        description: 'Engage hostile targets already within weapon range without pursuing.',
      },
      defensive: {
        title: 'Defensive',
        description: 'Acquire within sight and pursue only inside a short stance leash.',
      },
      aggressive: {
        title: 'Aggressive',
        description: 'Acquire farther contacts and pursue within an extended stance leash.',
      },
      holdPosition: {
        title: 'Hold Position',
        description: 'Cancel movement, remain anchored, and engage only targets in weapon range.',
      },
      selected: '{command} selected.',
      unavailable: '{command} is unavailable.',
    },
    tactical: {
      patrol: {
        title: 'Patrol',
        description: 'Cycle between this position and a chosen point, engaging contacts en route.',
      },
      guard: {
        title: 'Guard',
        description: 'Protect a friendly unit or structure and return to its perimeter.',
      },
      follow: {
        title: 'Follow',
        description: 'Maintain a stable escort position around another friendly unit.',
      },
      attackGround: {
        title: 'Attack Ground',
        description: 'Force-fire a battlefield point without requiring a visible target.',
      },
      holdPosition: {
        title: 'Hold Position',
        description: 'Cancel movement and chasing while retaining local weapon response.',
      },
      returnForRepair: {
        title: 'Return for Repair',
        description: 'Send damaged vehicles to the nearest operational repair workshop.',
      },
      selectArmed: 'Select at least one armed Ukrainian unit.',
      guardRequiresArmed: 'Select at least one armed Ukrainian unit to guard another entity.',
      selectDamagedVehicle: 'Select at least one damaged vehicle.',
      noRepairWorkshop: 'No operational repair workshop is available.',
      forceFireArmed: 'Force-fire armed: left-click a battlefield point.',
      armed: '{command} armed: right-click a valid target.',
      unavailable: '{command} is unavailable.',
      holdPositionIssued: 'Hold-position order issued.',
      returnForRepairIssued: 'Return-for-repair order issued.',
    },
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
    groups: {
      movement: 'Рух', combat: 'Бій', abilities: 'Здібності', build: 'Будівництво',
      production: 'Виробництво', research: 'Дослідження',
    },
    blocked: 'Заблоковано',
    stance: {
      returnFire: {
        title: 'Вогонь у відповідь',
        description: 'Відкривати вогонь лише по останньому нападнику, поки він залишається в радіусі дії зброї.',
      },
      holdFire: {
        title: 'Не відкривати вогонь',
        description: 'Не шукати цілі автоматично; прямі накази атакувати все одно дозволяють вести вогонь.',
      },
      fireAtWill: {
        title: 'Вогонь на розсуд',
        description: 'Атакувати ворожі цілі, що вже перебувають у радіусі дії зброї, без переслідування.',
      },
      defensive: {
        title: 'Оборонна',
        description: 'Виявляти цілі в межах видимості й переслідувати лише в короткому радіусі позиції.',
      },
      aggressive: {
        title: 'Агресивна',
        description: 'Виявляти дальші цілі й переслідувати їх у розширеному радіусі позиції.',
      },
      holdPosition: {
        title: 'Утримувати позицію',
        description: 'Скасувати рух, залишатися на місці й атакувати лише цілі в радіусі дії зброї.',
      },
      selected: 'Обрано: {command}.',
      unavailable: 'Команда «{command}» недоступна.',
    },
    tactical: {
      patrol: {
        title: 'Патруль',
        description: 'Рухатися між цією позицією та вибраною точкою, атакуючи виявлені цілі на маршруті.',
      },
      guard: {
        title: 'Охорона',
        description: 'Захищати союзний підрозділ або споруду й повертатися до її периметра.',
      },
      follow: {
        title: 'Слідувати',
        description: 'Утримувати стабільну позицію супроводу біля іншого союзного підрозділу.',
      },
      attackGround: {
        title: 'Вогонь по місцевості',
        description: 'Примусово атакувати точку на полі бою без видимої цілі.',
      },
      holdPosition: {
        title: 'Утримувати позицію',
        description: 'Скасувати рух і переслідування, зберігши вогонь по цілях поруч.',
      },
      returnForRepair: {
        title: 'Повернутися на ремонт',
        description: 'Відправити пошкоджену техніку до найближчої діючої ремонтної майстерні.',
      },
      selectArmed: 'Виберіть щонайменше один озброєний український підрозділ.',
      guardRequiresArmed: 'Виберіть щонайменше один озброєний український підрозділ для охорони іншої цілі.',
      selectDamagedVehicle: 'Виберіть щонайменше одну пошкоджену машину.',
      noRepairWorkshop: 'Немає доступної діючої ремонтної майстерні.',
      forceFireArmed: 'Вогонь по місцевості готовий: клацніть лівою кнопкою точку на полі бою.',
      armed: 'Команда «{command}» готова: клацніть правою кнопкою допустиму ціль.',
      unavailable: 'Команда «{command}» недоступна.',
      holdPositionIssued: 'Наказ утримувати позицію віддано.',
      returnForRepairIssued: 'Наказ повернутися на ремонт віддано.',
    },
  },
};

export const ENGLISH_CATALOG = createCatalog('en', ENGLISH_MESSAGES);
export const UKRAINIAN_CATALOG = createCatalog('uk', UKRAINIAN_MESSAGES);
export const LOCALIZATION_CATALOGS = Object.freeze([ENGLISH_CATALOG, UKRAINIAN_CATALOG]);