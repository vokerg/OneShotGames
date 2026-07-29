export const DOMAIN_EVENT_TYPES = Object.freeze({
  SHOT: 'combat.shot',
  IMPACT: 'combat.impact',
  DEATH: 'entity.death',
  PRODUCTION: 'economy.production',
  RESEARCH: 'economy.research',
  OBJECTIVE: 'mission.objective',
  ALERT: 'ui.alert',
  AUDIO: 'audio.request',
  TELEMETRY: 'telemetry.sample',
  REPLAY: 'replay.record',
});

const KNOWN_TYPES = new Set(Object.values(DOMAIN_EVENT_TYPES));

function freezeEvent(event) {
  if (event.payload && typeof event.payload === 'object') Object.freeze(event.payload);
  return Object.freeze(event);
}

export class DomainEventStream {
  #events = [];
  #listeners = new Map();
  #nextSequence = 1;
  #tick = 0;

  constructor({ allowedTypes = KNOWN_TYPES } = {}) {
    this.allowedTypes = new Set(allowedTypes);
  }

  setTick(tick) {
    if (!Number.isInteger(tick) || tick < 0) throw new TypeError('Domain event tick must be a non-negative integer.');
    this.#tick = tick;
  }

  emit(type, payload = {}, metadata = {}) {
    if (!this.allowedTypes.has(type)) throw new Error(`Unknown domain event type: ${type}`);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new TypeError('Domain event payload must be an object.');
    }
    const tick = metadata.tick ?? this.#tick;
    if (!Number.isInteger(tick) || tick < 0) throw new TypeError('Domain event tick must be a non-negative integer.');

    const event = freezeEvent({
      type,
      tick,
      sequence: this.#nextSequence++,
      source: metadata.source ?? null,
      payload: { ...payload },
    });
    this.#events.push(event);

    for (const listener of this.#listeners.get(type) ?? []) listener(event);
    for (const listener of this.#listeners.get('*') ?? []) listener(event);
    return event;
  }

  subscribe(type, listener) {
    if (type !== '*' && !this.allowedTypes.has(type)) throw new Error(`Unknown domain event type: ${type}`);
    if (typeof listener !== 'function') throw new TypeError('Domain event listener must be a function.');
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.#listeners.delete(type);
    };
  }

  peek() {
    return this.#events.slice();
  }

  drain() {
    const events = this.#events;
    this.#events = [];
    return events;
  }

  clear() {
    this.#events = [];
  }

  get size() {
    return this.#events.length;
  }
}

export function createDomainEventStream(options) {
  return new DomainEventStream(options);
}
