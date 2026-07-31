# Recovery #109 — Authoritative CI, integrated verification, and honest DONE semantics

- Base: `7f7f954b002379a6ba56638a3d7ed8f536ce660d`
- Claimed by: ChatGPT via GitHub connector
- Intended files: `.github/workflows/`, `ukrainian-front-rts/verify.sh`, `ukrainian-front-rts/scripts/`, `ukrainian-front-rts/tests/`, contributor/task documentation, completion-audit output
- Dependencies verified: recovery override active; issue #109 open and unclaimed
- Parallel boundary: tooling and CI only; no navigation, faction roster, gameplay, balance, art, audio, or campaign changes

## Plan

1. Inventory the existing verifier, tests, task markers, and browser startup path.
2. Add authoritative CI, assembled test discovery, browser startup smoke, and claim/completion diagnostics.
3. Generate the completion evidence audit and update contributor guidance.
4. Run all connector-available verification, inspect workflow status, and document any environment-limited checks.
