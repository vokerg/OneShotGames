import { readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateTaskMarkerState } from './lib/task-marker-state.mjs';

const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
if (!token || !repository) {
  console.log('[claims] skipped: GITHUB_TOKEN and GITHUB_REPOSITORY are required outside CI.');
  process.exit(0);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' };
async function github(path) {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, { headers });
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
  return response.json();
}

async function markerIds(directory) {
  try {
    const entries = await readdir(resolve(root, 'tasks', directory), { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name.match(/^(UFR-\d+)\.md$/i)?.[1]?.toUpperCase())
      .filter(Boolean)
      .sort();
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

const pulls = await github('/pulls?state=open&per_page=100');
const claims = new Map();
for (const pull of pulls) {
  const match = pull.title.match(/^\[([^\]]+)\]/);
  if (!match) continue;
  const id = match[1].toUpperCase();
  const list = claims.get(id) || [];
  list.push(pull.number);
  claims.set(id, list);
}

const failures = [];
for (const [id, numbers] of claims) {
  if (numbers.length > 1) failures.push(`duplicate active claim ${id}: PRs ${numbers.join(', ')}`);
}

const checkedInClaims = await markerIds('claims');
const checkedInCompletions = await markerIds('completed');
const activeClaimCounts = Object.fromEntries([...claims].map(([id, numbers]) => [id, numbers.length]));
failures.push(...validateTaskMarkerState({
  claimIds: checkedInClaims,
  completedIds: checkedInCompletions,
  activeClaimCounts,
}));

for (const pull of pulls) {
  if (!/\b(?:0|zero)\s+behind\b/i.test(pull.body || '')) continue;
  const sameRepository = pull.head.repo?.full_name === repository;
  const head = sameRepository ? pull.head.ref : `${pull.head.repo?.owner?.login}:${pull.head.ref}`;
  const comparison = await github(`/compare/${encodeURIComponent(pull.base.ref)}...${encodeURIComponent(head)}`);
  if (comparison.behind_by > 0) failures.push(`PR #${pull.number} claims zero behind but is ${comparison.behind_by} commit(s) behind ${pull.base.ref}`);
}

if (failures.length) {
  failures.forEach((failure) => console.error(`[claims] ${failure}`));
  process.exit(1);
}
console.log(`[claims] ${claims.size} active task/recovery claim(s); ${checkedInClaims.length} checked-in claim marker(s); no duplicate, orphaned, contradictory, or false zero-behind state.`);
