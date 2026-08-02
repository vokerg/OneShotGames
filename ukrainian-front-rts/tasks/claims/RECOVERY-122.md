# Recovery #122 — Navigation failure metrics regression

- Base: `7a695040e7b6ced8874cc91b0711361820fae774`
- Claimed by: ChatGPT coding agent
- Intended files: `src/navigation/path-service.js`, focused navigation metrics tests, and completion evidence
- Dependencies verified: UFR-022 and UFR-029 are merged on `main`; issue #122 records the combined regression
- Parallel boundary: no runtime-composition files owned by PR #118 and no deterministic AI files owned by PR #120

## Plan

1. Restore the published failed-search counter without changing routing behavior or cache identity.
2. Add focused tests proving cache hits do not double-count failures and successful searches remain at zero.
3. Run authoritative assembled verification and browser mission startup smoke, then record the achieved evidence level.
