import { TEAM, UPGRADES } from '../config.js';

export const TECH_NODE_STATES = Object.freeze({
  LOCKED: 'locked',
  AVAILABLE: 'available',
  QUEUED: 'queued',
  COMPLETED: 'completed',
});

const RESOURCE_ORDER = Object.freeze(['metal', 'fuel', 'intel']);
const LANE_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'survivability', label: 'Survivability', description: 'Protection and platform endurance.' }),
  Object.freeze({ id: 'sensors-command', label: 'Sensors & Command', description: 'Observation, targeting, and battle management.' }),
  Object.freeze({ id: 'fires', label: 'Long-Range Fires', description: 'Range and lethality improvements.' }),
  Object.freeze({ id: 'mobility', label: 'Mobility', description: 'Movement and obstacle-breaching upgrades.' }),
]);
const MODAL_NAVIGATION_KEYS = new Set(['Tab', 'Enter', ' ', 'Spacebar']);

function laneForUpgrade(upgrade) {
  const mods = upgrade?.mods || {};
  if ('hp' in mods || 'droneResistance' in mods) return 'survivability';
  if ('sight' in mods || 'rate' in mods) return 'sensors-command';
  if ('damage' in mods || 'range' in mods) return 'fires';
  return 'mobility';
}

function resourceSnapshot(player = {}) {
  return Object.fromEntries(RESOURCE_ORDER.map((resource) => [resource, Math.max(0, Number(player?.[resource]) || 0)]));
}

function costEntries(cost = {}) {
  return RESOURCE_ORDER
    .filter((resource) => Number(cost?.[resource]) > 0)
    .map((resource) => Object.freeze({ resource, amount: Number(cost[resource]) }));
}

function queuedResearch(game) {
  const queued = new Map();
  for (const state of Object.values(game?.researchQueueStates || {})) {
    for (const item of state?.queue || []) {
      const duration = Math.max(0, Number(item.duration) || 0);
      const remaining = Math.max(0, Number(item.remaining) || 0);
      queued.set(item.techId, Object.freeze({
        facilityId: state.facilityId,
        itemId: item.id,
        paused: Boolean(state.paused),
        started: Boolean(item.started),
        progress: duration > 0 ? Math.max(0, Math.min(1, (duration - remaining) / duration)) : 0,
      }));
    }
  }
  return queued;
}

export function findResearchWorkshop(game) {
  return (game?.buildings || [])
    .filter((building) => (
      building?.team === TEAM.UA &&
      building.type === 'workshop' &&
      !building.underConstruction &&
      Number(building.hp) > 0
    ))
    .sort((left, right) => String(left.id).localeCompare(String(right.id), undefined, { numeric: true }))[0] || null;
}

export function formatTechCost(cost = {}) {
  const entries = costEntries(cost);
  return entries.length
    ? entries.map(({ resource, amount }) => `${amount} ${resource}`).join(' · ')
    : 'No resource cost';
}

export function createTechTreeModel(game, { selectedTechId = null } = {}) {
  const resources = resourceSnapshot(game?.player);
  const completed = new Set(game?.player?.upgrades || []);
  const queued = queuedResearch(game);
  const workshop = findResearchWorkshop(game);

  const nodes = Object.entries(UPGRADES)
    .map(([id, upgrade]) => {
      const prerequisiteId = upgrade.requires || null;
      const prerequisiteComplete = !prerequisiteId || completed.has(prerequisiteId);
      const queue = queued.get(id) || null;
      const affordable = costEntries(upgrade.cost).every(({ resource, amount }) => resources[resource] >= amount);
      let state = TECH_NODE_STATES.AVAILABLE;
      if (completed.has(id)) state = TECH_NODE_STATES.COMPLETED;
      else if (queue) state = TECH_NODE_STATES.QUEUED;
      else if (!prerequisiteComplete) state = TECH_NODE_STATES.LOCKED;

      const prerequisiteName = prerequisiteId ? UPGRADES[prerequisiteId]?.name || prerequisiteId : null;
      const blockingReasons = [];
      if (!prerequisiteComplete) blockingReasons.push(`Requires ${prerequisiteName}`);
      if (!workshop) blockingReasons.push('Requires an operational Repair and Recovery Point');
      if (!affordable) blockingReasons.push('Insufficient resources');

      return Object.freeze({
        id,
        name: upgrade.name,
        description: upgrade.desc,
        tier: Math.max(1, Number(upgrade.tier) || 1),
        laneId: laneForUpgrade(upgrade),
        applies: Object.freeze([...(upgrade.applies || [])]),
        cost: Object.freeze(costEntries(upgrade.cost)),
        costLabel: formatTechCost(upgrade.cost),
        prerequisiteId,
        prerequisiteName,
        state,
        affordable,
        actionable: state === TECH_NODE_STATES.AVAILABLE && affordable && Boolean(workshop),
        blockingReasons: Object.freeze(blockingReasons),
        queue,
      });
    })
    .sort((left, right) => left.tier - right.tier || left.name.localeCompare(right.name));

  const lanes = LANE_DEFINITIONS
    .map((lane) => Object.freeze({
      ...lane,
      nodes: Object.freeze(nodes.filter((node) => node.laneId === lane.id)),
    }))
    .filter((lane) => lane.nodes.length > 0);

  const selected = nodes.find((node) => node.id === selectedTechId) || nodes[0] || null;
  return Object.freeze({
    resources: Object.freeze(resources),
    workshopId: workshop?.id ?? null,
    workshopName: workshop ? 'Repair and Recovery Point' : null,
    lanes: Object.freeze(lanes),
    nodes: Object.freeze(nodes),
    selected,
    counts: Object.freeze(Object.fromEntries(Object.values(TECH_NODE_STATES).map((state) => [
      state,
      nodes.filter((node) => node.state === state).length,
    ]))),
  });
}

