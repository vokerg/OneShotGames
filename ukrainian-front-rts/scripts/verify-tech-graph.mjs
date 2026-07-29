const entries = (value) => Object.entries(value ?? {}).sort(([left], [right]) => left.localeCompare(right));
const add = (errors, path, message) => errors.push(`${path}: ${message}`);
const asLegacyList = (value) => value == null || value === '' ? [] : Array.isArray(value) ? value : [value];

function validateReferenceList(errors, path, value, knownIds, label, { allowScalar = false } = {}) {
  if (value == null) return [];
  if (!Array.isArray(value) && !(allowScalar && typeof value === 'string')) {
    add(errors, path, allowScalar ? 'must be a string or an array of strings' : 'must be an array of strings');
    return [];
  }

  const references = asLegacyList(value);
  const seen = new Set();
  const valid = [];
  references.forEach((reference, index) => {
    const itemPath = Array.isArray(value) ? `${path}[${index}]` : path;
    if (typeof reference !== 'string' || reference.length === 0) {
      add(errors, itemPath, 'must be a non-empty string');
      return;
    }
    if (seen.has(reference)) add(errors, itemPath, `duplicate ${label} reference ${reference}`);
    seen.add(reference);
    if (!knownIds.has(reference)) add(errors, itemPath, `missing ${label} ${reference}`);
    else valid.push(reference);
  });
  return valid;
}

function collectNodes(errors, buildings, upgrades) {
  const nodes = new Map();
  for (const [id, data] of entries(buildings)) {
    nodes.set(id, { id, data: data ?? {}, path: `BUILDING_TYPES.${id}`, family: 'building' });
  }
  for (const [id, data] of entries(upgrades)) {
    if (nodes.has(id)) {
      add(errors, `UPGRADES.${id}`, `duplicate technology id ${id}; buildings and upgrades share one namespace`);
      continue;
    }
    nodes.set(id, { id, data: data ?? {}, path: `UPGRADES.${id}`, family: 'upgrade' });
  }
  return nodes;
}

function validateCycles(errors, nodes, requirements) {
  const visiting = new Set();
  const visited = new Set();

  function visit(id, stack) {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      const cycle = [...stack.slice(start), id];
      add(errors, `${nodes.get(id)?.path ?? id}.requires`, `circular technology path: ${cycle.join(' -> ')}`);
      return;
    }

    visiting.add(id);
    for (const required of requirements.get(id) ?? []) visit(required, [...stack, id]);
    visiting.delete(id);
    visited.add(id);
  }

  for (const id of nodes.keys()) visit(id, []);
}

function prerequisiteClosure(id, requirements) {
  const closure = new Set();
  const pending = [...(requirements.get(id) ?? [])];
  while (pending.length > 0) {
    const required = pending.pop();
    if (closure.has(required)) continue;
    closure.add(required);
    pending.push(...(requirements.get(required) ?? []));
  }
  return closure;
}

function allowedForFaction(node, factionId) {
  const restrictions = asLegacyList(node.data.factions);
  return restrictions.length === 0 || restrictions.includes(factionId);
}

function reachableForFaction(nodes, requirements, factionId, blocked = new Set()) {
  const reachable = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, node] of nodes) {
      if (reachable.has(id) || blocked.has(id) || !allowedForFaction(node, factionId)) continue;
      const required = requirements.get(id) ?? [];
      if (required.every((requiredId) => reachable.has(requiredId))) {
        reachable.add(id);
        changed = true;
      }
    }
  }
  return reachable;
}

