import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '../..');
const doctrine = readFileSync(resolve(projectRoot, 'docs/FACTION_DOCTRINE.md'), 'utf8');

const requiredHeadings = [
  '# Ukrainian faction — Networked Maneuver',
  '# Russian faction — Echeloned Pressure',
  '# Asymmetry matrix',
  '# Counter matrix',
  '# Roster and tech-tree constraints for UFR-070',
  '# AI doctrine hooks',
  '# Anti-mirroring acceptance checklist',
];

const requiredDimensions = [
  'Strategic identity',
  'Economy rhythm',
  'Reconnaissance and electronic warfare',
  'Fires',
  'Mobility and logistics',
  'Command model',
];

function section(start, end) {
  const startIndex = doctrine.indexOf(start);
  assert.notEqual(startIndex, -1, `missing section: ${start}`);
  const endIndex = end ? doctrine.indexOf(end, startIndex + start.length) : doctrine.length;
  assert.notEqual(endIndex, -1, `missing section boundary: ${end}`);
  return doctrine.slice(startIndex, endIndex);
}

function tableRows(markdownSection) {
  return markdownSection
    .split('\n')
    .filter((line) => /^\|/.test(line))
    .slice(2)
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
}

test('doctrine contains all normative faction and handoff sections', () => {
  for (const heading of requiredHeadings) assert.ok(doctrine.includes(heading), `missing heading: ${heading}`);
  assert.ok(doctrine.includes('stylized alternate-history fiction'));
  assert.ok(doctrine.includes('not a claim of documentary accuracy'));
});

test('both factions cover every required doctrine dimension and failure mode', () => {
  const ukraine = section('# Ukrainian faction — Networked Maneuver', '# Russian faction — Echeloned Pressure');
  const russia = section('# Russian faction — Echeloned Pressure', '# Asymmetry matrix');

  for (const dimension of requiredDimensions) {
    assert.ok(ukraine.includes(`## ${dimension}`), `Ukraine missing ${dimension}`);
    assert.ok(russia.includes(`## ${dimension}`), `Russia missing ${dimension}`);
  }
  assert.match(ukraine, /failure mode/gi);
  assert.match(russia, /failure mode/gi);
  assert.ok(ukraine.includes('Intended weaknesses and counterplay'));
  assert.ok(russia.includes('Intended weaknesses and counterplay'));
});

test('asymmetry matrix uses distinct doctrine text for every dimension', () => {
  const rows = tableRows(section('# Asymmetry matrix', '# Counter matrix'));
  assert.ok(rows.length >= 12, `expected at least 12 asymmetry rows, received ${rows.length}`);
  for (const [dimension, ukraine, russia] of rows) {
    assert.ok(dimension && ukraine && russia, `incomplete asymmetry row: ${dimension}`);
    assert.notEqual(ukraine.toLowerCase(), russia.toLowerCase(), `mirrored asymmetry row: ${dimension}`);
  }
});

test('counter matrix exposes strengths, vulnerabilities, and readable tells', () => {
  const rows = tableRows(section('# Counter matrix', '# Roster and tech-tree constraints for UFR-070'));
  assert.ok(rows.length >= 8, `expected at least 8 counter rows, received ${rows.length}`);
  for (const [strategy, strongAgainst, vulnerableTo, tell] of rows) {
    assert.ok(strategy && strongAgainst && vulnerableTo && tell, `incomplete counter row: ${strategy}`);
  }
});

test('handoff forbids number-only mirroring and defines AI use for both factions', () => {
  assert.ok(doctrine.includes('A simple cost, damage, or health adjustment does not satisfy this rule by itself.'));
  assert.ok(doctrine.includes('the same role with different numbers'));
  assert.ok(doctrine.includes('## Ukrainian AI priorities'));
  assert.ok(doctrine.includes('## Russian AI priorities'));
  assert.ok(doctrine.includes('hidden information'));
});
