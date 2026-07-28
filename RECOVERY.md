# Repository recovery audit

Date: 2026-07-28

## Incident

The `main` branch history had been rewritten so that only the repository initialization and the Ukrainian RTS work remained. Earlier games were absent from the `main` tree even though their merged pull-request refs and commits were still available.

## Recovery sources

- Current preserved `main` state and Fields of Resolve overlay: `cac8903565030a9dd69505350d44d604124aeb92`
- Complete earlier repository tree, including Bălți City Walk, Cat & Two Balconies, Outbreak Directive, Red Fortress, and Tremendous Peace Prize Run: PR #3 head `a3b25f57f1164e99452b45f88447f3b22c727d34`
- Final Red Fortress spawn correction and Soviet art pass, merged shortly after PR #3: PR #2 head `f8b27b2c6e4f62096745438e74a3de2bd098f9d6`

## Method

1. Created a recovery branch from the current `main` commit; no force push or ref rewrite was performed.
2. Used the complete PR #3 head as the base Git tree, restoring the historical root project and older game directories byte-for-byte.
3. Overlaid the four final Red Fortress files from PR #2, including `spawn-fix.js` and `soviet-art-pass.js`, using their exact blob SHAs.
4. Overlaid every file from the current `ukrainian-front-rts/` tree using its exact blob SHA from `cac8903565030a9dd69505350d44d604124aeb92`.
5. Rebuilt the top-level README to retain the historical Bălți City Walk documentation and list every restored game, including Fields of Resolve.
6. Opened the result as a pull request against `main` for review before merge.

## Restored projects

- Bălți City Walk
- Cat & Two Balconies
- Red Fortress, including its final spawn and art pass
- Outbreak Directive
- Tremendous Peace Prize Run

## Preserved project

- Fields of Resolve (`ukrainian-front-rts/`), including the latest unit-art pass, art lab, and art-pipeline documentation.

## Safety properties

- The current `main` branch was not modified directly.
- The recovery commits descend from the current `main` commit.
- Existing Fields of Resolve blobs are reused exactly rather than regenerated.
- Historical game blobs are reused from surviving Git objects rather than reconstructed from patch text.
