import { TEAM, UNIT_TYPES } from '../config.js';
import { COMBAT_STANCES, DEFAULT_COMBAT_STANCE } from '../core/stance-contract.js';

const STANCE_BUTTONS = Object.freeze([
  Object.freeze({
    stance: COMBAT_STANCES.RETURN_FIRE,
    title: 'Return Fire',
    description: 'Engage only the most recent attacker while it remains in weapon range.',
    meta: 'RET',
  }),
  Object.freeze({
    stance: COMBAT_STANCES.HOLD_FIRE,
    title: 'Hold Fire',
    description: 'Do not acquire targets automatically; explicit attack orders still fire.',
    meta: 'SIL',
  }),
  Object.freeze({
    stance: COMBAT_STANCES.FIRE_AT_WILL,
    title: 'Fire at Will',
    description: 'Engage hostile targets already within weapon range without pursuing.',
    meta: 'LOCAL',
  }),
  Object.freeze({
    stance: COMBAT_STANCES.DEFENSIVE,
    title: 'Defensive',
    description: 'Acquire within sight and pursue only inside a short stance leash.',
    meta: 'DEF',
  }),
  Object.freeze({
    stance: COMBAT_STANCES.AGGRESSIVE,
    title: 'Aggressive',
    description: 'Acquire farther contacts and pursue within an extended stance leash.',
    meta: 'AGG',
  }),
  Object.freeze({
    stance: COMBAT_STANCES.HOLD_POSITION,
    title: 'Hold Position',
    description: 'Cancel movement, remain anchored, and engage only targets in weapon range.',
    meta: 'HOLD',
  }),
]);

function armedPlayerUnits(game, units) {
  return units.filter(
    (unit) =>
      unit.team === TEAM.UA &&
      UNIT_TYPES[unit.type] &&
      Number(game.unitStats?.(unit.type)?.damage ?? UNIT_TYPES[unit.type].damage) > 0,
  );
}

function stanceSignature(units) {
  return units
    .filter((unit) => UNIT_TYPES[unit.type])
    .map((unit) => `${unit.id}:${unit.combatStance || DEFAULT_COMBAT_STANCE}:${unit.lastAttackerId ?? '-'}:${unit.stanceTargetId ?? '-'}`)
    .join('|');
}

export function installStanceCommandCard(ui) {
  if (!ui?.g || typeof ui.appendUnitCommands !== 'function' || typeof ui.commandStateSignature !== 'function') {
    throw new TypeError('Stance command card requires a UI instance with unit command hooks.');
  }
  if (typeof ui.commandButton !== 'function' || typeof ui.toast !== 'function') {
    throw new TypeError('Stance command card requires UI commandButton() and toast().');
  }

  const originalAppendUnitCommands = ui.appendUnitCommands;
  const originalCommandStateSignature = ui.commandStateSignature;

  ui.commandStateSignature = function commandStateSignatureWithStances(entities) {
    return `${originalCommandStateSignature.call(this, entities)}::stances:${stanceSignature(entities)}`;
  };

  ui.appendUnitCommands = function appendUnitCommandsWithStances(units) {
    originalAppendUnitCommands.call(this, units);
    const armed = armedPlayerUnits(this.g, units);
    if (!armed.length || typeof this.g.setSelectedCombatStance !== 'function') return;
    const active = new Set(armed.map((unit) => unit.combatStance || DEFAULT_COMBAT_STANCE));

    for (const command of STANCE_BUTTONS) {
      const selected = active.size === 1 && active.has(command.stance);
      this.commandButton({
        title: `${selected ? '✓ ' : ''}${command.title}`,
        description: command.description,
        meta: command.meta,
        className: `command ${selected ? 'stance-on' : 'stance-off'}`,
        onClick: () => {
          const accepted = this.g.setSelectedCombatStance(command.stance);
          this.toast(
            accepted
              ? this.g.lastCommandMessage || `${command.title} selected.`
              : this.g.lastError || `${command.title} is unavailable.`,
          );
          this.refresh?.();
        },
      });
    }
  };

  return () => {
    ui.appendUnitCommands = originalAppendUnitCommands;
    ui.commandStateSignature = originalCommandStateSignature;
  };
}