export function validateTechGraph({ buildings = {}, upgrades = {}, factions = {}, missions = [] }) {
  const errors = [];
  if (!Array.isArray(missions)) {
    add(errors, 'MISSIONS', 'must be an array');
    missions = [];
  }

  const nodes = collectNodes(errors, buildings, upgrades);
  const techIds = new Set(nodes.keys());
  const factionIds = new Set(entries(factions).map(([, faction]) => faction?.id).filter((id) => typeof id === 'string'));
  const missionIds = new Set(missions.map((mission) => mission?.id).filter((id) => typeof id === 'string'));
  const requirements = new Map();
  const exclusiveGroups = new Map();

  for (const [id, node] of nodes) {
    const required = validateReferenceList(errors, `${node.path}.requires`, node.data.requires, techIds, 'tech node', { allowScalar: true });
    requirements.set(id, required);
    if (required.includes(id)) add(errors, `${node.path}.requires`, 'a technology node cannot require itself');

    validateReferenceList(errors, `${node.path}.factions`, node.data.factions, factionIds, 'faction');
    validateReferenceList(errors, `${node.path}.missionLocks`, node.data.missionLocks, missionIds, 'mission');

    if (node.data.techRoot !== undefined && typeof node.data.techRoot !== 'boolean') {
      add(errors, `${node.path}.techRoot`, 'must be a boolean');
    }
    if (node.data.techRoot === true && required.length > 0) {
      add(errors, `${node.path}.techRoot`, 'a technology root cannot also declare prerequisites');
    }

    const group = node.data.exclusiveGroup;
    if (group != null) {
      if (typeof group !== 'string' || group.trim().length === 0) {
        add(errors, `${node.path}.exclusiveGroup`, 'must be a non-empty string or null');
      } else {
        exclusiveGroups.set(group, [...(exclusiveGroups.get(group) ?? []), id]);
      }
    }
  }

  validateCycles(errors, nodes, requirements);

  for (const [group, members] of exclusiveGroups) {
    if (members.length < 2) add(errors, `exclusiveGroup.${group}`, 'must contain at least two technology choices');
  }

  for (const [id, node] of nodes) {
    const closure = prerequisiteClosure(id, requirements);
    const choicesByGroup = new Map();
    for (const required of closure) {
      const group = nodes.get(required)?.data.exclusiveGroup;
      if (!group) continue;
      choicesByGroup.set(group, [...(choicesByGroup.get(group) ?? []), required]);
    }

    for (const [group, choices] of choicesByGroup) {
      const uniqueChoices = [...new Set(choices)];
      if (node.data.exclusiveGroup === group) {
        add(errors, `${node.path}.requires`, `cannot require ${uniqueChoices[0]} from its own mutually exclusive group ${group}`);
      }
      if (uniqueChoices.length > 1) {
        add(errors, `${node.path}.requires`, `requires mutually exclusive choices ${uniqueChoices.join(' and ')} from group ${group}`);
      }
    }
  }

  for (const factionId of factionIds) {
    const reachable = reachableForFaction(nodes, requirements, factionId);
    for (const [id, node] of nodes) {
      if (allowedForFaction(node, factionId) && !reachable.has(id)) {
        add(errors, node.path, `technology node is unreachable for faction ${factionId} from compatible roots`);
      }
    }
  }

  missions.forEach((mission, index) => {
    const path = `MISSIONS[${index}]`;
    const playerFaction = mission?.playerFaction ?? 'ukraine';
    if (!factionIds.has(playerFaction)) add(errors, `${path}.playerFaction`, `missing faction ${playerFaction}`);

    const available = validateReferenceList(errors, `${path}.availableTech`, mission?.availableTech, techIds, 'tech node');
    const locked = validateReferenceList(errors, `${path}.lockedTech`, mission?.lockedTech, techIds, 'tech node');
    const blocked = new Set(locked);
    for (const [id, node] of nodes) {
      if (asLegacyList(node.data.missionLocks).includes(mission?.id)) blocked.add(id);
    }

    for (const id of available) {
      if (blocked.has(id)) add(errors, path, `${id} cannot be both available and locked`);
      const node = nodes.get(id);
      if (node && factionIds.has(playerFaction) && !allowedForFaction(node, playerFaction)) {
        add(errors, `${path}.availableTech`, `${id} is not available to faction ${playerFaction}`);
      }
    }

    if (available.length > 0 && factionIds.has(playerFaction)) {
      const reachable = reachableForFaction(nodes, requirements, playerFaction, blocked);
      for (const id of available) {
        if (!reachable.has(id)) add(errors, `${path}.availableTech`, `${id} is unreachable after faction and mission locks`);
      }
    }
  });

  return errors;
}

export function assertValidTechGraph(content) {
  const errors = validateTechGraph(content);
  if (errors.length) throw new Error(`Technology graph validation failed:\n${errors.map((error) => `- ${error}`).join('\n')}`);
}
