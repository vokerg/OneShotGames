# Test conventions

The project uses Node's built-in `node:test` and `node:assert` modules. No package install, test framework,
or browser environment is required.

Run every automated Node test from the project root:

```bash
node scripts/run-tests.mjs
```

Run a filtered subset by passing one or more path fragments:

```bash
node scripts/run-tests.mjs math objectives
node scripts/run-tests.mjs sim
```

## Test layers

- Put fast deterministic function and public-state-transition tests under `tests/unit/`.
- Put deterministic whole-scenario tests driven through `src/app/simulation-harness.js` under `tests/sim/`.
- Browser interaction, rendering, visual regression, and accessibility tests belong to later browser-specific
  layers and must not be simulated inside the Node harness.

## Layout and naming

- Name files `*.test.mjs`; the runner recursively discovers that suffix under `tests/`.
- Keep test files independent. The Node test process may execute files concurrently.
- Import production modules through relative paths and use public exports or public `Game` methods.
- Construct the smallest explicit state fixture needed by the owner under test.
- Reset global deterministic services, such as the simulation random stream, inside each affected test.
- Never depend on DOM, canvas, wall-clock timing, network access, test order, or another test file's mutations.
- Add focused assertions for success, rejection, and no-mutation-on-failure behavior.

## Headless scenarios

The simulation harness starts a mission with a deterministic seed, accepts structured public game commands,
advances one configured tick duration, and returns reference-free snapshots. See
`docs/SIMULATION_HARNESS.md` for its command and snapshot contracts.

Keep scenario setup explicit. Use public commands for the behavior under test. The live `game` reference may
be used for small preparation mutations when no data-driven scenario facility exists yet.

`bash verify.sh` runs the complete Node test suite after syntax checks and before specialized contract
verifiers.
