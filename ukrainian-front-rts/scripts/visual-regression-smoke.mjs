#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { delimiter, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createVisualRegressionScenes, summarizeVisualRegressionScenes } from '../src/render/visual-regression-scenes.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = resolve(root, 'artifacts/visual-regression');
const host = '127.0.0.1';
const port = 4174;
const pageUrl = `http://${host}:${port}/visual-regression.html`;
const mime = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

function findBrowser() {
  const entries = (process.env.PATH || '').split(delimiter);
  return process.env.CHROME_BIN || ['google-chrome', 'chromium', 'chromium-browser'].find((name) => entries.some((directory) => existsSync(join(directory, name))));
}
function runBrowser(browser, arguments_, { timeoutMs = 45_000 } = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const startedAt = Date.now();
    const child = spawn(browser, arguments_, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [], stderr = [];
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback(value);
    };
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      const error = new Error(`Chrome exceeded ${timeoutMs}ms timeout.`);
      error.code = 'BROWSER_TIMEOUT';
      error.elapsedMs = Date.now() - startedAt;
      error.stderr = Buffer.concat(stderr).toString();
      finish(rejectRun, error);
    }, timeoutMs);
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.once('error', (error) => finish(rejectRun, error));
    child.once('exit', (code, signal) => {
      const result = { code, signal, stdout: Buffer.concat(stdout).toString(), stderr: Buffer.concat(stderr).toString(), elapsedMs: Date.now() - startedAt };
      if (code === 0) finish(resolveRun, result);
      else {
        const error = new Error(`Chrome exited with ${code ?? signal}: ${result.stderr}`);
        error.code = 'BROWSER_EXIT';
        error.elapsedMs = result.elapsedMs;
        error.stderr = result.stderr;
        finish(rejectRun, error);
      }
    });
  });
}

await mkdir(artifacts, { recursive: true });
const browser = findBrowser();
if (!browser) throw new Error('No Chrome/Chromium executable found. Set CHROME_BIN.');
const browserAttempts = [];
const diagnosticsPath = resolve(artifacts, 'visual-regression-browser-diagnostics.json');

async function runBrowserWithRetry(arguments_, { label, timeoutMs = 45_000, retries = 1 } = {}) {
  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    try {
      const result = await runBrowser(browser, arguments_, { timeoutMs });
      browserAttempts.push({ label, attempt, status: 'passed', elapsedMs: result.elapsedMs, timeoutMs });
      await writeFile(diagnosticsPath, JSON.stringify({ status: 'running', attempts: browserAttempts }, null, 2));
      return result;
    } catch (error) {
      const record = {
        label,
        attempt,
        status: 'failed',
        code: error.code || 'BROWSER_ERROR',
        elapsedMs: error.elapsedMs ?? null,
        timeoutMs,
        stderr: String(error.stderr || '').slice(-8000),
        message: error.message,
      };
      browserAttempts.push(record);
      await writeFile(diagnosticsPath, JSON.stringify({ status: 'running', attempts: browserAttempts }, null, 2));
      if (error.code !== 'BROWSER_TIMEOUT' || attempt > retries) throw error;
      await delay(750);
    }
  }
  throw new Error(`Browser retry loop exhausted for ${label}.`);
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
  const dom = await runBrowserWithRetry([...common, '--dump-dom', pageUrl], { label: 'visual-regression-dom', timeoutMs: 60_000 });
  const summary = summarizeVisualRegressionScenes(createVisualRegressionScenes());
  if (!dom.stdout.includes('data-visual-regression-ready="true"')) throw new Error('Visual-regression page did not reach its ready state.');
  if (!dom.stdout.includes(`data-scene-count="${summary.total}"`)) throw new Error(`Visual-regression page did not render ${summary.total} scenes.`);

  const screenshot = resolve(artifacts, 'visual-regression-overview.png');
  await runBrowserWithRetry([...common, '--window-size=1920,1080', `--screenshot=${screenshot}`, pageUrl], { label: 'visual-regression-overview', timeoutMs: 60_000 });
  const screenshotStat = await stat(screenshot);
  if (screenshotStat.size < 4096) throw new Error(`Visual-regression screenshot is unexpectedly small (${screenshotStat.size} bytes).`);

  // Keep CI bounded: the Art Lab retains four manual pages covering all 32 identities,
  // while automation validates readiness and captures one faction in color and the
  // opposing support page in grayscale. DOM validation and screenshot capture run in
  // separate Chrome processes because combining --dump-dom and --screenshot can hang
  // indefinitely on GitHub-hosted runners despite either mode completing immediately.
  const reviewTargets = [
    { page: 0, value: false, label: 'ua-uas-fires' },
    { page: 3, value: true, label: 'ru-support' },
  ];
  const supportCaptures = [];
  for (const target of reviewTargets) {
    const mode = target.value ? 'value' : 'color';
    const name = `ufr-114-${target.label}-${mode}.png`;
    const output = resolve(artifacts, name);
    const url = `http://${host}:${port}/art-lab.html?supportPage=${target.page}${target.value ? '&value=1' : ''}`;
    const supportCommon = [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--hide-scrollbars',
      '--virtual-time-budget=6000', '--window-size=1600,900',
    ];
    const review = await runBrowserWithRetry(
      [...supportCommon, '--dump-dom', url],
      { label: `support-page-${target.page + 1}-${mode}-dom`, timeoutMs: 60_000, retries: 1 },
    );
    if (!review.stdout.includes('data-support-visual-ready="true"')) throw new Error(`UFR-114 Art Lab page ${target.page + 1} did not reach ready state.`);
    if (!review.stdout.includes(`data-support-visual-page="${target.page}"`)) throw new Error(`UFR-114 Art Lab page ${target.page + 1} did not select the requested review page.`);
    if (review.stdout.includes('data-support-visual-error=')) throw new Error(`UFR-114 Art Lab page ${target.page + 1} reported a runtime load error.`);

    await runBrowserWithRetry(
      [...supportCommon, `--screenshot=${output}`, url],
      { label: `support-page-${target.page + 1}-${mode}-screenshot`, timeoutMs: 60_000, retries: 1 },
    );
    const captureStat = await stat(output);
    if (captureStat.size < 4096) throw new Error(`UFR-114 Art Lab capture ${name} is unexpectedly small (${captureStat.size} bytes).`);
    supportCaptures.push({ page: target.page + 1, file: name, valueCheck: target.value, bytes: captureStat.size });
  }

  const manifest = {
    status: 'passed',
    page: 'visual-regression.html',
    screenshot: 'visual-regression-overview.png',
    width: 1920,
    height: 1080,
    supportReview: {
      page: 'art-lab.html',
      width: 1600,
      height: 900,
      manualPageCount: 4,
      automatedCaptureStrategy: 'separate-readiness-and-representative-opposing-faction-captures',
      captures: supportCaptures,
    },
    browserAttempts,
    ...summary,
  };
  await writeFile(resolve(artifacts, 'visual-regression-manifest.json'), JSON.stringify(manifest, null, 2));
  await writeFile(diagnosticsPath, JSON.stringify({ status: 'passed', attempts: browserAttempts }, null, 2));
  console.log(`[visual-regression-browser] captured ${summary.total} scenes and ${supportCaptures.length} bounded UFR-114 Art Lab reviews to artifacts/visual-regression`);
} catch (error) {
  await writeFile(diagnosticsPath, JSON.stringify({ status: 'failed', attempts: browserAttempts, finalError: error.stack || error.message }, null, 2));
  throw error;
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
}
