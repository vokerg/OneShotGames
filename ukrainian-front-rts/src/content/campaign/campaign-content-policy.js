export const CAMPAIGN_CONTENT_POLICY_VERSION = 1;

const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

export const CAMPAIGN_CONTENT_POLICY = deepFreeze({
  framing: 'fictional-composite',
  geography: 'Real regional place names may orient the player, but operation events, dialogue, units, commanders, and outcomes are fictionalized/composite unless separately sourced.',
  publicFigures: 'Real contemporary public figures are not used as characters, commanders, dialogue speakers, objectives, or mission targets.',
  claims: 'Campaign copy must not present invented scenario events as documentary facts or imply that fictional mission outcomes describe real events.',
  sensitiveScenarios: 'Civilian presence is abstracted into evacuation/protection constraints; civilians are never controllable combat targets or score resources.',
  terminology: 'Military terminology describes game mechanics and fictional operational situations, not claims about real units or individual conduct.',
});

const PUBLIC_FIGURE_PATTERNS = Object.freeze([
  /\bputin\b/i,
  /\bzelensk(?:y|yy|yi)\b/i,
  /\bshoigu\b/i,
  /\bgerasimov\b/i,
  /\bzaluzhn(?:y|yi)\b/i,
  /\bsyrsk(?:y|yi)\b/i,
]);

const DOCUMENTARY_ASSERTION_PATTERNS = Object.freeze([
  /\b(?:on|since|during)\s+(?:19|20)\d{2}\b/i,
  /\b(?:historically|in reality|in the real war|actual(?:ly)? occurred|real-world operation)\b/i,
  /\b(?:this mission|this operation)\s+(?:recreates|depicts|documents)\s+(?:the\s+)?real\b/i,
]);

function collectStrings(value, path = [], output = []) {
  if (typeof value === 'string') output.push({ path: path.join('.'), value });
  else if (Array.isArray(value)) value.forEach((child, index) => collectStrings(child, [...path, String(index)], output));
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) collectStrings(child, [...path, key], output);
  }
  return output;
}

function hasFictionNote(operation) {
  if (operation?.briefing?.metadata?.fictional === true || operation?.briefing?.metadata?.fictionalized === true) return true;
  if (operation?.mission?.metadata?.fictional === true || operation?.mission?.metadata?.fictionalized === true || operation?.mission?.metadata?.fictionalFraming === true) return true;
  return Array.isArray(operation?.contentNotes) && operation.contentNotes.some((note) => /fiction/i.test(String(note)));
}

export function auditCampaignOperationContent(operation) {
  if (!operation || typeof operation !== 'object' || Array.isArray(operation)) throw new TypeError('Campaign content audit requires an operation object.');
  const violations = [];
  if (!hasFictionNote(operation)) violations.push({ code: 'missing-fiction-framing', path: 'operation', text: operation.id ?? 'unknown' });
  for (const entry of collectStrings(operation)) {
    for (const pattern of PUBLIC_FIGURE_PATTERNS) {
      if (pattern.test(entry.value)) violations.push({ code: 'public-figure-reference', path: entry.path, text: entry.value });
    }
    for (const pattern of DOCUMENTARY_ASSERTION_PATTERNS) {
      if (pattern.test(entry.value)) violations.push({ code: 'unsupported-documentary-assertion', path: entry.path, text: entry.value });
    }
  }
  return deepFreeze({ operationId: operation.id ?? null, violations });
}

export function auditCampaignContent(operations) {
  if (!Array.isArray(operations) || operations.length !== 9) throw new Error('Campaign content audit requires the complete nine-operation campaign.');
  const results = operations.map(auditCampaignOperationContent);
  const violations = results.flatMap((result) => result.violations.map((violation) => ({ operationId: result.operationId, ...violation })));
  return deepFreeze({
    version: CAMPAIGN_CONTENT_POLICY_VERSION,
    operationCount: operations.length,
    publicFigurePolicy: 'prohibited-in-fictional-campaign-copy',
    violations,
    passed: violations.length === 0,
  });
}