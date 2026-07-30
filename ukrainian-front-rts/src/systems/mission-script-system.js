export const MISSION_SCRIPT_VERSION = 1;

export const MISSION_SCRIPT_CONDITION_KINDS = Object.freeze([
  'all', 'any', 'not', 'timer', 'region', 'entity', 'resource', 'objective', 'variable',
]);
export const MISSION_SCRIPT_ACTION_KINDS = Object.freeze([
  'setVariable', 'addVariable', 'setResource', 'addResource', 'setObjective',
  'dialogue', 'reinforcement', 'camera', 'weather', 'finish',
  'enableTrigger', 'disableTrigger',
]);

const ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']);
const COLLECTIONS = new Set(['units', 'buildings', 'entities']);
const ENTITY_STATES = new Set([
  'exists', 'alive', 'destroyed', 'damaged', 'underConstruction', 'completed',
]);
const RECORD = Object.freeze({
  TRIGGER: 'mission.trigger',
  VARIABLE: 'mission.variable',
  RESOURCE: 'mission.resource',
  OBJECTIVE: 'mission.objective',
  DIALOGUE: 'mission.dialogue',
  REINFORCEMENT: 'mission.reinforcement',
  CAMERA: 'mission.camera',
  WEATHER: 'mission.weather',
  OUTCOME: 'mission.outcome',
  CONTROL: 'mission.trigger-control',
});

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  return value;
}

function id(value, label) {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new TypeError(`${label} must be a stable identifier.`);
  }
  return value;
}

function number(value, label, { min = -Infinity, max = Infinity } = {}) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new TypeError(`${label} must be a finite number from ${min} to ${max}.`);
  }
  return value;
}

function integer(value, label, { positive = false } = {}) {
  if (!Number.isInteger(value) || value < (positive ? 1 : 0)) {
    throw new TypeError(`${label} must be a ${positive ? 'positive' : 'non-negative'} integer.`);
  }
  return value;
}

