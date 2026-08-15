export const SINGLE_PLAYER_RELEASE_GATE_SCHEMA = 'fields-of-resolve.single-player-release-gate';
export const SINGLE_PLAYER_RELEASE_GATE_VERSION = 1;
export const SINGLE_PLAYER_RELEASE_GATES = Object.freeze(['A', 'B', 'C', 'D', 'E']);
export const SINGLE_PLAYER_FREEZE_AREAS = Object.freeze(['schemas', 'assets', 'content']);

const COMMIT = /^[0-9a-f]{40}$/i;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const GATE_STATUSES = new Set(['pass', 'fail', 'blocked', 'not-run']);
const FREEZE_STATUSES = new Set(['frozen', 'changed', 'not-run']);
const AUDIT_STATUSES = new Set(['pass', 'fail', 'not-run']);
const DEFECT_SEVERITIES = new Set(['P0', 'P1', 'P2', 'P3']);
const DEFECT_DISPOSITIONS = new Set(['fixed', 'blocker', 'known-issue', 'waived']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string.`);
  return value.trim();
}

function commit(value, label = 'candidate commit') {
  const normalized = text(value, label).toLowerCase();
  if (!COMMIT.test(normalized)) throw new TypeError(`${label} must be a 40-character Git commit SHA.`);
  return normalized;
}

function timestamp(value, label) {
  const normalized = text(value, label);
  if (!ISO_TIMESTAMP.test(normalized) || Number.isNaN(Date.parse(normalized))) {
    throw new TypeError(`${label} must be an ISO-8601 timestamp with an explicit UTC offset.`);
  }
  return normalized;
}

function evidence(entries, candidate, label, { required = false } = {}) {
  if (!Array.isArray(entries)) throw new TypeError(`${label} evidence must be an array.`);
  if (required && entries.length === 0) throw new Error(`${label} is marked complete but has no evidence.`);
  return entries.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new TypeError(`${label} evidence ${index + 1} must be an object.`);
    }
    const boundCommit = commit(entry.commit, `${label} evidence commit`);
    if (boundCommit !== candidate) {
      throw new Error(`${label} evidence targets ${boundCommit}; expected candidate ${candidate}.`);
    }
    return Object.freeze({
      kind: text(entry.kind, `${label} evidence kind`),
      ref: text(entry.ref, `${label} evidence ref`),
      commit: boundCommit,
    });
  });
}

function exactRows(rows, requiredIds, label) {
  if (!Array.isArray(rows)) throw new TypeError(`${label} must be an array.`);
  const byId = new Map();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new TypeError(`${label} entries must be objects.`);
    const id = text(row.id, `${label} id`);
    if (byId.has(id)) throw new Error(`Duplicate ${label} entry: ${id}.`);
    byId.set(id, row);
  }
  for (const id of requiredIds) if (!byId.has(id)) throw new Error(`${label} is missing required entry ${id}.`);
  for (const id of byId.keys()) if (!requiredIds.includes(id)) throw new Error(`${label} contains unsupported entry ${id}.`);
  return byId;
}

export function createSinglePlayerReleaseGateTemplate(candidateCommit) {
  const candidate = commit(candidateCommit);
  return deepFreeze({
    schema: SINGLE_PLAYER_RELEASE_GATE_SCHEMA,
    version: SINGLE_PLAYER_RELEASE_GATE_VERSION,
    candidate: {
      commit: candidate,
      tag: '',
      tagEvidence: [],
    },
    gates: SINGLE_PLAYER_RELEASE_GATES.map((id) => ({ id, status: 'not-run', evidence: [] })),
    freeze: SINGLE_PLAYER_FREEZE_AREAS.map((id) => ({ id, status: 'not-run', evidence: [] })),
    rcQa: { verdict: 'BLOCKED', candidateCommit: candidate, evidence: [] },
    defectAudit: { status: 'not-run', evidence: [] },
    defects: [],
    knownIssues: [],
    signoff: { status: 'not-approved', signer: '', recordedAt: '', evidence: [] },
  });
}

export function evaluateSinglePlayerReleaseGate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Release-gate input must be an object.');
  if (input.schema !== SINGLE_PLAYER_RELEASE_GATE_SCHEMA || input.version !== SINGLE_PLAYER_RELEASE_GATE_VERSION) {
    throw new TypeError(`Unsupported release-gate schema ${input.schema}@${input.version}.`);
  }

  const candidate = commit(input.candidate?.commit);
  const failures = [];
  const blockers = [];

  const tag = String(input.candidate?.tag || '').trim();
  if (!tag) blockers.push('Release candidate tag has not been recorded.');
  evidence(input.candidate?.tagEvidence ?? [], candidate, 'Release candidate tag', { required: Boolean(tag) });

  const gates = exactRows(input.gates, SINGLE_PLAYER_RELEASE_GATES, 'Gates A-E');
  for (const id of SINGLE_PLAYER_RELEASE_GATES) {
    const row = gates.get(id);
    if (!GATE_STATUSES.has(row.status)) throw new TypeError(`Gate ${id} has unsupported status ${row.status}.`);
    evidence(row.evidence ?? [], candidate, `Gate ${id}`, { required: row.status === 'pass' });
    if (row.status === 'fail') failures.push(`Gate ${id} failed.`);
    else if (row.status !== 'pass') blockers.push(`Gate ${id} is ${row.status}.`);
  }

  const freeze = exactRows(input.freeze, SINGLE_PLAYER_FREEZE_AREAS, 'Release freeze');
  for (const id of SINGLE_PLAYER_FREEZE_AREAS) {
    const row = freeze.get(id);
    if (!FREEZE_STATUSES.has(row.status)) throw new TypeError(`Release freeze ${id} has unsupported status ${row.status}.`);
    evidence(row.evidence ?? [], candidate, `Release freeze ${id}`, { required: row.status === 'frozen' });
    if (row.status === 'changed') failures.push(`Release freeze ${id} changed after freeze.`);
    else if (row.status !== 'frozen') blockers.push(`Release freeze ${id} is ${row.status}.`);
  }

  const rcQaCommit = commit(input.rcQa?.candidateCommit, 'RC QA candidate commit');
  if (rcQaCommit !== candidate) throw new Error(`RC QA targets ${rcQaCommit}; expected candidate ${candidate}.`);
  const rcQaVerdict = text(input.rcQa?.verdict, 'RC QA verdict').toUpperCase();
  evidence(input.rcQa?.evidence ?? [], candidate, 'RC QA', { required: rcQaVerdict === 'PASS' });
  if (rcQaVerdict === 'FAIL') failures.push('Release-candidate QA failed.');
  else if (rcQaVerdict !== 'PASS') blockers.push(`Release-candidate QA is ${rcQaVerdict}.`);

  const defectAuditStatus = text(input.defectAudit?.status, 'Release defect audit status').toLowerCase();
  if (!AUDIT_STATUSES.has(defectAuditStatus)) {
    throw new TypeError(`Release defect audit has unsupported status ${defectAuditStatus}.`);
  }
  evidence(input.defectAudit?.evidence ?? [], candidate, 'Release defect audit', { required: defectAuditStatus === 'pass' });
  if (defectAuditStatus === 'fail') failures.push('Release defect audit failed.');
  else if (defectAuditStatus !== 'pass') blockers.push(`Release defect audit is ${defectAuditStatus}.`);

  if (!Array.isArray(input.defects)) throw new TypeError('Release defects must be an array.');
  const defectsByIssue = new Map();
  for (const defect of input.defects) {
    const issue = text(defect?.issue, 'Release defect issue');
    if (defectsByIssue.has(issue)) throw new Error(`Duplicate release defect entry: ${issue}.`);
    const severity = text(defect?.severity, `Release defect ${issue} severity`).toUpperCase();
    const disposition = text(defect?.disposition, `Release defect ${issue} disposition`).toLowerCase();
    if (!DEFECT_SEVERITIES.has(severity)) throw new TypeError(`Release defect ${issue} has unsupported severity ${severity}.`);
    if (!DEFECT_DISPOSITIONS.has(disposition)) throw new TypeError(`Release defect ${issue} has unsupported disposition ${disposition}.`);
    evidence(defect?.evidence ?? [], candidate, `Release defect ${issue}`, { required: disposition === 'fixed' });
    if ((disposition === 'waived' || disposition === 'known-issue') && !String(defect?.rationale || '').trim()) {
      throw new Error(`Release defect ${issue} is ${disposition} without a rationale.`);
    }
    const normalizedDefect = Object.freeze({ issue, severity, disposition });
    defectsByIssue.set(issue, normalizedDefect);
    if (severity === 'P0' || severity === 'P1') {
      if (disposition !== 'fixed') blockers.push(`${issue} ${severity} remains ${disposition}; UFR-160 requires P0/P1 closure.`);
    } else if (disposition === 'blocker') {
      blockers.push(`${issue} ${severity} is still a release blocker.`);
    }
  }

  if (!Array.isArray(input.knownIssues)) throw new TypeError('Known issues must be an array.');
  const knownIssueIds = new Set();
  for (const issue of input.knownIssues) {
    const id = text(issue?.issue, 'Known issue id');
    if (knownIssueIds.has(id)) throw new Error(`Duplicate known issue entry: ${id}.`);
    const severity = text(issue?.severity, `Known issue ${id} severity`).toUpperCase();
    text(issue?.summary, `Known issue ${id} summary`);
    if (!DEFECT_SEVERITIES.has(severity)) throw new TypeError(`Known issue ${id} has unsupported severity ${severity}.`);
    const defect = defectsByIssue.get(id);
    if (!defect) throw new Error(`Known issue ${id} is missing from the release defect inventory.`);
    if (defect.severity !== severity) throw new Error(`Known issue ${id} severity does not match the release defect inventory.`);
    if (defect.disposition !== 'known-issue') {
      throw new Error(`Known issue ${id} must have known-issue disposition in the release defect inventory.`);
    }
    knownIssueIds.add(id);
    if (severity === 'P0' || severity === 'P1') blockers.push(`${id} ${severity} cannot be published as a releasable known issue.`);
  }
  for (const defect of defectsByIssue.values()) {
    if (defect.disposition === 'known-issue' && !knownIssueIds.has(defect.issue)) {
      throw new Error(`Release defect ${defect.issue} is marked known-issue but is missing from published known issues.`);
    }
  }

  const signoffStatus = text(input.signoff?.status, 'Release sign-off status').toLowerCase();
  if (signoffStatus === 'approved') {
    text(input.signoff?.signer, 'Release sign-off signer');
    timestamp(input.signoff?.recordedAt, 'Release sign-off timestamp');
    evidence(input.signoff?.evidence ?? [], candidate, 'Release sign-off', { required: true });
  } else {
    blockers.push(`Release sign-off is ${signoffStatus}.`);
  }

  const verdict = failures.length ? 'FAIL' : blockers.length ? 'BLOCKED' : 'PASS';
  return deepFreeze({
    schema: SINGLE_PLAYER_RELEASE_GATE_SCHEMA,
    version: SINGLE_PLAYER_RELEASE_GATE_VERSION,
    candidateCommit: candidate,
    candidateTag: tag,
    verdict,
    failures,
    blockers,
  });
}
