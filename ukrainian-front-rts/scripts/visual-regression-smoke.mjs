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

function findBrowser() {
  const entries = (process.env.PATH || '').split(delimiter);
  return process.env.CHROME_BIN || ['google-chrome', 'chromium', 'chromium-browser'].find((name) => entries.some((directory) => existsSync(join(directory, name))));
}

function runBrowser(browser, arguments_) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(browser, arguments_, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.once('error', rejectRun);
    child.once('exit', (code, signal) => {
      const result = { code, signal, stdout: Buffer.concat(stdout).toString(), stderr: Buffer.concat(stderr).toString() };
      code === 0 ? resolveRun(result) : rejectRun(new Error(`Chrome exited with ${code ?? signal}: ${result.stderr}`));
    });
  });
}

await mkdir(artifacts, { recursive: true });
const browser = findBrowser();
if (!browser) throw new Error('No Chrome/Chromium executable found. Set CHROME_BIN.');

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
  const dom = await runBrowser(browser, [...common, '--dump-dom', pageUrl]);
  const summary = summarizeVisualRegressionScenes(createVisualRegressionScenes());
  if (!dom.stdout.includes('data-visual-regression-ready="true"')) throw new Error('Visual-regression page did not reach its ready state.');
  if (!dom.stdout.includes(`data-scene-count="${summary.total}"`)) throw new Error(`Visual-regression page did not render ${summary.total} scenes.`);

  const screenshot = resolve(artifacts, 'visual-regression-overview.png');
  await runBrowser(browser, [...common, '--window-size=1920,1080', `--screenshot=${screenshot}`, pageUrl]);
  const screenshotStat = await stat(screenshot);
  if (screenshotStat.size < 4096) throw new Error(`Visual-regression screenshot is unexpectedly small (${screenshotStat.size} bytes).`);

  await writeFile(resolve(artifacts, 'visual-regression-manifest.json'), JSON.stringify({
    status: 'passed',
    page: 'visual-regression.html',
    screenshot: 'visual-regression-overview.png',
    width: 1920,
    height: 1080,
    ...summary,
  }, null, 2));
  console.log(`[visual-regression-browser] captured ${summary.total} scenes to artifacts/visual-regression/visual-regression-overview.png`);
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
}
