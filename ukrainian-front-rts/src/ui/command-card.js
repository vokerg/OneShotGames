import { ABILITIES, BUILDING_TYPES } from '../config.js';

export const COMMAND_CARD_SCHEMA = 'fields-of-resolve.command-card';
export const COMMAND_CARD_VERSION = 1;
export const COMMAND_CARD_COLUMNS = 4;
export const COMMAND_CARD_ROWS = 3;
export const COMMAND_CARD_PAGE_SIZE = COMMAND_CARD_COLUMNS * COMMAND_CARD_ROWS;
export const COMMAND_CARD_STYLESHEET = 'command-card.css';

const GROUPS = Object.freeze({
  order: Object.freeze({ rank: 0, label: 'Orders' }),
  targeting: Object.freeze({ rank: 1, label: 'Targeting' }),
  stance: Object.freeze({ rank: 2, label: 'Stances' }),
  ability: Object.freeze({ rank: 3, label: 'Abilities' }),
  construction: Object.freeze({ rank: 4, label: 'Construction' }),
  production: Object.freeze({ rank: 5, label: 'Production' }),
  modernization: Object.freeze({ rank: 6, label: 'Modernization' }),
});

const TARGETING_TITLES = new Map([
  ['attack-move', 'attackMove'],
  ['attack ground', 'attackGround'],
  ['force fire', 'attackGround'],
  ['patrol', 'patrol'],
  ['guard', 'guard'],
  ['follow', 'follow'],
]);

const HOTKEYS_BY_TITLE = new Map([
  ['attack-move', 'Q'],
  ['attack ground', 'F'],
  ['force fire', 'F'],
  ['stop', 'X'],
  ['auto-fire: on', 'T'],
  ['auto-fire: off', 'T'],
  ['patrol', 'P'],
  ['guard', 'G'],
  ['follow', 'Y'],
  ['hold position', 'H'],
  ['return for repair', 'R'],
  ...Object.values(ABILITIES)
    .filter((ability) => ability?.name && ability?.key)
    .map((ability) => [String(ability.name).toLowerCase(), String(ability.key).toUpperCase()]),
]);

const BUILD_TYPE_BY_TITLE = new Map(
  Object.entries({ buildDepot: 'depot', buildBarracks: 'barracks', buildWorkshop: 'workshop' })
    .filter(([abilityId]) => ABILITIES[abilityId]?.name)
    .map(([abilityId, buildingType]) => [ABILITIES[abilityId].name.toLowerCase(), buildingType]),
);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function normalizeTitle(title) {
  return String(title || '').replace(/^✓\s*/, '').trim();
}

function slug(value) {
  const normalized = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'command';
}

function inferGroup(action, title) {
  if (GROUPS[action.group]) return action.group;
  const classes = new Set(String(action.className || '').split(/\s+/).filter(Boolean));
  if (classes.has('production-command')) return 'production';
  if (classes.has('upgrade-command') || classes.has('researched')) return 'modernization';
  if (classes.has('build-command')) return 'construction';
  if (classes.has('stance-on') || classes.has('stance-off') || title.startsWith('Auto-Fire:')) return 'stance';
  if (TARGETING_TITLES.has(title.toLowerCase())) return 'targeting';
  if (classes.has('command')) return 'order';
  return 'ability';
}

function inferHotkey(action, title) {
  if (action.hotkey != null) return String(action.hotkey).trim().toUpperCase();
  const meta = String(action.meta || '').trim();
  if (/^[a-z0-9]$/i.test(meta)) return meta.toUpperCase();
  return HOTKEYS_BY_TITLE.get(title.toLowerCase()) || '';
}

function inferDisabledReason(action) {
  if (!action.disabled) return '';
  if (action.disabledReason) return String(action.disabledReason);
  const meta = String(action.meta || '').trim();
  const title = normalizeTitle(action.title);
  if (/already deployed/i.test(meta)) return 'This unique unit is already deployed or queued.';
  if (/researched/i.test(meta)) return 'This modernization is already complete.';
  if (/requires/i.test(meta)) return meta.endsWith('.') ? meta : `${meta}.`;
  if (/^\d+s$/i.test(meta)) return `${title} is cooling down for ${meta}.`;
  if (/auto-fire/i.test(title)) return 'The current selection has no weapon systems to toggle.';
  if (/return for repair/i.test(title)) return 'Select a damaged vehicle and ensure an operational repair workshop exists.';
  if (/guard/i.test(title)) return 'Select at least one armed Ukrainian unit to guard another entity.';
  return 'This command is unavailable for the current selection or state.';
}

