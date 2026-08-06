import { writeFileSync } from 'node:fs';

import { runDefaultBalanceSuite } from '../src/app/balance-simulation.js';
import { serializeBalanceSnapshot } from '../src/core/balance-snapshot.js';

function parseInteger(value, label, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new RangeError(`${label} must be a positive integer.`);
  return parsed;
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith('--')) throw new Error(`Unknown positional argument: ${argument}`);
    const [key, inlineValue] = argument.slice(2).split('=', 2);
    const value = inlineValue ?? args[index + 1];
    if (inlineValue === undefined) index += 1;
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}.`);
    options[key] = value;
  }
  return options;
}

try {
  const options = parseArgs(process.argv.slice(2));
  const snapshot = runDefaultBalanceSuite({
    iterations: parseInteger(options.iterations, 'iterations', 5),
    missionIndex: parseInteger(options.mission, 'mission', 1) - 1,
    maxTicks: parseInteger(options.ticks, 'ticks', 900),
    baseSeed: options.seed || 'default-balance-suite-v1',
    sourceRevision: process.env.GITHUB_SHA || options.revision || 'working-tree',
  });
  const output = serializeBalanceSnapshot(snapshot);
  if (options.output) {
    writeFileSync(options.output, output, 'utf8');
    console.log(`[balance] wrote ${snapshot.batches.length} batches to ${options.output}`);
  } else {
    process.stdout.write(output);
  }
} catch (error) {
  console.error(`[balance] ${error.stack || error.message}`);
  process.exitCode = 1;
}
