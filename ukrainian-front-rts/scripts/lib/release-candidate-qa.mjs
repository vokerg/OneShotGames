const SHA_PATTERN = /^[0-9a-f]{40}$/;
const STATUSES = new Set(['pass', 'fail', 'blocked', 'not-run', 'na']);
const DEFECT_SEVERITIES = new Set(['P0', 'P1', 'P2', 'P3']);
const DEFECT_DISPOSITIONS = new Set(['blocker', 'fixed', 'waived', 'known-issue']);

export const RELEASE_CANDIDATE_SURFACES = Object.freeze([
  Object.freeze({ id: 'campaign', label: 'Campaign progression and mission completion' }),
  Object.freeze({ id: 'skirmish', label: 'Skirmish setup, play, victory, and defeat' }),
  Object.freeze({ id: 'saves', label: 'Save, load, migration, export, and reset safety' }),
  Object.freeze({ id: 'replays', label: 'Replay capture, playback, determinism, and compatibility' }),
  Object.freeze({ id: 'settings', label: 'Settings persistence, reset, controls, and fullscreen' }),
  Object.freeze({ id: 'localization', label: 'English/Ukrainian localization and layout' }),
  Object.freeze({ id: 'audio', label: 'Audio playback, mute, volume, resume, and provenance' }),
  Object.freeze({ id: 'accessibility', label: 'Keyboard, focus, scaling, reduced motion, and contrast' }),
  Object.freeze({ id: 'stress', label: 'Performance, long-session, large-battle, and deterministic stress' }),
]);

export const RELEASE_CANDIDATE_BROWSERS = Object.freeze(['chrome', 'edge', 'firefox', 'safari']);

function assertRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  return value;
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string.`);
  return value.trim();
}

function validateStatus(value, label) {
  if (!STATUSES.has(value)) throw new TypeError(`${label} has unsupported status ${JSON.stringify(value)}.`);
  return value;
}

function validateEvidence(items, candidateCommit, label, { required = false } = {}) {
  if (!Array.isArray(items)) throw new TypeError(`${label}.evidence must be an array.`);
  if (required && items.length === 0) throw new Error(`${label} is marked pass but has no evidence.`);
  return items.map((item, index) => {
    assertRecord(item, `${label}.evidence[${index}]`);
    const kind = assertNonEmptyString(item.kind, `${label}.evidence[${index}].kind`);
    const ref = assertNonEmptyString(item.ref, `${label}.evidence[${index}].ref`);
    const commit = assertNonEmptyString(item.commit, `${label}.evidence[${index}].commit`);
    if (commit !== candidateCommit) {
      throw new Error(`${label} evidence ${ref} targets ${commit}, expected candidate ${candidateCommit}.`);
    }
    return Object.freeze({ kind, ref, commit });
  });
}

function validateResult(item, candidateCommit, label) {
  assertRecord(item, label);
  const status = validateStatus(item.status, label);
  const evidence = validateEvidence(item.evidence ?? [], candidateCommit, label, { required: status === 'pass' });
  const rationale = typeof item.rationale === 'string' ? item.rationale.trim() : '';
  if (status === 'na' && !rationale) throw new Error(`${label} uses na without a rationale.`);
  return Object.freeze({ status, evidence: Object.freeze(evidence), rationale });
}

function indexById(items, label) {
  if (!Array.isArray(items)) throw new TypeError(`${label} must be an array.`);
  const result = new Map();
  for (const [index, item] of items.entries()) {
    assertRecord(item, `${label}[${index}]`);
    const id = assertNonEmptyString(item.id, `${label}[${index}].id`);
    if (result.has(id)) throw new Error(`${label} contains duplicate id ${id}.`);
    result.set(id, item);
  }
  return result;
}

function evaluateRequiredResult(result, label, failures, blockers) {
  if (result.status === 'fail') failures.push(`${label} failed.`);
  if (result.status === 'blocked') blockers.push(`${label} is blocked.`);
  if (result.status === 'not-run') blockers.push(`${label} has not been run.`);
}

function validateDefects(defects) {
  if (!Array.isArray(defects)) throw new TypeError('defects must be an array.');
  return defects.map((defect, index) => {
    const label = `defects[${index}]`;
    assertRecord(defect, label);
    const issue = assertNonEmptyString(String(defect.issue ?? ''), `${label}.issue`);
    const severity = assertNonEmptyString(defect.severity, `${label}.severity`).toUpperCase();
    const disposition = assertNonEmptyString(defect.disposition, `${label}.disposition`);
    const rationale = typeof defect.rationale === 'string' ? defect.rationale.trim() : '';
    if (!DEFECT_SEVERITIES.has(severity)) throw new TypeError(`${label} has unsupported severity ${severity}.`);
    if (!DEFECT_DISPOSITIONS.has(disposition)) throw new TypeError(`${label} has unsupported disposition ${disposition}.`);
    if (disposition === 'waived' && !rationale) throw new Error(`${label} is waived without a rationale.`);
    return Object.freeze({ issue, severity, disposition, rationale });
  });
}

export function createReleaseCandidateEvidenceTemplate(candidateCommit) {
  if (!SHA_PATTERN.test(candidateCommit)) throw new TypeError('candidateCommit must be a 40-character lowercase Git SHA.');
  return {
    schemaVersion: 1,
    candidate: { commit: candidateCommit },
    surfaces: RELEASE_CANDIDATE_SURFACES.map(({ id }) => ({ id, status: 'not-run', evidence: [] })),
    browsers: RELEASE_CANDIDATE_BROWSERS.map((id) => ({ id, status: 'not-run', evidence: [] })),
    defects: [],
  };
}

export function evaluateReleaseCandidateEvidence(input) {
  assertRecord(input, 'release candidate evidence');
  if (input.schemaVersion !== 1) throw new Error(`Unsupported release candidate evidence schemaVersion ${input.schemaVersion}.`);
  const candidate = assertRecord(input.candidate, 'candidate');
  const commit = assertNonEmptyString(candidate.commit, 'candidate.commit');
  if (!SHA_PATTERN.test(commit)) throw new TypeError('candidate.commit must be a 40-character lowercase Git SHA.');

  const failures = [];
  const blockers = [];
  const surfaceInput = indexById(input.surfaces, 'surfaces');
  const surfaces = RELEASE_CANDIDATE_SURFACES.map(({ id, label }) => {
    if (!surfaceInput.has(id)) throw new Error(`Missing required release-candidate surface ${id}.`);
    const result = validateResult(surfaceInput.get(id), commit, `surface ${id}`);
    evaluateRequiredResult(result, label, failures, blockers);
    return Object.freeze({ id, label, ...result });
  });
  for (const id of surfaceInput.keys()) {
    if (!RELEASE_CANDIDATE_SURFACES.some((surface) => surface.id === id)) throw new Error(`Unknown release-candidate surface ${id}.`);
  }

  const browserInput = indexById(input.browsers, 'browsers');
  const browsers = RELEASE_CANDIDATE_BROWSERS.map((id) => {
    if (!browserInput.has(id)) throw new Error(`Missing required browser evidence for ${id}.`);
    const result = validateResult(browserInput.get(id), commit, `browser ${id}`);
    evaluateRequiredResult(result, `${id} browser matrix`, failures, blockers);
    return Object.freeze({ id, ...result });
  });
  for (const id of browserInput.keys()) {
    if (!RELEASE_CANDIDATE_BROWSERS.includes(id)) throw new Error(`Unknown browser matrix entry ${id}.`);
  }

  const defects = validateDefects(input.defects);
  for (const defect of defects) {
    if (defect.disposition === 'blocker') blockers.push(`${defect.severity} defect ${defect.issue} remains a release blocker.`);
    if ((defect.severity === 'P0' || defect.severity === 'P1') && defect.disposition === 'known-issue') {
      blockers.push(`${defect.severity} defect ${defect.issue} cannot be accepted as a known issue without an explicit waiver.`);
    }
  }

  const verdict = failures.length ? 'FAIL' : blockers.length ? 'BLOCKED' : 'PASS';
  return Object.freeze({
    schemaVersion: 1,
    candidate: Object.freeze({ commit }),
    verdict,
    failures: Object.freeze(failures),
    blockers: Object.freeze(blockers),
    surfaces: Object.freeze(surfaces),
    browsers: Object.freeze(browsers),
    defects: Object.freeze(defects),
  });
}
