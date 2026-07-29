# Content validation

Run `node scripts/verify-content.mjs` for production content and `node scripts/content-validator.test.mjs` for focused failure fixtures. Both are included in `bash verify.sh`.

The validator reports path-qualified errors for:

- missing faction, unit, ability, upgrade, region, and mission hero references;
- unknown, non-finite, or negative resource costs;
- missing and circular upgrade prerequisites;
- objectives outside the currently implemented objective vocabulary and objective/config contradictions;
- duplicate ability hotkeys within one unit command card.

Hotkeys are intentionally scoped to a selected unit's command card. Reusing a key on unrelated units is valid. Runtime-only legacy abilities are temporarily allow-listed in `scripts/content-validator.mjs`; remove entries as those abilities become full `ABILITIES` records. This compatibility list does not permit unknown new ability IDs.

When adding content, run the focused validator test first, then the full verification command. New objective forms require both runtime evaluation support and a validator rule or data-driven objective schema; adding display text alone is rejected as impossible content.
