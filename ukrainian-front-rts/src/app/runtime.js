import {
  createFixedStepClock,
  FIXED_SIMULATION_STEP_SECONDS,
  MAX_FRAME_DELTA_SECONDS,
} from '../core/fixed-step-clock.js';
import {
  DEFAULT_SIMULATION_SEED,
  deriveSimulationSeed,
  setSimulationSeed,
} from '../core/random.js';
import {
  createPerformanceProfiler,
  formatPerformanceSnapshot,
  PERFORMANCE_OVERLAY_DIAGNOSTIC,
  PERFORMANCE_OVERLAY_TOGGLE_KEY,
} from './performance-profiler.js';

const DEFAULT_PAUSE_REASON = 'default';

function normalizePauseReason(reason) {
  if (reason === undefined) return DEFAULT_PAUSE_REASON;
  if (typeof reason !== 'string' || !reason.trim()) throw new TypeError('Runtime pause reason must be a non-empty string.');
  return reason.trim();
}

function browserHeapSnapshot() {
  return globalThis.performance?.memory ?? null;
}

function compositionAudioSnapshot(windowTarget) {
  return windowTarget?.__fieldsOfResolveComposition?.audio?.()?.mixer ?? null;
}

function safeOptionalSnapshot(callback) {
  if (typeof callback !== 'function') return null;
  try {
    return callback();
  } catch {
    return null;
  }
}

function isEditableTarget(target) {
  const tag = String(target?.tagName ?? '').toLowerCase();
  return Boolean(target?.isContentEditable || ['input', 'textarea', 'select'].includes(tag));
}

function createPerformanceOverlayStyle(documentTarget) {
  const style = documentTarget.createElement('style');
  style.dataset.performanceDebugOverlay = 'style';
  style.textContent = `
[data-performance-debug-overlay] {
  position: fixed;
  inset: 12px 12px auto auto;
  z-index: 2147483646;
  width: min(520px, calc(100vw - 24px));
  max-height: calc(100vh - 24px);
  overflow: auto;
  box-sizing: border-box;
  padding: 10px;
  border: 1px solid rgba(173, 216, 230, 0.78);
  border-radius: 4px;
  background: rgba(5, 12, 18, 0.94);
  color: #e9f6ff;
  font: 12px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace;
  letter-spacing: 0.01em;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.45);
}
[data-performance-debug-overlay][hidden] { display: none !important; }
[data-performance-debug-overlay] header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
[data-performance-debug-overlay] strong { font-size: 13px; }
[data-performance-debug-overlay] button { min-width: 32px; min-height: 28px; border: 1px solid currentColor; background: transparent; color: inherit; cursor: pointer; }
[data-performance-debug-overlay] button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
[data-performance-debug-overlay] pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
@media (prefers-reduced-motion: reduce) { [data-performance-debug-overlay] * { scroll-behavior: auto !important; } }
`;
  return style;
}

