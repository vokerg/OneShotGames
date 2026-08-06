export const RUNTIME_DIAGNOSTICS_VERSION = 1;
export const RUNTIME_DIAGNOSTICS_GLOBAL = '__fieldsOfResolveDiagnostics';
export const RUNTIME_STORAGE_PREFIX = 'fields-of-resolve:';

const MAX_MESSAGE_LENGTH = 2_000;
const MAX_STACK_LENGTH = 12_000;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function boundedText(value, limit) {
  const text = String(value ?? '');
  return text.length <= limit ? text : `${text.slice(0, Math.max(0, limit - 1))}…`;
}

function safeCall(callback, fallback = null) {
  try {
    const value = callback();
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}

function storageKeys(storage) {
  if (!storage) return [];
  if (typeof storage.keys === 'function') return [...storage.keys()].map(String).sort();
  if (typeof storage.key === 'function' && Number.isInteger(storage.length) && storage.length >= 0) {
    const keys = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key !== null) keys.push(String(key));
    }
    return keys.sort();
  }
  throw new TypeError('Runtime recovery storage requires keys() or localStorage-compatible length/key access.');
}

export class RuntimeInvariantError extends Error {
  constructor(message, details = null) {
    super(String(message || 'Runtime invariant failed.'));
    this.name = 'RuntimeInvariantError';
    this.details = details;
  }
}

export function assertRuntimeInvariant(condition, message, details = null) {
  if (!condition) throw new RuntimeInvariantError(message, details);
  return condition;
}

export function normalizeRuntimeError(error) {
  if (error instanceof Error) {
    return deepFreeze({
      name: boundedText(error.name || 'Error', 120),
      message: boundedText(error.message || 'Unknown runtime error.', MAX_MESSAGE_LENGTH),
      stack: boundedText(error.stack || '', MAX_STACK_LENGTH),
      cause: error.cause == null ? null : boundedText(
        error.cause instanceof Error ? error.cause.message : error.cause,
        MAX_MESSAGE_LENGTH,
      ),
    });
  }
  return deepFreeze({
    name: 'NonErrorThrown',
    message: boundedText(error, MAX_MESSAGE_LENGTH) || 'Unknown runtime error.',
    stack: '',
    cause: null,
  });
}

export function createRuntimeDebugReport({
  error,
  phase = 'runtime',
  game = null,
  composition = null,
  performance = null,
  now = () => Date.now(),
} = {}) {
  if (typeof now !== 'function') throw new TypeError('Runtime diagnostics now must be a function.');
  const normalizedError = normalizeRuntimeError(error);
  const installedModules = safeCall(
    () => composition?.installedModules?.() ?? composition?.installedModules ?? [],
    [],
  );
  const performanceSnapshot = safeCall(
    () => performance?.snapshot?.() ?? performance,
    null,
  );
  return deepFreeze(canonicalize({
    schema: 'fields-of-resolve.runtime-diagnostic',
    version: RUNTIME_DIAGNOSTICS_VERSION,
    capturedAt: Number(now()),
    phase: boundedText(phase, 120) || 'runtime',
    error: normalizedError,
    runtime: {
      missionId: game?.mission?.id ?? null,
      missionIndex: Number.isInteger(game?.missionIndex) ? game.missionIndex : null,
      simulationSeed: game?.simulationSeed ?? null,
      simulationTime: Number.isFinite(game?.time) ? game.time : null,
      gameOver: Boolean(game?.gameOver),
      outcome: game?.outcome ?? null,
      units: Array.isArray(game?.units) ? game.units.length : null,
      buildings: Array.isArray(game?.buildings) ? game.buildings.length : null,
      projectiles: Array.isArray(game?.projectiles) ? game.projectiles.length : null,
      effects: Array.isArray(game?.effects) ? game.effects.length : null,
      lastError: boundedText(game?.lastError ?? '', MAX_MESSAGE_LENGTH),
    },
    composition: {
      installedModules: Array.isArray(installedModules) ? installedModules.map(String) : [],
    },
    performance: performanceSnapshot && typeof performanceSnapshot === 'object'
      ? {
          sequence: performanceSnapshot.sequence ?? null,
          frameP95Ms: performanceSnapshot.frame?.p95Ms ?? null,
          simulationP95Ms: performanceSnapshot.simulation?.p95Ms ?? null,
          renderP95Ms: performanceSnapshot.render?.p95Ms ?? null,
          entityTotal: performanceSnapshot.entities?.total ?? null,
        }
      : null,
  }));
}

export function collectRuntimeRecoveryData(storage, prefix = RUNTIME_STORAGE_PREFIX) {
  if (typeof prefix !== 'string' || !prefix) throw new TypeError('Runtime recovery prefix must be a non-empty string.');
  if (!storage) return deepFreeze({ available: false, entries: {} });
  if (typeof storage.getItem !== 'function') throw new TypeError('Runtime recovery storage requires getItem().');
  const entries = {};
  for (const key of storageKeys(storage)) {
    if (!key.startsWith(prefix)) continue;
    const value = storage.getItem(key);
    if (value !== null) entries[key] = String(value);
  }
  return deepFreeze({ available: true, entries: canonicalize(entries) });
}

