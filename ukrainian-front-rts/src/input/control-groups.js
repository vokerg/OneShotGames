import { TEAM } from '../config.js';

export const CONTROL_GROUP_COMMANDS = Object.freeze({
  ASSIGN: 'assign',
  ADD: 'add',
  RECALL: 'recall',
});

const DEFAULT_DOUBLE_TAP_MS = 350;

function normalizeSlot(key) {
  return /^[1-9]$/.test(String(key || '')) ? Number(key) : null;
}

export function resolveControlGroupCommand(event) {
  const slot = normalizeSlot(event?.key);
  if (slot === null || event?.altKey || event?.metaKey) return null;

  if (event.ctrlKey) {
    return {
      command: event.shiftKey ? CONTROL_GROUP_COMMANDS.ADD : CONTROL_GROUP_COMMANDS.ASSIGN,
      slot,
    };
  }

  if (event.shiftKey) return { command: CONTROL_GROUP_COMMANDS.ADD, slot };
  return { command: CONTROL_GROUP_COMMANDS.RECALL, slot };
}

function eligibleUnits(game) {
  return game.units.filter((unit) => unit.team === TEAM.UA);
}

function selectedEligibleUnits(game) {
  return eligibleUnits(game).filter((unit) => game.selected.has(unit.id));
}

function applyUnitSelection(game, units) {
  game.select(null);
  for (const unit of units) game.select(unit, true);
}

function focusCamera(game, units, viewport) {
  if (!units.length) return;
  const center = units.reduce(
    (total, unit) => ({ x: total.x + unit.x, y: total.y + unit.y }),
    { x: 0, y: 0 },
  );
  center.x /= units.length;
  center.y /= units.length;
  game.camera.x = viewport.width / 2 - center.x * game.camera.z;
  game.camera.y = viewport.height / 2 - center.y * game.camera.z;
}

export function createControlGroupController({
  now = () => Date.now(),
  doubleTapMs = DEFAULT_DOUBLE_TAP_MS,
} = {}) {
  const groups = new Map();
  const lastRecallAt = new Map();

  const clean = (game) => {
    const validIds = new Set(eligibleUnits(game).map((unit) => unit.id));
    for (const [slot, members] of groups) {
      for (const id of members) {
        if (!validIds.has(id)) members.delete(id);
      }
      if (!members.size) groups.delete(slot);
    }
  };

  const unitsForSlot = (game, slot) => {
    clean(game);
    const members = groups.get(slot);
    if (!members) return [];
    return eligibleUnits(game).filter((unit) => members.has(unit.id));
  };

  const execute = (game, { command, slot }, viewport) => {
    clean(game);
    const selected = selectedEligibleUnits(game);

    if (command === CONTROL_GROUP_COMMANDS.ASSIGN) {
      if (!selected.length) return { handled: true, changed: false, message: `Control group ${slot} needs selected units.` };
      groups.set(slot, new Set(selected.map((unit) => unit.id)));
      lastRecallAt.delete(slot);
      return { handled: true, changed: true, message: `Assigned ${selected.length} unit${selected.length === 1 ? '' : 's'} to control group ${slot}.` };
    }

    if (command === CONTROL_GROUP_COMMANDS.ADD) {
      if (!selected.length) return { handled: true, changed: false, message: `Select units to add to control group ${slot}.` };
      const members = groups.get(slot) || new Set();
      const before = members.size;
      for (const unit of selected) members.add(unit.id);
      groups.set(slot, members);
      return {
        handled: true,
        changed: members.size !== before,
        message: `Control group ${slot} now has ${members.size} unit${members.size === 1 ? '' : 's'}.`,
      };
    }

    const units = unitsForSlot(game, slot);
    if (!units.length) {
      lastRecallAt.delete(slot);
      return { handled: true, changed: false, message: `Control group ${slot} is empty.` };
    }

    applyUnitSelection(game, units);
    const recalledAt = now();
    const focused = recalledAt - (lastRecallAt.get(slot) ?? Number.NEGATIVE_INFINITY) <= doubleTapMs;
    lastRecallAt.set(slot, recalledAt);
    if (focused) focusCamera(game, units, viewport);

    return {
      handled: true,
      changed: true,
      focused,
      message: focused ? `Focused control group ${slot}.` : `Selected control group ${slot}.`,
    };
  };

  return {
    clean,
    execute,
    members(slot) {
      return [...(groups.get(slot) || [])];
    },
  };
}
