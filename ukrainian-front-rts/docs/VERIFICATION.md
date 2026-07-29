# Unified verification command

Run the complete dependency-free project verification from `ukrainian-front-rts/`:

```bash
bash verify.sh
```

`verify.sh` is the only supported top-level verification entry point. It resolves the project directory and delegates to `scripts/run-verification.mjs`, which executes the ordered plan owned by `scripts/lib/verification-runner.mjs`.

## Ordered stages

1. Validate `verify.sh` syntax with `bash -n`.
2. Run `node --check` for every `.js` and `.mjs` file under `src/`, `scripts/`, and `tests/` in stable path order.
3. Run the complete Node unit and headless simulation suite.
4. Run task-queue fixtures and production queue validation.
5. Run content-schema, content-validator fixture, and production content validation.
6. Run technology-graph fixtures and production technology validation.
7. Verify seeded simulation randomness.
8. Verify architecture boundaries.

The runner stops at the first failing stage and exits with that stage's non-zero status. A successful exit is emitted only after every stage completes. Stage labels identify the exact failed contract without requiring callers or CI to reconstruct the pipeline.

## Extending verification

Add new project-wide contract commands to `VERIFICATION_COMMANDS` in `scripts/lib/verification-runner.mjs`, then update `tests/tooling/verification-runner.test.mjs`. Do not add a second top-level shell command or duplicate the stage list in CI configuration. CI should invoke `bash verify.sh` so local and hosted verification use the same order and failure behavior.
