#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { delimiter, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createVisualRegressionScenes, summarizeVisualRegressionScenes } from '../src/render/visual-regression-scenes.js';
import { runBrowserWithTimeoutRetry } from './lib/browser-process.mjs';
import { openChromeDevToolsSession } from './lib/chrome-devtools-session.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = resolve(root, 'artifacts/visual-regression');
const browserAttemptsPath = resolve(artifacts, 'visual-regression-browser-attempts.json');
const failurePath = resolve(artifacts, 'visual-regression-failure.json');
const host = '127.0.0.1';
const port = 4174;
const devToolsPort = 9234;
const pageUrl = `http://${host}:${port}/visual-regression.html`;
const mime = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const timeoutRetryCount = 1;

function findBrowser() {
  const entries = (process.env.PATH || '').split(delimiter);
  return process.env.CHROME_BIN || ['google-chrome', 'chromium', 'chromium-browser'].find((name) => entries.some((directory) => existsSync(join(directory, name))));
}

function textTail(value, limit = 12_000) {
  const text = String(value || '');
  return text.length <= limit ? text : text.slice(-limit);
}

async function captureState(output) {
  if (!output) return null;
  const file = relative(artifacts, output);
  try {
    const captureStat = await stat(output);
    return { file, exists: true, bytes: captureStat.size };
  } catch (error) {
    if (error.code === 'ENOENT') return { file, exists: false, bytes: 0 };
    return { file, exists: null, bytes: null, error: error.message };
  }
}

await mkdir(artifacts, { recursive: true });
await rm(browserAttemptsPath, { force: true });
await rm(failurePath, { force: true });
const browser = findBrowser();
if (!browser) throw new Error('No Chrome/Chromium executable found. Set CHROME_BIN.');

const browserAttemptDiagnostics = [];
let phase = 'server-startup';
let activeTarget = null;
let lastBrowserResult = null;
let devToolsDiagnostics = null;

async function recordBrowserAttemptFailure(target, output, failure) {
  const details = failure.details ?? {};
  const diagnostic = {
    target,
    attempt: failure.attempt,
    retryable: failure.retryable,
    message: failure.message,
    timedOut: details.timedOut === true,
    timeoutMs: details.timeoutMs ?? null,
    elapsedMs: details.elapsedMs ?? null,
    code: details.code ?? null,
    signal: details.signal ?? null,
    stderr: textTail(details.stderr),
    stdoutTail: textTail(details.stdout),
    capture: await captureState(output),
  };
  browserAttemptDiagnostics.push(diagnostic);
  await writeFile(browserAttemptsPath, JSON.stringify({
    status: 'attempt-failed',
    timeoutRetryCount,
    attempts: browserAttemptDiagnostics,
  }, null, 2));
}

async function runVisualBrowser(arguments_, { target, output = null, timeoutMs = 45_000 } = {}) {
  activeTarget = {
    ...target,
    output: output ? relative(artifacts, output) : null,
  };
  const result = await runBrowserWithTimeoutRetry(browser, arguments_, {
    timeoutMs,
    retries: timeoutRetryCount,
    beforeAttempt: output ? () => rm(output, { force: true }) : null,
    onAttemptFailure: (failure) => recordBrowserAttemptFailure(activeTarget, output, failure),
  });
  lastBrowserResult = {
    target: activeTarget,
    attemptCount: result.attemptCount,
    elapsedMs: result.elapsedMs ?? null,
    code: result.code ?? null,
    signal: result.signal ?? null,
    stderr: textTail(result.stderr),
    stdoutTail: textTail(result.stdout),
  };
  return result;
}

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, pageUrl).pathname);
    const requested = pathname === '/' ? 'visual-regression.html' : pathname.replace(/^\/+/, '');
    const file = resolve(root, requested);
    const projectRelative = relative(root, file);
    if (isAbsolute(projectRelative) || projectRelative === '..' || projectRelative.startsWith(`..${sep}`)) throw new Error('Invalid path');
    response.setHeader('content-type', mime[extname(file)] || 'application/octet-stream');
    response.end(await readFile(file));
  } catch (error) {
    response.statusCode = 404;
    response.end(error.message);
  }
});
await new Promise((resolveReady, rejectReady) => {
  server.once('error', rejectReady);
  server.listen(port, host, resolveReady);
});

