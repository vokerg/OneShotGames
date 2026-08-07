(function (global) {
  "use strict";
  const story = global.FE2_STORY_V2;
  if (!story) throw new Error("story-v2-core.js and story-v2-horizon.js must load first");
  const N = (id, node) => { story.nodes[id] = node; };

  story.nodes.model_quiz.quiz.success = "model_matrix_lock";
  N("model_matrix_lock", {
    chapter: "04", title: "MODEL ROOM // CROSS-MATRIX",
    lines: [
      "Перед выходом MODEL ROOM перемешивает четыре спасательные модели и четыре наблюдаемых ограничения. Код строится не из названий моделей, а из типа наблюдения, который первой ломает каждую модель.",
      "Обозначения: R = южный ROUTE; S = южное SKY; U = угловой размер/закат SUN; A = ANTARCTICA. Порядок моделей фиксирован: POLAR CROWN → MIRROR SOUTH → PERSONAL DOME → INFINITE PLANE.",
      "POLAR CROWN растягивает южные расстояния. MIRROR SOUTH вводит отдельную геометрию южного неба. PERSONAL DOME спасает локальное Солнце перспективой. INFINITE PLANE отказывается от конечной ледяной границы.",
      "Введи четырёхбуквенный код наблюдений в порядке моделей."
    ],
    visual: { type: "matrix", title: "MODEL ↔ CONSTRAINT" },
    puzzle: {
      type: "text", label: "4-БУКВЕННЫЙ КОД", answers: ["RSUA", "R S U A", "R-S-U-A"],
      hint: "POLAR CROWN ↔ route; MIRROR SOUTH ↔ sky; PERSONAL DOME ↔ Sun; INFINITE PLANE ↔ Antarctica.",
      success: "drain_trap",
      failText: "Не ищи 'правильную карту'. Сопоставь каждую спасательную модель с наблюдением, из-за которого она вообще понадобилась.",
      effects: { rigor: 2, flags: ["modelCrossSolved"], journal: "MODEL ROOM cross-matrix: POLAR CROWN→route, MIRROR SOUTH→sky, PERSONAL DOME→Sun, INFINITE PLANE→Antarctica." }
    }
  });

  story.nodes.relay_tech.lines = [
    "Каждый 67-й байт четырёх сохранённых пакетов даёт: 5E 52 61 64. В заголовке пакета ключ: SHIFT -0x11. После сдвига получаются четыре ASCII-кода.",
    "Шлюз не даёт таблицу целиком. Он оставляет только контрольный пример: 5E - 11h = 4D = M. Выполни тот же шестнадцатеричный сдвиг для остальных трёх байтов и введи слово."
  ];
  story.nodes.relay_tech.puzzle.hint = "В hex: 52h - 11h = 41h = A; 61h - 11h = 50h = P; 64h - 11h = 53h = S.";

  story.nodes.kestrel_quiz.quiz.success = "vault_crosscheck";
  N("vault_crosscheck", {
    chapter: "06", title: "THE VAULT // CROSS-CHECK",
    lines: [
      "Одноразовый ключ КЕСТРЕЛА не является паролем. RELAY-19 требует собрать четыре цифры из независимых частей уже пройденного дела — это проверка, что ты не дошёл сюда одним архивным документом.",
      "1) Рейс: расчёт 11 400 / 14,5 дал примерно 786. Возьми сотни. 2) Тени: 7,2° помещается в круг 50 раз. Возьми единицы. 3) HZ67: период 67 секунд. Возьми десятки. 4) У Миры изменён был file-C. Возьми позицию C в латинском алфавите.",
      "Соедини четыре цифры без пробелов. Если какой-то фрагмент забыт, журнал и карточки дела помогают восстановить цепочку."
    ],
    visual: { type: "vault", title: "4-SOURCE KEY" },
    puzzle: {
      type: "text", label: "КЛЮЧ", answers: ["7063"],
      hint: "786 → 7; 50 → 0; 67 → 6; C → 3. Получается 7063.",
      success: "vault_offer",
      failText: "Ключ состоит из четырёх отдельных операций, а не из последних четырёх чисел, которые ты видел.",
      effects: { evidence: ["method"], rigor: 2, flags: ["vaultCrossSolved"], journal: "THE VAULT cross-check собран из четырёх независимых нитей: route/shadows/signal/witness." }
    }
  });
})(typeof window !== "undefined" ? window : globalThis);
