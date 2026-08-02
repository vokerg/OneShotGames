# RECOVERY-122 — Navigation failure metrics regression

- Owning issue: #122
- Pull request: #123
- Evidence level: `RUNTIME_INTEGRATED`
- Base commit: `7a695040e7b6ced8874cc91b0711361820fae774`
- Passing implementation head: `a7b6832fecb08fb3da5195024c7054c55df9250f`
- Passing workflow run: `30738890529`

## Delivered

- `NavigationPathService.metrics()` now exposes a deterministic `failures` counter.
- The counter increments only when a newly executed search returns a non-`FOUND` route.
- Cached failed routes do not double-count failures.
- Successful route searches preserve a zero failure count.
- No route selection, pathfinding bound, cache identity, repath cadence, movement, content, balance, or UI behavior changed.

## Verification evidence

Workflow run `30738890529` passed the authoritative assembled verifier, active-claim diagnostics, browser startup and first-mission smoke, completion-evidence audit, and diagnostic artifact upload on the implementation head.

Focused regression coverage proves one bounded failed search plus one cached replay reports `{ searches: 1, failures: 1, cacheHits: 1 }`, while a successful search reports one search and zero failures. The merged UFR-029 dense-group torture assertion also passes with 36 successful searches and zero failures.

This evidence verifies the metric in the assembled runtime and automated browser entry path. It does not claim additional gameplay, balance, visual, or manual campaign verification.
