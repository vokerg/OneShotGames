const CHECKPOINT_SCHEMA = 'fields-of-resolve/battlefield-checkpoint';
const CHECKPOINT_VERSION = 1;
const DEFAULT_PREFIX = 'fields-of-resolve.checkpoint.';

const TRANSIENT_GAME_KEYS = new Set([
  'events',
  'domainEvents',
  'mission',
]);

function containsUnsupportedValue(value, seen = new Set()) {
  if (value == null) return false;
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') return true;
  if (typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (typeof Node !== 'undefined' && value instanceof Node) return true;
  for (const entry of value instanceof Map ? [...value.entries()].flat() : value instanceof Set ? value : Object.values(value)) {
    if (containsUnsupportedValue(entry, seen)) return true;
  }
  return false;
}

function encodeGraph(root) {
  const ids = new Map();
  let nextId = 1;

  const encode = (value) => {
    if (value == null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (Number.isNaN(value)) return { $number: 'NaN' };
      if (value === Infinity) return { $number: 'Infinity' };
      if (value === -Infinity) return { $number: '-Infinity' };
      return value;
    }
    if (typeof value !== 'object') throw new TypeError(`Unsupported checkpoint value: ${typeof value}`);
    if (ids.has(value)) return { $ref: ids.get(value) };

    const id = nextId++;
    ids.set(value, id);
    if (Array.isArray(value)) return { $id: id, $type: 'array', value: value.map(encode) };
    if (value instanceof Set) return { $id: id, $type: 'set', value: [...value].map(encode) };
    if (value instanceof Map) {
      return { $id: id, $type: 'map', value: [...value.entries()].map(([key, entry]) => [encode(key), encode(entry)]) };
    }
    return {
      $id: id,
      $type: 'object',
      value: Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, encode(entry)])),
    };
  };

  return encode(root);
}

function decodeGraph(encoded) {
  const objects = new Map();

  const allocate = (node) => {
    if (node == null || typeof node !== 'object' || '$number' in node || '$ref' in node) return;
    if ('$id' in node && !objects.has(node.$id)) {
      const target = node.$type === 'array' ? [] : node.$type === 'set' ? new Set() : node.$type === 'map' ? new Map() : {};
      objects.set(node.$id, target);
      if (node.$type === 'array') node.value.forEach(allocate);
      else if (node.$type === 'set') node.value.forEach(allocate);
      else if (node.$type === 'map') node.value.flat().forEach(allocate);
      else Object.values(node.value).forEach(allocate);
    }
  };

  const hydrate = (node) => {
    if (node == null || typeof node !== 'object') return node;
    if ('$number' in node) {
      if (node.$number === 'NaN') return NaN;
      if (node.$number === 'Infinity') return Infinity;
      return -Infinity;
    }
    if ('$ref' in node) {
      if (!objects.has(node.$ref)) throw new Error(`Checkpoint references missing object ${node.$ref}.`);
      return objects.get(node.$ref);
    }
    const target = objects.get(node.$id);
    if (!target) throw new Error(`Checkpoint object ${node.$id} was not allocated.`);
    if (node.$type === 'array') node.value.forEach((entry) => target.push(hydrate(entry)));
    else if (node.$type === 'set') node.value.forEach((entry) => target.add(hydrate(entry)));
    else if (node.$type === 'map') node.value.forEach(([key, entry]) => target.set(hydrate(key), hydrate(entry)));
    else Object.entries(node.value).forEach(([key, entry]) => { target[key] = hydrate(entry); });
    return target;
  };

  allocate(encoded);
  return hydrate(encoded);
}

function captureOwnState(game) {
  const state = {};
  for (const [key, value] of Object.entries(game)) {
    if (TRANSIENT_GAME_KEYS.has(key) || typeof value === 'function') continue;
    if (containsUnsupportedValue(value)) continue;
    state[key] = value;
  }
  return state;
}

export function createBattlefieldCheckpoint(game, { now = () => new Date().toISOString() } = {}) {
  if (!game?.mission) throw new Error('A mission must be active before saving a checkpoint.');
  return Object.freeze({
    schema: CHECKPOINT_SCHEMA,
    version: CHECKPOINT_VERSION,
    savedAt: now(),
    missionIndex: game.missionIndex,
    state: encodeGraph(captureOwnState(game)),
  });
}

export function restoreBattlefieldCheckpoint(game, checkpoint) {
  if (checkpoint?.schema !== CHECKPOINT_SCHEMA || checkpoint?.version !== CHECKPOINT_VERSION) {
    throw new Error('Unsupported or corrupt battlefield checkpoint.');
  }
  if (!Number.isInteger(checkpoint.missionIndex) || checkpoint.missionIndex < 0) {
    throw new Error('Checkpoint mission index is invalid.');
  }

  game.start(checkpoint.missionIndex);
  const state = decodeGraph(checkpoint.state);
  for (const [key, value] of Object.entries(state)) {
    if (TRANSIENT_GAME_KEYS.has(key) || typeof game[key] === 'function') continue;
    game[key] = value;
  }
  if (!(game.selected instanceof Set)) game.selected = new Set(game.selected ?? []);
  if (game.player && !(game.player.upgrades instanceof Set)) {
    game.player.upgrades = new Set(game.player.upgrades ?? []);
  }
  return game;
}

export function createBattlefieldCheckpointStore({ storage, prefix = DEFAULT_PREFIX } = {}) {
  const keyFor = (slot) => {
    if (!Number.isInteger(slot) || slot < 1 || slot > 3) throw new RangeError('Checkpoint slot must be 1, 2, or 3.');
    return `${prefix}${slot}`;
  };

  const read = (slot) => {
    if (!storage) return null;
    const serialized = storage.getItem(keyFor(slot));
    if (!serialized) return null;
    const checkpoint = JSON.parse(serialized);
    if (checkpoint?.schema !== CHECKPOINT_SCHEMA || checkpoint?.version !== CHECKPOINT_VERSION) return null;
    return checkpoint;
  };

  return Object.freeze({
    available: Boolean(storage),
    save(slot, game) {
      if (!storage) throw new Error('Checkpoint storage is unavailable.');
      const checkpoint = createBattlefieldCheckpoint(game);
      storage.setItem(keyFor(slot), JSON.stringify(checkpoint));
      return checkpoint;
    },
    load(slot, game) {
      const checkpoint = read(slot);
      if (!checkpoint) throw new Error(`Checkpoint slot ${slot} is empty.`);
      return restoreBattlefieldCheckpoint(game, checkpoint);
    },
    read,
    list() {
      return [1, 2, 3].map((slot) => {
        try {
          const checkpoint = read(slot);
          return Object.freeze({ slot, savedAt: checkpoint?.savedAt ?? null, missionIndex: checkpoint?.missionIndex ?? null });
        } catch {
          return Object.freeze({ slot, savedAt: null, missionIndex: null, corrupt: true });
        }
      });
    },
  });
}
