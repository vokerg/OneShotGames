const freeze = (value) => Object.freeze(value);
const list = (value) => Array.isArray(value) ? value : [];
const number = (value) => Number.isFinite(value) ? value : 0;

export function createEconomyHudModel(state = {}) {
  const queues = list(state.productionQueues).map((queue) => freeze({
    id: String(queue.id), structureId: String(queue.structureId ?? ''), paused: Boolean(queue.paused), repeat: Boolean(queue.repeat),
    rally: queue.rally ? freeze({ x: number(queue.rally.x), y: number(queue.rally.y) }) : null,
    items: list(queue.items).map((item, index) => freeze({ id: String(item.id ?? `${queue.id}:${index}`), contentId: String(item.contentId ?? ''), progress: Math.max(0, Math.min(1, number(item.progress))), canCancel: item.canCancel !== false, canMoveUp: index > 0, canMoveDown: index < list(queue.items).length - 1 })),
  }));
  const research = list(state.researchQueues).map((item) => freeze({ id: String(item.id), researchId: String(item.researchId ?? ''), structureId: String(item.structureId ?? ''), progress: Math.max(0, Math.min(1, number(item.progress))), paused: Boolean(item.paused), canCancel: item.canCancel !== false }));
  const prerequisites = list(state.prerequisites).map((entry) => freeze({ contentId: String(entry.contentId ?? ''), available: Boolean(entry.available), reasons: freeze(list(entry.reasons).map(String)) }));
  const income = freeze(Object.fromEntries(Object.entries(state.incomeRates ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, number(value)])));
  const capacity = freeze({ used: Math.max(0, number(state.capacity?.used)), reserved: Math.max(0, number(state.capacity?.reserved)), limit: Math.max(0, number(state.capacity?.limit)), forecast: Math.max(0, number(state.capacity?.forecast ?? state.capacity?.used)) });
  return freeze({ queues: freeze(queues), research: freeze(research), prerequisites: freeze(prerequisites), income, capacity });
}

export function createEconomyHudCommands(model) {
  const commands = [];
  for (const queue of model.queues) {
    for (const item of queue.items) {
      if (item.canCancel) commands.push(freeze({ type: 'cancel-production', queueId: queue.id, itemId: item.id }));
      if (item.canMoveUp) commands.push(freeze({ type: 'move-production', queueId: queue.id, itemId: item.id, direction: -1 }));
      if (item.canMoveDown) commands.push(freeze({ type: 'move-production', queueId: queue.id, itemId: item.id, direction: 1 }));
    }
    commands.push(freeze({ type: queue.paused ? 'resume-production' : 'pause-production', queueId: queue.id }));
    commands.push(freeze({ type: 'set-production-repeat', queueId: queue.id, repeat: !queue.repeat }));
  }
  for (const item of model.research) if (item.canCancel) commands.push(freeze({ type: 'cancel-research', researchQueueId: item.id }));
  return freeze(commands);
}
