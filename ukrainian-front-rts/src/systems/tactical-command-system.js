import { TACTICAL_COMMAND_KINDS } from '../core/tactical-command-contract.js';
import {
  clearTacticalCommand,
  isTargetedTacticalCommand,
  issueFollowCommand,
  issueGuardCommand,
  issueHoldPositionCommand,
  issuePatrolCommand,
  issueReturnForRepairCommand,
  selectedPlayerUnits,
  tacticalUnitStats,
} from './tactical-command-policy.js';
import {
  prepareTacticalCommands,
  reconcileTacticalCommands,
  tacticalCommandSnapshot,
} from './tactical-command-runtime.js';

export { TACTICAL_COMMAND_KINDS } from '../core/tactical-command-contract.js';
export {
  TACTICAL_COMMAND_POLICY,
  TACTICAL_COMMAND_RESULTS,
  clearTacticalCommand,
  findNearestRepairFacility,
  isRepairFacility,
  isReturnForRepairEligible,
  issueFollowCommand,
  issueGuardCommand,
  issueHoldPositionCommand,
  issuePatrolCommand,
  issueReturnForRepairCommand,
  selectGuardThreat,
} from './tactical-command-policy.js';
export {
  prepareTacticalCommands,
  reconcileTacticalCommands,
  tacticalCommandSnapshot,
} from './tactical-command-runtime.js';

export function createTacticalCommandController(game) {
  for (const method of ['selectedUnits', 'issue', 'stopSelected', 'update', 'start', 'fail']) {
    if (typeof game?.[method] !== 'function') {
      throw new TypeError(`Tactical command controller requires game.${method}().`);
    }
  }

  const originalIssue = game.issue;
  const originalStopSelected = game.stopSelected;
  const originalUpdate = game.update;
  const originalStart = game.start;

  const setMessage = (commandResult) => {
    game.lastError = commandResult.ok ? '' : commandResult.message;
    game.lastCommandMessage = commandResult.ok ? commandResult.message : '';
    return commandResult.ok;
  };

  game.pendingTacticalCommand = null;
  game.tacticalCommandSequence = 1;
  game.lastCommandMessage = game.lastCommandMessage || '';

  game.armTacticalCommand = (kind) => {
    game.lastError = '';
    game.lastCommandMessage = '';
    if (game.gameOver || !isTargetedTacticalCommand(kind)) {
      return game.fail('That tactical command cannot be armed.');
    }
    const units = selectedPlayerUnits(game);
    if (!units.length) return game.fail('Select at least one Ukrainian unit first.');
    if (kind === TACTICAL_COMMAND_KINDS.GUARD && !units.some((unit) => Number(tacticalUnitStats(game, unit)?.damage) > 0)) {
      return game.fail('Select at least one armed Ukrainian unit to guard with.');
    }
    game.pendingBuild = null;
    game.mouse.attackMove = false;
    game.cancelAttackGround?.();
    game.pendingTacticalCommand = Object.freeze({ kind });
    return true;
  };

  game.cancelTacticalCommand = () => {
    const changed = Boolean(game.pendingTacticalCommand);
    game.pendingTacticalCommand = null;
    return changed;
  };

  game.issueTacticalTarget = (x, y, target) => {
    const pending = game.pendingTacticalCommand;
    if (!pending) return false;
    const units = selectedPlayerUnits(game);
    let commandResult;
    if (pending.kind === TACTICAL_COMMAND_KINDS.PATROL) {
      commandResult = issuePatrolCommand(game, units, { x, y });
    } else if (pending.kind === TACTICAL_COMMAND_KINDS.GUARD) {
      commandResult = issueGuardCommand(game, units, target);
    } else {
      commandResult = issueFollowCommand(game, units, target);
    }
    if (commandResult.ok) game.pendingTacticalCommand = null;
    return setMessage(commandResult);
  };

  game.holdSelected = () => {
    game.pendingTacticalCommand = null;
    game.cancelAttackGround?.();
    return setMessage(issueHoldPositionCommand(game, selectedPlayerUnits(game)));
  };
  game.returnSelectedForRepair = () => {
    game.pendingTacticalCommand = null;
    game.cancelAttackGround?.();
    return setMessage(issueReturnForRepairCommand(game, selectedPlayerUnits(game)));
  };
  game.tacticalCommandSnapshot = (unit) => tacticalCommandSnapshot(unit);

  game.issue = (...args) => {
    game.pendingTacticalCommand = null;
    selectedPlayerUnits(game).forEach((unit) => clearTacticalCommand(unit));
    return originalIssue.apply(game, args);
  };

  game.stopSelected = () => {
    game.pendingTacticalCommand = null;
    selectedPlayerUnits(game).forEach((unit) => clearTacticalCommand(unit));
    return originalStopSelected.call(game);
  };

  game.update = (stepSeconds) => {
    if (game.gameOver) return originalUpdate.call(game, stepSeconds);
    prepareTacticalCommands(game);
    const updated = originalUpdate.call(game, stepSeconds);
    reconcileTacticalCommands(game);
    return updated;
  };

  game.start = (...args) => {
    game.pendingTacticalCommand = null;
    game.tacticalCommandSequence = 1;
    game.lastCommandMessage = '';
    return originalStart.apply(game, args);
  };

  return () => {
    game.issue = originalIssue;
    game.stopSelected = originalStopSelected;
    game.update = originalUpdate;
    game.start = originalStart;
    delete game.armTacticalCommand;
    delete game.cancelTacticalCommand;
    delete game.issueTacticalTarget;
    delete game.holdSelected;
    delete game.returnSelectedForRepair;
    delete game.tacticalCommandSnapshot;
    delete game.pendingTacticalCommand;
    delete game.tacticalCommandSequence;
  };
}
