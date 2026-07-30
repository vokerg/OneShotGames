import { BUILDING_TYPES, UNIT_TYPES } from '../config.js';

export function installProductionExitFeedback({ game, ui }) {
  if (!ui || typeof ui.refresh !== 'function' || typeof ui.toast !== 'function') {
    throw new TypeError('Production exit feedback requires UI refresh and toast methods.');
  }
  const originalRefresh = ui.refresh.bind(ui);
  let lastSequence = 0;

  ui.refresh = (...args) => {
    const result = originalRefresh(...args);
    const acknowledgements = game.productionAcknowledgements || [];
    for (const acknowledgement of acknowledgements) {
      if (acknowledgement.sequence <= lastSequence) continue;
      const unit = UNIT_TYPES[acknowledgement.type];
      const building = (game.buildings || []).find((candidate) => candidate.id === acknowledgement.buildingId);
      const buildingName = BUILDING_TYPES[building?.type]?.name || 'production facility';
      const rallyText = acknowledgement.rallyWaypointCount > 0 ? ' Moving to rally point.' : '';
      ui.toast(`${unit?.short || unit?.name || acknowledgement.type} deployed from ${buildingName}.${rallyText}`);
      lastSequence = acknowledgement.sequence;
    }
    const selected = game.selectedEntities?.()[0];
    if (selected?.productionExitBlocked && ui.e?.stats?.textContent && !ui.e.stats.textContent.includes('Exit blocked')) {
      ui.e.stats.textContent += ` · Exit blocked: ${selected.productionExitBlocked}`;
    }
    return result;
  };

  return () => {
    ui.refresh = originalRefresh;
  };
}