export function installPerformanceDebugOverlay({
  profiler,
  documentTarget = globalThis.document ?? null,
  windowTarget = globalThis.window ?? null,
  toggleKey = PERFORMANCE_OVERLAY_TOGGLE_KEY,
  updateIntervalMs = 250,
} = {}) {
  if (!profiler || typeof profiler.snapshot !== 'function') {
    throw new TypeError('Performance debug overlay requires a profiler snapshot API.');
  }
  if (!Number.isFinite(updateIntervalMs) || updateIntervalMs < 0) {
    throw new RangeError('Performance overlay update interval must be non-negative.');
  }

  let visible = false;
  let disposed = false;
  let lastRenderedAt = -Infinity;
  let latest = profiler.snapshot();
  let root = null;
  let output = null;
  let style = null;
  const previousDiagnostic = windowTarget?.[PERFORMANCE_OVERLAY_DIAGNOSTIC];

  function render(force = false, sampledAt = latest?.sampledAt ?? 0) {
    if (!root || !output || (!force && !visible)) return false;
    if (!force && sampledAt - lastRenderedAt < updateIntervalMs) return false;
    output.textContent = formatPerformanceSnapshot(latest);
    lastRenderedAt = sampledAt;
    return true;
  }

  function setVisible(next) {
    if (disposed) return false;
    visible = Boolean(next);
    if (root) {
      root.hidden = !visible;
      root.setAttribute('aria-hidden', String(!visible));
    }
    if (visible) render(true);
    return visible;
  }

  function toggle() {
    return setVisible(!visible);
  }

  function update(snapshot, sampledAt = snapshot?.sampledAt ?? 0) {
    if (disposed) return false;
    if (snapshot) latest = snapshot;
    return render(false, sampledAt);
  }

  function onKeyDown(event) {
    if (event?.defaultPrevented || event?.repeat || event?.key !== toggleKey || isEditableTarget(event.target)) return;
    event.preventDefault?.();
    toggle();
  }

  if (documentTarget?.createElement && documentTarget?.body) {
    style = createPerformanceOverlayStyle(documentTarget);
    root = documentTarget.createElement('aside');
    root.dataset.performanceDebugOverlay = 'root';
    root.setAttribute('data-performance-debug-overlay', '');
    root.setAttribute('role', 'complementary');
    root.setAttribute('aria-label', 'Performance debug overlay');
    root.setAttribute('aria-hidden', 'true');
    root.hidden = true;

    const header = documentTarget.createElement('header');
    const title = documentTarget.createElement('strong');
    title.textContent = `Performance debug (${toggleKey})`;
    const close = documentTarget.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Close performance debug overlay');
    close.addEventListener('click', () => setVisible(false));
    header.append(title, close);
    output = documentTarget.createElement('pre');
    output.setAttribute('aria-live', 'off');
    root.append(header, output);
    documentTarget.head?.append(style);
    documentTarget.body.append(root);
    render(true);
  }

  windowTarget?.addEventListener?.('keydown', onKeyDown);
  const diagnostic = Object.freeze({
    snapshot: () => profiler.snapshot(),
    visible: () => visible,
    setVisible,
    toggle,
  });
  if (windowTarget) windowTarget[PERFORMANCE_OVERLAY_DIAGNOSTIC] = diagnostic;

  function dispose() {
    if (disposed) return false;
    disposed = true;
    windowTarget?.removeEventListener?.('keydown', onKeyDown);
    root?.remove?.();
    style?.remove?.();
    if (windowTarget) {
      if (previousDiagnostic === undefined) delete windowTarget[PERFORMANCE_OVERLAY_DIAGNOSTIC];
      else windowTarget[PERFORMANCE_OVERLAY_DIAGNOSTIC] = previousDiagnostic;
    }
    root = null;
    output = null;
    style = null;
    return true;
  }

  return Object.freeze({ update, setVisible, toggle, visible: () => visible, dispose });
}

