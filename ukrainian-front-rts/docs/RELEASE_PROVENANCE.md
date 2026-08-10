# Release provenance manifest

`provenance/release-manifest.json` is the release-wide provenance index. It does not replace family-owned source manifests. Instead it records the authoritative source and validator for every release provenance domain: visual art, audio, fonts, localized text, campaign/reference material, and procedural outputs.

The gate is deliberately fail-closed. Every release record requires an explicit id, kind, source, license statement, redistribution status, and validator. Placeholder values such as `TBD`, `unknown`, or `pending` are rejected. The manifest must explicitly declare that fail-closed policy and the complete required-field contract; required domains cannot silently disappear and record ids cannot collide.

The release gate also validates delegated provenance rather than merely checking that umbrella files exist:

- every `art-src/manifest.json` asset must retain explicit creator, source, license, and redistribution metadata;
- every source SVG under `art-src/` must be declared by an art-source record, and every declared frame must exist on disk;
- every audio family in `assets/audio/release-qa.json` must retain explicit source-path, license, and redistribution metadata, and every declared family source must exist;
- the current system-font-stack claim is enforced by rejecting bundled `.otf`, `.ttf`, `.woff`, `.woff2`, or `.eot` binaries until an explicit font provenance record is introduced;
- localization and reference roots remain release-indexed and continue through their family-owned validators.

This recursive delegation is what makes the aggregation complete without duplicating family-specific source metadata. Adding an orphan visual source, deleting a delegated source, removing a nested visual/audio license or source field, weakening the fail-closed policy, or silently adding a bundled font binary causes the release provenance gate to fail.

Visual provenance remains owned by `art-src/manifest.json` and its source records. Audio provenance remains owned by `assets/audio/release-qa.json`. Localization, campaign art, and their existing validators remain authoritative for their content. Procedural outputs inherit their provenance from the source records and generation ledgers that produced them.

Run `bash verify.sh` for the authoritative gate, or `node scripts/verify-release-provenance.mjs` for the focused provenance check.
