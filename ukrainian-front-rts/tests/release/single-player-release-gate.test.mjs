import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  createSinglePlayerReleaseGateTemplate,
  evaluateSinglePlayerReleaseGate,
  SINGLE_PLAYER_FREEZE_AREAS,
  SINGLE_PLAYER_RELEASE_GATES,
} from '../../scripts/lib/single-player-release-gate.mjs';

const commit = 'c'.repeat(40);
const evidence = (ref) => [{ kind: 'workflow', ref, commit }];
const cliPath = fileURLToPath(new URL('../../scripts/single-player-release-gate.mjs', import.meta.url));

function passingGate() {
  return {
    schema: 'fields-of-resolve.single-player-release-gate',
    version: 1,
    candidate: { commit, tag: 'single-player-rc.1', tagEvidence: evidence('tag:single-player-rc.1') },
    gates: SINGLE_PLAYER_RELEASE_GATES.map((id) => ({ id, status: 'pass', evidence: evidence(`gate:${id}`) })),
    freeze: SINGLE_PLAYER_FREEZE_AREAS.map((id) => ({ id, status: 'frozen', evidence: evidence(`freeze:${id}`) })),
    rcQa: { verdict: 'PASS', candidateCommit: commit, evidence: evidence('rc-qa') },
    defects: [
      { issue: '#183', severity: 'P1', disposition: 'fixed', evidence: evidence('issue:183') },
      { issue: '#249', severity: 'P1', disposition: 'fixed', evidence: evidence('issue:249') },
      { issue: '#247', severity: 'P2', disposition: 'known-issue', rationale: 'Intermittent diagnostics upload only.', evidence: [] },
    ],
    knownIssues: [{ issue: '#247', severity: 'P2', summary: 'Intermittent diagnostics upload timing.' }],
    signoff: { status: 'approved', signer: 'release-owner', recordedAt: '2026-08-15T12:00:00Z', evidence: evidence('signoff') },
  };
}

test('UFR-160 passes only with Gates A-E, freezes, RC QA, tag, P0/P1 closure, and sign-off', () => {
  const report = evaluateSinglePlayerReleaseGate(passingGate());
  assert.equal(report.verdict, 'PASS');
  assert.equal(report.failures.length, 0);
  assert.equal(report.blockers.length, 0);
});

test('UFR-160 template fails closed before release evidence exists', () => {
  const report = evaluateSinglePlayerReleaseGate(createSinglePlayerReleaseGateTemplate(commit));
  assert.equal(report.verdict, 'BLOCKED');
  assert.match(report.blockers.join('\n'), /Release candidate tag/);
  assert.match(report.blockers.join('\n'), /Gate A/);
  assert.match(report.blockers.join('\n'), /Release freeze schemas/);
  assert.match(report.blockers.join('\n'), /Release-candidate QA/);
  assert.match(report.blockers.join('\n'), /Release sign-off/);
});

test('UFR-160 does not permit P0/P1 waivers or known-issue dispositions to promote', () => {
  for (const disposition of ['waived', 'known-issue', 'blocker']) {
    const input = passingGate();
    input.defects[0] = {
      issue: '#183',
      severity: 'P1',
      disposition,
      rationale: 'Release owner considered the issue.',
      evidence: [],
    };
    const report = evaluateSinglePlayerReleaseGate(input);
    assert.equal(report.verdict, 'BLOCKED');
    assert.match(report.blockers.join('\n'), /#183 P1/);
  }
});

test('UFR-160 rejects stale commit evidence and post-freeze drift', () => {
  const stale = passingGate();
  stale.gates[0].evidence[0].commit = 'd'.repeat(40);
  assert.throws(() => evaluateSinglePlayerReleaseGate(stale), /expected candidate/);

  const changed = passingGate();
  changed.freeze.find(({ id }) => id === 'assets').status = 'changed';
  changed.freeze.find(({ id }) => id === 'assets').evidence = [];
  const report = evaluateSinglePlayerReleaseGate(changed);
  assert.equal(report.verdict, 'FAIL');
  assert.match(report.failures.join('\n'), /assets changed after freeze/);
});

test('UFR-160 CLI initializes a nested fail-closed evidence template', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'ufr-160-release-gate-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const output = join(root, 'nested', 'gate.json');
  const result = spawnSync(process.execPath, [cliPath, '--init', commit, '--output', output], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const template = JSON.parse(await readFile(output, 'utf8'));
  assert.equal(template.candidate.commit, commit);
  assert.equal(template.gates.length, 5);
  assert.equal(template.freeze.length, 3);
  assert.equal(evaluateSinglePlayerReleaseGate(template).verdict, 'BLOCKED');
});