function targetingState(game, action, title) {
  if (typeof action.targeting === 'boolean') return action.targeting;
  const targetKind = TARGETING_TITLES.get(title.toLowerCase());
  if (targetKind === 'attackMove') return Boolean(game?.mouse?.attackMove);
  if (targetKind === 'attackGround') return Boolean(game?.isAttackGroundArmed?.());
  if (targetKind) return game?.pendingTacticalCommand?.kind === targetKind;
  if (inferGroup(action, title) === 'construction' && game?.pendingBuild) {
    return BUILD_TYPE_BY_TITLE.get(title.toLowerCase()) === game.pendingBuild.type;
  }
  return false;
}

function pressedState(action) {
  if (typeof action.pressed === 'boolean') return action.pressed;
  const classes = new Set(String(action.className || '').split(/\s+/).filter(Boolean));
  return classes.has('stance-on') || classes.has('researched');
}

function normalizeActions(actions, game) {
  const duplicateCounts = new Map();
  return actions
    .map((action, sourceIndex) => {
      const title = normalizeTitle(action.title);
      const requestedId = slug(action.id || title);
      const duplicateCount = duplicateCounts.get(requestedId) || 0;
      duplicateCounts.set(requestedId, duplicateCount + 1);
      const id = duplicateCount ? `${requestedId}-${duplicateCount + 1}` : requestedId;
      const group = inferGroup(action, title);
      return {
        id,
        title,
        description: String(action.description || ''),
        meta: String(action.meta || ''),
        hotkey: inferHotkey(action, title),
        group,
        groupLabel: GROUPS[group].label,
        groupRank: GROUPS[group].rank,
        sourceIndex,
        className: String(action.className || ''),
        disabled: Boolean(action.disabled),
        disabledReason: inferDisabledReason(action),
        targeting: targetingState(game, action, title),
        pressed: pressedState(action),
        activate: action.onClick,
      };
    })
    .sort((left, right) => left.groupRank - right.groupRank || left.sourceIndex - right.sourceIndex);
}

export function createCommandCardModel(actions, {
  game = null,
  page = 0,
  columns = COMMAND_CARD_COLUMNS,
  rows = COMMAND_CARD_ROWS,
} = {}) {
  if (!Array.isArray(actions)) throw new TypeError('Command card actions must be an array.');
  if (!Number.isInteger(columns) || columns <= 0 || !Number.isInteger(rows) || rows <= 0) {
    throw new TypeError('Command card grid dimensions must be positive integers.');
  }
  const normalized = normalizeActions(actions, game);
  const pageSize = columns * rows;
  const pageCount = Math.max(1, Math.ceil(normalized.length / pageSize));
  const activePage = Math.min(Math.max(Number.isInteger(page) ? page : 0, 0), pageCount - 1);
  const pageStart = activePage * pageSize;
  const visibleActions = normalized.slice(pageStart, pageStart + pageSize).map((action, slot) => ({
    ...action,
    slot,
    row: Math.floor(slot / columns),
    column: slot % columns,
  }));
  return deepFreeze({
    schema: COMMAND_CARD_SCHEMA,
    version: COMMAND_CARD_VERSION,
    columns,
    rows,
    pageSize,
    pageCount,
    activePage,
    actionCount: normalized.length,
    actions: visibleActions,
    allActions: normalized,
  });
}

export function navigateCommandCard(model, currentId, key) {
  if (!model || model.schema !== COMMAND_CARD_SCHEMA) throw new TypeError('A valid command card model is required.');
  const actions = model.actions;
  if (!actions.length) return Object.freeze({ pageDelta: 0, actionId: null });
  const currentIndex = Math.max(0, actions.findIndex((action) => action.id === currentId));
  let nextIndex = currentIndex;
  let pageDelta = 0;
  if (key === 'ArrowLeft') nextIndex = (currentIndex - 1 + actions.length) % actions.length;
  else if (key === 'ArrowRight') nextIndex = (currentIndex + 1) % actions.length;
  else if (key === 'ArrowUp') nextIndex = Math.max(0, currentIndex - model.columns);
  else if (key === 'ArrowDown') nextIndex = Math.min(actions.length - 1, currentIndex + model.columns);
  else if (key === 'Home') nextIndex = 0;
  else if (key === 'End') nextIndex = actions.length - 1;
  else if (key === 'PageUp') pageDelta = -1;
  else if (key === 'PageDown') pageDelta = 1;
  else return Object.freeze({ pageDelta: 0, actionId: currentId || actions[0].id });
  return Object.freeze({ pageDelta, actionId: actions[nextIndex]?.id || actions[0].id });
}

function createTextElement(documentTarget, tagName, className, text) {
  const element = documentTarget.createElement(tagName);
  element.className = className;
  element.textContent = text;
  return element;
}

