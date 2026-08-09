# Release provenance manifest

`provenance/release-manifest.json` is the release-wide provenance index. It does not replace family-owned source manifests. Instead it records the authoritative source and validator for every release provenance domain: visual art, audio, fonts, localized text, campaign/reference material, and procedural outputs.

The gate is deliberately fail-closed. Every record requires an explicit id, kind, source, license statement, redistribution status, and validator. Placeholder values such as `TBD`, `unknown`, or `pending` are rejected. Required domains cannot silently disappear and record ids cannot collide.

Visual provenance remains owned by `art-src/manifest.json` and its source records. Audio provenance remains owned by `assets/audio/release-qa.json`. Localization, campaign art, and their existing validators remain authoritative for their content. The release manifest provides a deterministic aggregation point so release review can prove that each domain has both provenance and an executable validation owner without duplicating family-specific policy.

No third-party font binary is bundled by this task. The font record documents the existing system/runtime stack rather than inventing a redistributable asset. Procedural outputs inherit their provenance from the source records and generation ledgers that produced them.

Run `bash verify.sh` for the authoritative gate, or `node scripts/verify-release-provenance.mjs` for the focused provenance check.
