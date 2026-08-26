import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  createSinglePlayerReleaseGateTemplate,
  evaluateSinglePlayerReleaseGate,
} from './lib/single-player-release-gate.mjs';

function usage() {
  return [
    'Usage:',
    '  node scripts/single-player-release-gate.mjs --init <commit> --output <path>',
    '  node scripts/single-player-release-gate.mjs --input <path>',
  ].join('\n');
}

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  if (index < 0) return null;
  return args[index + 1] ?? null;
}

const args = process.argv.slice(2);
const initCommit = valueAfter(args, '--init');
const inputPath = valueAfter(args, '--input');
const outputPath = valueAfter(args, '--output');

if (initCommit) {
  if (!outputPath || inputPath) {
    console.error(usage());
    process.exit(1);
  }
  const target = resolve(outputPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(createSinglePlayerReleaseGateTemplate(initCommit), null, 2)}\n`);
  process.stdout.write(`[single-player-release-gate] initialized ${target}\n`);
  process.exit(0);
}

if (!inputPath || outputPath) {
  console.error(usage());
  process.exit(1);
}

try {
  const input = JSON.parse(await readFile(resolve(inputPath), 'utf8'));
  const report = evaluateSinglePlayerReleaseGate(input);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(report.verdict === 'PASS' ? 0 : report.verdict === 'BLOCKED' ? 2 : 1);
} catch (error) {
  console.error(`[single-player-release-gate] ${error?.message || error}`);
  process.exit(1);
}
