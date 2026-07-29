import assert from 'node:assert/strict';
import { validateTaskQueue } from './verify-task-queue.mjs';

const header = `| ID | P | Lane | Entry point | Deliverable and acceptance | Depends | Parallel |
| --- | --- | --- | --- | --- | --- | --- |`;

function queue(...rows) {
  return `${header}\n${rows.join('\n')}\n`;
}

function row({
  id,
  priority = 'P0',
  lane = 'tooling',
  entryPoint = '`scripts/`',
  deliverable = 'Observable acceptance criteria.',
  depends = '—',
  parallel = 'YES — isolated tooling.',
}) {
  return `| ${id} | ${priority} | ${lane} | ${entryPoint} | ${deliverable} | ${depends} | ${parallel} |`;
}

const valid = validateTaskQueue(
  queue(
    row({ id: 'UFR-001' }),
    row({ id: 'UFR-002', depends: 'UFR-001', parallel: 'LIMITED — owns the validator.' }),
    row({ id: 'UFR-004', depends: 'UFR-001 through UFR-002', parallel: 'NO — integration gate.' }),
  ),
);
assert.deepEqual(valid.errors, []);
assert.equal(valid.tasks.length, 3);

const cases = [
  {
    name: 'duplicate and non-monotonic IDs',
    markdown: queue(row({ id: 'UFR-002' }), row({ id: 'UFR-001' }), row({ id: 'UFR-002' })),
    expected: ['IDs must increase monotonically', 'duplicate ID'],
  },
  {
    name: 'missing required field',
    markdown: `${header}\n| UFR-001 | P0 | tooling | \\| escaped pipe | Acceptance. | — | YES — isolated. |\n| UFR-002 | P0 | tooling | | Acceptance. | — | YES — isolated. |\n`,
    expected: ['missing required field "Entry point"'],
  },
  {
    name: 'unknown dependency and malformed clause',
    markdown: queue(
      row({ id: 'UFR-001' }),
      row({ id: 'UFR-002', depends: 'UFR-001 to UFR-003' }),
      row({ id: 'UFR-003', depends: 'UFR-009' }),
    ),
    expected: ['invalid dependency clause', 'dependency UFR-009 does not exist'],
  },
  {
    name: 'descending dependency range',
    markdown: queue(row({ id: 'UFR-001' }), row({ id: 'UFR-002', depends: 'UFR-002 through UFR-001' })),
    expected: ['dependency range', 'descending'],
  },
  {
    name: 'dependency cycle',
    markdown: queue(row({ id: 'UFR-001', depends: 'UFR-002' }), row({ id: 'UFR-002', depends: 'UFR-001' })),
    expected: ['dependency cycle'],
  },
  {
    name: 'parallel policy requires explanation',
    markdown: queue(row({ id: 'UFR-001', parallel: 'YES' })),
    expected: ['Parallel must start with YES, LIMITED, or NO'],
  },
];

for (const testCase of cases) {
  const { errors } = validateTaskQueue(testCase.markdown);
  for (const expected of testCase.expected) {
    assert.ok(
      errors.some((error) => error.includes(expected)),
      `${testCase.name}: expected an error containing ${JSON.stringify(expected)}; got ${JSON.stringify(errors)}`,
    );
  }
}

console.log(`Task queue validator tests passed (${cases.length + 1} cases).`);
