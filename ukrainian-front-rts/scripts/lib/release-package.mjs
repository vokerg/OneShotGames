import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';

export const RELEASE_PACKAGE_SCHEMA = 'fields-of-resolve.release-package';
export const RELEASE_PACKAGE_VERSION = 1;
export const RELEASE_CACHE_PREFIX = 'fields-of-resolve-release-';
export const RELEASE_RUNTIME_DIRECTORIES = Object.freeze(['assets', 'game', 'src', 'ui']);
export const RELEASE_TOP_LEVEL_EXTENSIONS = Object.freeze(new Set(['.css']));

function posix(path) {
  return path.replaceAll(sep, '/');
}

export function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

async function walkFiles(root) {
  const output = [];
  async function walk(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) output.push(posix(relative(root, absolute)));
      else throw new Error(`Release package does not support non-file entry: ${posix(relative(root, absolute))}`);
    }
  }
  await walk(root);
  return output.sort();
}

async function exists(path) {
  try {
    await readFile(path);
    return true;
  } catch (error) {
    if (error?.code === 'EISDIR') return true;
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export async function discoverReleaseInputs(projectRoot) {
  const root = resolve(projectRoot);
  const paths = [];
  for (const entry of (await readdir(root, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isFile() && (entry.name === 'index.html' || RELEASE_TOP_LEVEL_EXTENSIONS.has(extname(entry.name)))) {
      paths.push(entry.name);
    }
  }
  for (const directory of RELEASE_RUNTIME_DIRECTORIES) {
    const absolute = join(root, directory);
    if (!(await exists(absolute))) throw new Error(`Required release runtime directory is missing: ${directory}`);
    paths.push(...(await walkFiles(absolute)).map((path) => `${directory}/${path}`));
  }
  return Object.freeze([...new Set(paths)].sort());
}

export async function createSourceInventory(projectRoot, inputPaths = null) {
  const root = resolve(projectRoot);
  const paths = inputPaths ?? await discoverReleaseInputs(root);
  const entries = [];
  for (const path of paths) {
    const content = await readFile(join(root, path));
    entries.push(Object.freeze({ path, bytes: content.byteLength, sha256: sha256(content) }));
  }
  return Object.freeze(entries);
}

export function deriveReleaseId(sourceInventory) {
  const canonical = sourceInventory
    .map(({ path, bytes, sha256: digest }) => `${path}\0${bytes}\0${digest}`)
    .join('\n');
  return `r-${sha256(canonical).slice(0, 16)}`;
}

function webManifest(releaseId) {
  return `${JSON.stringify({
    name: 'Fields of Resolve',
    short_name: 'Fields of Resolve',
    id: `./?release=${releaseId}`,
    start_url: './',
    scope: './',
    display: 'standalone',
    background_color: '#101510',
    theme_color: '#101510',
    lang: 'en',
  }, null, 2)}\n`;
}

function releaseBootstrap({ releaseId, serviceWorkerPath }) {
  return `const release = Object.freeze(${JSON.stringify({ id: releaseId, packageVersion: RELEASE_PACKAGE_VERSION })});\n` +
    `globalThis.__fieldsOfResolveRelease = release;\n` +
    `if ('serviceWorker' in navigator && location.protocol !== 'file:') {\n` +
    `  addEventListener('load', () => navigator.serviceWorker.register(${JSON.stringify(`./${serviceWorkerPath}`)}, { scope: './' })\n` +
    `    .catch((error) => console.warn('[release] service worker registration failed', error)));\n` +
    `}\n`;
}

function serviceWorker({ releaseId, cachePaths }) {
  const cacheName = `${RELEASE_CACHE_PREFIX}${releaseId}`;
  return `const CACHE_NAME = ${JSON.stringify(cacheName)};\n` +
    `const CACHE_PREFIX = ${JSON.stringify(RELEASE_CACHE_PREFIX)};\n` +
    `const PRECACHE = Object.freeze(${JSON.stringify(cachePaths, null, 2)});\n` +
    `self.addEventListener('install', (event) => {\n` +
    `  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE.map((path) => new Request(path, { cache: 'reload' })))).then(() => self.skipWaiting()));\n` +
    `});\n` +
    `self.addEventListener('activate', (event) => {\n` +
    `  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));\n` +
    `});\n` +
    `self.addEventListener('fetch', (event) => {\n` +
    `  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;\n` +
    `  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then((cached) => cached || fetch(event.request)));\n` +
    `});\n`;
}

function patchIndexHtml(source, { releaseId, manifestPath, bootstrapPath }) {
  if (!source.includes('</head>') || !source.includes('</body>')) {
    throw new Error('index.html must contain closing head and body tags for release metadata injection.');
  }
  const head = `    <meta name="fields-of-resolve-release" content="${releaseId}" />\n    <link rel="manifest" href="${manifestPath}" />\n`;
  const body = `    <script type="module" src="${bootstrapPath}"></script>\n`;
  return source.replace('</head>', `${head}  </head>`).replace('</body>', `${body}  </body>`);
}

export function generatedReleasePaths(releaseId) {
  return Object.freeze({
    manifestPath: `manifest.${releaseId}.webmanifest`,
    bootstrapPath: `release-bootstrap.${releaseId}.js`,
    serviceWorkerPath: `service-worker.${releaseId}.js`,
    versionPath: 'release-version.json',
    packageManifestPath: 'release-manifest.json',
  });
}

export async function buildReleasePackage({ projectRoot, outputRoot }) {
  if (!projectRoot || !outputRoot) throw new TypeError('buildReleasePackage requires projectRoot and outputRoot.');
  const root = resolve(projectRoot);
  const output = resolve(outputRoot);
  if (output === root || root.startsWith(`${output}${sep}`)) throw new Error('Release output must not contain the project root.');

  const inputPaths = await discoverReleaseInputs(root);
  const sourceInventory = await createSourceInventory(root, inputPaths);
  const releaseId = deriveReleaseId(sourceInventory);
  const paths = generatedReleasePaths(releaseId);

  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  for (const path of inputPaths) {
    const destination = join(output, path);
    await mkdir(dirname(destination), { recursive: true });
    await cp(join(root, path), destination);
  }

  const sourceIndex = await readFile(join(root, 'index.html'), 'utf8');
  await writeFile(join(output, 'index.html'), patchIndexHtml(sourceIndex, {
    releaseId,
    manifestPath: paths.manifestPath,
    bootstrapPath: paths.bootstrapPath,
  }));
  await writeFile(join(output, paths.manifestPath), webManifest(releaseId));
  await writeFile(join(output, paths.bootstrapPath), releaseBootstrap({ releaseId, serviceWorkerPath: paths.serviceWorkerPath }));
  await writeFile(join(output, paths.versionPath), `${JSON.stringify({
    schema: RELEASE_PACKAGE_SCHEMA,
    version: RELEASE_PACKAGE_VERSION,
    releaseId,
    sourceDigest: sha256(sourceInventory.map(({ path, sha256: digest }) => `${path}:${digest}`).join('\n')),
  }, null, 2)}\n`);

  const cachePaths = (await walkFiles(output))
    .filter((path) => path !== paths.packageManifestPath && path !== paths.serviceWorkerPath)
    .map((path) => `./${path}`)
    .sort();
  await writeFile(join(output, paths.serviceWorkerPath), serviceWorker({ releaseId, cachePaths }));

  const packagedPaths = (await walkFiles(output)).filter((path) => path !== paths.packageManifestPath).sort();
  const files = [];
  for (const path of packagedPaths) {
    const content = await readFile(join(output, path));
    files.push({ path, bytes: content.byteLength, sha256: sha256(content) });
  }
  const manifest = {
    schema: RELEASE_PACKAGE_SCHEMA,
    version: RELEASE_PACKAGE_VERSION,
    releaseId,
    entrypoint: 'index.html',
    generated: paths,
    sourceInventory,
    cachePaths,
    files,
  };
  await writeFile(join(output, paths.packageManifestPath), `${JSON.stringify(manifest, null, 2)}\n`);
  return Object.freeze(manifest);
}

export async function verifyReleasePackage(outputRoot) {
  const output = resolve(outputRoot);
  const manifestPath = join(output, 'release-manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.schema !== RELEASE_PACKAGE_SCHEMA || manifest.version !== RELEASE_PACKAGE_VERSION) {
    throw new Error(`Unsupported release package manifest ${manifest.schema}@${manifest.version}.`);
  }
  if (deriveReleaseId(manifest.sourceInventory ?? []) !== manifest.releaseId) {
    throw new Error('Release ID does not match the declared source inventory.');
  }
  const expectedPaths = [...(manifest.files ?? []).map((entry) => entry.path), 'release-manifest.json'].sort();
  const actualPaths = (await walkFiles(output)).sort();
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    throw new Error(`Release package file set drift: expected ${expectedPaths.length}, found ${actualPaths.length}.`);
  }
  for (const entry of manifest.files ?? []) {
    const content = await readFile(join(output, entry.path));
    if (content.byteLength !== entry.bytes || sha256(content) !== entry.sha256) {
      throw new Error(`Release package digest mismatch: ${entry.path}`);
    }
  }
  const cachePaths = new Set(manifest.cachePaths ?? []);
  const serviceWorkerPath = manifest.generated?.serviceWorkerPath;
  for (const entry of manifest.files ?? []) {
    if (entry.path === serviceWorkerPath) continue;
    const url = `./${entry.path}`;
    if (entry.path !== 'release-manifest.json' && !cachePaths.has(url)) {
      throw new Error(`Offline precache is missing packaged runtime file: ${entry.path}`);
    }
  }
  for (const url of cachePaths) {
    if (!url.startsWith('./')) throw new Error(`Invalid offline cache URL: ${url}`);
    const path = url.slice(2);
    if (!(manifest.files ?? []).some((entry) => entry.path === path)) {
      throw new Error(`Offline cache references undeclared package file: ${path}`);
    }
  }
  const index = await readFile(join(output, 'index.html'), 'utf8');
  if (!index.includes(`content="${manifest.releaseId}"`)) throw new Error('Packaged index is missing release version metadata.');
  if (!index.includes(`href="${manifest.generated.manifestPath}"`)) throw new Error('Packaged index is missing the release web manifest.');
  if (!index.includes(`src="${manifest.generated.bootstrapPath}"`)) throw new Error('Packaged index is missing the release bootstrap.');
  const bootstrap = await readFile(join(output, manifest.generated.bootstrapPath), 'utf8');
  if (!bootstrap.includes(`./${serviceWorkerPath}`)) throw new Error('Release bootstrap does not register the versioned service worker.');
  const worker = await readFile(join(output, serviceWorkerPath), 'utf8');
  if (!worker.includes(`${RELEASE_CACHE_PREFIX}${manifest.releaseId}`)) throw new Error('Service worker cache is not version-scoped.');
  return Object.freeze({ releaseId: manifest.releaseId, files: manifest.files.length, cached: cachePaths.size });
}

export async function compareReleaseTrees(leftRoot, rightRoot) {
  const left = await walkFiles(resolve(leftRoot));
  const right = await walkFiles(resolve(rightRoot));
  if (JSON.stringify(left) !== JSON.stringify(right)) return false;
  for (const path of left) {
    const [a, b] = await Promise.all([readFile(join(leftRoot, path)), readFile(join(rightRoot, path))]);
    if (a.length !== b.length || sha256(a) !== sha256(b)) return false;
  }
  return true;
}
