export const LOCALIZATION_SCHEMA = 'fields-of-resolve.localization';
export const LOCALIZATION_VERSION = 1;
export const DEFAULT_LOCALE = 'en';
export const SUPPORTED_LOCALES = Object.freeze(['en', 'uk']);

const PLURAL_CATEGORIES = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);
const PLACEHOLDER_PATTERN = /\{([A-Za-z][A-Za-z0-9_.-]*)\}/g;
const FORBIDDEN_CODE_POINT_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uE000-\uF8FF]/u;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isPluralMessage(value) {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => PLURAL_CATEGORIES.has(key));
}

function placeholders(value) {
  const found = new Set();
  const inspect = (message) => {
    if (typeof message !== 'string') return;
    for (const match of message.matchAll(PLACEHOLDER_PATTERN)) found.add(match[1]);
  };
  if (typeof value === 'string') inspect(value);
  else if (isPluralMessage(value)) Object.values(value).forEach(inspect);
  return [...found].sort();
}

function flattenMessages(messages, prefix = '', output = new Map()) {
  if (!isPlainObject(messages)) throw new TypeError('Localization messages must be a plain object.');
  for (const [segment, value] of Object.entries(messages)) {
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(segment)) {
      throw new TypeError(`Localization key segment "${segment}" is invalid.`);
    }
    const key = prefix ? `${prefix}.${segment}` : segment;
    if (typeof value === 'string' || isPluralMessage(value)) {
      output.set(key, value);
      continue;
    }
    if (!isPlainObject(value)) throw new TypeError(`Localization message "${key}" must be a string, plural map, or object.`);
    flattenMessages(value, key, output);
  }
  return output;
}

function normalizeCatalog(catalog) {
  if (!isPlainObject(catalog)) throw new TypeError('Localization catalog must be a plain object.');
  const locale = normalizeLocale(catalog.locale);
  if (!locale) throw new TypeError(`Localization catalog locale "${catalog.locale}" is unsupported.`);
  if (catalog.schema !== LOCALIZATION_SCHEMA) throw new TypeError(`Localization catalog ${locale} has an invalid schema.`);
  if (catalog.version !== LOCALIZATION_VERSION) throw new TypeError(`Localization catalog ${locale} has an unsupported version.`);
  const messages = deepFreeze(structuredClone(catalog.messages));
  return deepFreeze({ schema: LOCALIZATION_SCHEMA, version: LOCALIZATION_VERSION, locale, messages });
}

function messageShape(value) {
  return typeof value === 'string' ? 'string' : isPluralMessage(value) ? 'plural' : 'invalid';
}

function messageVariants(value) {
  return typeof value === 'string' ? [['message', value]] : Object.entries(value);
}

function interpolate(message, variables, key) {
  return message.replace(PLACEHOLDER_PATTERN, (_, name) => {
    if (!Object.prototype.hasOwnProperty.call(variables, name)) {
      throw new TypeError(`Localization message "${key}" requires variable "${name}".`);
    }
    return String(variables[name]);
  });
}

export function normalizeLocale(input) {
  if (typeof input !== 'string' || !input.trim()) return null;
  let canonical;
  try {
    [canonical] = Intl.getCanonicalLocales(input.trim().replaceAll('_', '-'));
  } catch {
    return null;
  }
  const language = canonical.split('-')[0].toLowerCase();
  return SUPPORTED_LOCALES.includes(language) ? language : null;
}

export function createCatalog(locale, messages) {
  const normalizedLocale = normalizeLocale(locale);
  if (!normalizedLocale) throw new TypeError(`Unsupported localization locale "${locale}".`);
  return normalizeCatalog({
    schema: LOCALIZATION_SCHEMA,
    version: LOCALIZATION_VERSION,
    locale: normalizedLocale,
    messages,
  });
}

