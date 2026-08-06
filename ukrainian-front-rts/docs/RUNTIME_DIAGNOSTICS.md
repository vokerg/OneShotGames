# Runtime diagnostics and recovery

## Ownership

UFR-156 adds a browser-bootstrap diagnostics boundary. It does not own gameplay rules, simulation ordering, save schemas, or ordinary UI state.

- `src/app/diagnostics.js` owns invariant errors, bounded diagnostic reports, application-local storage export/reset, fatal-screen actions, and window error/rejection capture.
- `src/app/diagnostics-bootstrap.js` installs the boundary before renderer and game startup.
- `src/render/viewport-runtime-bootstrap.js` imports the diagnostics bootstrap first so startup/import failures are visible rather than leaving a blank page.

The diagnostics service is dependency-free and tears down its listeners, global diagnostic handle, and fatal view on `pagehide`.

## Assertion policy

Use `assertRuntimeInvariant(condition, message, details)` only for internal states that indicate a programming or integration defect and cannot be recovered through normal player input. Examples include a missing authoritative owner, an impossible lifecycle transition, or a required adapter contract disappearing after installation.

Do not use invariant assertions for expected player-facing rejection paths such as insufficient resources, invalid placement, unavailable abilities, unsupported save versions, or cancelled actions. Those remain ordinary result/error states with actionable UI feedback.

Invariant details are developer diagnostics. Do not place secrets, personal data, free-form user input, complete saves, or large entity graphs in them.

## Fatal error flow

The bootstrap listens for:

- `window.error` — synchronous runtime and module errors;
- `window.unhandledrejection` — rejected promises that escaped their local owner.

An unhandled rejection is marked handled by the diagnostics boundary and converted into the same fatal recovery flow. Ordinary asynchronous UI actions in the fatal screen catch their own failures and report them through the live status region.

The fatal screen provides:

1. a bounded error summary and expandable technical report;
2. **Copy debug report**;
3. **Export saves and settings**;
4. **Export, then reset local data**;
5. **Reload application**.

The reset action is fail-safe: export must finish successfully before any application-owned local-storage entry is deleted. It removes only keys beginning with `fields-of-resolve:` and leaves unrelated site data untouched.

## Diagnostic report boundary

Reports include the error name/message/stack, capture phase, mission/simulation summary when available, installed composition modules, and bounded performance summaries when the profiler is available. Reports deliberately exclude browser identity, user agent, URL, network address, account identity, arbitrary DOM content, and complete save payloads.

The separate recovery bundle contains the report plus raw application-owned local-storage values so a player can preserve saves and settings before reset. The bundle is downloaded locally and is never transmitted by the application.

## Manual verification

1. Start a mission and confirm normal startup has no diagnostics overlay.
2. In developer tools, run `window.__fieldsOfResolveDiagnostics.showFatal(new Error('diagnostic test'))`.
3. Verify the alert-dialog receives focus and the technical report expands.
4. Verify copy produces valid JSON.
5. Verify export downloads a `fields-of-resolve-recovery-<timestamp>.json` file containing only `fields-of-resolve:` storage keys.
6. Add an unrelated local-storage key, run export-and-reset, and confirm the unrelated key remains.
7. Block downloads, run export-and-reset, and confirm application data is not removed.
8. Reload and confirm the application starts from clean local state after a successful reset.

## Evidence boundary

Automated tests cover invariant semantics, bounded reports, privacy exclusions, storage filtering, canonical recovery serialization, application-only reset, global error/rejection capture, exact disposal, and export-before-reset failure safety. Browser smoke confirms the bootstrap remains compatible with normal startup. Human interaction with download and clipboard policies is required for `PLAYER_VERIFIED` evidence.
