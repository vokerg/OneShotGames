import { readViewportMetrics } from '../core/viewport-model.js';

const LOCALE_CHANGE_EVENT = 'fields-of-resolve:localechange';

function createElement(documentTarget, tagName, attributes = {}) {
  const element = documentTarget.createElement(tagName);
  for (const [name, value] of Object.entries(attributes)) {
    if (name === 'textContent') element.textContent = value;
    else if (name === 'className') element.className = value;
    else element.setAttribute(name, value);
  }
  return element;
}

function safeRequestAnimationFrame(windowTarget, callback) {
  if (typeof windowTarget.requestAnimationFrame === 'function') {
    return windowTarget.requestAnimationFrame(callback);
  }
  callback();
  return null;
}

function safeCancelAnimationFrame(windowTarget, handle) {
  if (handle !== null && typeof windowTarget.cancelAnimationFrame === 'function') {
    windowTarget.cancelAnimationFrame(handle);
  }
}

export function installViewportRuntime({
  windowTarget = globalThis.window,
  documentTarget = windowTarget?.document ?? globalThis.document,
} = {}) {
  if (!windowTarget || !documentTarget) {
    throw new TypeError('Viewport runtime requires window and document targets.');
  }

  const root = documentTarget.documentElement;
  const shell = documentTarget.querySelector('#shell');
  const topbar = documentTarget.querySelector('#topbar');
  if (!root || !shell || !topbar) {
    throw new Error('Viewport runtime requires #shell, #topbar, and documentElement.');
  }

  const previousMode = root.dataset.viewportMode;
  const previousFullscreen = root.dataset.viewportFullscreen;
  const previousWidth = root.style.getPropertyValue('--viewport-width');
  const previousHeight = root.style.getPropertyValue('--viewport-height');
  const previousDpr = root.style.getPropertyValue('--viewport-dpr');
  const previousDiagnostic = windowTarget.__fieldsOfResolveViewport;

  const stylesheet = createElement(documentTarget, 'link', {
    rel: 'stylesheet',
    href: 'viewport-runtime.css',
    'data-viewport-runtime': '',
  });
  documentTarget.head.append(stylesheet);

  const fullscreenButton = createElement(documentTarget, 'button', {
    id: 'viewportFullscreenToggle',
    type: 'button',
    'aria-pressed': 'false',
    'aria-label': 'Enter fullscreen battlefield view',
    'data-tooltip': 'Enter or leave fullscreen battlefield view.',
    textContent: 'Fullscreen',
  });
  topbar.append(fullscreenButton);

  const minimumNotice = createElement(documentTarget, 'div', {
    id: 'minimumViewportNotice',
    role: 'status',
    'aria-live': 'polite',
    className: 'viewportNotice hidden',
  });
  const noticeHeading = createElement(documentTarget, 'strong', {
    textContent: 'Viewport too small',
  });
  const noticeBody = createElement(documentTarget, 'span', {
    textContent: 'Use at least 960 × 600 CSS pixels or enter fullscreen for the complete command interface.',
  });
  minimumNotice.append(noticeHeading, noticeBody);
  shell.append(minimumNotice);

  let disposed = false;
  let frameHandle = null;
  let metrics = readViewportMetrics(windowTarget, documentTarget);
  let fullscreenError = null;

  const localized = (key, fallback, variables) => {
    const translate = windowTarget.__fieldsOfResolveLocalization?.t;
    if (typeof translate !== 'function') return fallback;
    try {
      const value = translate(key, variables);
      return typeof value === 'string' ? value : fallback;
    } catch {
      return fallback;
    }
  };

  const apply = () => {
    frameHandle = null;
    if (disposed) return;
    metrics = readViewportMetrics(windowTarget, documentTarget);
    root.dataset.viewportMode = metrics.layoutMode;
    root.dataset.viewportFullscreen = String(metrics.fullscreen);
    root.style.setProperty('--viewport-width', `${metrics.cssWidth}px`);
    root.style.setProperty('--viewport-height', `${metrics.cssHeight}px`);
    root.style.setProperty('--viewport-dpr', String(metrics.pixelRatio));

    minimumNotice.classList.toggle('hidden', !metrics.belowMinimum);
    noticeHeading.textContent = localized('runtime.viewport.noticeHeading', 'Viewport too small');
    noticeBody.textContent = localized(
      'runtime.viewport.noticeBody',
      'Use at least 960 × 600 CSS pixels or enter fullscreen for the complete command interface.',
    );
    fullscreenButton.setAttribute('aria-pressed', String(metrics.fullscreen));
    fullscreenButton.setAttribute(
      'aria-label',
      metrics.fullscreen
        ? localized('runtime.viewport.exitFullscreenAria', 'Exit fullscreen battlefield view')
        : localized('runtime.viewport.enterFullscreenAria', 'Enter fullscreen battlefield view'),
    );
    fullscreenButton.setAttribute(
      'data-tooltip',
      localized('runtime.viewport.fullscreenTooltip', 'Enter or leave fullscreen battlefield view.'),
    );
    fullscreenButton.textContent = metrics.fullscreen
      ? localized('runtime.viewport.exitFullscreen', 'Exit Fullscreen')
      : localized('runtime.viewport.fullscreen', 'Fullscreen');

    const event = typeof windowTarget.CustomEvent === 'function'
      ? new windowTarget.CustomEvent('ufr:viewport-change', { detail: metrics })
      : null;
    if (event) documentTarget.dispatchEvent(event);
  };

  const schedule = () => {
    if (disposed || frameHandle !== null) return;
    frameHandle = safeRequestAnimationFrame(windowTarget, apply);
  };

  const toggleFullscreen = async () => {
    fullscreenError = null;
    try {
      if (documentTarget.fullscreenElement) await documentTarget.exitFullscreen?.();
      else await root.requestFullscreen?.({ navigationUI: 'hide' });
    } catch (error) {
      fullscreenError = error instanceof Error ? error.message : String(error);
      fullscreenButton.dataset.fullscreenError = 'true';
      fullscreenButton.title = localized(
        'runtime.viewport.unavailable',
        `Fullscreen unavailable: ${fullscreenError}`,
        { error: fullscreenError },
      );
    } finally {
      schedule();
    }
  };

  const clearFullscreenError = () => {
    fullscreenError = null;
    delete fullscreenButton.dataset.fullscreenError;
    fullscreenButton.removeAttribute('title');
    schedule();
  };

  const visualViewport = windowTarget.visualViewport ?? null;
  windowTarget.addEventListener('resize', schedule);
  windowTarget.addEventListener('orientationchange', schedule);
  visualViewport?.addEventListener?.('resize', schedule);
  documentTarget.addEventListener('fullscreenchange', clearFullscreenError);
  documentTarget.addEventListener('fullscreenerror', schedule);
  documentTarget.addEventListener(LOCALE_CHANGE_EVENT, schedule);
  fullscreenButton.addEventListener('click', toggleFullscreen);

  apply();

  const snapshot = () => Object.freeze({
    ...metrics,
    fullscreenAvailable: typeof root.requestFullscreen === 'function',
    fullscreenError,
  });
  windowTarget.__fieldsOfResolveViewport = Object.freeze({ snapshot });

  return Object.freeze({
    snapshot,
    dispose() {
      if (disposed) return;
      disposed = true;
      safeCancelAnimationFrame(windowTarget, frameHandle);
      windowTarget.removeEventListener('resize', schedule);
      windowTarget.removeEventListener('orientationchange', schedule);
      visualViewport?.removeEventListener?.('resize', schedule);
      documentTarget.removeEventListener('fullscreenchange', clearFullscreenError);
      documentTarget.removeEventListener('fullscreenerror', schedule);
      documentTarget.removeEventListener(LOCALE_CHANGE_EVENT, schedule);
      fullscreenButton.removeEventListener('click', toggleFullscreen);
      fullscreenButton.remove();
      minimumNotice.remove();
      stylesheet.remove();

      if (previousMode === undefined) delete root.dataset.viewportMode;
      else root.dataset.viewportMode = previousMode;
      if (previousFullscreen === undefined) delete root.dataset.viewportFullscreen;
      else root.dataset.viewportFullscreen = previousFullscreen;

      if (previousWidth) root.style.setProperty('--viewport-width', previousWidth);
      else root.style.removeProperty('--viewport-width');
      if (previousHeight) root.style.setProperty('--viewport-height', previousHeight);
      else root.style.removeProperty('--viewport-height');
      if (previousDpr) root.style.setProperty('--viewport-dpr', previousDpr);
      else root.style.removeProperty('--viewport-dpr');

      if (previousDiagnostic === undefined) delete windowTarget.__fieldsOfResolveViewport;
      else windowTarget.__fieldsOfResolveViewport = previousDiagnostic;
    },
  });
}