export function validateCatalogs(catalogs, { baseLocale = DEFAULT_LOCALE, expansionLimit = 2.6 } = {}) {
  if (!Array.isArray(catalogs) || catalogs.length === 0) throw new TypeError('Localization validation requires at least one catalog.');
  if (!Number.isFinite(expansionLimit) || expansionLimit < 1) throw new TypeError('Localization expansionLimit must be at least 1.');
  const normalized = catalogs.map(normalizeCatalog);
  const duplicateLocales = normalized
    .map((catalog) => catalog.locale)
    .filter((locale, index, locales) => locales.indexOf(locale) !== index);
  const base = normalized.find((catalog) => catalog.locale === normalizeLocale(baseLocale));
  const errors = [];
  const warnings = [];
  if (!base) errors.push(`Base locale "${baseLocale}" is missing.`);
  for (const locale of new Set(duplicateLocales)) errors.push(`Locale "${locale}" is duplicated.`);
  if (!base) return deepFreeze({ valid: false, errors, warnings, catalogs: normalized });

  const baseMessages = flattenMessages(base.messages);
  for (const catalog of normalized) {
    const messages = flattenMessages(catalog.messages);
    for (const [key, baseValue] of baseMessages) {
      if (!messages.has(key)) {
        errors.push(`[${catalog.locale}] Missing message "${key}".`);
        continue;
      }
      const value = messages.get(key);
      if (messageShape(value) !== messageShape(baseValue)) {
        errors.push(`[${catalog.locale}] Message "${key}" must use ${messageShape(baseValue)} form.`);
        continue;
      }
      if (messageShape(value) === 'plural' && !Object.prototype.hasOwnProperty.call(value, 'other')) {
        errors.push(`[${catalog.locale}] Plural message "${key}" requires an "other" form.`);
      }
      const expectedPlaceholders = placeholders(baseValue);
      const actualPlaceholders = placeholders(value);
      if (expectedPlaceholders.join('|') !== actualPlaceholders.join('|')) {
        errors.push(
          `[${catalog.locale}] Message "${key}" placeholders differ: expected {${expectedPlaceholders.join(', ')}}, `
          + `received {${actualPlaceholders.join(', ')}}.`,
        );
      }
      for (const [category, message] of messageVariants(value)) {
        if (!message.trim()) errors.push(`[${catalog.locale}] Message "${key}" (${category}) is empty.`);
        if (FORBIDDEN_CODE_POINT_PATTERN.test(message)) {
          errors.push(`[${catalog.locale}] Message "${key}" (${category}) contains unsupported control/private-use characters.`);
        }
      }
      const baseLongest = Math.max(...messageVariants(baseValue).map(([, message]) => [...message].length), 1);
      const translatedLongest = Math.max(...messageVariants(value).map(([, message]) => [...message].length), 0);
      if (catalog.locale !== base.locale && translatedLongest / baseLongest > expansionLimit) {
        warnings.push(
          `[${catalog.locale}] Message "${key}" expands to ${Math.round((translatedLongest / baseLongest) * 100)}% of the base length.`,
        );
      }
    }
    for (const key of messages.keys()) {
      if (!baseMessages.has(key)) errors.push(`[${catalog.locale}] Extra message "${key}" is not present in ${base.locale}.`);
    }
  }

  return deepFreeze({
    valid: errors.length === 0,
    errors,
    warnings,
    catalogs: normalized,
    messageCount: baseMessages.size,
  });
}

