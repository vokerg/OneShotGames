import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createReleaseCandidateEvidenceTemplate,
  evaluateReleaseCandidateEvidence,
} from './lib/release-candidate-qa.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function usage() {
  console.error('Usage: node scripts/release-candidate-qa.mjs --input <evidence.json> [--output <report.json>]');
  console.error('   or: node scripts/release-candidate-qa.mjs --init <40-char-commit> --output <evidence.json>');
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!['--input', '--output', '--init'].includes(flag)) throw new Error(`Unknown argument ${flag}.`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
    args[flag.slice(2)] = value;
    index += 1;
  }
  return args;
}

function projectPath(path) {
  return resolve(projectRoot, path);
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.init) {
    if (!args.output || args.input) throw new Error('--init requires --output and cannot be combined with --input.');
    const template = createReleaseCandidateEvidenceTemplate(args.init);
    await writeFile(projectPath(args.output), `${JSON.stringify(template, null, 2)}\n`);
    console.log(`[rc-qa] wrote evidence template to ${args.output}`);
    process.exit(0);
  }
  if (!args.input) {
    usage();
    process.exit(64);
  }

  const evidence = JSON.parse(await readFile(projectPath(args.input), 'utf8'));
  const report = evaluateReleaseCandidateEvidence(evidence);
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (args.output) await writeFile(projectPath(args.output), serialized);
  else process.stdout.write(serialized);
  console.log(`[rc-qa] ${report.candidate.commit} verdict=${report.verdict} failures=${report.failures.length} blockers=${report.blockers.length}`);
  if (report.verdict === 'FAIL') process.exit(1);
  if (report.verdict === 'BLOCKED') process.exit(2);
} catch (error) {
  console.error(`[rc-qa] ${error.message}`);
  process.exit(1);
}
