import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createReleaseCandidateEvidenceTemplate,
  evaluateReleaseCandidateEvidence,
  RELEASE_CANDIDATE_BROWSERS,
  RELEASE_CANDIDATE_SURFACES,
} from '../../scripts/lib/release-candidate-qa.mjs';

const commit = 'a'.repeat(40);
const evidence = (ref) => [{ kind: 'workflow', ref, commit }];

function passingEvidence() {
  return {
    schemaVersion: 1,
    candidate: { commit },
    surfaces: RELEASE_CANDIDATE_SURFACES.map(({ id }) => ({ id, status: 'pass', evidence: evidence(`surface:${id}`) })),
    browsers: RELEASE_CANDIDATE_BROWSERS.map((id) => ({ id, status: 'pass', evidence: evidence(`browser:${id}`) })),
    defects: [],
  };
}

test('UFR-159 release-candidate evidence passes only when every required surface and browser passes', () => {
  const report = evaluateReleaseCandidateEvidence(passingEvidence());
  assert.equal(report.verdict, 'PASS');
  assert.equal(report.failures.length, 0);
  assert.equal(report.blockers.length, 0);
});

test('UFR-159 evidence template fails closed as not-run', () => {
  const report = evaluateReleaseCandidateEvidence(createReleaseCandidateEvidenceTemplate(commit));
  assert.equal(report.verdict, 'BLOCKED');
  assert.equal(report.blockers.length, RELEASE_CANDIDATE_SURFACES.length + RELEASE_CANDIDATE_BROWSERS.length);
});

test('UFR-159 rejects stale pass evidence from a different candidate commit', () => {
  const input = passingEvidence();
  input.surfaces[0].evidence[0].commit = 'b'.repeat(40);
  assert.throws(() => evaluateReleaseCandidateEvidence(input), /expected candidate/);
});

test('UFR-159 fails on a failed surface and blocks on a required browser that was not run', () => {
  const input = passingEvidence();
  input.surfaces.find(({ id }) => id === 'saves').status = 'fail';
  input.browsers.find(({ id }) => id === 'safari').status = 'not-run';
  const report = evaluateReleaseCandidateEvidence(input);
  assert.equal(report.verdict, 'FAIL');
  assert.match(report.failures.join('\n'), /Save, load, migration/);
  assert.match(report.blockers.join('\n'), /safari browser matrix/);
});

test('UFR-159 blocks undispositioned P0/P1 release defects and requires rationale for waivers', () => {
  const input = passingEvidence();
  input.defects.push({ issue: '#183', severity: 'P1', disposition: 'known-issue' });
  const report = evaluateReleaseCandidateEvidence(input);
  assert.equal(report.verdict, 'BLOCKED');
  assert.match(report.blockers.join('\n'), /#183/);

  input.defects[0] = { issue: '#183', severity: 'P1', disposition: 'waived' };
  assert.throws(() => evaluateReleaseCandidateEvidence(input), /waived without a rationale/);

  input.defects[0].rationale = 'Maintainer waiver recorded in the release sign-off.';
  assert.equal(evaluateReleaseCandidateEvidence(input).verdict, 'PASS');
});

test('UFR-159 allows N/A only with an explicit rationale and still requires commit-bound pass evidence', () => {
  const input = passingEvidence();
  const safari = input.browsers.find(({ id }) => id === 'safari');
  safari.status = 'na';
  safari.evidence = [];
  assert.throws(() => evaluateReleaseCandidateEvidence(input), /without a rationale/);
  safari.rationale = 'Safari is unavailable on this platform; separate macOS evidence is tracked by the gate owner.';
  assert.equal(evaluateReleaseCandidateEvidence(input).verdict, 'PASS');

  input.surfaces[0].evidence = [];
  assert.throws(() => evaluateReleaseCandidateEvidence(input), /marked pass but has no evidence/);
});