export function resetRuntimeRecoveryData(storage, prefix = RUNTIME_STORAGE_PREFIX) {
  if (!storage) return 0;
  if (typeof storage.removeItem !== 'function') throw new TypeError('Runtime recovery storage requires removeItem().');
  const keys = storageKeys(storage).filter((key) => key.startsWith(prefix));
  for (const key of keys) storage.removeItem(key);
  return keys.length;
}

export function createRuntimeRecoveryBundle({ report, storage, now = () => Date.now() } = {}) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    throw new TypeError('Runtime recovery bundle requires a diagnostic report.');
  }
  const recovery = collectRuntimeRecoveryData(storage);
  return deepFreeze(canonicalize({
    schema: 'fields-of-resolve.runtime-recovery',
    version: RUNTIME_DIAGNOSTICS_VERSION,
    exportedAt: Number(now()),
    diagnostic: report,
    storage: recovery,
  }));
}

export function serializeRuntimeRecoveryBundle(bundle, { space = 2 } = {}) {
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) {
    throw new TypeError('Runtime recovery bundle must be an object.');
  }
  if (!Number.isInteger(space) || space < 0 || space > 8) {
    throw new RangeError('Runtime recovery indentation must be an integer from 0 through 8.');
  }
  return `${JSON.stringify(canonicalize(bundle), null, space)}\n`;
}

function defaultCopyText(text, { documentTarget, windowTarget }) {
  const clipboard = windowTarget?.navigator?.clipboard;
  if (clipboard?.writeText) return clipboard.writeText(text);
  if (!documentTarget?.createElement || !documentTarget?.body) {
    throw new Error('Clipboard access is unavailable.');
  }
  const textarea = documentTarget.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  documentTarget.body.append(textarea);
  textarea.select();
  const copied = documentTarget.execCommand?.('copy');
  textarea.remove();
  if (!copied) throw new Error('Clipboard copy failed.');
  return true;
}

function defaultDownloadText(filename, text, { documentTarget, windowTarget }) {
  const BlobType = windowTarget?.Blob ?? globalThis.Blob;
  const URLType = windowTarget?.URL ?? globalThis.URL;
  if (!BlobType || !URLType?.createObjectURL || !documentTarget?.createElement) {
    throw new Error('File download is unavailable.');
  }
  const url = URLType.createObjectURL(new BlobType([text], { type: 'application/json' }));
  try {
    const anchor = documentTarget.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.hidden = true;
    documentTarget.body?.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URLType.revokeObjectURL(url);
  }
}

