import { translateLiveRuntimeText as legacyTranslate } from './live-runtime-bridge.js';

const LOCALE_CHANGE_EVENT = 'fields-of-resolve:localechange';
const BRIDGE_KEY = '__fieldsOfResolveLiveRuntimeLocalization';
const CYRILLIC_PATTERN = /[А-ЯІЇЄҐа-яіїєґ]/u;
const ATTRIBUTES = Object.freeze(['aria-label', 'data-tooltip', 'title', 'placeholder']);
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);
const AUTHORED_SURFACE_SELECTOR = [
  '[data-campaign-operation-id]',
  '[data-campaign-briefing]',
  '[data-campaign-loading]',
  '[data-campaign-prologue-card]',
  '[data-campaign-prologue]',
].join(',');

const AUTHORED_OPERATION_TITLES = Object.freeze({
  'operation-hold-the-crossing': 'Утримати переправу',
  'operation-eyes-above': 'Очі в небі',
  'operation-long-night': 'Довга ніч',
  'operation-safe-passage': 'Безпечний прохід',
  'operation-lantern-gate': 'Брама ліхтаря',
  'operation-silent-ledger': 'Тихий реєстр',
  'operation-ember-line': 'Лінія жарин',
  'operation-iron-horizon': 'Залізний обрій',
  'operation-last-light': 'Останнє світло',
});

const DIRECT_REPLACEMENTS = Object.freeze([
  ['COMPLETED', 'ЗАВЕРШЕНО'],
  ['AVAILABLE', 'ДОСТУПНО'],
  ['LOCKED', 'ЗАБЛОКОВАНО'],
  ['OBJECTIVE', 'ЗАВДАННЯ'],
  ['Locked', 'Заблоковано'],
  ['Authored campaign operation.', 'Авторська операція кампанії.'],
  ['Objectives', 'Завдання'],
  ['Intelligence', 'Розвіддані'],
  ['Back to Operations', 'Назад до операцій'],
  ['Begin Mission', 'Почати місію'],
  ['Loading Operation', 'Завантаження операції'],
  ['Loading authored battlefield and mission contracts.', 'Завантаження авторського поля бою та контрактів місії.'],
  ['Mounting authored map, forces, objectives, and mission script.', 'Підготовка авторської мапи, сил, завдань і сценарію місії.'],
  ['Authored operation ready.', 'Авторська операція готова.'],
  ['Optional — ', 'Необов’язково — '],
  ['STANDARD', 'СТАНДАРТНА'],
  ['VETERAN', 'ВЕТЕРАНСЬКА'],
  ['STORY', 'СЮЖЕТНА'],
  ['TUTORIAL / FIRST COMMAND', 'НАВЧАННЯ / ПЕРШЕ КОМАНДУВАННЯ'],
  ['INTERACTIVE TUTORIAL / PROLOGUE', 'ІНТЕРАКТИВНЕ НАВЧАННЯ / ПРОЛОГ'],
  ['Open Prologue', 'Відкрити пролог'],
  ['Continue to First Operation', 'Продовжити до першої операції'],
  ['Prologue', 'Пролог'],

  ['Volodymyr Zelenskyy', 'Володимир Зеленський'],
  ['Valerii Zaluzhnyi', 'Валерій Залужний'],
  ['Zelenskyy', 'Зеленський'],
  ['Zaluzhnyi', 'Залужний'],
  ['Supreme Commander-in-Chief', 'Верховний Головнокомандувач'],
  ['Senior military commander', 'Старший військовий командувач'],
  ['National Command', 'Національне командування'],
  ['Strategic Command', 'Стратегічне командування'],
  ['Ukraine', 'Україна'],
  ['Russia', 'Росія'],

  ['National Rally', 'Національне згуртування'],
  ['Raise nearby morale and movement speed.', 'Підвищити мораль і швидкість руху підрозділів поруч.'],
  ['Strategic Communication', 'Стратегічна комунікація'],
  ['Generate intelligence and morale.', 'Згенерувати розвіддані та підвищити мораль.'],
  ['Combined-Arms Coordination', 'Координація загальновійськових дій'],
  ['Boost a mixed tactical group.', 'Посилити змішану тактичну групу.'],
  ['Counter-Battery Mission', 'Контрбатарейна задача'],
  ['Strike hostile artillery positions.', 'Уразити ворожі артилерійські позиції.'],
  ['Choose a battlefield location; adds command capacity.', 'Виберіть місце на полі бою; збільшує командну спроможність.'],
  ['Choose a battlefield location; enables infantry production.', 'Виберіть місце на полі бою; відкриває виробництво піхоти.'],
  ['Choose a battlefield location; unlocks specialized units.', 'Виберіть місце на полі бою; відкриває спеціалізовані підрозділи.'],
  ['Deploy a mechanized infantry squad.', 'Розгорнути механізоване піхотне відділення.'],
  ['Long-range 155 mm bombardment.', 'Далекобійний 155-мм артилерійський обстріл.'],
  ['Temporarily reduce incoming accuracy.', 'Тимчасово знизити точність ворожого вогню.'],

  ['+18% vehicle durability and reduced drone damage.', '+18% міцності техніки та менша шкода від дронів.'],
  ['+35 sight and +10% weapon range.', '+35 до огляду та +10% до дальності зброї.'],
  ['+16% artillery damage and range.', '+16% до шкоди й дальності артилерії.'],
  ['+22% tank durability.', '+22% до міцності танків.'],
  ['Faster reloads and improved target acquisition.', 'Швидше перезаряджання та краще виявлення цілей.'],
  ['+12% vehicle movement speed.', '+12% до швидкості руху техніки.'],
]);

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replacePhrase(value, english, ukrainian) {
  const escaped = escapeRegExp(english);
  const beginsWithWord = /^[A-Za-z0-9]/.test(english);
  const endsWithWord = /[A-Za-z0-9]$/.test(english);
  if (!beginsWithWord && !endsWithWord) return value.replaceAll(english, ukrainian);
  const prefix = beginsWithWord ? '(^|[^A-Za-z0-9])' : '';
  const suffix = endsWithWord ? '(?=$|[^A-Za-z0-9])' : '';
  return value.replace(new RegExp(`${prefix}${escaped}${suffix}`, 'g'), (_, leading = '') => `${leading}${ukrainian}`);
}