function json(value, label = 'Value', seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return number(value, label);
  if (typeof value !== 'object') throw new TypeError(`${label} must be JSON-compatible.`);
  if (seen.has(value)) throw new TypeError(`${label} must not be circular.`);
  seen.add(value);
  let result;
  if (Array.isArray(value)) result = value.map((child, index) => json(child, `${label}[${index}]`, seen));
  else {
    object(value, label);
    result = {};
    for (const key of Object.keys(value).sort()) result[key] = json(value[key], `${label}.${key}`, seen);
  }
  seen.delete(value);
  return result;
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

function op(value = 'gte') {
  if (!OPS.has(value)) throw new RangeError(`Unknown mission-script operator: ${value}`);
  return value;
}

function compare(actual, operator, expected) {
  const structured =
    (actual && typeof actual === 'object') || (expected && typeof expected === 'object');
  const equal = structured ? JSON.stringify(actual) === JSON.stringify(expected) : actual === expected;
  return operator === 'eq' ? equal
    : operator === 'neq' ? !equal
      : operator === 'gt' ? actual > expected
        : operator === 'gte' ? actual >= expected
          : operator === 'lt' ? actual < expected
            : actual <= expected;
}

function selector(value = {}, label = 'Selector') {
  object(value, label);
  const collection = value.collection ?? 'entities';
  if (!COLLECTIONS.has(collection)) throw new RangeError(`${label}.collection is invalid.`);
  const result = { collection };
  if (value.id !== undefined) {
    if (!['string', 'number'].includes(typeof value.id) || value.id === '') {
      throw new TypeError(`${label}.id must be a non-empty string or number.`);
    }
    result.id = value.id;
  }
  for (const key of ['scriptId', 'type', 'tag']) {
    if (value[key] !== undefined) result[key] = id(value[key], `${label}.${key}`);
  }
  if (value.team !== undefined) {
    if (!['string', 'number'].includes(typeof value.team)) {
      throw new TypeError(`${label}.team must be a string or number.`);
    }
    result.team = value.team;
  }
  return result;
}

function region(value, index) {
  object(value, `Region ${index}`);
  const result = {
    id: id(value.id, `Region ${index}.id`),
    shape: value.shape ?? 'rect',
    x: number(value.x, `Region ${index}.x`),
    y: number(value.y, `Region ${index}.y`),
  };
  if (result.shape === 'circle') {
    result.radius = number(value.radius, `Region ${result.id}.radius`, { min: 0 });
  } else if (result.shape === 'rect') {
    result.width = number(value.width, `Region ${result.id}.width`, { min: 0 });
    result.height = number(value.height, `Region ${result.id}.height`, { min: 0 });
  } else throw new RangeError(`Unknown region shape: ${result.shape}`);
  return result;
}

function condition(value, path) {
  object(value, `Condition ${path}`);
  if (!MISSION_SCRIPT_CONDITION_KINDS.includes(value.kind)) {
    throw new RangeError(`Unknown condition kind at ${path}: ${value.kind}`);
  }
  if (value.kind === 'all' || value.kind === 'any') {
    if (!Array.isArray(value.conditions) || !value.conditions.length) {
      throw new TypeError(`Condition ${path}.conditions must be non-empty.`);
    }
    return {
      kind: value.kind,
      conditions: value.conditions.map((child, index) => condition(child, `${path}.${index}`)),
    };
  }
  if (value.kind === 'not') return { kind: 'not', condition: condition(value.condition, `${path}.not`) };
  if (value.kind === 'timer') {
    const clock = value.clock ?? 'seconds';
    if (!['seconds', 'ticks'].includes(clock)) throw new RangeError(`Condition ${path}.clock is invalid.`);
    return { kind: 'timer', clock, operator: op(value.operator), value: number(value.value, `${path}.value`, { min: 0 }) };
  }
  if (value.kind === 'region') {
    const event = value.event ?? 'present';
    const state = value.state ?? 'alive';
    if (!['present', 'enter', 'exit'].includes(event)) throw new RangeError(`Condition ${path}.event is invalid.`);
    if (!['exists', 'alive', 'completed'].includes(state)) throw new RangeError(`Condition ${path}.state is invalid.`);
    return {
      kind: 'region',
      key: path,
      regionId: id(value.regionId, `${path}.regionId`),
      selector: selector(value.selector, `${path}.selector`),
      state,
      event,
      operator: op(value.operator),
      value: number(value.value ?? 1, `${path}.value`, { min: 0 }),
    };
  }
  if (value.kind === 'entity') {
    const state = value.state ?? 'alive';
    if (!ENTITY_STATES.has(state)) throw new RangeError(`Condition ${path}.state is invalid.`);
    const match = selector(value.selector, `${path}.selector`);
    if (state === 'destroyed' && match.id === undefined && match.scriptId === undefined) {
      throw new Error(`Destroyed condition ${path} requires selector.id or selector.scriptId.`);
    }
    return {
      kind: 'entity',
      selector: match,
      state,
      operator: op(value.operator),
      value: number(value.value ?? 1, `${path}.value`, { min: 0 }),
    };
  }
  if (value.kind === 'resource') {
    return {
      kind: 'resource',
      resource: id(value.resource, `${path}.resource`),
      operator: op(value.operator),
      value: number(value.value, `${path}.value`),
    };
  }
  if (value.kind === 'objective') {
    if (value.index === undefined && value.id === undefined) {
      throw new Error(`Objective condition ${path} requires index or id.`);
    }
    const state = value.state ?? 'complete';
    if (!['complete', 'incomplete'].includes(state)) throw new RangeError(`Condition ${path}.state is invalid.`);
    return {
      kind: 'objective',
      ...(value.index === undefined
        ? { id: id(value.id, `${path}.id`) }
        : { index: integer(value.index, `${path}.index`) }),
      state,
    };
  }
  return {
    kind: 'variable',
    id: id(value.id, `${path}.id`),
    operator: op(value.operator ?? 'eq'),
    value: json(value.value, `${path}.value`),
  };
}

function spawn(value, path) {
  object(value, path);
  const kind = value.kind ?? 'unit';
  if (!['unit', 'building'].includes(kind)) throw new RangeError(`${path}.kind is invalid.`);
  const result = {
    kind,
    type: id(value.type, `${path}.type`),
    count: integer(value.count ?? 1, `${path}.count`, { positive: true }),
    spacingX: number(value.spacingX ?? 24, `${path}.spacingX`),
    spacingY: number(value.spacingY ?? 0, `${path}.spacingY`),
    options: json(value.options ?? {}, `${path}.options`),
  };
  if (value.regionId !== undefined) result.regionId = id(value.regionId, `${path}.regionId`);
  else {
    result.x = number(value.x, `${path}.x`);
    result.y = number(value.y, `${path}.y`);
  }
  if (value.scriptIdPrefix !== undefined) result.scriptIdPrefix = id(value.scriptIdPrefix, `${path}.scriptIdPrefix`);
  if (value.tag !== undefined) result.tag = id(value.tag, `${path}.tag`);
  return result;
}

function action(value, path) {
  object(value, `Action ${path}`);
  if (!MISSION_SCRIPT_ACTION_KINDS.includes(value.kind)) {
    throw new RangeError(`Unknown action kind at ${path}: ${value.kind}`);
  }
  const result = { kind: value.kind, delayTicks: integer(value.delayTicks ?? 0, `${path}.delayTicks`) };
  if (value.kind === 'setVariable') return { ...result, id: id(value.id, `${path}.id`), value: json(value.value, `${path}.value`) };
  if (value.kind === 'addVariable') return { ...result, id: id(value.id, `${path}.id`), amount: number(value.amount, `${path}.amount`) };
  if (value.kind === 'setResource' || value.kind === 'addResource') {
    return {
      ...result,
      resource: id(value.resource, `${path}.resource`),
      amount: number(value.amount, `${path}.amount`, value.kind === 'setResource' ? { min: 0 } : {}),
    };
  }
  if (value.kind === 'setObjective') {
    if (value.index === undefined && value.id === undefined) throw new Error(`Action ${path} requires objective index or id.`);
    if (value.complete !== undefined && typeof value.complete !== 'boolean') {
      throw new TypeError(`Action ${path}.complete must be boolean.`);
    }
    return {
      ...result,
      ...(value.index === undefined
        ? { id: id(value.id, `${path}.id`) }
        : { index: integer(value.index, `${path}.index`) }),
      complete: value.complete ?? true,
    };
  }
  if (value.kind === 'dialogue') {
    if (typeof value.text !== 'string' || !value.text.trim()) throw new TypeError(`Action ${path}.text is required.`);
    return {
      ...result,
      speaker: id(value.speaker, `${path}.speaker`),
      text: value.text,
      portrait: value.portrait == null ? null : id(value.portrait, `${path}.portrait`),
      durationSeconds: number(value.durationSeconds ?? 0, `${path}.durationSeconds`, { min: 0 }),
      metadata: json(value.metadata ?? {}, `${path}.metadata`),
    };
  }
  if (value.kind === 'reinforcement') {
    if (!Array.isArray(value.entities) || !value.entities.length) {
      throw new TypeError(`Action ${path}.entities must be non-empty.`);
    }
    if (!['string', 'number'].includes(typeof value.team)) throw new TypeError(`Action ${path}.team is required.`);
    return {
      ...result,
      team: value.team,
      label: typeof value.label === 'string' ? value.label : '',
      entities: value.entities.map((entry, index) => spawn(entry, `${path}.entities.${index}`)),
    };
  }
  if (value.kind === 'camera') {
    return {
      ...result,
      x: number(value.x, `${path}.x`),
      y: number(value.y, `${path}.y`),
      zoom: value.zoom == null ? null : number(value.zoom, `${path}.zoom`, { min: 0.01 }),
      durationSeconds: number(value.durationSeconds ?? 0, `${path}.durationSeconds`, { min: 0 }),
      label: typeof value.label === 'string' ? value.label : '',
    };
  }
  if (value.kind === 'weather') {
    return {
      ...result,
      weatherId: value.weatherId === null ? null : id(value.weatherId, `${path}.weatherId`),
      intensity: number(value.intensity ?? 1, `${path}.intensity`, { min: 0, max: 1 }),
      transitionSeconds: number(value.transitionSeconds ?? 0, `${path}.transitionSeconds`, { min: 0 }),
      durationSeconds: value.durationSeconds == null
        ? null
        : number(value.durationSeconds, `${path}.durationSeconds`, { min: 0 }),
    };
  }
  if (value.kind === 'finish') {
    if (!['victory', 'defeat'].includes(value.result)) throw new RangeError(`Action ${path}.result is invalid.`);
    return {
      ...result,
      result: value.result,
      reason: typeof value.reason === 'string' && value.reason.trim()
        ? value.reason
        : `Mission script resolved ${value.result}.`,
    };
  }
  return { ...result, triggerId: id(value.triggerId, `${path}.triggerId`) };
}

function regionRefs(value, output = []) {
  if (value.kind === 'region') output.push(value.regionId);
  value.conditions?.forEach((child) => regionRefs(child, output));
  if (value.condition) regionRefs(value.condition, output);
  return output;
}

export function validateMissionScript(value) {
  object(value, 'Mission script');
  if (value.version !== MISSION_SCRIPT_VERSION) {
    throw new RangeError(`Unsupported mission script version: ${value.version}`);
  }
  const regions = (value.regions ?? []).map(region);
  const regionIds = new Set();
  for (const item of regions) {
    if (regionIds.has(item.id)) throw new Error(`Duplicate mission script region id: ${item.id}`);
    regionIds.add(item.id);
  }
  if (!Array.isArray(value.triggers)) throw new TypeError('Mission script triggers must be an array.');

  const triggerIds = new Set();
  const triggers = value.triggers.map((item, index) => {
    object(item, `Trigger ${index}`);
    const triggerId = id(item.id, `Trigger ${index}.id`);
    if (triggerIds.has(triggerId)) throw new Error(`Duplicate mission script trigger id: ${triggerId}`);
    triggerIds.add(triggerId);
    if (!Array.isArray(item.actions) || !item.actions.length) {
      throw new TypeError(`Trigger ${triggerId}.actions must be non-empty.`);
    }
    if (item.once !== undefined && typeof item.once !== 'boolean') throw new TypeError(`Trigger ${triggerId}.once must be boolean.`);
    if (item.enabled !== undefined && typeof item.enabled !== 'boolean') throw new TypeError(`Trigger ${triggerId}.enabled must be boolean.`);
    const once = item.once ?? true;
    const maxActivations = item.maxActivations === null
      ? null
      : item.maxActivations === undefined
        ? (once ? 1 : null)
        : integer(item.maxActivations, `Trigger ${triggerId}.maxActivations`, { positive: true });
    return {
      id: triggerId,
      enabled: item.enabled ?? true,
      once,
      maxActivations,
      cooldownTicks: integer(item.cooldownTicks ?? 0, `Trigger ${triggerId}.cooldownTicks`),
      delayTicks: integer(item.delayTicks ?? 0, `Trigger ${triggerId}.delayTicks`),
      when: condition(item.when, `trigger:${triggerId}`),
      actions: item.actions.map((entry, actionIndex) => action(entry, `trigger:${triggerId}.${actionIndex}`)),
    };
  });

  for (const trigger of triggers) {
    for (const regionId of regionRefs(trigger.when)) {
      if (!regionIds.has(regionId)) throw new Error(`Trigger ${trigger.id} references unknown region: ${regionId}`);
    }
    for (const entry of trigger.actions) {
      if (['enableTrigger', 'disableTrigger'].includes(entry.kind) && !triggerIds.has(entry.triggerId)) {
        throw new Error(`Trigger ${trigger.id} references unknown trigger: ${entry.triggerId}`);
      }
      for (const spawned of entry.entities ?? []) {
        if (spawned.regionId && !regionIds.has(spawned.regionId)) {
          throw new Error(`Trigger ${trigger.id} reinforcement references unknown region: ${spawned.regionId}`);
        }
      }
    }
  }

  const initialVariables = value.initialVariables ?? {};
  object(initialVariables, 'Mission script initialVariables');
  return freeze({
    version: MISSION_SCRIPT_VERSION,
    id: id(value.id, 'Mission script id'),
    regions,
    initialVariables: json(initialVariables, 'Mission script initialVariables'),
    triggers,
  });
}

function definition(mission) {
  if (!mission) return null;
  if (mission.script) return mission.script;
  if (!mission.triggers?.length) return null;
  return {
    version: MISSION_SCRIPT_VERSION,
    id: `${mission.id}.script`,
    regions: mission.regions ?? [],
    initialVariables: mission.scriptVariables ?? {},
    triggers: mission.triggers,
  };
}

export function createMissionScriptState(script, { missionId = null } = {}) {
  const normalized = validateMissionScript(script);
  return {
    version: MISSION_SCRIPT_VERSION,
    scriptId: normalized.id,
    missionId,
    tick: 0,
    nextSequence: 1,
    variables: json(normalized.initialVariables),
    triggers: Object.fromEntries(normalized.triggers.map((trigger) => [
      trigger.id,
      { enabled: trigger.enabled, activations: 0, lastFiredTick: null },
    ])),
    pending: [],
    regionMatches: {},
    seenEntityIds: [],
    seenScriptIds: [],
  };
}

function queues(game) {
  game.dialogueQueue ??= [];
  game.cameraCues ??= [];
  game.missionScriptRecords ??= [];
}

function entities(game, collection = 'entities') {
  if (collection === 'units') return game.units ?? [];
  if (collection === 'buildings') return game.buildings ?? [];
  return [...(game.units ?? []), ...(game.buildings ?? [])];
}

function matches(entity, match) {
  if (match.id !== undefined && entity.id !== match.id) return false;
  if (match.scriptId !== undefined && entity.scriptId !== match.scriptId) return false;
  if (match.type !== undefined && entity.type !== match.type) return false;
  if (match.team !== undefined && entity.team !== match.team) return false;
  if (match.tag !== undefined && entity.scriptTag !== match.tag && !(entity.tags ?? []).includes(match.tag)) return false;
  return true;
}

const alive = (entity) => entity.hp === undefined || entity.hp > 0;

function remember(game, state) {
  const ids = new Set(state.seenEntityIds);
  const scriptIds = new Set(state.seenScriptIds);
  for (const entity of entities(game)) {
    if (entity.id !== undefined) ids.add(entity.id);
    if (entity.scriptId !== undefined) scriptIds.add(entity.scriptId);
  }
  state.seenEntityIds = [...ids].sort((a, b) => String(a).localeCompare(String(b)));
  state.seenScriptIds = [...scriptIds].sort();
}

export function initializeMissionScripts(game, script = definition(game?.mission)) {
  if (!game || typeof game !== 'object') throw new TypeError('Mission scripts require game state.');
  queues(game);
  if (!script) {
    game.missionScript = null;
    game.missionScriptState = null;
    return null;
  }
  game.missionScript = validateMissionScript(script);
  game.missionScriptState = createMissionScriptState(game.missionScript, {
    missionId: game.mission?.id ?? null,
  });
  remember(game, game.missionScriptState);
  return game.missionScriptState;
}

function ensure(game) {
  const source = definition(game.mission);
  if (!source) {
    if (game.missionScriptState) initializeMissionScripts(game, null);
    return null;
  }
  const scriptId = source.id ?? `${game.mission.id}.script`;
  if (!game.missionScriptState ||
      game.missionScriptState.missionId !== game.mission.id ||
      game.missionScriptState.scriptId !== scriptId) {
    initializeMissionScripts(game, source);
  }
  return game.missionScriptState;
}

function objectiveIndex(game, reference) {
  if (reference.index !== undefined) return reference.index;
  const index = game.mission?.objectiveIds?.indexOf(reference.id) ?? -1;
  return index >= 0 ? index : null;
}

function stateCount(game, state, item) {
  const found = entities(game, item.selector.collection).filter((entity) => matches(entity, item.selector));
  if (item.state === 'exists') return found.length;
  if (item.state === 'alive') return found.filter(alive).length;
  if (item.state === 'damaged') {
    return found.filter((entity) => alive(entity) && entity.hp < entity.maxHp).length;
  }
  if (item.state === 'underConstruction') {
    return found.filter((entity) => alive(entity) && entity.underConstruction === true).length;
  }
  if (item.state === 'completed') {
    return found.filter((entity) => alive(entity) && entity.underConstruction === false).length;
  }
  const seen = item.selector.id !== undefined
    ? state.seenEntityIds.includes(item.selector.id)
    : state.seenScriptIds.includes(item.selector.scriptId);
  return seen && !found.some(alive) ? 1 : 0;
}

function inside(region, entity) {
  if (!Number.isFinite(entity.x) || !Number.isFinite(entity.y)) return false;
  if (region.shape === 'circle') return Math.hypot(entity.x - region.x, entity.y - region.y) <= region.radius;
  return entity.x >= region.x && entity.x <= region.x + region.width &&
    entity.y >= region.y && entity.y <= region.y + region.height;
}

function evaluate(item, context, transitions) {
  const { game, script, state } = context;
  if (item.kind === 'all' || item.kind === 'any') {
    const results = item.conditions.map((child) => evaluate(child, context, transitions));
    return item.kind === 'all' ? results.every(Boolean) : results.some(Boolean);
  }
  if (item.kind === 'not') return !evaluate(item.condition, context, transitions);
  if (item.kind === 'timer') {
    return compare(item.clock === 'ticks' ? state.tick : game.time ?? 0, item.operator, item.value);
  }
  if (item.kind === 'region') {
    const targetRegion = script.regions.find((candidate) => candidate.id === item.regionId);
    const count = entities(game, item.selector.collection)
      .filter((entity) => matches(entity, item.selector))
      .filter((entity) => item.state === 'exists' ||
        (item.state === 'completed' ? alive(entity) && entity.underConstruction === false : alive(entity)))
      .filter((entity) => inside(targetRegion, entity)).length;
    const current = compare(count, item.operator, item.value);
    const previous = Boolean(state.regionMatches[item.key]);
    transitions[item.key] = current;
    return item.event === 'enter' ? current && !previous
      : item.event === 'exit' ? !current && previous
        : current;
  }
  if (item.kind === 'entity') return compare(stateCount(game, state, item), item.operator, item.value);
  if (item.kind === 'resource') return compare(game.player?.[item.resource] ?? 0, item.operator, item.value);
  if (item.kind === 'objective') {
    const index = objectiveIndex(game, item);
    const complete = index !== null && Boolean(game.player?.objectives?.[index]);
    return item.state === 'complete' ? complete : !complete;
  }
  return compare(state.variables[item.id], item.operator, item.value);
}

function record(game, state, type, triggerId, payload = {}) {
  const entry = freeze({
    type,
    tick: state.tick,
    sequence: state.nextSequence++,
    triggerId,
    payload: json(payload, `Mission script record ${type}`),
  });
  game.missionScriptRecords.push(entry);
  return entry;
}

function schedule(state, trigger, entry) {
  state.pending.push({
    dueTick: state.tick + trigger.delayTicks + entry.delayTicks,
    sequence: state.nextSequence++,
    triggerId: trigger.id,
    action: entry,
  });
}

function center(region) {
  return region.shape === 'circle'
    ? { x: region.x, y: region.y }
    : { x: region.x + region.width / 2, y: region.y + region.height / 2 };
}

function reinforce(game, script, state, triggerId, entry) {
  const spawned = [];
  for (const spec of entry.entities) {
    const base = spec.regionId
      ? center(script.regions.find((region) => region.id === spec.regionId))
      : { x: spec.x, y: spec.y };
    for (let index = 0; index < spec.count; index += 1) {
      const x = base.x + spec.spacingX * index;
      const y = base.y + spec.spacingY * index;
      const create = spec.kind === 'unit' ? game.addUnit?.bind(game) : game.addBuilding?.bind(game);
      if (!create) throw new TypeError(`Reinforcement action requires game.add${spec.kind === 'unit' ? 'Unit' : 'Building'}().`);
      const entity = spec.kind === 'unit'
        ? create(spec.type, entry.team, x, y)
        : create(spec.type, entry.team, x, y, spec.options);
      if (spec.scriptIdPrefix) entity.scriptId = `${spec.scriptIdPrefix}-${index + 1}`;
      if (spec.tag) entity.scriptTag = spec.tag;
      spawned.push({ id: entity.id ?? null, scriptId: entity.scriptId ?? null, kind: spec.kind, type: spec.type, x, y });
    }
  }
  remember(game, state);
  record(game, state, RECORD.REINFORCEMENT, triggerId, { team: entry.team, label: entry.label, spawned });
}

function apply(game, script, state, triggerId, entry) {
  if (entry.kind === 'setVariable' || entry.kind === 'addVariable') {
    const current = state.variables[entry.id] ?? 0;
    if (entry.kind === 'addVariable' && !Number.isFinite(current)) {
      throw new TypeError(`Mission variable ${entry.id} must be numeric before addVariable.`);
    }
    state.variables[entry.id] = entry.kind === 'setVariable' ? json(entry.value) : current + entry.amount;
    record(game, state, RECORD.VARIABLE, triggerId, { id: entry.id, value: state.variables[entry.id] });
  } else if (entry.kind === 'setResource' || entry.kind === 'addResource') {
    if (!game.player) throw new TypeError('Resource actions require game.player.');
    game.player[entry.resource] = Math.max(
      0,
      entry.kind === 'setResource' ? entry.amount : Number(game.player[entry.resource] ?? 0) + entry.amount,
    );
    record(game, state, RECORD.RESOURCE, triggerId, { resource: entry.resource, value: game.player[entry.resource] });
  } else if (entry.kind === 'setObjective') {
    const index = objectiveIndex(game, entry);
    if (index === null || !game.player?.objectives || index >= game.player.objectives.length) {
      throw new Error(`Mission script could not resolve objective ${entry.id ?? entry.index}.`);
    }
    game.player.objectives[index] = entry.complete;
    record(game, state, RECORD.OBJECTIVE, triggerId, {
      index, id: entry.id ?? game.mission?.objectiveIds?.[index] ?? null, complete: entry.complete,
    });
  } else if (entry.kind === 'dialogue') {
    const cue = freeze({
      tick: state.tick,
      triggerId,
      speaker: entry.speaker,
      text: entry.text,
      portrait: entry.portrait,
      durationSeconds: entry.durationSeconds,
      metadata: json(entry.metadata),
    });
    game.dialogueQueue.push(cue);
    record(game, state, RECORD.DIALOGUE, triggerId, cue);
  } else if (entry.kind === 'reinforcement') reinforce(game, script, state, triggerId, entry);
  else if (entry.kind === 'camera') {
    const cue = freeze({
      tick: state.tick,
      triggerId,
      x: entry.x,
      y: entry.y,
      zoom: entry.zoom,
      durationSeconds: entry.durationSeconds,
      label: entry.label,
    });
    game.cameraCues.push(cue);
    game.cameraCue = cue;
    record(game, state, RECORD.CAMERA, triggerId, cue);
  } else if (entry.kind === 'weather') {
    game.weather = entry.weatherId === null ? null : freeze({
      id: entry.weatherId,
      intensity: entry.intensity,
      transitionSeconds: entry.transitionSeconds,
      startedAt: game.time ?? 0,
      endsAt: entry.durationSeconds === null ? null : (game.time ?? 0) + entry.durationSeconds,
      source: script.id,
    });
    record(game, state, RECORD.WEATHER, triggerId, { weather: game.weather });
  } else if (entry.kind === 'finish') {
    if (game.finish) game.finish(entry.result, entry.reason);
    else Object.assign(game, { gameOver: true, outcome: entry.result, endReason: entry.reason });
    record(game, state, RECORD.OUTCOME, triggerId, { result: entry.result, reason: entry.reason });
  } else {
    state.triggers[entry.triggerId].enabled = entry.kind === 'enableTrigger';
    record(game, state, RECORD.CONTROL, triggerId, {
      triggerId: entry.triggerId,
      enabled: state.triggers[entry.triggerId].enabled,
    });
  }
}

function execute(game, script, state) {
  const due = state.pending
    .filter((entry) => entry.dueTick <= state.tick)
    .sort((left, right) => left.dueTick - right.dueTick || left.sequence - right.sequence);
  if (!due.length) return;
  const sequences = new Set(due.map((entry) => entry.sequence));
  state.pending = state.pending.filter((entry) => !sequences.has(entry.sequence));
  for (const entry of due) apply(game, script, state, entry.triggerId, entry.action);
}

function expireWeather(game, script, state) {
  if (game.weather?.source === script.id &&
      game.weather.endsAt !== null &&
      (game.time ?? 0) >= game.weather.endsAt) {
    game.weather = null;
    record(game, state, RECORD.WEATHER, null, { weather: null, expired: true });
  }
}

export function updateMissionScripts(game, stepSeconds = null) {
  if (!game || typeof game !== 'object') throw new TypeError('Mission scripts require game state.');
  if (stepSeconds !== null) number(stepSeconds, 'Mission script stepSeconds', { min: 0 });
  if (game.gameOver) return [];

  const state = ensure(game);
  if (!state) return [];
  const script = game.missionScript;
  queues(game);
  const start = game.missionScriptRecords.length;

  state.tick += 1;
  remember(game, state);
  expireWeather(game, script, state);

  const transitions = {};
  for (const trigger of script.triggers) {
    const runtime = state.triggers[trigger.id];
    if (!runtime.enabled) continue;
    if (trigger.maxActivations !== null && runtime.activations >= trigger.maxActivations) continue;
    if (runtime.lastFiredTick !== null &&
        state.tick - runtime.lastFiredTick <= trigger.cooldownTicks) continue;
    if (!evaluate(trigger.when, { game, script, state }, transitions)) continue;

    runtime.activations += 1;
    runtime.lastFiredTick = state.tick;
    if (trigger.once) runtime.enabled = false;
    record(game, state, RECORD.TRIGGER, trigger.id, { activations: runtime.activations });
    trigger.actions.forEach((entry) => schedule(state, trigger, entry));
  }
  Object.assign(state.regionMatches, transitions);

  // All due actions run after trigger evaluation, preventing same-tick cascades.
  execute(game, script, state);
  return game.missionScriptRecords.slice(start);
}

export function updateMissionScriptObjectivePhase(game, stepSeconds = null) {
  const records = updateMissionScripts(game, stepSeconds);
  if (!game.gameOver && game.mission?.objectiveMode !== 'scripted') game.updateObjectives();
  return records;
}

export function drainMissionScriptRecords(game) {
  if (!Array.isArray(game?.missionScriptRecords)) return [];
  const records = game.missionScriptRecords;
  game.missionScriptRecords = [];
  return records;
}
