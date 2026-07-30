import { COMBAT_CUE_KINDS } from './combat-readability.js';

export function installCombatReadabilityFeedback({ game, ui }) {
  for (const method of ['appendUnitCommands', 'commandButton', 'refresh', 'setMission', 'toast']) {
    if (typeof ui?.[method] !== 'function') {
      throw new TypeError(`Combat readability feedback requires ui.${method}().`);
    }
  }
  if (typeof game?.combatReadabilitySnapshot !== 'function' || typeof game?.toggleDamageNumbers !== 'function') {
    throw new TypeError('Combat readability feedback requires the combat readability controller.');
  }

  const originalAppendUnitCommands = ui.appendUnitCommands;
  const originalRefresh = ui.refresh;
  const originalSetMission = ui.setMission;
  const announced = new Set();

  ui.appendUnitCommands = (units) => {
    const result = originalAppendUnitCommands.call(ui, units);
    if (!units.some((unit) => Number(game.unitStats?.(unit.type)?.damage) > 0)) return result;
    const visible = game.combatReadabilitySnapshot().preferences.showDamageNumbers;
    ui.commandButton({
      title: `Damage Numbers: ${visible ? 'ON' : 'OFF'}`,
      description: 'Show or hide transient damage values.',
      meta: 'HUD',
      className: `command ${visible ? 'stance-on' : 'stance-off'}`,
      onClick: () => {
        const next = game.toggleDamageNumbers();
        ui.commandSignature = '';
        ui.toast(`Damage numbers ${next ? 'enabled' : 'disabled'}.`);
        ui.refresh();
      },
    });
    return result;
  };

  ui.refresh = () => {
    const result = originalRefresh.call(ui);
    const incoming = game.combatReadabilitySnapshot().cues
      .filter((cue) => cue.kind === COMBAT_CUE_KINDS.INCOMING && !announced.has(cue.id));
    for (const cue of incoming) {
      announced.add(cue.id);
      ui.toast(cue.text || 'Incoming fire');
    }
    return result;
  };

  ui.setMission = (...args) => {
    announced.clear();
    return originalSetMission.apply(ui, args);
  };

  return () => {
    ui.appendUnitCommands = originalAppendUnitCommands;
    ui.refresh = originalRefresh;
    ui.setMission = originalSetMission;
  };
}
