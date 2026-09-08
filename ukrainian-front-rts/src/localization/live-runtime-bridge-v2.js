import { translateLiveRuntimeText as legacyTranslate } from './live-runtime-bridge.js';

const LOCALE_CHANGE_EVENT = 'fields-of-resolve:localechange';
const BRIDGE_KEY = '__fieldsOfResolveLiveRuntimeLocalization';
const CYRILLIC_PATTERN = /[А-ЯІЇЄҐа-яіїєґ]/u;
const ATTRIBUTES = Object.freeze(['aria-label', 'data-tooltip', 'title', 'placeholder']);
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);

function normalizeLegacyArtifacts(value) {
  return String(value)
    .replaceAll('Завданняs', 'Завдання')
    .replaceAll('АТАКАed', 'атаковано')
    .replaceAll('Паузаd', 'призупинено');
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
