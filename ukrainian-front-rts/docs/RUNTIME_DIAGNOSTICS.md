# Runtime diagnostics and recovery

## Ownership

UFR-156 adds a browser-bootstrap diagnostics boundary. It does not own gameplay rules, simulation ordering, save schemas, or ordinary UI state.

- `src/app/diagnostics.js` owns invariant errors, bounded diagnostic reports, application-local storage export/reset, fatal-screen actions, locale-aware presentation, and window error/rejection capture.
- `src/localization/runtime-diagnostics-catalogs.js` owns structurally matched English and Ukrainian fatal-screen, status, confirmation, and capability-error messages.
- `src/app/diagnostics-bootstrap.js` installs the boundary before renderer and game startup.
- `src/render/viewport-runtime-bootstrap.js` imports the diagnostics bootstrap first so startup/import failures are visible rather than leaving a blank page.

The diagnostics service is dependency-free and tears down its listeners, global diagnostic handle, fatal report, and fatal view on `pagehide`.

## Assertion policy

Use `assertRuntimeInvariant(condition, message, details)` only for internal states that indicate a programming or integration defect and cannot be recovered through normal player input. Examples include a missing authoritative owner, an impossible lifecycle transition, or a required adapter contract disappearing after installation.

Do not use invariant assertions for expected player-facing rejection paths such as insufficient resources, invalid placement, unavailable abilities, unsupported save versions, or cancelled actions. Those remain ordinary result/error states with actionable UI feedback.

Invariant details are developer diagnostics. Do not place secrets, personal data, free-form user input, complete saves, or large entity graphs in them.

## Fatal error flow

The bootstrap listens for:

- `window.error` — synchronous runtime and module errors;
- `window.unhandledrejection` — rejected promises that escaped their local owner.

An unhandled rejection is marked handled by the diagnostics boundary and converted into the same fatal recovery flow. Ordinary asynchronous UI actions in the fatal screen catch their own failures and report them through the localized live status region.

The fatal screen provides:

1. a bounded error summary and expandable technical report;
2. **Copy debug report**;
3. **Export saves and settings**;
4. **Export, then reset local data**;
5. **Reload application**.

The reset action is fail-safe within browser constraints: the recovery export action must return successfully, then the player must explicitly confirm that the recovery file is visible in downloads before any application-owned local-storage entry is deleted. Cancelling confirmation leaves storage unchanged. Reset removes only keys beginning with `fields-of-resolve:` and leaves unrelated site data untouched.

## Localization

The recovery surface starts from the current document locale and listens for `fields-of-resolve:localechange`. When a fatal report is already visible, changing locale removes and recreates only the presentation layer; the bounded report and recovery actions remain unchanged. English and Ukrainian catalogs use the repository localization schema and are validated for key, plural, message-shape, and placeholder parity.

The report's technical fields, error names, stack traces, storage keys, filenames, and schema identifiers are diagnostic data rather than translated prose. Player-facing headings, buttons, status messages, export counts, reset confirmation, cancellation, and browser-capability errors are localized.

## Diagnostic report boundary

Reports include the error name/message/stack, capture phase, mission/simulation summary when available, installed composition modules, and bounded performance summaries when the profiler is available. Reports deliberately exclude browser identity, user agent, URL, network address, account identity, arbitrary DOM content, and complete save payloads.

The separate recovery bundle contains the report plus raw application-owned local-storage values so a player can preserve saves and settings before reset. The bundle is downloaded locally and is never transmitted by the application.

## Manual verification

1. Start a mission and confirm normal startup has no diagnostics overlay.
2. In developer tools, run `window.__fieldsOfResolveDiagnostics.showFatal(new Error('diagnostic test'))`.
3. Verify the alert-dialog receives focus and the technical report expands.
4. Switch between English and Ukrainian and confirm the visible recovery controls rerender while the report is retained.
5. Verify copy produces valid JSON.
6. Verify export downloads a `fields-of-resolve-recovery-<timestamp>.json` file containing only `fields-of-resolve:` storage keys.
7. Add an unrelated local-storage key, run export-and-reset, cancel the confirmation, and confirm all local data remains.
8. Run export-and-reset again, confirm only after the recovery file appears, and verify application-owned keys are removed while the unrelated key remains.
9. Block downloads or make the export action fail, run export-and-reset, and confirm the confirmation is not shown and application data is not removed.
10. Reload and confirm the application starts from clean local state after a confirmed reset.

## Evidence boundary

Automated tests cover invariant semantics, bounded reports, privacy exclusions, storage filtering, canonical recovery serialization, English/Ukrainian catalog parity and fatal-view rerendering, application-only reset, global error/rejection capture, exact disposal, export failure safety, confirmation cancellation, and confirmed reset. Browser smoke confirms the bootstrap remains compatible with normal startup. Human interaction with download, confirmation, clipboard, and locale-switch policies is required for `PLAYER_VERIFIED` evidence.
