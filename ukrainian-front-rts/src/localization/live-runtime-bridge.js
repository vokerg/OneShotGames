const LOCALE_CHANGE_EVENT = 'fields-of-resolve:localechange';
const BRIDGE_KEY = '__fieldsOfResolveLiveRuntimeLocalization';
const CYRILLIC_PATTERN = /[А-ЯІЇЄҐа-яіїєґ]/u;

const UKRAINIAN_PHRASES = Object.freeze([
  ['Manual saves preserve campaign profile state. Active mission snapshots require the checkpoint integration owner.', 'Ручні збереження зберігають стан профілю кампанії. Знімки активної місії потребують інтеграції контрольних точок.'],
  ['Campaign menu. No operation is currently running.', 'Меню кампанії. Жодна операція зараз не виконується.'],
  ['Operation paused. Choose an action.', 'Операцію призупинено. Виберіть дію.'],
  ['Current mission progress will be discarded and the campaign profile will be restored.', 'Поточний прогрес місії буде втрачено, а профіль кампанії — відновлено.'],
  ['Current mission progress since the last supported save will be discarded.', 'Поточний прогрес місії після останнього підтримуваного збереження буде втрачено.'],
  ['Current mission progress will be discarded.', 'Поточний прогрес місії буде втрачено.'],
  ['This save slot will be permanently removed.', 'Цей слот збереження буде видалено назавжди.'],
  ['Audio settings are unavailable in this browser session.', 'Налаштування звуку недоступні в цій сесії браузера.'],
  ['Local storage is unavailable in this browser session.', 'Локальне сховище недоступне в цій сесії браузера.'],
  ['Campaign profile loaded. Select an operation to deploy.', 'Профіль кампанії завантажено. Виберіть операцію для розгортання.'],
  ['Presentation and interaction support available in the assembled runtime.', 'Підтримка відображення та взаємодії, доступна у зібраному середовищі гри.'],
  ['Keyboard-operable menu controls with trapped focus and focus restoration.', 'Керування меню з клавіатури з утриманням і відновленням фокуса.'],
  ['Subtitles, speaker labels, visual audio cues, dynamic range, and per-bus volume in Audio Settings.', 'Субтитри, позначення мовців, візуальні звукові сигнали, динамічний діапазон і гучність каналів у налаштуваннях звуку.'],
  ['Shape-reinforced minimap markers and textual tactical alerts.', 'Позначки мінікарти з дублюванням форми та текстові тактичні сповіщення.'],
  ['Reduced-motion-safe menu presentation with no required animation.', 'Меню не потребує анімації та підтримує зменшення руху.'],
  ['Native controls and status regions compatible with assistive technology.', 'Нативні елементи керування та області стану сумісні з допоміжними технологіями.'],
  ['Choose a battlefield, your faction, and a fair AI difficulty. Both sides begin with the same resource wallet; campaign waves are disabled.', 'Виберіть поле бою, свою фракцію та чесну складність ШІ. Обидві сторони починають з однаковими ресурсами; хвилі кампанії вимкнено.'],
  ['Audio preferences are active, but local persistence is unavailable.', 'Налаштування звуку активні, але локальне збереження недоступне.'],
  ['Audio preferences are active for this session.', 'Налаштування звуку активні для цієї сесії.'],
  ['Audio preferences saved locally.', 'Налаштування звуку збережено локально.'],
  ['Accessibility preferences are active for this session.', 'Налаштування доступності активні для цієї сесії.'],
  ['Accessibility preferences saved locally.', 'Налаштування доступності збережено локально.'],
  ['Focus-loss pause requests are exposed for the active menu/runtime owner.', 'Запити на паузу при втраті фокуса передаються активному власнику меню/середовища.'],
  ['Focus-loss pause is connected.', 'Пауза при втраті фокуса підключена.'],
  ['A conflicting assignment requires a second confirmation.', 'Конфліктне призначення потребує повторного підтвердження.'],
  ['Choose a standard non-modifier key, then Assign.', 'Виберіть стандартну клавішу без модифікатора, потім натисніть «Призначити».'],
  ['Pause the operation and open the game menu.', 'Призупинити операцію та відкрити меню гри.'],
  ['Resume operation and close menu', 'Продовжити операцію та закрити меню'],
  ['Current keyboard and pointer bindings.', 'Поточні прив’язки клавіатури та вказівника.'],
  ['Reduce screen flashes and alert pulses', 'Зменшити спалахи екрана та пульсацію сповіщень'],
  ['Request pause when the game loses focus', 'Запитувати паузу, коли гра втрачає фокус'],
  ['Reduce animation and motion', 'Зменшити анімацію та рух'],
  ['Visual, motion & controls', 'Візуальні параметри, рух і керування'],
  ['Gameplay key bindings', 'Прив’язки клавіш гри'],
  ['Color-vision preset', 'Режим сприйняття кольорів'],
  ['Open Audio Accessibility', 'Відкрити аудіодоступність'],
  ['Quit to Operations', 'Вийти до операцій'],
  ['Restart Operation', 'Перезапустити операцію'],
  ['Resume Operation', 'Продовжити операцію'],
  ['Campaign Saves', 'Збереження кампанії'],
  ['Save Campaign', 'Зберегти кампанію'],
  ['No campaign saves found.', 'Збережень кампанії не знайдено.'],
  ['mission checkpoint', 'контрольна точка місії'],
  ['campaign profile', 'профіль кампанії'],
  ['Audio Settings', 'Налаштування звуку'],
  ['Accessibility', 'Доступність'],
  ['Controls', 'Керування'],
  ['Selection', 'Вибір'],
  ['Orders', 'Накази'],
  ['Camera', 'Камера'],
  ['Left click', 'Ліва кнопка'],
  ['Shift + click', 'Shift + клік'],
  ['Ctrl + click', 'Ctrl + клік'],
  ['Select unit or structure', 'Вибрати підрозділ або споруду'],
  ['Add or remove from selection', 'Додати до вибору або вилучити з нього'],
  ['Select matching units on screen', 'Вибрати однакові підрозділи на екрані'],
  ['Recall control group', 'Викликати групу керування'],
  ['Assign control group', 'Призначити групу керування'],
  ['Right click', 'Права кнопка'],
  ['Move, attack, gather, or interact', 'Рухатися, атакувати, збирати або взаємодіяти'],
  ['Attack-move', 'Атакувати в русі'],
  ['Toggle auto-fire', 'Перемкнути автовогонь'],
  ['Cancel placement or open pause menu', 'Скасувати розміщення або відкрити меню паузи'],
  ['Pan camera', 'Переміщувати камеру'],
  ['Mouse wheel', 'Коліщатко миші'],
  ['Focus current selection', 'Центрувати поточний вибір'],
  ['Minimap click', 'Клік на мінікарті'],
  ['Move camera', 'Перемістити камеру'],
  ['Confirm action', 'Підтвердити дію'],
  ['Continue?', 'Продовжити?'],
  ['Restart operation?', 'Перезапустити операцію?'],
  ['Load campaign save?', 'Завантажити збереження кампанії?'],
  ['Delete campaign save?', 'Видалити збереження кампанії?'],
  ['Quit to operations?', 'Вийти до операцій?'],
  ['Save / Load', 'Зберегти / Завантажити'],
  ['OPERATION MENU', 'МЕНЮ ОПЕРАЦІЇ'],
  ['Pause', 'Пауза'],
  ['Resume', 'Продовжити'],
  ['Back', 'Назад'],
  ['Load', 'Завантажити'],
  ['Delete', 'Видалити'],
  ['Cancel', 'Скасувати'],
  ['Confirm', 'Підтвердити'],
  ['Campaign save deleted.', 'Збереження кампанії видалено.'],
  ['Operation restarted.', 'Операцію перезапущено.'],
  ['Save could not be loaded', 'Не вдалося завантажити збереження'],
  ['Campaign saved at', 'Кампанію збережено о'],
  ['Unknown time', 'Невідомий час'],

  ['Battlefield notifications', 'Сповіщення поля бою'],
  ['Message history', 'Історія повідомлень'],
  ['Clear history', 'Очистити історію'],
  ['Messages', 'Повідомлення'],
  ['View', 'Переглянути'],
  ['Objective complete', 'Завдання виконано'],
  ['Production complete', 'Виробництво завершено'],
  ['Research complete', 'Дослідження завершено'],
  ['Save not completed', 'Збереження не завершено'],
  ['Game saved', 'Гру збережено'],
  ['Under attack:', 'Під атакою:'],
  ['damage taken', 'отримано шкоди'],
  ['strength remaining', 'залишок міцності'],
  ['deployed from', 'розгорнуто з'],
  ['is now available.', 'тепер доступно.'],
  ['Focus map location.', 'Перейти до точки на мапі.'],
  ['is under attack.', 'під атакою.'],
  ['Objective', 'Завдання'],
  ['complete.', 'виконано.'],
  ['deployed.', 'розгорнуто.'],
  ['ATTACK', 'АТАКА'],
  ['PRODUCTION', 'ВИРОБНИЦТВО'],
  ['INFO', 'ІНФО'],

  ['Skirmish — Custom Match', 'Сутичка — власний матч'],
  ['Battlefield', 'Поле бою'],
  ['Your faction', 'Ваша фракція'],
  ['Opponent', 'Супротивник'],
  ['AI difficulty', 'Складність ШІ'],
  ['Begin Skirmish', 'Почати сутичку'],
  ['Match time', 'Час матчу'],
  ['Victory conditions', 'Умови перемоги'],
  ['Player gathered', 'Зібрано гравцем'],
  ['AI gathered', 'Зібрано ШІ'],
  ['SKIRMISH', 'СУТИЧКА'],
  ['NORMAL', 'ЗВИЧАЙНА'],
  ['EASY', 'ЛЕГКА'],
  ['HARD', 'ВАЖКА'],

  ['Mission deployed.', 'Місію розгорнуто.'],
  ['First enemy assault in', 'Перший ворожий штурм через'],
  ['seconds.', 'с.'],
  ['scripted pressure', 'сценарний тиск'],
  ['objectives', 'завдань'],

  ['Visual, motion & controls', 'Візуальні параметри, рух і керування'],
  ['UI scale', 'Масштаб інтерфейсу'],
  ['Text scale', 'Масштаб тексту'],
  ['Contrast', 'Контраст'],
  ['Cursor size', 'Розмір курсора'],
  ['Key bindings', 'Прив’язки клавіш'],
  ['Unbound', 'Не призначено'],
  ['Assign', 'Призначити'],
  ['Standard', 'Стандартний'],
  ['High contrast', 'Високий контраст'],
  ['Incoming attack', 'Вхідна атака'],
  ['Alert', 'Тривога'],
  ['Command unavailable', 'Команда недоступна'],
  ['Unit cannot comply', 'Підрозділ не може виконати наказ'],
  ['Objective updated', 'Завдання оновлено'],
  ['Audio cue', 'Звуковий сигнал'],
  ['Victory', 'Перемога'],
  ['Defeat', 'Поразка'],

  ['Ukrainian Combat Engineer Section', 'Українське відділення бойових інженерів'],
  ['Combat Engineers', 'Бойові інженери'],
  ['Construction, repair, and field logistics', 'Будівництво, ремонт і польова логістика'],
  ['Ukrainian Mechanized Infantry Squad', 'Українське механізоване піхотне відділення'],
  ['Mechanized Squad', 'Механізоване відділення'],
  ['Dismounted line infantry', 'Лінійна піхота у пішому порядку'],
  ['Ukrainian FPV Strike Team', 'Українська ударна група FPV'],
  ['FPV Strike Team', 'Ударна група FPV'],
  ['Fast precision unmanned strike element', 'Швидкий високоточний безпілотний ударний елемент'],
  ['Ukrainian CASEVAC Team', 'Українська група CASEVAC'],
  ['CASEVAC Team', 'Група CASEVAC'],
  ['Combat lifesavers and casualty evacuation', 'Бойові медики та евакуація поранених'],
  ['Mechanized infantry fighting vehicle', 'Механізована бойова машина піхоти'],
  ['Ukrainian main battle tank', 'Український основний бойовий танк'],
  ['155 mm self-propelled artillery', '155-мм самохідна артилерія'],
  ['Brigade Command Post', 'Бригадний командний пункт'],
  ['Command, engineering recruitment, and senior leadership.', 'Командування, набір інженерів і старше керівництво.'],
  ['Field Logistics Depot', 'Польовий логістичний склад'],
  ['Raises command capacity and anchors field logistics.', 'Збільшує командну спроможність і підтримує польову логістику.'],
  ['Infantry Assembly Area', 'Район збору піхоти'],
  ['Produces infantry and CASEVAC teams.', 'Виробляє піхотні та CASEVAC-підрозділи.'],
  ['Repair and Recovery Point', 'Ремонтно-евакуаційний пункт'],
  ['Produces drones, armored vehicles, and artillery; hosts modernization.', 'Виробляє дрони, бронетехніку й артилерію; забезпечує модернізацію.'],
  ['Fragmentation Grenade', 'Осколкова граната'],
  ['Area damage against a fire team.', 'Ураження по площі проти вогневої групи.'],
  ['Aerial Reconnaissance', 'Повітряна розвідка'],
  ['Reveal a broad tactical area.', 'Відкрити широку тактичну зону.'],
  ['FPV Precision Strike', 'Високоточний удар FPV'],
  ['Heavy precision damage to one target.', 'Потужне високоточне ураження однієї цілі.'],
  ['Casualty Stabilization', 'Стабілізація поранених'],
  ['Restore nearby friendly squads.', 'Відновити сусідні союзні підрозділи.'],
  ['Place Logistics Depot', 'Розмістити логістичний склад'],
  ['Place Infantry Area', 'Розмістити район піхоти'],
  ['Place Repair Workshop', 'Розмістити ремонтну майстерню'],
  ['Dismount Infantry', 'Спішити піхоту'],
  ['Artillery Fire Mission', 'Артилерійська вогнева задача'],
  ['Smoke-Screen Launchers', 'Пускові установки димової завіси'],
  ['Counter-UAS Roof Protection', 'Даховий захист від БпЛА'],
  ['Thermal Fire-Control Sights', 'Тепловізійні приціли керування вогнем'],
  ['NATO 155 mm Ammunition', '155-мм боєприпаси НАТО'],
  ['Active Protection Suite', 'Комплекс активного захисту'],
  ['Digital Battle Management', 'Цифрове управління боєм'],
  ['KMT Mine-Roller Kit', 'Комплект мінного трала КМТ'],
]);