function installDefaultFatalView({ documentTarget, report, actions }) {
  if (!documentTarget?.createElement || !documentTarget?.body) return () => {};
  const previous = documentTarget.querySelector?.('[data-runtime-diagnostics]');
  previous?.remove?.();
  const root = documentTarget.createElement('section');
  root.dataset.runtimeDiagnostics = 'fatal';
  root.setAttribute('role', 'alertdialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'runtimeDiagnosticsTitle');
  root.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px;background:#111d;color:#f4f0df;font:16px/1.45 system-ui,sans-serif;';
  root.innerHTML = `
    <div style="width:min(760px,100%);max-height:90vh;overflow:auto;border:2px solid #b89b62;background:#171914;padding:24px;box-shadow:0 18px 60px #000b">
      <p style="margin:0;color:#d9b76c;font-weight:700;letter-spacing:.08em">FIELDS OF RESOLVE — RECOVERY MODE</p>
      <h1 id="runtimeDiagnosticsTitle" style="margin:.35rem 0">The operation could not continue</h1>
      <p data-diagnostics-message></p>
      <p data-diagnostics-status role="status" aria-live="polite"></p>
      <details><summary>Technical report</summary><pre data-diagnostics-report style="white-space:pre-wrap;word-break:break-word;max-height:35vh;overflow:auto;background:#090b08;padding:12px"></pre></details>
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:18px">
        <button type="button" data-action="copy">Copy debug report</button>
        <button type="button" data-action="export">Export saves and settings</button>
        <button type="button" data-action="reset">Export, then reset local data</button>
        <button type="button" data-action="reload">Reload application</button>
      </div>
    </div>`;
  const reportText = JSON.stringify(report, null, 2);
  root.querySelector('[data-diagnostics-message]').textContent = `${report.error.name}: ${report.error.message}`;
  root.querySelector('[data-diagnostics-report]').textContent = reportText;
  const status = root.querySelector('[data-diagnostics-status]');
  const run = async (label, action) => {
    status.textContent = `${label}…`;
    try {
      const result = await action();
      status.textContent = typeof result === 'string' ? result : `${label} complete.`;
    } catch (error) {
      status.textContent = `${label} failed: ${normalizeRuntimeError(error).message}`;
    }
  };
  root.querySelector('[data-action="copy"]').addEventListener('click', () => void run('Copy', actions.copyReport));
  root.querySelector('[data-action="export"]').addEventListener('click', () => void run('Export', actions.exportRecovery));
  root.querySelector('[data-action="reset"]').addEventListener('click', () => void run('Export and reset', actions.exportAndReset));
  root.querySelector('[data-action="reload"]').addEventListener('click', () => actions.reload());
  documentTarget.body.append(root);
  root.querySelector('[data-action="copy"]')?.focus?.();
  return () => root.remove();
}

export function createRuntimeDiagnostics({
  windowTarget = globalThis.window,
  documentTarget = globalThis.document,
  storage = null,
  now = () => Date.now(),
  game = () => windowTarget?.__fieldsOfResolveGame ?? null,
  composition = () => windowTarget?.__fieldsOfResolveComposition ?? null,
  performance = () => windowTarget?.__fieldsOfResolvePerformance ?? null,
  copyText = null,
  downloadText = null,
  renderFatal = null,
  confirmReset = (message) => windowTarget?.confirm?.(message) ?? false,
  reload = () => windowTarget?.location?.reload?.(),
} = {}) {
  if (!windowTarget?.addEventListener || !windowTarget?.removeEventListener) {
    throw new TypeError('Runtime diagnostics require a window-like event target.');
  }
  if (typeof now !== 'function') throw new TypeError('Runtime diagnostics now must be a function.');
  if (typeof confirmReset !== 'function') throw new TypeError('Runtime diagnostics confirmReset must be a function.');
  const copy = copyText ?? ((text) => defaultCopyText(text, { documentTarget, windowTarget }));
  const download = downloadText ?? ((filename, text) => defaultDownloadText(filename, text, { documentTarget, windowTarget }));
  const render = renderFatal ?? ((model) => installDefaultFatalView({ documentTarget, ...model }));
  let installed = false;
  let currentReport = null;
  let removeView = null;
  let previousGlobal;

  const resolveCandidate = (candidate) => typeof candidate === 'function' ? safeCall(candidate, null) : candidate;
  const reportText = () => currentReport ? `${JSON.stringify(currentReport, null, 2)}\n` : '';
  const exportRecovery = async () => {
    assertRuntimeInvariant(currentReport, 'A fatal report must exist before recovery export.');
    const bundle = createRuntimeRecoveryBundle({ report: currentReport, storage, now });
    const text = serializeRuntimeRecoveryBundle(bundle);
    await download(`fields-of-resolve-recovery-${bundle.exportedAt}.json`, text);
    return `Exported ${Object.keys(bundle.storage.entries).length} local data entries.`;
  };
  const exportAndReset = async () => {
    const exported = await exportRecovery();
    const confirmed = await confirmReset(
      'Confirm reset only after the recovery file appears in your downloads. Cancel to keep local data unchanged.',
    );
    if (!confirmed) return `${exported} Reset cancelled; local data was not changed.`;
    const removed = resetRuntimeRecoveryData(storage);
    return `${exported} Reset ${removed} local data entries. Reload to restart cleanly.`;
  };
  const actions = Object.freeze({
    copyReport: async () => {
      await copy(reportText());
      return 'Debug report copied.';
    },
    exportRecovery,
    exportAndReset,
    reload,
  });

  function showFatal(error, phase = 'runtime') {
    currentReport = createRuntimeDebugReport({
      error,
      phase,
      game: resolveCandidate(game),
      composition: resolveCandidate(composition),
      performance: resolveCandidate(performance),
      now,
    });
    removeView?.();
    removeView = render({ report: currentReport, actions }) ?? null;
    return currentReport;
  }

  const onError = (event) => {
    showFatal(event?.error ?? event?.message ?? 'Unknown window error.', 'window-error');
  };
  const onUnhandledRejection = (event) => {
    event?.preventDefault?.();
    showFatal(event?.reason ?? 'Unhandled promise rejection.', 'unhandled-rejection');
  };

  function snapshot() {
    return deepFreeze({
      version: RUNTIME_DIAGNOSTICS_VERSION,
      installed,
      fatal: currentReport !== null,
      report: currentReport,
      recoverableEntries: safeCall(() => Object.keys(collectRuntimeRecoveryData(storage).entries).length, 0),
    });
  }

  function install() {
    if (installed) return dispose;
    installed = true;
    windowTarget.addEventListener('error', onError);
    windowTarget.addEventListener('unhandledrejection', onUnhandledRejection);
    previousGlobal = windowTarget[RUNTIME_DIAGNOSTICS_GLOBAL];
    windowTarget[RUNTIME_DIAGNOSTICS_GLOBAL] = Object.freeze({ snapshot, showFatal });
    return dispose;
  }

  function dispose() {
    if (!installed && !removeView && currentReport === null) return false;
    windowTarget.removeEventListener('error', onError);
    windowTarget.removeEventListener('unhandledrejection', onUnhandledRejection);
    installed = false;
    removeView?.();
    removeView = null;
    currentReport = null;
    if (windowTarget[RUNTIME_DIAGNOSTICS_GLOBAL]?.snapshot === snapshot) {
      if (previousGlobal === undefined) delete windowTarget[RUNTIME_DIAGNOSTICS_GLOBAL];
      else windowTarget[RUNTIME_DIAGNOSTICS_GLOBAL] = previousGlobal;
    }
    return true;
  }

  return Object.freeze({ install, dispose, showFatal, snapshot, actions });
}