function element(documentTarget, tagName, className = '', text = '') {
  const node = documentTarget.createElement(tagName);
  node.className = className;
  node.textContent = text;
  return node;
}

function appendResourceSummary(root, model, documentTarget) {
  const bar = element(documentTarget, 'div', 'techTreeResources');
  for (const resource of RESOURCE_ORDER) {
    const item = element(documentTarget, 'div', 'techTreeResource');
    item.dataset.resource = resource;
    item.append(
      element(documentTarget, 'strong', '', String(Math.floor(model.resources[resource]))),
      element(documentTarget, 'span', '', resource),
    );
    bar.append(item);
  }
  const facility = element(
    documentTarget,
    'div',
    `techTreeFacility ${model.workshopId == null ? 'is-missing' : 'is-ready'}`,
    model.workshopId == null ? 'No operational research workshop' : `Research facility ready · #${model.workshopId}`,
  );
  bar.append(facility);
  root.append(bar);
}

function appendLane(root, lane, selectedTechId, documentTarget) {
  const section = element(documentTarget, 'section', 'techTreeLane');
  section.dataset.laneId = lane.id;
  const heading = element(documentTarget, 'header', 'techTreeLaneHeader');
  heading.append(
    element(documentTarget, 'h3', '', lane.label),
    element(documentTarget, 'p', '', lane.description),
  );
  const track = element(documentTarget, 'div', 'techTreeTrack');

  for (const node of lane.nodes) {
    const button = element(documentTarget, 'button', `techTreeNode state-${node.state}`);
    button.type = 'button';
    button.dataset.action = 'select-tech';
    button.dataset.techId = node.id;
    button.setAttribute('aria-pressed', String(node.id === selectedTechId));
    button.setAttribute('aria-label', `${node.name}: ${node.state}`);
    const eyebrow = element(documentTarget, 'span', 'techTreeNodeEyebrow', `Tier ${node.tier} · ${node.state}`);
    const name = element(documentTarget, 'strong', '', node.name);
    const cost = element(documentTarget, 'small', '', node.costLabel);
    button.append(eyebrow, name, cost);
    if (node.queue) {
      const progress = element(documentTarget, 'span', 'techTreeProgress');
      progress.style.setProperty?.('--progress', String(node.queue.progress));
      progress.setAttribute('aria-label', `${Math.round(node.queue.progress * 100)}% complete`);
      button.append(progress);
    }
    track.append(button);
  }

  section.append(heading, track);
  root.append(section);
}

function appendDetails(root, selected, documentTarget) {
  const details = element(documentTarget, 'aside', 'techTreeDetails');
  details.setAttribute('aria-live', 'polite');
  if (!selected) {
    details.append(element(documentTarget, 'p', '', 'No modernization projects are configured.'));
    root.append(details);
    return;
  }

  const state = element(documentTarget, 'span', `techTreeState state-${selected.state}`, selected.state);
  const title = element(documentTarget, 'h3', '', selected.name);
  const description = element(documentTarget, 'p', '', selected.description);
  const applies = element(
    documentTarget,
    'p',
    'techTreeApplies',
    `Applies to: ${selected.applies.length ? selected.applies.join(', ') : 'all forces'}`,
  );
  const prerequisite = element(
    documentTarget,
    'p',
    'techTreePrerequisite',
    selected.prerequisiteName ? `Prerequisite: ${selected.prerequisiteName}` : 'Prerequisite: none',
  );
  const cost = element(documentTarget, 'p', 'techTreeCost', `Cost: ${selected.costLabel}`);
  details.append(state, title, description, applies, prerequisite, cost);

  if (selected.blockingReasons.length) {
    const reasons = element(documentTarget, 'ul', 'techTreeBlockingReasons');
    selected.blockingReasons.forEach((reason) => reasons.append(element(documentTarget, 'li', '', reason)));
    details.append(reasons);
  }

  const action = element(documentTarget, 'button', 'techTreeResearchAction');
  action.type = 'button';
  action.dataset.action = 'research-tech';
  action.dataset.techId = selected.id;
  action.disabled = !selected.actionable;
  action.textContent = selected.state === TECH_NODE_STATES.COMPLETED
    ? 'Modernization Complete'
    : selected.state === TECH_NODE_STATES.QUEUED
      ? 'Research Queued'
      : selected.state === TECH_NODE_STATES.LOCKED
        ? 'Prerequisite Required'
        : 'Begin Research';
  details.append(action);
  root.append(details);
}

