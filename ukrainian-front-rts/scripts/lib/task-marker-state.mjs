function normalizeIds(ids = []) {
  return [...new Set(ids.map((id) => String(id).trim().toUpperCase()).filter(Boolean))].sort();
}

function activeCount(activeClaimCounts, id) {
  if (activeClaimCounts instanceof Map) return Number(activeClaimCounts.get(id) || 0);
  return Number(activeClaimCounts?.[id] || 0);
}

export function validateTaskMarkerState({ claimIds = [], completedIds = [], activeClaimCounts = {} } = {}) {
  const claims = normalizeIds(claimIds);
  const completed = new Set(normalizeIds(completedIds));
  const failures = [];

  for (const id of claims) {
    if (completed.has(id)) {
      failures.push(`${id} exists in both tasks/claims and tasks/completed`);
    }

    const count = activeCount(activeClaimCounts, id);
    if (count === 0) {
      failures.push(`${id} has a checked-in claim marker but no matching open PR title claim`);
    } else if (count > 1) {
      failures.push(`${id} has a checked-in claim marker but ${count} matching open PR title claims`);
    }
  }

  return failures;
}