function installStylesheet(documentTarget) {
  if (!documentTarget?.head || typeof documentTarget.createElement !== 'function') return () => {};
  const existing = documentTarget.querySelector?.('link[data-command-card-styles="true"]');
  if (existing) return () => {};
  const link = documentTarget.createElement('link');
  link.rel = 'stylesheet';
  link.href = COMMAND_CARD_STYLESHEET;
  link.dataset.commandCardStyles = 'true';
  documentTarget.head.append(link);
  return () => link.remove?.();
}

export function createCommandCardController({ root, game, documentTarget = globalThis.document } = {}) {
  if (!root || typeof root.replaceChildren !== 'function') throw new TypeError('Command card root is required.');
  if (!documentTarget || typeof documentTarget.createElement !== 'function') throw new TypeError('Command card document is required.');
  let page = 0;
  let selectionKey = '';
  let sourceActions = [];
  let model = createCommandCardModel([], { game });
  let actionButtons = new Map();
  const disposeStylesheet = installStylesheet(documentTarget);

  const focusAction = (actionId) => actionButtons.get(actionId)?.focus?.();

  const render = (actions = sourceActions, { preferredFocusId = null } = {}) => {
    sourceActions = actions;
    model = createCommandCardModel(sourceActions, { game, page });
    page = model.activePage;
    actionButtons = new Map();
    const grid = documentTarget.createElement('div');
    grid.className = 'commandCardGrid';
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', `Command card page ${page + 1} of ${model.pageCount}`);

    for (const action of model.actions) {
      const button = documentTarget.createElement('button');
      button.type = 'button';
      button.className = `ability commandCardAction commandGroup-${action.group} ${action.className}`.trim();
      button.disabled = action.disabled;
      button.dataset.commandId = action.id;
      button.dataset.commandGroup = action.group;
      button.dataset.commandSlot = String(action.slot);
      button.dataset.targeting = action.targeting ? 'true' : 'false';
      button.setAttribute('aria-label', `${action.title}. ${action.description}${action.disabledReason ? ` ${action.disabledReason}` : ''}`);
      button.setAttribute('aria-rowindex', String(action.row + 1));
      button.setAttribute('aria-colindex', String(action.column + 1));
      if (action.pressed) button.setAttribute('aria-pressed', 'true');
      if (action.targeting) button.setAttribute('aria-current', 'true');
      if (action.disabledReason) {
        button.title = action.disabledReason;
        button.dataset.tooltip = action.disabledReason;
      }

      button.append(
        createTextElement(documentTarget, 'span', 'commandGroupLabel', action.groupLabel),
        createTextElement(documentTarget, 'strong', 'commandTitle', action.title),
        createTextElement(documentTarget, 'small', 'commandDescription', action.description),
      );
      if (action.hotkey) button.append(createTextElement(documentTarget, 'kbd', 'commandHotkey', action.hotkey));
      if (action.meta && action.meta.toUpperCase() !== action.hotkey) {
        button.append(createTextElement(documentTarget, 'span', 'abilityMeta', action.meta));
      }
      if (action.disabledReason) {
        button.append(createTextElement(documentTarget, 'span', 'commandDisabledReason', action.disabledReason));
      }

      const activate = (event) => {
        if (button.disabled || typeof action.activate !== 'function') return;
        if (event.type === 'pointerdown' && event.button !== 0) return;
        if (event.type === 'click' && event.detail !== 0) return;
        action.activate();
      };
      button.addEventListener('pointerdown', activate);
      button.addEventListener('click', activate);
      button.addEventListener('keydown', (event) => {
        const navigation = navigateCommandCard(model, action.id, event.key);
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) return;
        event.preventDefault();
        if (navigation.pageDelta) {
          const previousSlot = action.slot;
          page = Math.min(Math.max(0, page + navigation.pageDelta), model.pageCount - 1);
          render(sourceActions);
          focusAction(model.actions[Math.min(previousSlot, model.actions.length - 1)]?.id);
        } else {
          focusAction(navigation.actionId);
        }
      });
      actionButtons.set(action.id, button);
      grid.append(button);
    }

    const children = [grid];
    if (model.pageCount > 1) {
      const pager = documentTarget.createElement('nav');
      pager.className = 'commandCardPager';
      pager.setAttribute('aria-label', 'Command card pages');
      const previous = createTextElement(documentTarget, 'button', 'commandCardPageButton', 'Previous');
      previous.type = 'button';
      previous.disabled = page === 0;
      const status = createTextElement(documentTarget, 'span', 'commandCardPageStatus', `${page + 1} / ${model.pageCount}`);
      status.setAttribute('aria-live', 'polite');
      const next = createTextElement(documentTarget, 'button', 'commandCardPageButton', 'Next');
      next.type = 'button';
      next.disabled = page >= model.pageCount - 1;
      previous.addEventListener('click', () => {
        page = Math.max(0, page - 1);
        render(sourceActions);
        focusAction(model.actions[0]?.id);
      });
      next.addEventListener('click', () => {
        page = Math.min(model.pageCount - 1, page + 1);
        render(sourceActions);
        focusAction(model.actions[0]?.id);
      });
      pager.append(previous, status, next);
      children.push(pager);
    }
    root.replaceChildren(...children);
    root.dataset.commandCardPage = String(page);
    root.dataset.commandCardPages = String(model.pageCount);
    root.setAttribute('aria-label', 'Unit and facility command card');
    if (preferredFocusId) focusAction(preferredFocusId);
    return model;
  };

  return Object.freeze({
    begin(entities = []) {
      const nextSelectionKey = entities.map((entity) => `${entity.id}:${entity.type}`).join('|');
      if (nextSelectionKey !== selectionKey) page = 0;
      selectionKey = nextSelectionKey;
      sourceActions = [];
    },
    add(action) { sourceActions.push(action); },
    commit() { return render(sourceActions); },
    render,
    reset() {
      page = 0;
      selectionKey = '';
      sourceActions = [];
      model = createCommandCardModel([], { game });
      actionButtons = new Map();
      root.replaceChildren();
    },
    model: () => model,
    page: () => page,
    dispose() {
      this.reset();
      disposeStylesheet();
    },
  });
}

