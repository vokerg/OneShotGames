#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { delimiter, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = resolve(root, 'artifacts/command-card-readability');
const host = '127.0.0.1';
const port = 4184;
const pageUrl = `http://${host}:${port}/tests/fixtures/command-card-readability.html`;
const mime = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.mjs': 'text/javascript',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function findBrowser() {
  const entries = (process.env.PATH || '').split(delimiter);
  return process.env.CHROME_BIN || ['google-chrome', 'chromium', 'chromium-browser']
    .find((name) => entries.some((directory) => existsSync(join(directory, name))));
}

function runBrowser(browser, arguments_, { timeoutMs = 45_000 } = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(browser, arguments_, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback(value);
    };
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      finish(rejectRun, new Error(`Chrome exceeded ${timeoutMs}ms timeout.`));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.once('error', (error) => finish(rejectRun, error));
    child.once('exit', (code, signal) => {
      const result = {
        code,
        signal,
        stdout: Buffer.concat(stdout).toString(),
        stderr: Buffer.concat(stderr).toString(),
      };
      code === 0
        ? finish(resolveRun, result)
        : finish(rejectRun, new Error(`Chrome exited with ${code ?? signal}: ${result.stderr}`));
    });
  });
}

await mkdir(artifacts, { recursive: true });
const browser = findBrowser();
if (!browser) throw new Error('No Chrome/Chromium executable found. Set CHROME_BIN.');

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, pageUrl).pathname);
    if (pathname === '/favicon.ico') {
      response.statusCode = 204;
      response.end();
      return;
    }
    const requested = pathname === '/' ? 'tests/fixtures/command-card-readability.html' : pathname.replace(/^\/+/, '');
    const file = resolve(root, requested);
    const projectRelative = relative(root, file);
    if (isAbsolute(projectRelative) || projectRelative === '..' || projectRelative.startsWith(`..${sep}`)) {
      throw new Error('Invalid path');
    }
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

const targets = [
  { label: 'desktop', width: 1600, height: 1000 },
  { label: 'responsive-1050', width: 1000, height: 900 },
  { label: 'responsive-760', width: 760, height: 900 },
];
const captures = [];

try {
  for (const target of targets) {
    const filename = `${target.label}.png`;
    const output = resolve(artifacts, filename);
    const result = await runBrowser(browser, [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--virtual-time-budget=4000',
      `--window-size=${target.width},${target.height}`,
      '--dump-dom',
      `--screenshot=${output}`,
      pageUrl,
    ], { timeoutMs: 60_000 });

    if (!result.stdout.includes('data-command-card-review-ready="true"')) {
      throw new Error(`${target.label} command-card fixture did not reach its ready state.`);
    }
    if (!result.stdout.includes('data-command-card-action-count="8"')) {
      throw new Error(`${target.label} command-card fixture did not render all representative actions.`);
    }
    if (!result.stdout.includes('data-command-card-overlap-count="0"')) {
      const diagnostic = result.stdout.match(/<pre[^>]*id="commandCardReadabilityDiagnostics"[^>]*>([\s\S]*?)<\/pre>/)?.[1] || 'no DOM diagnostic';
      throw new Error(`${target.label} command-card text overlap detected: ${diagnostic}`);
    }
    if (!result.stdout.includes('data-command-card-detail-failure-count="0"')) {
      throw new Error(`${target.label} command-card full-detail accessibility contract failed.`);
    }

    const screenshot = await stat(output);
    if (screenshot.size < 10_000) {
      throw new Error(`${target.label} command-card screenshot is unexpectedly small (${screenshot.size} bytes).`);
    }
    captures.push({ ...target, file: filename, bytes: screenshot.size });
  }

  await writeFile(resolve(artifacts, 'command-card-readability-manifest.json'), JSON.stringify({
    status: 'passed',
    surface: 'production command-card controller in the real HUD command panel',
    fixture: 'tests/fixtures/command-card-readability.html',
    expectations: {
      representativeActions: 8,
      textOverlapCount: 0,
      fullDetailFailures: 0,
      focusedDetailSurface: 'aria-label tooltip on the long English production command',
    },
    captures,
  }, null, 2));
  console.log(`[command-card-readability-browser] captured ${captures.length} real-HUD reviews with zero text overlaps`);
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
}