const ATTRIBUTES = Object.freeze(['aria-label', 'data-tooltip', 'title', 'placeholder']);
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);

function replaceAllLiteral(value, search, replacement) {
  return value.includes(search) ? value.split(search).join(replacement) : value;
}

export function translateLiveRuntimeText(value, locale = 'en') {
  const source = String(value ?? '');
  if (locale !== 'uk' || !source) return source;
  let translated = source;
  for (const [english, ukrainian] of UKRAINIAN_PHRASES) {
    translated = replaceAllLiteral(translated, english, ukrainian);
  }
  translated = translated
    .replace(/Mission deployed\. First enemy assault in (\d+) seconds\./g, 'Місію розгорнуто. Перший ворожий штурм через $1 с.')
    .replace(/Messages \((\d+)\)/g, 'Повідомлення ($1)')
    .replace(/Objective (\d+) complete\./g, 'Завдання $1 виконано.')
    .replace(/(\d+) damage taken · (\d+\/\d+) strength remaining/g, 'Отримано шкоди: $1 · залишок міцності $2');
  return translated;
}

function localeOf(documentTarget) {
  return documentTarget?.documentElement?.lang === 'uk' ? 'uk' : 'en';
}

function textNodes(root) {
  const result = [];
  const visit = (node) => {
    if (!node) return;
    if (node.nodeType === 3) {
      if (String(node.nodeValue ?? '').trim()) result.push(node);
      return;
    }
    if (node.nodeType !== 1 && node !== root) return;
    if (SKIP_TAGS.has(String(node.tagName || '').toUpperCase())) return;
    for (const child of node.childNodes || []) visit(child);
  };
  visit(root);
  return result;
}

