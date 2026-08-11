import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const guidePath = path.join(projectRoot, 'docs/PLAYER_AND_CONTRIBUTOR_GUIDE.md');
const readmePath = path.join(projectRoot, 'README.md');

async function read(relativePath) {
  return readFile(path.join(projectRoot, relativePath), 'utf8');
}

function localMarkdownTargets(markdown) {
  return [...markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
    .map((match) => match[1].trim())
    .filter((target) => target && !target.startsWith('#') && !/^[a-z]+:/i.test(target));
}

async function assertLocalLinksResolve(filePath, markdown) {
  for (const target of localMarkdownTargets(markdown)) {
    const withoutFragment = target.split('#', 1)[0];
    const resolved = path.resolve(path.dirname(filePath), decodeURIComponent(withoutFragment));
    await assert.doesNotReject(
      access(resolved),
      `documentation link must resolve: ${path.relative(projectRoot, filePath)} -> ${target}`,
    );
  }
}

test('player and contributor guide covers the UFR-157 player manual surface', async () => {
  const guide = await read('docs/PLAYER_AND_CONTRIBUTOR_GUIDE.md');
  for (const heading of [
    '## Battlefield controls',
    '## Campaign',
    '## Skirmish',
    '### Saves and Continue',
    '## Accessibility, audio, and key bindings',
    '## Troubleshooting',
    '## Credits, licensing, and provenance',
  ]) {
    assert.match(guide, new RegExp(`^${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
  }
  assert.match(guide, /Crossing Ground/);
  assert.match(guide, /Shelterbelt Grid/);
  assert.match(guide, /Industrial Basin/);
  assert.match(guide, /manual and autosave slots/);
  assert.match(guide, /provenance\/release-manifest\.json/);
});

test('player and contributor guide covers the UFR-157 contributor workflows', async () => {
  const guide = await read('docs/PLAYER_AND_CONTRIBUTOR_GUIDE.md');
  for (const heading of [
    '## Before changing code',
    '## Architecture landmarks',
    '## Adding a gameplay unit or building',
    '## Adding a campaign scenario',
    '## Modifying legacy-sensitive systems',
    '## Verification and evidence',
  ]) {
    assert.match(guide, new RegExp(`^${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
  }
  assert.match(guide, /ufrts\/<task-id>-<slug>/);
  assert.match(guide, /tasks\/claims\/<ID>\.md/);
  assert.match(guide, /tasks\/completed\/<ID>\.md/);
  assert.match(guide, /legacy-source\//);
  assert.match(guide, /bash verify\.sh/);
});

test('README points players and contributors to the consolidated guide', async () => {
  const readme = await read('README.md');
  assert.match(readme, /docs\/PLAYER_AND_CONTRIBUTOR_GUIDE\.md/);
  assert.match(readme, /docs\/RELEASE_PROVENANCE\.md/);
  assert.match(readme, /provenance\/release-manifest\.json/);
  assert.match(readme, /legacy-source\/.*not a runtime dependency/);
});

test('README and player/contributor guide local markdown links resolve', async () => {
  await assertLocalLinksResolve(readmePath, await read('README.md'));
  await assertLocalLinksResolve(guidePath, await read('docs/PLAYER_AND_CONTRIBUTOR_GUIDE.md'));
});