function normalizeLegacyArtifacts(value) {
  let normalized = String(value)
    .replaceAll('Завданняs', 'Завдання')
    .replaceAll('АТАКАed', 'атаковано')
    .replaceAll('Паузаd', 'призупинено');
  for (const [english, ukrainian] of DIRECT_REPLACEMENTS) {
    normalized = replacePhrase(normalized, english, ukrainian);
  }
  return normalized;
}

export function translateLiveRuntimeText(value, locale = 'en') {
  if (locale !== 'uk') return String(value ?? '');
  return normalizeLegacyArtifacts(legacyTranslate(value, locale));
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

function firstTextNode(element) {
  return [...(element?.childNodes || [])].find((node) => node.nodeType === 3) || null;
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

  const setTextOverride = (element, translated) => {
    const node = firstTextNode(element);
    if (!node) return;
    const current = String(node.nodeValue ?? '');
    let state = textState.get(node);
    if (locale === 'en') {
      if (state?.translated === current) node.nodeValue = state.source;
      textState.set(node, { source: String(node.nodeValue ?? ''), translated: null });
      return;
    }
    if (state?.translated === current && state.translated === translated) return;
    const source = state?.translated === current ? state.source : current;
    state = { source, translated };
    textState.set(node, state);
    if (node.nodeValue !== translated) node.nodeValue = translated;
  };

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
      if (!state || (!CYRILLIC_PATTERN.test(current) && current !== state.source)) {
        state = { source: current, translated: null };
      }
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

  const campaignSurfaces = (root) => {
    const surfaces = [];
    if (root?.matches?.(AUTHORED_SURFACE_SELECTOR)) surfaces.push(root);
    for (const surface of root?.querySelectorAll?.(AUTHORED_SURFACE_SELECTOR) || []) surfaces.push(surface);
    return surfaces;
  };

  const localizeAuthoredSurface = (surface) => {
    if (!surface || locale !== 'uk') return;
    const operationId = surface.dataset?.campaignOperationId || surface.dataset?.campaignBriefing || null;
    if (operationId && AUTHORED_OPERATION_TITLES[operationId]) {
      const heading = surface.querySelector?.('h3');
      if (heading) {
        const source = String(firstTextNode(heading)?.nodeValue ?? '');
        const order = source.match(/^\s*(\d+)\./)?.[1];
        setTextOverride(heading, `${order ? `${order}. ` : ''}${AUTHORED_OPERATION_TITLES[operationId]}`);
      }
    }

    if (surface.dataset?.campaignOperationId) {
      const summary = [...(surface.querySelectorAll?.('p') || [])]
        .find((element) => !element.classList?.contains?.('missionPacing'));
      if (summary) setTextOverride(summary, 'Авторська операція кампанії. Відкрийте брифінг, щоб переглянути завдання.');
      return;
    }

    if (surface.dataset?.campaignBriefing) {
      const paragraphs = [...(surface.querySelectorAll?.('p') || [])];
      if (paragraphs[0]) setTextOverride(paragraphs[0], 'Брифінг авторської операції. Перегляньте завдання та розвіддані перед початком місії.');
      const lists = [...(surface.querySelectorAll?.('ul') || [])];
      [...(lists[0]?.querySelectorAll?.('li') || [])].forEach((item, index) => {
        const source = String(firstTextNode(item)?.nodeValue ?? '');
        setTextOverride(item, `${source.startsWith('Optional — ') ? 'Необов’язково — ' : ''}Завдання ${index + 1}`);
      });
      [...(lists[1]?.querySelectorAll?.('li') || [])].forEach((item, index) => {
        setTextOverride(item, `Розвіддані ${index + 1}`);
      });
      return;
    }

    if (surface.dataset?.campaignLoading) {
      const paragraphs = [...(surface.querySelectorAll?.('p') || [])];
      if (paragraphs[0]) setTextOverride(paragraphs[0], 'Підготовка авторської операції та сценарію місії.');
      if (paragraphs[1]) setTextOverride(paragraphs[1], 'Підготовка операції…');
      return;
    }

    if (surface.dataset?.campaignPrologueCard !== undefined) {
      const heading = surface.querySelector?.('h3');
      const summary = surface.querySelector?.('p');
      if (heading) setTextOverride(heading, 'Пролог — Перше командування');
      if (summary) setTextOverride(summary, 'Навчальна операція з основ керування та взаємодії на полі бою.');
      return;
    }

    if (surface.dataset?.campaignPrologue !== undefined) {
      const heading = surface.querySelector?.('h3');
      const summary = surface.querySelector?.('p');
      if (heading) setTextOverride(heading, 'Перше командування');
      if (summary) setTextOverride(summary, 'Інтерактивне навчання з базових наказів, вибору підрозділів і цілей.');
      [...(surface.querySelectorAll?.('li') || [])].forEach((item, index) => setTextOverride(item, `Крок ${index + 1}`));
    }
  };

  const applyNode = (root) => {
    if (!root || applying || disposed) return;
    applying = true;
    try {
      for (const surface of campaignSurfaces(root)) localizeAuthoredSurface(surface);
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
        if (record.type === 'characterData') applyNode(record.target.parentElement || record.target);
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
      observer?.disconnect();
      documentTarget.removeEventListener(LOCALE_CHANGE_EVENT, onLocaleChange);
      if (locale !== 'en') {
        locale = 'en';
        applyNode(documentTarget.body);
      }
      disposed = true;
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
