import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMPAIGN_OPERATION_SEQUENCE } from '../../src/content/campaign/campaign-operation-registry.js';
import {
  CAMPAIGN_CONTENT_POLICY,
  auditCampaignContent,
  auditCampaignOperationContent,
} from '../../src/content/campaign/campaign-content-policy.js';

test('complete campaign passes fictional framing and unsupported-claim audit', () => {
  const result = auditCampaignContent(CAMPAIGN_OPERATION_SEQUENCE);
  assert.equal(result.operationCount, 9);
  assert.equal(result.passed, true, JSON.stringify(result.violations, null, 2));
  assert.deepEqual(result.violations, []);
});

test('content policy explicitly covers public figures, claims, terminology, and sensitive scenarios', () => {
  assert.match(CAMPAIGN_CONTENT_POLICY.publicFigures, /not used/i);
  assert.match(CAMPAIGN_CONTENT_POLICY.claims, /documentary/i);
  assert.match(CAMPAIGN_CONTENT_POLICY.terminology, /game mechanics/i);
  assert.match(CAMPAIGN_CONTENT_POLICY.sensitiveScenarios, /never controllable combat targets/i);
});

test('audit rejects real public figures and documentary-sounding assertions', () => {
  const result = auditCampaignOperationContent({
    id: 'unsafe-copy',
    contentNotes: ['This is fictional.'],
    briefing: {
      summary: 'This mission recreates the real operation and names Putin as the opposing commander.',
    },
  });
  assert.equal(result.violations.some((violation) => violation.code === 'public-figure-reference'), true);
  assert.equal(result.violations.some((violation) => violation.code === 'unsupported-documentary-assertion'), true);
});

test('real geography and tactical confidence language remain allowed inside clearly fictional operations', () => {
  const result = auditCampaignOperationContent({
    id: 'safe-copy',
    briefing: {
      summary: 'Secure a fictional crossing west of the Siverskyi Donets.',
      intelligence: [{ detail: 'A fictional forward command node is assessed as active.', confidence: 'confirmed' }],
      metadata: { fictional: true },
    },
  });
  assert.deepEqual(result.violations, []);
});
