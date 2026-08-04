import { createSelectionPanelModel } from './selection-panel-model.js';

function requiredElement(value, label) {
  if (!value || typeof value.replaceChildren !== 'function' || typeof value.append !== 'function') {
    throw new TypeError(`Selection panel requires ${label}.`);
  }
  return value;
}

function createElement(documentTarget, tagName, className = '') {
  const element = documentTarget.createElement(tagName);
  if (className) element.className = className;
  return element;
}

function setText(element, value) {
  element.textContent = value ?? '';
  return element;
}

function healthLabel(health) {
  return `${Math.ceil(health.current)}/${Math.ceil(health.maximum)}`;
}

function contentsLabel(container) {
  const capacity = container.capacity === null ? '' : `/${container.capacity}`;
  return `${container.label} ${container.used}${capacity}`;
}

export function createSelectionPanelController({
  game,
  elements,
  onSelectionChanged = () => {},
  documentTarget = globalThis.document,
} = {}) {
  if (!game || typeof game.select !== 'function' || typeof game.selectedEntities !== 'function') {
    throw new TypeError('Selection panel controller requires public Game selection commands.');
  }
  if (!elements || typeof elements !== 'object') throw new TypeError('Selection panel controller requires element references.');
  if (!documentTarget || typeof documentTarget.createElement !== 'function') {
    throw new TypeError('Selection panel controller requires a document-like target.');
  }
  if (typeof onSelectionChanged !== 'function') throw new TypeError('Selection panel onSelectionChanged must be a function.');

  const root = requiredElement(elements.root, 'a root element');
  const subgroupRoot = requiredElement(elements.subgroups, 'a subgroup container');
  const gridRoot = requiredElement(elements.grid, 'a unit-grid container');
  const contentsRoot = requiredElement(elements.contents, 'a contents container');
  let activeSubgroup = 'all';
  let lastModel = createSelectionPanelModel(game, []);

  function clear() {
    activeSubgroup = 'all';
    lastModel = createSelectionPanelModel(game, []);
    subgroupRoot.replaceChildren();
    gridRoot.replaceChildren();
    contentsRoot.replaceChildren();
    root.classList?.add?.('hidden');
    return lastModel;
  }

  function activeItems(model) {
    if (activeSubgroup === 'all') return model.items;
    return model.items.filter((item) => item.type === activeSubgroup);
  }

  function renderSubgroups(model) {
    subgroupRoot.replaceChildren();
    if (model.subgroups.length <= 1) return;
    const tabs = [
      { id: 'all', label: 'All', count: model.items.filter((item) => item.kind === 'unit').length },
      ...model.subgroups,
    ];
    for (const subgroup of tabs) {
      const button = createElement(documentTarget, 'button', 'selectionSubgroupTab');
      button.type = 'button';
      button.dataset.subgroup = subgroup.id;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(activeSubgroup === subgroup.id));
      button.classList?.toggle?.('active', activeSubgroup === subgroup.id);
      setText(button, `${subgroup.label} ${subgroup.count}`);
      button.addEventListener('click', () => {
        activeSubgroup = subgroup.id;
        renderModel(model);
      });
      subgroupRoot.append(button);
    }
  }

  function statusBadges(item) {
    const badges = createElement(documentTarget, 'span', 'selectionStatusBadges');
    for (const status of item.statuses) {
      const badge = createElement(documentTarget, 'span', `selectionStatus selectionStatus-${status.severity}`);
      badge.dataset.status = status.id;
      badge.title = status.label;
      setText(badge, status.label);
      badges.append(badge);
    }
    return badges;
  }

  function veterancyBadge(item) {
    if (!item.veterancy) return null;
    const badge = createElement(documentTarget, 'span', 'selectionVeterancy');
    badge.title = `${item.veterancy.label} · ${Math.floor(item.veterancy.xp)} XP`;
    setText(badge, item.veterancy.badge);
    return badge;
  }

  function renderGrid(model) {
    gridRoot.replaceChildren();
    const byId = new Map(game.selectedEntities().map((entity) => [String(entity.id), entity]));
    for (const item of activeItems(model)) {
      const button = createElement(documentTarget, 'button', 'selectionUnitCard');
      button.type = 'button';
      button.dataset.entityId = item.id;
      button.classList?.toggle?.('primary', item.primary);
      button.classList?.add?.(`health-${item.health.state}`);
      button.setAttribute('aria-pressed', String(item.primary));
      button.setAttribute('aria-label', `${item.fullName}, ${healthLabel(item.health)} strength${item.primary ? ', primary selection' : ''}`);

      const header = createElement(documentTarget, 'span', 'selectionUnitHeader');
      const name = createElement(documentTarget, 'strong', 'selectionUnitName');
      setText(name, item.name);
      header.append(name);
      const veteran = veterancyBadge(item);
      if (veteran) header.append(veteran);

      const meter = createElement(documentTarget, 'span', 'selectionHealthMeter');
      const fill = createElement(documentTarget, 'span', 'selectionHealthFill');
      fill.style.width = `${item.health.percent}%`;
      meter.append(fill);

      const meta = createElement(documentTarget, 'span', 'selectionUnitMeta');
      setText(meta, healthLabel(item.health));

      button.append(header, meter, meta, statusBadges(item));
      button.addEventListener('click', (event) => {
        const entity = byId.get(item.id);
        if (!entity) return;
        game.select(entity, Boolean(event.shiftKey));
        onSelectionChanged(Object.freeze({ entityId: item.id, additive: Boolean(event.shiftKey) }));
      });
      gridRoot.append(button);
    }
  }

  function renderContents(model) {
    contentsRoot.replaceChildren();
    for (const container of model.containers) {
      const section = createElement(documentTarget, 'section', `selectionContentsGroup selectionContents-${container.kind}`);
      const heading = createElement(documentTarget, 'h4');
      setText(heading, contentsLabel(container));
      section.append(heading);
      const list = createElement(documentTarget, 'div', 'selectionContentsList');
      for (const content of container.contents) {
        const item = createElement(documentTarget, 'span', 'selectionContentItem');
        item.dataset.entityId = content.id;
        item.title = `${content.fullName} · ${healthLabel(content.health)} strength`;
        const veteran = content.veterancy ? ` ${content.veterancy.badge}` : '';
        setText(item, `${content.name}${veteran}`);
        list.append(item);
      }
      section.append(list);
      contentsRoot.append(section);
    }
    contentsRoot.classList?.toggle?.('hidden', model.containers.length === 0);
  }

  function renderModel(model) {
    lastModel = model;
    if (model.empty) return clear();

    const validSubgroups = new Set(['all', ...model.subgroups.map((subgroup) => subgroup.id)]);
    if (!validSubgroups.has(activeSubgroup)) {
      const primary = model.items.find((item) => item.primary && item.kind === 'unit');
      activeSubgroup = primary?.type ?? 'all';
    }
    root.classList?.remove?.('hidden');
    renderSubgroups(model);
    renderGrid(model);
    renderContents(model);
    return model;
  }

  function render(entities = game.selectedEntities()) {
    return renderModel(createSelectionPanelModel(game, entities));
  }

  return Object.freeze({
    render,
    clear,
    snapshot: () => lastModel,
    activeSubgroup: () => activeSubgroup,
  });
}

