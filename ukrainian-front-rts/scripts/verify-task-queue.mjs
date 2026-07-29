import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const COLUMNS = [
  'ID',
  'P',
  'Lane',
  'Entry point',
  'Deliverable and acceptance',
  'Depends',
  'Parallel',
];
const ID_PATTERN = /^UFR-(\d{3})$/;
const DEPENDENCY_PATTERN = /^(UFR-\d{3})(?:\s+through\s+(UFR-\d{3}))?$/;

function splitRow(line) {
  const cells = [];
  let cell = '';
  let escaped = false;

  for (const character of line.trim()) {
    if (escaped) {
      cell += character;
      escaped = false;
    } else if (character === '\\') {
      cell += character;
      escaped = true;
    } else if (character === '|') {
      cells.push(cell.trim().replaceAll('\\|', '|'));
      cell = '';
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim().replaceAll('\\|', '|'));
  if (cells[0] === '') cells.shift();
  if (cells.at(-1) === '') cells.pop();
  return cells;
}

function numberOf(id) {
  const match = ID_PATTERN.exec(id);
  return match ? Number(match[1]) : null;
}

function report(errors, line, message) {
  errors.push(`line ${line}: ${message}`);
}

export function parseTaskQueue(markdown) {
  const tasks = [];
  const errors = [];
  let hasHeader = false;

  markdown.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim().startsWith('|')) return;
    const cells = splitRow(line);

    if (cells.length === COLUMNS.length && cells.every((cell, i) => cell === COLUMNS[i])) {
      hasHeader = true;
      return;
    }

    const candidateId = cells[0] ?? '';
    if (!candidateId.startsWith('UFR-')) return;

    const lineNumber = index + 1;
    if (cells.length !== COLUMNS.length) {
      report(errors, lineNumber, `${candidateId}: expected ${COLUMNS.length} fields, found ${cells.length}`);
    }

    const values = [...cells, ...Array(COLUMNS.length).fill('')].slice(0, COLUMNS.length);
    const [id, priority, lane, entryPoint, deliverable, depends, parallel] = values;
    tasks.push({ id, priority, lane, entryPoint, deliverable, depends, parallel, lineNumber });

    values.forEach((value, i) => {
      if (!value.trim()) report(errors, lineNumber, `${id}: missing required field "${COLUMNS[i]}"`);
    });
    if (!ID_PATTERN.test(id)) report(errors, lineNumber, `${id}: ID must match UFR-###`);
    if (!/^P[0-3]$/.test(priority)) report(errors, lineNumber, `${id}: priority must be P0, P1, P2, or P3`);
    if (!/^(YES|LIMITED|NO)\s+—\s+\S/.test(parallel)) {
      report(
        errors,
        lineNumber,
        `${id}: Parallel must start with YES, LIMITED, or NO and include explanatory text after an em dash`,
      );
    }
  });

  if (!hasHeader) report(errors, 1, `missing task table header: ${COLUMNS.join(' | ')}`);
  if (tasks.length === 0) report(errors, 1, 'no task rows found');
  return { tasks, errors };
}

export function validateTaskQueue(markdown) {
  const { tasks, errors } = parseTaskQueue(markdown);
  const seen = new Map();
  let previousNumber = null;
  let previousId = null;

  for (const task of tasks) {
    if (seen.has(task.id)) {
      report(errors, task.lineNumber, `${task.id}: duplicate ID; first declared on line ${seen.get(task.id)}`);
    } else {
      seen.set(task.id, task.lineNumber);
    }

    const number = numberOf(task.id);
    if (number !== null && previousNumber !== null && number <= previousNumber) {
      report(errors, task.lineNumber, `${task.id}: IDs must increase monotonically after ${previousId}`);
    }
    if (number !== null) {
      previousNumber = number;
      previousId = task.id;
    }
  }

  const knownIds = new Set(tasks.filter((task) => ID_PATTERN.test(task.id)).map((task) => task.id));
  for (const task of tasks) {
    if (task.depends === '—') continue;
    const clauses = task.depends.split(',').map((clause) => clause.trim());
    if (clauses.some((clause) => clause === '')) {
      report(errors, task.lineNumber, `${task.id}: dependency list contains an empty item`);
      continue;
    }

    for (const clause of clauses) {
      const match = DEPENDENCY_PATTERN.exec(clause);
      if (!match) {
        report(
          errors,
          task.lineNumber,
          `${task.id}: invalid dependency clause "${clause}"; use UFR-### or UFR-### through UFR-###`,
        );
        continue;
      }

      const start = numberOf(match[1]);
      const end = numberOf(match[2] ?? match[1]);
      if (start > end) {
        report(errors, task.lineNumber, `${task.id}: dependency range "${clause}" is descending`);
        continue;
      }

      for (let number = start; number <= end; number += 1) {
        const dependencyId = `UFR-${String(number).padStart(3, '0')}`;
        if (!knownIds.has(dependencyId)) {
          report(errors, task.lineNumber, `${task.id}: dependency ${dependencyId} does not exist`);
        }
        if (dependencyId === task.id) {
          report(errors, task.lineNumber, `${task.id}: task cannot depend on itself`);
        }
      }
    }
  }

  return { tasks, errors };
}

function runCli() {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const queuePath = resolve(process.argv[2] ?? resolve(projectRoot, 'TASKS.md'));
  const { tasks, errors } = validateTaskQueue(readFileSync(queuePath, 'utf8'));

  if (errors.length) {
    console.error(`Task queue verification failed for ${queuePath}:`);
    errors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
  } else {
    console.log(`Task queue verification passed for ${tasks.length} tasks.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCli();
