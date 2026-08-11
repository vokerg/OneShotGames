import { CAMPAIGN_OPERATION_SEQUENCE } from '../src/content/campaign/campaign-operation-registry.js';
import { CAMPAIGN_CONTENT_POLICY, auditCampaignContent } from '../src/content/campaign/campaign-content-policy.js';

const result = auditCampaignContent(CAMPAIGN_OPERATION_SEQUENCE);
if (!result.passed) {
  console.error('[campaign-content] FAIL');
  for (const violation of result.violations) {
    console.error(`- ${violation.operationId} ${violation.code} at ${violation.path}: ${violation.text}`);
  }
  process.exit(1);
}

console.log(`[campaign-content] PASS ${result.operationCount} operations`);
console.log(`[campaign-content] framing=${CAMPAIGN_CONTENT_POLICY.framing}`);
console.log(`[campaign-content] public-figures=${result.publicFigurePolicy}`);
console.log('[campaign-content] geography may be real; authored events, commanders, dialogue, and outcomes remain fictional/composite');