function commandCardStateSignature(game) {
  const player = game?.player || {};
  return [
    game?.mouse?.attackMove ? 1 : 0,
    game?.isAttackGroundArmed?.() ? 1 : 0,
    game?.pendingBuild?.type || '-',
    game?.pendingTacticalCommand?.kind || '-',
    Math.floor(player.metal || 0),
    Math.floor(player.fuel || 0),
    Math.floor(player.intel || 0),
    player.pop || 0,
    player.cap || 0,
  ].join(':');
}

export function installProductionCommandCard(ui, { documentTarget = globalThis.document } = {}) {
  if (!ui?.g || !ui?.e?.abilities) throw new TypeError('Production command card requires the active UI command root.');
  for (const method of ['commandButton', 'commandStateSignature', 'shouldRenderCommands', 'refresh']) {
    if (typeof ui[method] !== 'function') throw new TypeError(`Production command card requires UI.${method}().`);
  }

  const controller = createCommandCardController({ root: ui.e.abilities, game: ui.g, documentTarget });
  const originalCommandButton = ui.commandButton;
  const originalCommandStateSignature = ui.commandStateSignature;
  const originalShouldRenderCommands = ui.shouldRenderCommands;
  const originalRefresh = ui.refresh;
  const originalSetMission = ui.setMission;
  const originalShowMissionSelect = ui.showMissionSelect;
  let collecting = false;

  ui.commandStateSignature = function commandStateSignatureWithCardState(entities) {
    return `${originalCommandStateSignature.call(this, entities)}::command-card:${commandCardStateSignature(this.g)}`;
  };

  ui.shouldRenderCommands = function shouldRenderCommandsWithCard(entities) {
    const shouldRender = originalShouldRenderCommands.call(this, entities);
    if (shouldRender) {
      controller.begin(entities);
      collecting = true;
    }
    return shouldRender;
  };

  ui.commandButton = function collectCommandCardAction(action) {
    if (!collecting) return originalCommandButton.call(this, action);
    controller.add(action);
    return action;
  };

  ui.refresh = function refreshWithCommandCard(...args) {
    const result = originalRefresh.apply(this, args);
    if (collecting) {
      collecting = false;
      controller.commit();
    }
    return result;
  };

  if (typeof originalSetMission === 'function') {
    ui.setMission = function setMissionWithCommandCard(...args) {
      controller.reset();
      return originalSetMission.apply(this, args);
    };
  }
  if (typeof originalShowMissionSelect === 'function') {
    ui.showMissionSelect = function showMissionSelectWithCommandCard(...args) {
      controller.reset();
      return originalShowMissionSelect.apply(this, args);
    };
  }

  return () => {
    ui.commandButton = originalCommandButton;
    ui.commandStateSignature = originalCommandStateSignature;
    ui.shouldRenderCommands = originalShouldRenderCommands;
    ui.refresh = originalRefresh;
    if (typeof originalSetMission === 'function') ui.setMission = originalSetMission;
    if (typeof originalShowMissionSelect === 'function') ui.showMissionSelect = originalShowMissionSelect;
    collecting = false;
    controller.dispose();
  };
}

export function commandCardBuildLabel(type) {
  return BUILDING_TYPES[type]?.name || String(type || 'Structure');
}
