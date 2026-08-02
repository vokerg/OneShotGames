import assert from 'node:assert/strict';
import test from 'node:test';

import { createApplicationComposition } from '../../src/app/composition-registry.js';

test('installs named modules in declaration order and disposes in reverse order', () => {
  const calls = [];
  const context = { value: 7 };
  const composition = createApplicationComposition({
    context,
    modules: [
      {
        name: 'alpha',
        install(activeContext) {
          assert.equal(activeContext, context);
          calls.push('install:alpha');
          return () => calls.push('dispose:alpha');
        },
      },
      {
        name: 'bravo',
        install() {
          calls.push('install:bravo');
          return { dispose: () => calls.push('dispose:bravo') };
        },
      },
      {
        name: 'charlie',
        install() {
          calls.push('install:charlie');
        },
      },
    ],
  });

  assert.deepEqual(composition.install(), ['alpha', 'bravo', 'charlie']);
  assert.deepEqual(composition.installedModules(), ['alpha', 'bravo', 'charlie']);
  assert.equal(composition.state(), 'installed');
  assert.equal(composition.dispose(), true);
  assert.equal(composition.dispose(), false);
  assert.equal(composition.state(), 'disposed');
  assert.deepEqual(calls, [
    'install:alpha',
    'install:bravo',
    'install:charlie',
    'dispose:bravo',
    'dispose:alpha',
  ]);
});

test('rolls back completed installers when a later installer fails', () => {
  const calls = [];
  const expected = new Error('installer failed');
  const composition = createApplicationComposition({
    modules: [
      {
        name: 'first',
        install() {
          calls.push('install:first');
          return () => calls.push('dispose:first');
        },
      },
      {
        name: 'second',
        install() {
          calls.push('install:second');
          throw expected;
        },
      },
    ],
  });

  assert.throws(() => composition.install(), (error) => error === expected);
  assert.equal(composition.state(), 'idle');
  assert.deepEqual(composition.installedModules(), []);
  assert.deepEqual(calls, ['install:first', 'install:second', 'dispose:first']);
});

test('rejects duplicate module names before installation', () => {
  assert.throws(
    () => createApplicationComposition({
      modules: [
        { name: 'same', install() {} },
        { name: 'same', install() {} },
      ],
    }),
    /Duplicate application module name: same/,
  );
});
