import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const TASK_ID_PATTERN = /^UFR-(\d{3})$/;
const DEPENDENCY_CLAUSE_PATTERN = /^(UFR-\d{3})(?:\s+through\s+(UFR-\d{3}))?$/;
const EXPECTED_COLUMNS = [
  'ID',
  'P',
  'Lane',
  'Entry point',
  'Deliverable and acceptance',
  'Depends',
  'Parallel',
];

function splitTableRow(line) {
  const cells = [];
  let cell = '';
  let escaped = false;

  for (const character of line.trim()) {
    if (escaped) {
      cell += character;
      escaped = false;
      continue;
    }

    if (character === '\\') {
      cell += character;
      escaped = true;
      continue;
    }

    if (character === '|') {
      cells.push(cell.trim().replaceAll('\\|', '|'));
      cell = '';
      continue;
    }

    cell += character;
  }
  cells.push(cell.trim().replaceAll('\\|', '|'));

  if (cells[0] === '') cells.shift();
  if (cells.at(-1) === '') cells.pop();
  return cells;
}

function taskNumber(taskId) {
  const match = TASK_ID_PATTERN.exec(taskId);
  return match ? Number(match[1]) : null;
}

function addError(errors, lineNumber, message) {
  errors.push(`line ${lineNumber}: ${message}`);
}

function parseDependencies(task, knownIds, errors) {
  if (task.depends === '—') return [];

  const dependencies = [];
  const clauses = task.depends.split(',').map((clause) => clause.trim());
  if (clauses.some((clause) => clause === '')) {
    addError(errors, task.lineNumber, `${task.id}: dependency list contains an empty item`);
    return dependencies;
  }

  for (const clause of clauses) {
    const match = DEPENDENCY_CLAUSE_PATTERN.exec(clause);
    if (!match) {
      addError(
        errors,
        task.lineNumber,
        `${task.id}: invalid dependency clause "${clause}"; use UFR-### or UFR-### through UFR-###`,
      );
      continue;
    }

    const start = taskNumber(match[1]);
    const end = taskNumber(match[2] ?? match[1]);
    if (start > end) {
      addError(errors, task.lineNumber, `${task.id}: dependency range "${clause}" is descending`);
      continue;
    }

    for (let number = start; number <= end; number += 1) {
      const dependencyId = `UFR-${String(number).padStart(3, '0')}`;
      dependencies.push(dependencyId);
      if (!knownIds.has(dependencyId)) {
        addError(errors, task.lineNumber, `${task.id}: dependency ${dependencyId} does not exist`);
      }
      if (dependencyId === task.id) {
        addError(errors, task.lineNumber, `${task.id}: task cannot depend on itself`);
      }
    }
  }

  return [...new Set(dependencies)];
}

function findDependencyCycles(tasks, dependenciesById, errors) {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const state = new Map();
  const stack = [];
  const reported = new Set();

  function visit(taskId) {
    const currentState = state.get(taskId) ?? 0;
    if (currentState === 2) return;
    if (currentState === 1) {
      const cycleStart = stack.indexOf(taskId);
      const cycle = [...stack.slice(cycleStart), taskId];
      const signature = cycle.join(' -> ');
      if (!reported.has(signature)) {
        reported.add(signature);
        addError(errors, taskById.get(taskId)?.lineNumber ?? 1, `dependency cycle: ${signature}`);
      }
      return;
    }

    state.set(taskId, 1);
    stack.pushhtaskId);
    for (const dependencyId of dependenciesById.get(taskId) ?? []) {
      if (taskById.has(dependencyId)) visit(dependencyId);
    }
    stack.pop();
    state.set(taskId, 2);
  }

  tasks.forEach((task) => visit(task.id));
}

export function parseTaskQueue(markdown) {
  const lines = markdown.split(/\r?\n/);
  const tasks = [];
  const errors = [];
  let sawExpectedHeader = false;

  lines.forEach((line, index) => {
    if (!line.trim().startsWith('|')) return;

    const cells = splitTableRow(line);
    if (cells.length === EXPECTED_COLUMNS.length && cells.every((cell, cellIndex) => cell === EXPECTED_COLUMNS[cellIndex])) {
      sawExpectedHeader = true;
      return;
    }

    const candidateId = cells[0] ?? '';
    if (!candidateId.startsWith('UFR-')) return;

    const lineNumber = index + 1;
    if (cells.length !== EXPECTED_COLUMNS.length) {
      addError(
        errors,
        lineNumber,
        `${candidateId || 'task row'}: expected ${EXPECTED_COLUMNS.length} fields, found ${cells.length}`,
      );
    }

    const padded = [...cells, ...Array(EXPECTED_COLUMNS.length).fill('')].slice(0, EXPECTED_COLUMNS.length);
    const [id, priority, lane, entryPoint, deliverable, depends, parallel] = padded;
    const task = { id, priority, lane, entryPoint, deliverable, depends, parallel, lineNumber };
    tasks.push(task);

    EXPECTED_COLUMNS.forEach((column, cellIndex) => {
      if (!padded[cellIndex].trim()) addError(errors, lineNumber, `${id || 'task row'}: missing required field "${column}"`);
    });

    if (!TASK_ID_PATTERN.test(id)) addError(errors, lineNumber, `${id || 'task row'}: ID must match UFR-###`);
    if (!/^P[0-3]$/.test(priority)) addError(errors, lineNumber, `${id}: priority must be P0, P1, P2, or P3`);
    if (!/^(YES|LIMITED|NO)\s+—\s+\S/.test(parallel)) {
      addError(errors, lineNumber, `${id}: Parallel must start with YES, LIMITED, or NO and include explanatory text after an em dash`);
    }
  });

  if (!sawExpectedHeader) {
    addError(errors, 1, `missing task table header: ${EXPECTED_COLUMNS.join(' | ')}`);
  }
  if (tasks.length === 0) addError(errors, 1, 'no task rows found');

  return { tasks, errors };
}

export function validateTaskQueue(markdown) {
  const { tasks, errors } = parseTaskQueue(markdown);
  const seen = new Map();
  let previousNumber = null;
  let previousId = null;

  for (const task of tasks) {
    if (seen.has(task.id)) {
      addError(errors, task.lineNumber, `${task.id}: duplicate ID; first declared on line ${seen.get(task.id)}`);
    } else {
      seen.set(task.id, task.lineNumber);
    }

    const number = taskNumber(task.id);
    if (number !== null && previousNumber !== null && number <= previousNumber) {
      addError(errors, task.lineNumber, `${task.id}: IDs must increase monotonically after ${previousId}`);
    }
    if (number !== null) {
      previousNumber = number;
      previousId = task.id;
    }
  }

  const knownIds = new Set(tasks.filter((task) => TASK_ID_PATTERN.test(task.id)).map((task) => task.id));
  const dependenciesById = new Map();
  for (const task of tasks) {
    dependenciesById.set(task.id, parseDependencies(task, knownIds, errors));
  }
  findDependencyCycles(tasks, dependenciesById, errors);

  return { tasks, errors };
}

function runCli() {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const queuePath = resolve(process.argv[2] ?? resolve(projectRoot, 'TASKS.md'));
  const markdown = readFileSync(queuePath, 'utf8');
  const { tasks, errors } = validateTaskQueue(markdown);

  if (errors.length) {
    console.error(`Task queue verification failed for ${queuePath}:`);
    errors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
    return;
  }

  console.log(`Task queue verification passed for ${tasks.length} tasks.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) runCli();