export function renderTechTreeScreen(root, model, { documentTarget = document } = {}) {
  if (!root || typeof root.replaceChildren !== 'function') {
    throw new TypeError('Tech-tree screen root must support replaceChildren().');
  }
  root.replaceChildren();
  appendResourceSummary(root, model, documentTarget);
  const layout = element(documentTarget, 'div', 'techTreeLayout');
  const lanes = element(documentTarget, 'div', 'techTreeLanes');
  model.lanes.forEach((lane) => appendLane(lanes, lane, model.selected?.id, documentTarget));
  layout.append(lanes);
  appendDetails(layout, model.selected, documentTarget);
  root.append(layout);
  return root;
}

function backgroundSiblings(panel) {
  const children = panel.parentElement?.children;
  return children ? [...children].filter((child) => child !== panel) : [];
}

export function installTechTreeScreen({
  game,
  ui,
  documentTarget = document,
  windowTarget = window,
} = {}) {
  const panel = documentTarget.querySelector('#techTree');
  const content = documentTarget.querySelector('#techTreeContent');
  const toggle = documentTarget.querySelector('#techTreeToggle');
  const close = documentTarget.querySelector('#techTreeClose');
  if (!panel || !content || !toggle || !close) {
    throw new Error('Tech-tree screen requires panel, content, toggle, and close elements.');
  }

  let selectedTechId = null;
  let refreshTimer = null;
  let previousFocus = null;
  const siblingInertState = new Map();
  const isOpen = () => !panel.classList.contains('hidden');
  const render = () => {
    const model = createTechTreeModel(game, { selectedTechId });
    selectedTechId = model.selected?.id || null;
    renderTechTreeScreen(content, model, { documentTarget });
    return model;
  };
  const setBackgroundInert = (inert) => {
    for (const sibling of backgroundSiblings(panel)) {
      if (inert) {
        if (!siblingInertState.has(sibling)) siblingInertState.set(sibling, Boolean(sibling.inert));
        sibling.inert = true;
      } else if (siblingInertState.has(sibling)) {
        sibling.inert = siblingInertState.get(sibling);
      }
    }
    if (!inert) siblingInertState.clear();
  };
  const setOpen = (open, { restoreFocus = true } = {}) => {
    if (open) previousFocus = documentTarget.activeElement || toggle;
    panel.classList.toggle('hidden', !open);
    panel.setAttribute('aria-hidden', String(!open));
    toggle.setAttribute('aria-expanded', String(open));
    documentTarget.body?.classList?.toggle('tech-tree-open', open);
    setBackgroundInert(open);
    if (refreshTimer != null) {
      windowTarget.clearInterval?.(refreshTimer);
      refreshTimer = null;
    }
    if (open) {
      render();
      refreshTimer = windowTarget.setInterval?.(render, 1000) ?? null;
      close.focus?.();
    } else if (restoreFocus) {
      const target = previousFocus?.isConnected === false ? toggle : previousFocus || toggle;
      target?.focus?.();
      previousFocus = null;
    }
  };
  const onToggle = () => setOpen(!isOpen());
  const onClose = () => setOpen(false);
  const onKeyDown = (event) => {
    if (!isOpen()) return;
    if (event.key === 'Escape') {
      event.preventDefault?.();
      event.stopImmediatePropagation?.();
      setOpen(false);
      return;
    }
    if (!MODAL_NAVIGATION_KEYS.has(event.key)) {
      event.preventDefault?.();
      event.stopImmediatePropagation?.();
    }
  };
  const onContentClick = (event) => {
    const target = event.target?.closest?.('[data-action]') || event.target;
    const action = target?.dataset?.action;
    const techId = target?.dataset?.techId;
    if (!action || !techId) return;

    if (action === 'select-tech') {
      selectedTechId = techId;
      render();
      return;
    }
    if (action !== 'research-tech' || target.disabled) return;

    const workshop = findResearchWorkshop(game);
    if (workshop && typeof game.select === 'function') game.select(workshop);
    const succeeded = Boolean(game.research?.(techId));
    if (succeeded) ui?.toast?.(`${UPGRADES[techId]?.name || techId} added to the research queue.`);
    else ui?.toast?.(game.lastError || 'Research could not be started.');
    ui?.refresh?.();
    selectedTechId = techId;
    render();
  };

  toggle.addEventListener('click', onToggle);
  close.addEventListener('click', onClose);
  content.addEventListener('click', onContentClick);
  windowTarget.addEventListener?.('keydown', onKeyDown, true);
  panel.setAttribute('aria-hidden', String(!isOpen()));
  toggle.setAttribute('aria-expanded', String(isOpen()));

  return () => {
    toggle.removeEventListener('click', onToggle);
    close.removeEventListener('click', onClose);
    content.removeEventListener('click', onContentClick);
    windowTarget.removeEventListener?.('keydown', onKeyDown, true);
    setOpen(false, { restoreFocus: false });
  };
}