export function createGameRuntime({
  game,
  renderer,
  ui,
  simulationSeed = DEFAULT_SIMULATION_SEED,
  simulationStepSeconds = FIXED_SIMULATION_STEP_SECONDS,
  maxFrameDeltaSeconds = MAX_FRAME_DELTA_SECONDS,
  now = () => performance.now(),
  requestFrame = window.requestAnimationFrame.bind(window),
  cancelFrame = window.cancelAnimationFrame.bind(window),
  performanceProfiler = createPerformanceProfiler(),
  installDebugOverlay = installPerformanceDebugOverlay,
  documentTarget = globalThis.document ?? null,
  windowTarget = globalThis.window ?? null,
  audioSnapshot = () => compositionAudioSnapshot(windowTarget),
  heapSnapshot = browserHeapSnapshot,
} = {}) {
  if (!performanceProfiler || typeof performanceProfiler.recordFrame !== 'function' ||
      typeof performanceProfiler.reset !== 'function' || typeof performanceProfiler.snapshot !== 'function') {
    throw new TypeError('Game runtime requires a performance profiler record/reset/snapshot API.');
  }
  if (typeof installDebugOverlay !== 'function') {
    throw new TypeError('Game runtime debug-overlay installer must be a function.');
  }
  if (typeof audioSnapshot !== 'function') {
    throw new TypeError('Game runtime audioSnapshot must be a function.');
  }
  if (typeof heapSnapshot !== 'function') {
    throw new TypeError('Game runtime heapSnapshot must be a function.');
  }

  const simulationClock = createFixedStepClock({
    stepSeconds: simulationStepSeconds,
    maxFrameDeltaSeconds,
  });
  const pauseReasons = new Set();
  let lastFrameAt = now();
  let frameHandle = null;
  let debugOverlay = null;

  const isPaused = () => pauseReasons.size > 0;
  const pauseReasonSnapshot = () => Object.freeze([...pauseReasons].sort());

  const startMission = (missionIndex, seed = simulationSeed) => {
    const activeSeed = deriveSimulationSeed(seed, missionIndex);
    setSimulationSeed(activeSeed);
    game.simulationSeed = activeSeed;
    game.start(missionIndex);
    simulationClock.reset();
    performanceProfiler.reset();
    pauseReasons.clear();
    ui.setMission();
    ui.toast(`Mission deployed. First enemy assault in ${game.mission.waves.firstDelay} seconds.`);
    lastFrameAt = now();
  };

  const frame = (frameAt) => {
    const frameStartedAt = now();
    const frameDeltaSeconds = Math.max(0, (frameAt - lastFrameAt) / 1000);
    lastFrameAt = frameAt;
    let clock = simulationClock.snapshot();
    let simulationMs = 0;
    let renderMs = 0;
    let uiMs = 0;

    if (game.mission) {
      const simulationStartedAt = now();
      if (!isPaused()) clock = simulationClock.advance(frameDeltaSeconds, (stepSeconds) => game.update(stepSeconds));
      simulationMs = Math.max(0, now() - simulationStartedAt);

      const renderStartedAt = now();
      renderer.render();
      renderMs = Math.max(0, now() - renderStartedAt);

      const uiStartedAt = now();
      ui.refresh();
      uiMs = Math.max(0, now() - uiStartedAt);
    }

    const sampledAt = now();
    const snapshot = performanceProfiler.recordFrame({
      frameAt: sampledAt,
      frameDeltaMs: frameDeltaSeconds * 1000,
      totalMs: Math.max(0, sampledAt - frameStartedAt),
      simulationMs,
      renderMs,
      uiMs,
      clock,
      game,
      audio: audioSnapshot,
      heap: safeOptionalSnapshot(heapSnapshot),
    });
    debugOverlay?.update(snapshot, sampledAt);
    frameHandle = requestFrame(frame);
  };

  const start = () => {
    if (frameHandle !== null) return;
    if (!debugOverlay) {
      debugOverlay = installDebugOverlay({
        profiler: performanceProfiler,
        documentTarget,
        windowTarget,
      });
    }
    lastFrameAt = now();
    frameHandle = requestFrame(frame);
  };

  const stop = () => {
    const wasRunning = frameHandle !== null;
    if (wasRunning) {
      cancelFrame(frameHandle);
      frameHandle = null;
    }
    debugOverlay?.dispose?.();
    debugOverlay = null;
    return wasRunning;
  };

  const pause = (reason = DEFAULT_PAUSE_REASON) => {
    pauseReasons.add(normalizePauseReason(reason));
    return isPaused();
  };

  const resume = (reason = DEFAULT_PAUSE_REASON) => {
    pauseReasons.delete(normalizePauseReason(reason));
    if (!isPaused()) lastFrameAt = now();
    return isPaused();
  };

  return Object.freeze({
    startMission,
    start,
    stop,
    pause,
    resume,
    isPaused,
    pauseReasons: pauseReasonSnapshot,
    simulationClock,
    performanceProfiler,
  });
}
