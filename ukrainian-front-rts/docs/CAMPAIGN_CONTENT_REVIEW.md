# Campaign content and fictional-framing review

UFR-104 reviews the complete nine-operation campaign as a fictional/composite military strategy campaign rather than a documentary reconstruction.

## Review policy

- Real regional geography may be used for orientation.
- Authored operation events, commanders, dialogue, unit identities, target identities, and outcomes are fictional/composite unless separately sourced and explicitly identified outside campaign fiction.
- Contemporary public figures are not characters, commanders, dialogue speakers, objectives, or targets.
- Campaign copy must not claim that invented mission events recreate, document, or establish facts about real events.
- Military terminology describes game systems and fictional operational situations; it is not an assertion about the conduct of real units or individuals.
- Sensitive civilian scenarios remain abstract protection/evacuation constraints. Civilians are not controllable combat units, targets, or score resources.

## Corpus audit

`node scripts/audit-campaign-content.mjs` traverses all nine operations from the canonical campaign registry. It requires explicit fictional framing and fails on contemporary public-figure references or documentary-sounding claims such as dated scenario assertions or statements that a mission recreates a real operation.

The regression suite also verifies that real place names and in-fiction intelligence confidence language remain usable when the surrounding operation is explicitly fictional. This avoids stripping useful geographic/tactical vocabulary while preventing unsupported real-world attribution.

## Ongoing rule

New campaign copy must remain inside this policy and keep `tests/campaign/campaign-content-review.test.mjs` green. If a future scenario intentionally makes a real-world factual claim, that claim should be handled as sourced editorial material rather than silently weakening this campaign-fiction guard.
