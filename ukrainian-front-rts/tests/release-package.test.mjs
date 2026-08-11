import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildReleasePackage,
  compareReleaseTrees,
  discoverReleaseInputs,
  verifyReleasePackage,
} from '../scripts/lib/release-package.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function withTemp(callback) {
  const root = await mkdtemp(join(tmpdir(), 'ufr-release-package-test-'));
  try { return await callback(root); }
  finally { await rm(root, { recursive: true, force: true }); }
}

async function createFixtureProject(root) {
  await mkdir(join(root, 'assets'), { recursive: true });
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'index.html'), '<!doctype html><html><head></head><body></body></html>\n');
  await writeFile(join(root, 'styles.css'), 'body { margin: 0; }\n');
  await writeFile(join(root, 'assets', 'sprite.txt'), 'asset\n');
  await writeFile(join(root, 'src', 'app.js'), 'export const ready = true;\n');
}

test('release inputs exclude authoring, task, test, and documentation trees', async () => {
  const inputs = await discoverReleaseInputs(projectRoot);
  assert.ok(inputs.includes('index.html'));
  assert.ok(inputs.some((path) => path.startsWith('src/')));
  assert.ok(inputs.some((path) => path.startsWith('assets/')));
  for (const prefix of ['art-src/', 'docs/', 'provenance/', 'scripts/', 'tasks/', 'tests/']) {
    assert.equal(inputs.some((path) => path.startsWith(prefix)), false, prefix);
  }
});

test('release package is deterministic, versioned, and fully declared for offline caching', async () => withTemp(async (root) => {
  const first = join(root, 'first');
  const second = join(root, 'second');
  const a = await buildReleasePackage({ projectRoot, outputRoot: first });
  const b = await buildReleasePackage({ projectRoot, outputRoot: second });
  assert.equal(a.releaseId, b.releaseId);
  assert.equal(await compareReleaseTrees(first, second), true);
  const verified = await verifyReleasePackage(first);
  assert.equal(verified.releaseId, a.releaseId);
  assert.ok(verified.files > 0);
  assert.ok(verified.cached > 0);
  const index = await readFile(join(first, 'index.html'), 'utf8');
  assert.match(index, new RegExp(`manifest\\.${a.releaseId}\\.webmanifest`));
  assert.match(index, new RegExp(`release-bootstrap\\.${a.releaseId}\\.js`));
}));

test('release verification fails closed on file mutation and undeclared output', async () => withTemp(async (root) => {
  const output = join(root, 'release');
  await buildReleasePackage({ projectRoot, outputRoot: output });
  const cssPath = join(output, 'styles.css');
  await writeFile(cssPath, `${await readFile(cssPath, 'utf8')}\n/* mutation */\n`);
  await assert.rejects(() => verifyReleasePackage(output), /digest mismatch/i);

  await buildReleasePackage({ projectRoot, outputRoot: output });
  await writeFile(join(output, 'undeclared.txt'), 'not in package manifest\n');
  await assert.rejects(() => verifyReleasePackage(output), /file set drift/i);
}));

test('release builder rejects source-overlapping output before deleting runtime inputs', async () => withTemp(async (root) => {
  const fixture = join(root, 'fixture');
  await createFixtureProject(fixture);
  const appPath = join(fixture, 'src', 'app.js');
  const indexPath = join(fixture, 'index.html');
  const appBefore = await readFile(appPath, 'utf8');
  const indexBefore = await readFile(indexPath, 'utf8');

  for (const outputRoot of [join(fixture, 'src', 'release'), join(fixture, 'assets', 'release'), indexPath]) {
    await assert.rejects(
      () => buildReleasePackage({ projectRoot: fixture, outputRoot }),
      /overlap release source inputs/i,
    );
    assert.equal(await readFile(appPath, 'utf8'), appBefore);
    assert.equal(await readFile(indexPath, 'utf8'), indexBefore);
  }
}));
