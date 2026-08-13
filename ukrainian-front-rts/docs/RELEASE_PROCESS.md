# Release process

UFR-158 turns the deterministic UFR-155 static package into a versioned, reviewable release artifact. This process does not weaken provenance, browser-QA, or full-product release gates.

## 1. Prepare the version

Use Semantic Versioning. Move the intended changes from `CHANGELOG.md`'s `Unreleased` section into a dated `## [x.y.z] - YYYY-MM-DD` section. Do not create a shipping version merely to satisfy automation; the `0.0.0-dev.158` entry exists only as a verification baseline.

Copy `docs/RELEASE_NOTES_TEMPLATE.md` to a working release-notes file and replace every placeholder. The first line must be `# Fields of Resolve x.y.z`, and the notes must retain `Highlights`, `Verification`, `Known issues`, and `Rollback` sections. Verification text must distinguish automated evidence from deferred/manual evidence. In particular, do not upgrade browser coverage beyond what `docs/BROWSER_QA_MATRIX.md` actually records.

## 2. Build and verify

From `ukrainian-front-rts/` run:

```bash
node scripts/build-release-artifact.mjs x.y.z path/to/release-notes.md /absolute/staging/fields-of-resolve-x.y.z
```

The command runs the UFR-153 provenance gate, builds the UFR-155 deterministic package, verifies its internal manifest, creates an outer release artifact, verifies all outer checksums, and serves the packaged directory on a loopback HTTP server for a static-host smoke test.

A verified artifact contains:

- `package/` — the deployable deterministic static package;
- `release-metadata.json` — product version mapped to the content-derived release ID;
- `release-notes.md` — the validated notes used for this build;
- `artifact-manifest.json` — size and SHA-256 inventory for the artifact payload;
- `SHA256SUMS` — independent SHA-256 coverage including `artifact-manifest.json`.

Deploy only `package/`, but retain the complete artifact next to the release record so version, notes, manifest, and checksums stay auditable.

## 3. Release verification

Run the authoritative project gate before promotion:

```bash
bash verify.sh
```

For an already-built artifact, rerun:

```bash
node scripts/verify-release-artifact.mjs /absolute/staging/fields-of-resolve-x.y.z x.y.z
node scripts/smoke-release-artifact.mjs /absolute/staging/fields-of-resolve-x.y.z
```

Record the exact commit, verification result, release ID, and `SHA256SUMS` with the release. UFR-159 full release-candidate QA remains a separate downstream gate; UFR-158 automation is not product sign-off.

## Rollback

Keep at least the previous known-good complete artifact. To roll back:

1. stop promotion of the bad artifact and capture its release ID for incident notes;
2. run `verify-release-artifact.mjs` against the previous artifact before using it;
3. atomically redeploy that artifact's `package/` directory rather than copying individual files;
4. confirm the deployed `release-version.json` reports the previous release ID and run the packaged smoke check against staging;
5. purge any CDN/static-host cache if the host adds caching outside the versioned service worker;
6. record the rollback and reopen the failed release work instead of editing a published artifact in place.

Never combine files from two release IDs. The package and outer artifact verifiers intentionally fail on mutation, missing files, extra files, or checksum drift.