try {
  const common = ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--hide-scrollbars', '--virtual-time-budget=3000'];
  phase = 'overview-dom';
  const dom = await runVisualBrowser([...common, '--dump-dom', pageUrl], {
    target: { kind: 'overview-dom', page: 'visual-regression.html' },
  });
  const summary = summarizeVisualRegressionScenes(createVisualRegressionScenes());
  if (!dom.stdout.includes('data-visual-regression-ready="true"')) throw new Error('Visual-regression page did not reach its ready state.');
  if (!dom.stdout.includes(`data-scene-count="${summary.total}"`)) throw new Error(`Visual-regression page did not render ${summary.total} scenes.`);

  phase = 'overview-screenshot';
  const screenshot = resolve(artifacts, 'visual-regression-overview.png');
  await runVisualBrowser([...common, '--window-size=1920,1080', `--screenshot=${screenshot}`, pageUrl], {
    target: { kind: 'overview-screenshot', page: 'visual-regression.html' },
    output: screenshot,
  });
  const screenshotStat = await stat(screenshot);
  if (screenshotStat.size < 4096) throw new Error(`Visual-regression screenshot is unexpectedly small (${screenshotStat.size} bytes).`);

  // Keep CI bounded: the Art Lab retains four manual pages covering all 32 identities,
  // while automation captures one faction in color and the opposing support page in
  // grayscale. Unit tests and the support verifier enforce exact 32-identity coverage.
  // The live Art Lab has a perpetual requestAnimationFrame renderer, so capture it through
  // DevTools instead of relying on Chromium's CLI --dump-dom + --screenshot process exit.
  const reviewTargets = [
    { page: 0, value: false, label: 'ua-uas-fires' },
    { page: 3, value: true, label: 'ru-support' },
  ];
  const supportCaptures = [];
  phase = 'support-devtools-startup';
  const devTools = await openChromeDevToolsSession({
    browser,
    browserPort: devToolsPort,
    profilePrefix: 'ufrts-visual-regression-',
    windowSize: '1600,900',
  });
  try {
    await devTools.call('Emulation.setDeviceMetricsOverride', {
      width: 1600,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    for (const target of reviewTargets) {
      phase = `support-review-${target.page + 1}`;
      const name = `ufr-114-${target.label}-${target.value ? 'value' : 'color'}.png`;
      const output = resolve(artifacts, name);
      const url = `http://${host}:${port}/art-lab.html?supportPage=${target.page}${target.value ? '&value=1' : ''}`;
      activeTarget = {
        kind: 'support-review',
        page: target.page + 1,
        label: target.label,
        valueCheck: target.value,
        url,
        output: name,
        captureMode: 'devtools',
      };
      await rm(output, { force: true });
      await devTools.call('Page.navigate', { url });
      await devTools.waitFor(
        `document.body?.dataset.supportVisualReady === 'true' || Boolean(document.body?.dataset.supportVisualError)`,
        `UFR-114 Art Lab page ${target.page + 1} readiness`,
        { timeoutMs: 20_000 },
      );
      const review = await devTools.evaluate(`({
        ready: document.body?.dataset.supportVisualReady ?? null,
        page: document.body?.dataset.supportVisualPage ?? null,
        state: document.body?.dataset.supportVisualState ?? null,
        direction: document.body?.dataset.supportVisualDirection ?? null,
        value: document.body?.dataset.supportVisualValue ?? null,
        error: document.body?.dataset.supportVisualError ?? null,
      })`);
      if (review.error) throw new Error(`UFR-114 Art Lab page ${target.page + 1} reported a runtime load error: ${review.error}`);
      if (review.ready !== 'true') throw new Error(`UFR-114 Art Lab page ${target.page + 1} did not reach ready state.`);
      if (review.page !== String(target.page)) throw new Error(`UFR-114 Art Lab page ${target.page + 1} did not select the requested review page.`);
      if (review.value !== String(target.value)) throw new Error(`UFR-114 Art Lab page ${target.page + 1} did not apply the requested value-check mode.`);
      await devTools.evaluate(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`, {
        awaitPromise: true,
        timeoutMs: 8_000,
      });
      await devTools.captureScreenshot(output);
      const captureStat = await stat(output);
      if (captureStat.size < 4096) throw new Error(`UFR-114 Art Lab capture ${name} is unexpectedly small (${captureStat.size} bytes).`);
      supportCaptures.push({
        page: target.page + 1,
        file: name,
        valueCheck: target.value,
        bytes: captureStat.size,
        captureMode: 'devtools',
        state: review.state,
        direction: review.direction,
      });
    }
    devToolsDiagnostics = {
      ...devTools.diagnostics(),
      stderr: textTail(devTools.diagnostics().stderr),
    };
  } catch (error) {
    devToolsDiagnostics = {
      ...devTools.diagnostics(),
      stderr: textTail(devTools.diagnostics().stderr),
    };
    throw error;
  } finally {
    await devTools.close();
  }

  phase = 'manifest';
  await writeFile(resolve(artifacts, 'visual-regression-manifest.json'), JSON.stringify({
    status: 'passed',
    page: 'visual-regression.html',
    screenshot: 'visual-regression-overview.png',
    width: 1920,
    height: 1080,
    browserPolicy: {
      timeoutRetries: timeoutRetryCount,
      recoveredAttemptFailures: browserAttemptDiagnostics.length,
      liveArtLabCapture: 'chrome-devtools-protocol',
    },
    supportReview: {
      page: 'art-lab.html',
      width: 1600,
      height: 900,
      manualPageCount: 4,
      automatedCaptureStrategy: 'representative-opposing-faction-color-and-grayscale',
      captures: supportCaptures,
    },
    ...summary,
  }, null, 2));
  if (browserAttemptDiagnostics.length) {
    await writeFile(browserAttemptsPath, JSON.stringify({
      status: 'recovered',
      timeoutRetryCount,
      attempts: browserAttemptDiagnostics,
    }, null, 2));
  }
  console.log(`[visual-regression-browser] captured ${summary.total} scenes and ${supportCaptures.length} bounded UFR-114 Art Lab reviews to artifacts/visual-regression`);
} catch (error) {
  const activeOutput = activeTarget?.output ? resolve(artifacts, activeTarget.output) : null;
  await writeFile(failurePath, JSON.stringify({
    status: 'failed',
    phase,
    target: activeTarget,
    message: error.message,
    timeoutRetryCount,
    capture: await captureState(activeOutput),
    lastBrowserResult,
    browserAttempts: browserAttemptDiagnostics,
    devTools: devToolsDiagnostics ?? error.devToolsDiagnostics ?? null,
  }, null, 2));
  throw error;
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
}
