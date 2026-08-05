import { createMissionDebriefModel } from './campaign-flow.js';
import { ENDGAME_ANALYTICS_VERSION } from './endgame-analytics.js';

function currentReport(report) {
  if (report?.kind !== 'endgame-analytics-report' || report.version !== ENDGAME_ANALYTICS_VERSION) {
    throw new TypeError('Campaign debrief adapter requires a current endgame analytics report.');
  }
  return report;
}

function debriefMedal(medal) {
  const result = {
    id: medal.id,
    title: medal.title,
    description: medal.description,
  };
  if (medal.iconId !== null) result.iconId = medal.iconId;
  return result;
}

export function createCampaignDebriefFromAnalytics(report, { nextOperations = [] } = {}) {
  const analytics = currentReport(report);
  return createMissionDebriefModel({
    operationId: analytics.operationId,
    title: analytics.title,
    summary: analytics.summary,
    outcome: analytics.outcome,
    score: analytics.score.total,
    completedTick: analytics.completedTick,
    medals: analytics.medals.awarded.map(debriefMedal),
    losses: {
      totalLost: analytics.combat.friendlyTotals.lost,
      totalDeployed: analytics.combat.friendlyTotals.deployed,
      categories: analytics.combat.friendly.map((category) => ({
        id: category.id,
        label: category.label,
        lost: category.lost,
        deployed: category.deployed,
      })),
    },
    timeline: analytics.timeline,
    nextOperations,
    campaignConsequences: analytics.campaignConsequences,
  });
}
