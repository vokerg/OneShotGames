# Unit test conventions

The project uses Node's built-in `node:test` and `node:assert` modules. No package install, test framework,
or browser environment is required.

Run every unit test from the project root:

```bash
node scripts/run-tests.mjs
```

Run a filtered subset by passing one or more path fragments:

```bash
node scripts/run-tests.mjs math objectives
```

## Layout and naming

- Put fast deterministic unit tests under `tests/unit/`.
- Name files `*.test.mjs`; the runner recursively discovers that suffix under `tests/`.
- Keep test files independent. The Node test process may execute files concurrently.
- Import production modules through relative paths and use public exports or public `Game` methods.
- Construct the smallest explicit state fixture needed by the owner under test.
- Reset global deterministic services, such as the simulation random stream, inside each affected test.
- Never depend on DOM, canvas, wall-clock timing, network access, test order, or another test file's mutations.
- Add focused assertions for success, rejection, and no-mutation-on-failure behavior.

`bash verify.sh` runs this unit suite after syntax checks and before the specialized contract verifiers.
Headless scenario stepping and browser interaction tests belong to later test layers, not `tests/unit/`.