export function installSelectionPanel({ game, ui, documentTarget = globalThis.document } = {}) {
  if (!ui || typeof ui.refresh !== 'function' || typeof ui.setMission !== 'function' || typeof ui.showMissionSelect !== 'function') {
    throw new TypeError('Selection panel installation requires the battlefield UI lifecycle.');
  }
  const controller = createSelectionPanelController({
    game,
    documentTarget,
    elements: {
      root: documentTarget.querySelector('#selectionPanel'),
      subgroups: documentTarget.querySelector('#selectionSubgroups'),
      grid: documentTarget.querySelector('#selectionGrid'),
      contents: documentTarget.querySelector('#selectionContents'),
    },
    onSelectionChanged: () => ui.refresh(),
  });
  const originalRefresh = ui.refresh;
  const originalSetMission = ui.setMission;
  const originalShowMissionSelect = ui.showMissionSelect;

  ui.refresh = function refreshSelectionPanel(...args) {
    const result = originalRefresh.apply(this, args);
    if (game.mission) controller.render();
    else controller.clear();
    return result;
  };
  ui.setMission = function setMissionSelectionPanel(...args) {
    controller.clear();
    return originalSetMission.apply(this, args);
  };
  ui.showMissionSelect = function showMissionSelectSelectionPanel(...args) {
    controller.clear();
    return originalShowMissionSelect.apply(this, args);
  };

  return () => {
    controller.clear();
    ui.refresh = originalRefresh;
    ui.setMission = originalSetMission;
    ui.showMissionSelect = originalShowMissionSelect;
  };
}
