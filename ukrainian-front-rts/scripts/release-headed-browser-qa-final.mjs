#!/usr/bin/env node

// Chrome/Edge WebDriver sends synthetic Escape to page content rather than browser chrome,
// so it cannot be used to leave fullscreen after the release harness has verified a real
// user-gesture fullscreen entry. Intercept only that cleanup action on Chromium and route
// it through the application's own fullscreen toggle. All other WebDriver traffic and all
// Firefox/Safari behavior remains untouched.
const browser = String(process.env.RELEASE_QA_BROWSER || '').toLowerCase();
if (browser === 'chrome' || browser === 'edge') {
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (init.method === 'POST' && /\/session\/[^/]+\/actions$/.test(url) && typeof init.body === 'string') {
      let payload = null;
      try { payload = JSON.parse(init.body); } catch {}
      const hasEscape = payload?.actions?.some((source) => source?.type === 'key'
        && source.actions?.some((action) => action?.value === '\uE00C'));
      if (hasEscape) {
        const sessionBase = url.replace(/\/actions$/, '');
        const response = await originalFetch(`${sessionBase}/execute/sync`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            script: `
              const toggle = document.querySelector('#viewportFullscreenToggle');
              if (document.fullscreenElement && toggle) {
                toggle.click();
                return true;
              }
              return document.fullscreenElement === null;
            `,
            args: [],
          }),
        });
        if (!response.ok) return response;
        return new Response(JSON.stringify({ value: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
    }
    return originalFetch(input, init);
  };
}

await import('./release-headed-browser-qa-v3.mjs');
