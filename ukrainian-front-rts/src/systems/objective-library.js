const freeze = (value) => Object.freeze(value);
const number = (value) => Number.isFinite(value) ? value : 0;

export const OBJECTIVE_TYPES = freeze(['build', 'gather', 'capture', 'escort', 'defend', 'survive', 'destroy', 'disable', 'rescue', 'recon', 'extract']);

export function validateObjectiveDefinition(objective) {
  const errors = [];
  if (!objective || typeof objective !== 'object') return freeze(['objective must be an object']);
  if (!objective.id) errors.push('missing id');
  if (!OBJECTIVE_TYPES.includes(objective.type)) errors.push(`unsupported type ${objective.type}`);
  if (objective.optional && objective.hidden) errors.push('objective cannot be both optional and hidden');
  if (objective.timeLimit != null && number(objective.timeLimit) <= 0) errors.push('timeLimit must be positive');
  return freeze(errors);
}

export function evaluateObjective(objective, state = {}) {
  const errors = validateObjectiveDefinition(objective);
  if (errors.length) return freeze({ id: objective?.id ?? '', status: 'invalid', progress: 0, errors });
  let current = 0;
  let target = Math.max(1, number(objective.target ?? 1));
  switch (objective.type) {
    case 'build': current = number(state.built?.[objective.contentId]); break;
    case 'gather': current = number(state.resources?.[objective.resource]); break;
    case 'capture': current = number(state.captured?.[objective.targetId]); break;
    case 'escort': current = number(state.escorted?.[objective.targetId]); break;
    case 'defend': current = number(state.defendedTicks); target = Math.max(1, number(objective.duration)); break;
    case 'survive': current = number(state.elapsed); target = Math.max(1, number(objective.duration)); break;
    case 'destroy': current = number(state.destroyed?.[objective.targetId]); break;
    case 'disable': current = number(state.disabled?.[objective.targetId]); break;
    case 'rescue': current = number(state.rescued?.[objective.targetId]); break;
    case 'recon': current = number(state.recon?.[objective.regionId]); break;
    case 'extract': current = number(state.extracted?.[objective.targetId]); break;
  }
  const elapsed = number(state.elapsed);
  const failed = Boolean(state.failed) || Boolean(objective.timeLimit && elapsed > objective.timeLimit && current < target);
  const completed = current >= target;
  return freeze({ id: objective.id, status: failed ? 'failed' : completed ? 'completed' : 'active', progress: Math.max(0, Math.min(1, current / target)), current, target, optional: Boolean(objective.optional), hidden: Boolean(objective.hidden), timed: Boolean(objective.timeLimit) });
}

export function evaluateObjectiveSet(definitions, state = {}) {
  const results = definitions.map((objective) => evaluateObjective(objective, state[objective.id] ?? state));
  const required = results.filter((result, index) => !definitions[index].optional);
  return freeze({ results: freeze(results), completed: required.every((result) => result.status === 'completed'), failed: required.some((result) => result.status === 'failed') });
}
