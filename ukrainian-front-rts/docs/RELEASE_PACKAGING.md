# Release packaging

UFR-155 packages **Fields of Resolve** as a deterministic static deploy without changing gameplay runtime ownership.

## Build

From `ukrainian-front-rts/`:

```bash
node scripts/build-release-package.mjs
```

The default output is `artifacts/release-package/`. Pass another output path as the first argument when a deploy system needs a staging directory. The staging path must not overlap the project root itself or any packaged runtime source; in particular, never point it into `assets/`, `src/`, `index.html`, or a top-level packaged CSS path.

Before copying files the command runs the UFR-153 release provenance verifier. Missing source, license, redistribution, or delegated-validator metadata therefore blocks packaging.

## Package contract

The builder copies only release runtime inputs: `index.html`, top-level CSS, and the `assets/` and `src/` runtime trees. Authoring sources, tests, task records, scripts, documentation, CI configuration, and diagnostics are not deployed.

A release ID is derived from the sorted path/byte-count/SHA-256 inventory of those inputs. No wall-clock time, machine path, random value, or build host identifier enters the package. Consecutive builds from identical inputs must therefore be byte-for-byte identical.

The package adds:

- `release-version.json` — deterministic version/source digest;
- `release-manifest.json` — complete packaged-file size/digest inventory and offline-cache declaration;
- `manifest.<release-id>.webmanifest` — minimal install metadata;
- `release-bootstrap.<release-id>.js` — exposes the release ID and registers the service worker on HTTP(S);
- `service-worker.<release-id>.js` — version-scoped offline cache.

The generated entry page carries the same release ID and references versioned generated filenames. Service-worker installation fetches declared files with `cache: reload`, activation deletes prior Fields of Resolve release caches, and fetch handling serves cached same-origin GETs before network. This provides explicit cache busting between releases while retaining offline static-host behavior after installation.

## Verification

```bash
node scripts/verify-release-package.mjs
```

The verification gate:

1. validates release provenance;
2. builds two independent temporary packages;
3. requires identical release IDs and byte-for-byte trees;
4. verifies every packaged file against its SHA-256/byte-count declaration;
5. rejects undeclared extra files;
6. requires every declared runtime file to appear in the offline precache;
7. checks entry-page release metadata, web-manifest/bootstrap references, service-worker registration, and version-scoped cache ownership.

This verifier is part of the authoritative assembled `verify.sh` plan. Unit tests also mutate package contents, add undeclared files, and attempt destructive source-overlapping output locations to prove the package builder/verifier fail closed.

## Static hosting

Deploy the **contents** of the generated package as one directory and serve `index.html` for `/`. No server-side application is required. The first online load installs the versioned cache; later same-origin GETs can be satisfied offline. `file://` remains usable as a plain static page where browser module security permits it, but service workers intentionally register only over an HTTP(S)-style origin.

For rollback, redeploy an older deterministic package as a whole. Do not mix files from different release IDs: `release-manifest.json` will no longer validate, and the versioned cache boundary is designed around an atomic package.