export function createLocalizer(catalogs, {
  locale = DEFAULT_LOCALE,
  fallbackLocale = DEFAULT_LOCALE,
  onMissing = null,
} = {}) {
  const validation = validateCatalogs(catalogs, { baseLocale: fallbackLocale });
  if (!validation.valid) throw new TypeError(`Invalid localization catalogs:\n${validation.errors.join('\n')}`);
  const catalogByLocale = new Map(validation.catalogs.map((catalog) => [catalog.locale, catalog]));
  const flattenedByLocale = new Map(
    validation.catalogs.map((catalog) => [catalog.locale, flattenMessages(catalog.messages)]),
  );
  const fallback = normalizeLocale(fallbackLocale);
  let activeLocale = normalizeLocale(locale) || fallback;
  if (!catalogByLocale.has(activeLocale)) activeLocale = fallback;
  const formatterCache = new Map();

  const formatter = (kind, options) => {
    const cacheKey = `${activeLocale}:${kind}:${JSON.stringify(options || {})}`;
    if (formatterCache.has(cacheKey)) return formatterCache.get(cacheKey);
    const value = kind === 'number'
      ? new Intl.NumberFormat(activeLocale, options)
      : kind === 'date'
        ? new Intl.DateTimeFormat(activeLocale, options)
        : kind === 'list'
          ? new Intl.ListFormat(activeLocale, options)
          : new Intl.PluralRules(activeLocale, options);
    formatterCache.set(cacheKey, value);
    return value;
  };

  const resolve = (key) => {
    const localized = flattenedByLocale.get(activeLocale)?.get(key);
    if (localized != null) return localized;
    const fallbackValue = flattenedByLocale.get(fallback)?.get(key);
    if (typeof onMissing === 'function') onMissing(deepFreeze({ key, locale: activeLocale, fallbackUsed: fallbackValue != null }));
    return fallbackValue;
  };

  const translate = (key, variables = {}) => {
    const value = resolve(key);
    if (value == null) return `[${key}]`;
    if (typeof value === 'string') return interpolate(value, variables, key);
    if (!Object.prototype.hasOwnProperty.call(variables, 'count')) {
      throw new TypeError(`Plural localization message "${key}" requires variable "count".`);
    }
    const count = Number(variables.count);
    if (!Number.isFinite(count)) throw new TypeError(`Plural localization message "${key}" requires a finite count.`);
    const category = formatter('plural').select(count);
    const message = value[category] ?? value.other;
    return interpolate(message, { ...variables, count: formatter('number').format(count) }, key);
  };

  const api = {
    get schema() { return LOCALIZATION_SCHEMA; },
    get version() { return LOCALIZATION_VERSION; },
    get locale() { return activeLocale; },
    get fallbackLocale() { return fallback; },
    get supportedLocales() { return [...catalogByLocale.keys()]; },
    setLocale(nextLocale) {
      const normalized = normalizeLocale(nextLocale);
      if (!normalized || !catalogByLocale.has(normalized)) return false;
      activeLocale = normalized;
      return true;
    },
    has(key) { return flattenedByLocale.get(activeLocale)?.has(key) || flattenedByLocale.get(fallback)?.has(key) || false; },
    t: translate,
    number(value, options) {
      const number = Number(value);
      if (!Number.isFinite(number)) throw new TypeError('Localized number value must be finite.');
      return formatter('number', options).format(number);
    },
    date(value, options) {
      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) throw new TypeError('Localized date value must be valid.');
      return formatter('date', options).format(date);
    },
    list(values, options) {
      if (!Array.isArray(values)) throw new TypeError('Localized list value must be an array.');
      return formatter('list', options).format(values.map(String));
    },
    diagnostics() {
      return deepFreeze({
        schema: LOCALIZATION_SCHEMA,
        version: LOCALIZATION_VERSION,
        locale: activeLocale,
        fallbackLocale: fallback,
        supportedLocales: [...catalogByLocale.keys()],
        messageCount: validation.messageCount,
        warnings: validation.warnings,
      });
    },
  };
  return Object.freeze(api);
}

export function localizationPlaceholders(value) {
  return Object.freeze(placeholders(value));
}

export function localizationMessageEntries(catalog) {
  const normalized = normalizeCatalog(catalog);
  return Object.freeze([...flattenMessages(normalized.messages)].map(([key, value]) => Object.freeze([key, value])));
}
