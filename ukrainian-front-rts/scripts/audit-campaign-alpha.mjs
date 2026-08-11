import { runCampaignAlphaGate } from './lib/campaign-alpha-gate.mjs';

try {
  const report = runCampaignAlphaGate();
  console.log(`[campaign-alpha] ${report.operationRuns} operation runs, ${report.checkpointSaveRestores} checkpoint save/restores, ${report.creditsTransitions} credits transitions; ${report.blockers.length} blockers`);
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
}
