import { createCatalog } from './localization.js';

const ENGLISH_MESSAGES = {
  onboarding: {
    ui: {
      help: 'Help',
      helpTooltip: 'Open help and control reference (F1).',
      eyebrow: 'FIELD MANUAL',
      title: 'Help, glossary, and controls',
      close: 'Close help',
      search: 'Search',
      section: 'Section',
      all: 'All',
      guides: 'Guides',
      controls: 'Controls',
      glossary: 'Glossary',
      resetHints: 'Reset first-time hints',
      keys: 'Keys: {keys}',
      entries: {
        one: '{count} help entry shown.',
        other: '{count} help entries shown.',
      },
      hintsReset: 'First-time hints reset.',
      openGuide: 'Open guide',
      dismiss: 'Dismiss',
      dismissAll: 'Dismiss all',
      currentBinding: 'Current binding: {keys}.',
      unbound: 'This action is currently unbound.',
    },
    actions: {
      w: 'Camera up',
      s: 'Camera down',
      a: 'Camera left',
      d: 'Camera right',
      cancel: 'Cancel current action',
      attackMove: 'Attack-move',
      attackGround: 'Attack ground',
      stop: 'Stop selected units',
      toggleAutoFire: 'Toggle auto-fire',
      cycleSelectionSubgroup: 'Cycle selection subgroup',
      disembark: 'Disembark',
      patrol: 'Patrol',
      guard: 'Guard',
      follow: 'Follow',
      holdPosition: 'Hold position',
      returnForRepair: 'Return for repair',
      selectIdleWorker: 'Select idle worker',
    },
    tutorials: {
      selectUnits: {
        title: 'Take command',
        prompt: 'Select the marked infantry squad, then drag a selection box around both squads.',
        hint1: 'Click a unit to select it.',
        hint2: 'Drag on open terrain to select several units.',
      },
      moveForce: {
        title: 'Move to the assembly area',
        prompt: 'Move the selected squads to the marked assembly area.',
        hint1: 'Right-click the ground to issue a move order.',
      },
      gatherResources: {
        title: 'Secure supplies',
        prompt: 'Assign a worker to the nearby supply point and gather the required resources.',
        hint1: 'Select a worker, then order it to the highlighted resource point.',
      },
      constructBase: {
        title: 'Establish the position',
        prompt: 'Place and complete the highlighted production structure.',
        hint1: 'Open the build menu, choose the highlighted structure, and place it inside the marked area.',
      },
      produceReinforcement: {
        title: 'Raise a reinforcement',
        prompt: 'Queue and complete the highlighted unit at the new structure.',
        hint1: 'Select the production structure and choose the highlighted unit card.',
      },
      winSkirmish: {
        title: 'Clear the checkpoint',
        prompt: 'Use attack-move and defeat the training opposition at the checkpoint.',
        hint1: 'Attack-move advances while engaging threats encountered along the route.',
      },
      useAbility: {
        title: 'Use a tactical ability',
        prompt: 'Activate the highlighted squad ability on the marked target area.',
        hint1: 'Select the squad, choose the highlighted ability, then choose its target.',
      },
      useMinimap: {
        title: 'Read the battlefield',
        prompt: 'Use the minimap to move the camera to the marked objective.',
        hint1: 'Click the pulsing minimap marker to jump the camera.',
      },
      saveProgress: {
        title: 'Preserve the operation',
        prompt: 'Create a manual save, then confirm that it appears in the save list.',
        hint1: 'Open the pause menu and choose Save Game.',
      },
      reviewAccessibility: {
        title: 'Configure your command post',
        prompt: 'Open accessibility settings and confirm the current visual, audio, and input preferences.',
        hint1: 'Prompts remain available in the objective log and can be replayed without resetting progress.',
      },
      completeObjective: {
        title: 'Complete the prologue',
        prompt: 'Capture the marked command post to complete the operation.',
        hint1: 'The objective panel tracks the command post and all optional tutorial reminders.',
      },
    },
    glossary: {
      attackMove: {
        term: 'Attack-move',
        definition: 'Advance toward a point while automatically engaging threats encountered along the route.',
      },
      commandCapacity: {
        term: 'Command capacity',
        definition: 'The force-size limit supplied by headquarters and command structures.',
      },
      controlGroup: {
        term: 'Control group',
        definition: 'A saved selection recalled with a number key; assign with Control plus that number.',
      },
      fogOfWar: {
        term: 'Fog of war',
        definition: 'Areas outside friendly vision where current hostile positions are hidden.',
      },
      garrison: {
        term: 'Garrison',
        definition: 'Units placed inside a compatible structure for protection or firing positions.',
      },
      rallyPoint: {
        term: 'Rally point',
        definition: 'The destination assigned to newly produced units.',
      },
      reconnaissance: {
        term: 'Reconnaissance',
        definition: 'Information gathering that reveals terrain, threats, and targets before committing forces.',
      },
      stance: {
        term: 'Stance',
        definition: 'A persistent behavior policy such as hold position or auto-fire.',
      },
      suppression: {
        term: 'Suppression',
        definition: 'Combat pressure that reduces a unit’s immediate effectiveness and freedom of movement.',
      },
      veterancy: {
        term: 'Veterancy',
        definition: 'Experience earned through battlefield actions that improves a unit within defined limits.',
      },
    },
  },
};

