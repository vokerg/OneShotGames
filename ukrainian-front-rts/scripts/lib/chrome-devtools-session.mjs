import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

export async function openChromeDevToolsSession({
  browser,
  browserPort,
  profilePrefix = 'ufrts-chrome-cdp-',
  windowSize = '1600,900',
  startupTimeoutMs = 12_000,
} = {}) {
  if (!browser) throw new Error('A Chrome/Chromium executable is required.');
  if (!Number.isInteger(browserPort) || browserPort <= 0) throw new Error('A positive DevTools browser port is required.');
  if (typeof WebSocket !== 'function') throw new Error('Chrome DevTools capture requires the Node.js WebSocket global.');

  const profile = await mkdtemp(join(tmpdir(), profilePrefix));
  const browserLogs = [];
  const startedAt = Date.now();
  const chrome = spawn(browser, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    `--window-size=${windowSize}`,
    `--remote-debugging-port=${browserPort}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  chrome.stderr.on('data', (chunk) => browserLogs.push(chunk.toString()));
  chrome.on('error', (error) => browserLogs.push(`[spawn] ${error.stack || error.message}\n`));

  let chromeExited = false;
  let exitCode = null;
  let exitSignal = null;
  const chromeExit = new Promise((resolveExit) => {
    chrome.once('exit', (code, signal) => {
      chromeExited = true;
      exitCode = code;
      exitSignal = signal;
      browserLogs.push(`[exit] code=${code ?? 'null'} signal=${signal ?? 'null'}\n`);
      resolveExit();
    });
  });

  let socket = null;
  let nextId = 1;
  const pending = new Map();
  const events = [];

  const diagnostics = () => ({
    elapsedMs: Date.now() - startedAt,
    browserPort,
    chromeExited,
    exitCode,
    exitSignal,
    stderr: browserLogs.join(''),
    eventCount: events.length,
  });

  async function connect() {
    const deadline = Date.now() + startupTimeoutMs;
    let attempt = 0;
    while (Date.now() < deadline) {
      attempt += 1;
      if (chromeExited) throw new Error(`Chrome exited before DevTools became available (${exitCode ?? exitSignal}).`);
      try {
        const response = await fetch(`http://127.0.0.1:${browserPort}/json`);
        if (!response.ok) throw new Error(`DevTools target listing returned ${response.status}.`);
        const targets = await response.json();
        const target = targets.find((item) => item.type === 'page');
        if (target?.webSocketDebuggerUrl) {
          socket = new WebSocket(target.webSocketDebuggerUrl);
          await new Promise((resolveOpen, rejectOpen) => {
            socket.addEventListener('open', resolveOpen, { once: true });
            socket.addEventListener('error', rejectOpen, { once: true });
          });
          socket.addEventListener('message', ({ data }) => {
            const message = JSON.parse(data);
            if (message.id && pending.has(message.id)) {
              const entry = pending.get(message.id);
              pending.delete(message.id);
              clearTimeout(entry.timeout);
              message.error ? entry.reject(new Error(message.error.message)) : entry.resolve(message.result);
            } else if (message.method) {
              events.push(message);
            }
          });
          socket.addEventListener('close', () => {
            for (const entry of pending.values()) {
              clearTimeout(entry.timeout);
              entry.reject(new Error('Chrome DevTools socket closed.'));
            }
            pending.clear();
          }, { once: true });
          return;
        }
      } catch (error) {
        browserLogs.push(`[connect ${attempt}] ${error.message}\n`);
      }
      await delay(200);
    }
    throw new Error(`Chrome DevTools endpoint did not become available within ${startupTimeoutMs}ms.`);
  }

  function call(method, params = {}, timeoutMs = 10_000) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`Cannot call ${method}: DevTools socket is not open.`));
    }
    const id = nextId++;
    return new Promise((resolveCall, rejectCall) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        rejectCall(new Error(`Chrome DevTools call timed out after ${timeoutMs}ms: ${method}`));
      }, timeoutMs);
      pending.set(id, { resolve: resolveCall, reject: rejectCall, timeout });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate(expression, { awaitPromise = false, timeoutMs = 10_000 } = {}) {
    const evaluation = await call('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise,
    }, timeoutMs);
    if (evaluation.exceptionDetails) {
      const exception = evaluation.exceptionDetails.exception?.description
        || evaluation.exceptionDetails.text
        || 'unknown error';
      throw new Error(`Browser evaluation failed: ${exception}`);
    }
    return evaluation.result?.value;
  }

  async function waitFor(expression, description, { timeoutMs = 20_000, pollMs = 200 } = {}) {
    const deadline = Date.now() + timeoutMs;
    let lastError = null;
    while (Date.now() < deadline) {
      try {
        if (await evaluate(`Boolean(${expression})`)) return;
      } catch (error) {
        lastError = error;
        browserLogs.push(`[wait ${description}] ${error.message}\n`);
      }
      await delay(pollMs);
    }
    throw new Error(`Timed out after ${timeoutMs}ms waiting for ${description}${lastError ? `; last error: ${lastError.message}` : ''}.`);
  }

  async function captureScreenshot(output) {
    const shot = await call('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    }, 15_000);
    await writeFile(output, Buffer.from(shot.data, 'base64'));
  }

  async function close() {
    try {
      socket?.close();
    } catch {}
    if (!chromeExited) chrome.kill('SIGTERM');
    await Promise.race([chromeExit, delay(3000)]);
    if (!chromeExited) {
      chrome.kill('SIGKILL');
      await Promise.race([chromeExit, delay(3000)]);
    }
    if (!chromeExited) throw new Error('Chromium did not exit after forced DevTools teardown.');
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }

  try {
    await connect();
    await call('Runtime.enable');
    await call('Log.enable');
    await call('Page.enable');
    await call('Network.enable');
    return { call, evaluate, waitFor, captureScreenshot, close, diagnostics, events };
  } catch (error) {
    try {
      await close();
    } catch (closeError) {
      browserLogs.push(`[close-after-connect-failure] ${closeError.stack || closeError.message}\n`);
    }
    error.devToolsDiagnostics = diagnostics();
    throw error;
  }
}