export function installLiveRuntimeLocalizationBridge({
  documentTarget = globalThis.document,
  windowTarget = globalThis.window,
} = {}) {
  if (!documentTarget?.documentElement || !documentTarget?.addEventListener) return () => {};
  if (documentTarget[BRIDGE_KEY]?.dispose) return documentTarget[BRIDGE_KEY].dispose;

  const textState = new WeakMap();
  const attributeState = new WeakMap();
  let locale = localeOf(documentTarget);
  let disposed = false;
  let applying = false;

  const translateTextNode = (node) => {
    const current = String(node.nodeValue ?? '');
    let state = textState.get(node);
    if (locale === 'en') {
      if (state?.translated === current) node.nodeValue = state.source;
      textState.set(node, { source: String(node.nodeValue ?? ''), translated: null });
      return;
    }
    if (state?.translated === current) return;
    if (!state || (!CYRILLIC_PATTERN.test(current) && current !== state.source)) {
      state = { source: current, translated: null };
    }
    const translated = translateLiveRuntimeText(state.source, 'uk');
    if (translated === state.source) {
      if (CYRILLIC_PATTERN.test(current)) textState.delete(node);
      else textState.set(node, state);
      return;
    }
    state.translated = translated;
    textState.set(node, state);
    if (node.nodeValue !== translated) node.nodeValue = translated;
  };

  const translateAttributes = (element) => {
    if (!element?.getAttribute) return;
    let states = attributeState.get(element);
    if (!states) {
      states = new Map();
      attributeState.set(element, states);
    }
    for (const attribute of ATTRIBUTES) {
      if (!element.hasAttribute?.(attribute)) continue;
      const current = String(element.getAttribute(attribute) ?? '');
      let state = states.get(attribute);
      if (locale === 'en') {
        if (state?.translated === current) element.setAttribute(attribute, state.source);
        states.set(attribute, { source: String(element.getAttribute(attribute) ?? ''), translated: null });
        continue;
      }
      if (state?.translated === current) continue;
      if (!state || (!CYRILLIC_PATTERN.test(current) && current !== state.source)) state = { source: current, translated: null };
      const translated = translateLiveRuntimeText(state.source, 'uk');
      if (translated === state.source) {
        if (CYRILLIC_PATTERN.test(current)) states.delete(attribute);
        else states.set(attribute, state);
        continue;
      }
      state.translated = translated;
      states.set(attribute, state);
      if (current !== translated) element.setAttribute(attribute, translated);
    }
  };

  const applyNode = (root) => {
    if (!root || applying || disposed) return;
    applying = true;
    try {
      if (root.nodeType === 1) translateAttributes(root);
      for (const node of textNodes(root)) {
        translateTextNode(node);
        translateAttributes(node.parentElement);
      }
      if (root.querySelectorAll) {
        for (const element of root.querySelectorAll('*')) translateAttributes(element);
      }
    } finally {
      applying = false;
    }
  };

  const applyDocument = () => {
    locale = localeOf(documentTarget);
    applyNode(documentTarget.body);
  };

  const onLocaleChange = () => applyDocument();
  documentTarget.addEventListener(LOCALE_CHANGE_EVENT, onLocaleChange);

  const MutationObserverConstructor = windowTarget?.MutationObserver ?? globalThis.MutationObserver;
  const observer = typeof MutationObserverConstructor === 'function' && documentTarget.body
    ? new MutationObserverConstructor((records) => {
      if (applying || disposed) return;
      for (const record of records) {
        if (record.type === 'characterData') applyNode(record.target);
        else if (record.type === 'attributes') applyNode(record.target);
        else for (const node of record.addedNodes || []) applyNode(node);
      }
    })
    : null;
  observer?.observe(documentTarget.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRIBUTES,
  });

  applyDocument();

  const api = Object.freeze({
    apply: applyDocument,
    get locale() { return locale; },
    dispose() {
      if (disposed) return false;
      disposed = true;
      observer?.disconnect();
      documentTarget.removeEventListener(LOCALE_CHANGE_EVENT, onLocaleChange);
      if (locale !== 'en') {
        locale = 'en';
        applyNode(documentTarget.body);
      }
      delete documentTarget[BRIDGE_KEY];
      if (windowTarget?.__fieldsOfResolveLiveRuntimeLocalization === api) {
        delete windowTarget.__fieldsOfResolveLiveRuntimeLocalization;
      }
      return true;
    },
  });
  documentTarget[BRIDGE_KEY] = api;
  if (windowTarget) windowTarget.__fieldsOfResolveLiveRuntimeLocalization = api;
  return api.dispose;
}