const UKRAINIAN_MESSAGES = {
  onboarding: {
    ui: {
      help: 'Допомога',
      helpTooltip: 'Відкрити довідку та перелік керування (F1).',
      eyebrow: 'ПОЛЬОВИЙ ПОСІБНИК',
      title: 'Довідка, словник і керування',
      close: 'Закрити довідку',
      search: 'Пошук',
      section: 'Розділ',
      all: 'Усі',
      guides: 'Посібники',
      controls: 'Керування',
      glossary: 'Словник',
      resetHints: 'Скинути початкові підказки',
      keys: 'Клавіші: {keys}',
      entries: {
        one: 'Показано {count} запис довідки.',
        few: 'Показано {count} записи довідки.',
        many: 'Показано {count} записів довідки.',
        other: 'Показано {count} запису довідки.',
      },
      hintsReset: 'Початкові підказки скинуто.',
      openGuide: 'Відкрити посібник',
      dismiss: 'Закрити',
      dismissAll: 'Закрити всі',
      currentBinding: 'Поточна прив’язка: {keys}.',
      unbound: 'Цю дію зараз не прив’язано.',
    },
    actions: {
      w: 'Камера вгору',
      s: 'Камера вниз',
      a: 'Камера ліворуч',
      d: 'Камера праворуч',
      cancel: 'Скасувати поточну дію',
      attackMove: 'Атака в русі',
      attackGround: 'Атака по землі',
      stop: 'Зупинити вибрані підрозділи',
      toggleAutoFire: 'Перемкнути автовогонь',
      cycleSelectionSubgroup: 'Перейти до наступної підгрупи',
      disembark: 'Висадитися',
      patrol: 'Патрулювати',
      guard: 'Охороняти',
      follow: 'Слідувати',
      holdPosition: 'Утримувати позицію',
      returnForRepair: 'Повернутися на ремонт',
      selectIdleWorker: 'Вибрати вільного робітника',
    },
    tutorials: {
      selectUnits: {
        title: 'Переберіть командування',
        prompt: 'Виберіть позначене піхотне відділення, а потім рамкою виділіть обидва відділення.',
        hint1: 'Натисніть підрозділ, щоб вибрати його.',
        hint2: 'Протягніть рамку по вільній місцевості, щоб вибрати кілька підрозділів.',
      },
      moveForce: {
        title: 'Рушайте до району збору',
        prompt: 'Перемістіть вибрані відділення до позначеного району збору.',
        hint1: 'Натисніть правою кнопкою на місцевості, щоб віддати наказ на рух.',
      },
      gatherResources: {
        title: 'Забезпечте постачання',
        prompt: 'Призначте робітника до сусіднього пункту постачання та зберіть потрібні ресурси.',
        hint1: 'Виберіть робітника й накажіть йому рухатися до підсвіченого пункту ресурсів.',
      },
      constructBase: {
        title: 'Облаштуйте позицію',
        prompt: 'Розмістіть і добудуйте підсвічену виробничу споруду.',
        hint1: 'Відкрийте меню будівництва, виберіть підсвічену споруду та розмістіть її в позначеній зоні.',
      },
      produceReinforcement: {
        title: 'Підготуйте підкріплення',
        prompt: 'Поставте підсвічений підрозділ у чергу та завершіть його підготовку в новій споруді.',
        hint1: 'Виберіть виробничу споруду й натисніть картку підсвіченого підрозділу.',
      },
      winSkirmish: {
        title: 'Зачистьте блокпост',
        prompt: 'Застосуйте атаку в русі та знищте навчального противника біля блокпоста.',
        hint1: 'Атака в русі просуває підрозділи вперед і змушує їх вступати в бій із загрозами на маршруті.',
      },
      useAbility: {
        title: 'Застосуйте тактичну здатність',
        prompt: 'Активуйте підсвічену здатність відділення в позначеній зоні цілі.',
        hint1: 'Виберіть відділення, натисніть підсвічену здатність, а потім укажіть ціль.',
      },
      useMinimap: {
        title: 'Читайте поле бою',
        prompt: 'Скористайтеся мінікартою, щоб перемістити камеру до позначеної цілі.',
        hint1: 'Натисніть пульсуючу позначку на мінікарті, щоб перемістити камеру.',
      },
      saveProgress: {
        title: 'Збережіть операцію',
        prompt: 'Створіть ручне збереження та переконайтеся, що воно з’явилося у списку.',
        hint1: 'Відкрийте меню паузи й виберіть «Зберегти гру».',
      },
      reviewAccessibility: {
        title: 'Налаштуйте командний пункт',
        prompt: 'Відкрийте налаштування доступності та перевірте поточні параметри зображення, звуку й введення.',
        hint1: 'Підказки залишаються в журналі завдань і можуть бути відтворені без скидання прогресу.',
      },
      completeObjective: {
        title: 'Завершіть пролог',
        prompt: 'Захопіть позначений командний пункт, щоб завершити операцію.',
        hint1: 'Панель завдань відстежує командний пункт і всі додаткові навчальні нагадування.',
      },
    },
    glossary: {
      attackMove: {
        term: 'Атака в русі',
        definition: 'Рух до вказаної точки з автоматичним вступом у бій із загрозами на маршруті.',
      },
      commandCapacity: {
        term: 'Командна місткість',
        definition: 'Обмеження чисельності сил, яке забезпечують штаб і командні споруди.',
      },
      controlGroup: {
        term: 'Група керування',
        definition: 'Збережений набір підрозділів, який викликається цифровою клавішею; призначається через Control і цю цифру.',
      },
      fogOfWar: {
        term: 'Туман війни',
        definition: 'Ділянки поза дружнім оглядом, де поточне розташування ворога приховане.',
      },
      garrison: {
        term: 'Гарнізон',
        definition: 'Підрозділи всередині сумісної споруди для захисту або ведення вогню.',
      },
      rallyPoint: {
        term: 'Точка збору',
        definition: 'Місце призначення для щойно вироблених підрозділів.',
      },
      reconnaissance: {
        term: 'Розвідка',
        definition: 'Збирання відомостей про місцевість, загрози й цілі перед введенням сил у бій.',
      },
      stance: {
        term: 'Режим поведінки',
        definition: 'Постійна політика дій, наприклад утримання позиції або автовогонь.',
      },
      suppression: {
        term: 'Придушення',
        definition: 'Бойовий тиск, що тимчасово знижує ефективність і свободу руху підрозділу.',
      },
      veterancy: {
        term: 'Бойовий досвід',
        definition: 'Досвід, отриманий у бою, який покращує підрозділ у визначених межах.',
      },
    },
  },
};

export const ONBOARDING_HELP_CATALOGS = Object.freeze([
  createCatalog('en', ENGLISH_MESSAGES),
  createCatalog('uk', UKRAINIAN_MESSAGES),
]);
