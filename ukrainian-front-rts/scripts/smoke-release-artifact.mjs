import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RELEASE_PACKAGE_DIRECTORY, verifyReleaseArtifact } from './lib/release-automation.mjs';

function contentType(path) {
  if (path.endsWith('.html')) return 'text/html; charset=utf-8';
  if (path.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (path.endsWith('.json') || path.endsWith('.webmanifest')) return 'application/json; charset=utf-8';
  if (path.endsWith('.css')) return 'text/css; charset=utf-8';
  return 'application/octet-stream';
}

function safePackagePath(packageRoot, requestPath) {
  const relativePath = decodeURIComponent(requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, ''));
  if (!relativePath || relativePath.includes('..') || relativePath.includes('\\')) throw new Error('Unsafe smoke-test path.');
  const absolute = resolve(packageRoot, relativePath);
  if (absolute !== packageRoot && !absolute.startsWith(`${packageRoot}${sep}`)) throw new Error('Smoke-test path escaped package root.');
  return { absolute, relativePath };
}

async function requestText(url) {
  const response = await fetch(url, { redirect: 'error' });
  if (!response.ok) throw new Error(`Release smoke request failed ${response.status}: ${url}`);
  return Object.freeze({ body: await response.text(), contentType: response.headers.get('content-type') ?? '' });
}

export async function smokeReleaseArtifact(outputRoot) {
  const output = resolve(outputRoot);
  const verified = await verifyReleaseArtifact(output);
  const packageRoot = resolve(output, RELEASE_PACKAGE_DIRECTORY);
  const packageManifest = JSON.parse(await readFile(resolve(packageRoot, 'release-manifest.json'), 'utf8'));

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const { absolute, relativePath } = safePackagePath(packageRoot, url.pathname);
      const info = await stat(absolute);
      if (!info.isFile()) throw new Error('Not a file.');
      response.writeHead(200, { 'content-type': contentType(relativePath), 'cache-control': 'no-store' });
      response.end(await readFile(absolute));
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    }
  });

  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });

  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Release smoke server did not bind an IP port.');
    const base = `http://127.0.0.1:${address.port}`;
    const index = await requestText(`${base}/`);
    if (!index.contentType.startsWith('text/html')) throw new Error('Release smoke index has the wrong content type.');
    if (!index.body.includes(`content="${verified.releaseId}"`)) throw new Error('Release smoke index is missing release metadata.');

    const required = [
      'release-version.json',
      'release-manifest.json',
      packageManifest.generated?.manifestPath,
      packageManifest.generated?.bootstrapPath,
      packageManifest.generated?.serviceWorkerPath,
    ].filter(Boolean);
    for (const path of required) await requestText(`${base}/${encodeURI(path)}`);

    const missing = await fetch(`${base}/__release-smoke-missing__`, { redirect: 'error' });
    if (missing.status !== 404) throw new Error(`Release smoke missing-path contract returned ${missing.status}, expected 404.`);

    return Object.freeze({ ...verified, requests: required.length + 2 });
  } finally {
    await new Promise((resolvePromise) => server.close(resolvePromise));
  }
}

const directInvocation = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (directInvocation) {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputRoot = resolve(projectRoot, process.argv[2] ?? 'artifacts/releases/current');
  const result = await smokeReleaseArtifact(outputRoot);
  console.log(`[release-smoke] ${result.productVersion} ${result.releaseId}: ${result.requests} HTTP checks passed`);
}
