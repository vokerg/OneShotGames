# Source asset pipeline

## Scope

UFR-108 establishes the repository-owned source and export boundary for production art. It implements the source-file rules frozen by `ART_PIPELINE.md` and feeds the UFR-107 sprite-atlas packer without changing active gameplay art.

The pipeline owns source organization, canonical frame naming, palette and padding validation, provenance records, deterministic export manifests, and human-review contact sheets. Asset-family tasks UFR-109 through UFR-121 author production content through this boundary; UFR-122 consumes its generated contact sheets and manifests for visual regression; UFR-123 may optimize runtime packing without weakening this source contract.

## Repository layout

```text
art-src/
  manifest.json
  units/<faction>/<family>/<asset-id>/
  buildings/<faction>/<asset-id>/
  terrain/<biome>/<family>/
  effects/<family>/<asset-id>/
  ui/<family>/<asset-id>/
  campaign/<operation-or-screen>/
  diagnostic/<asset-id>/
assets/
  atlases/                 # UFR-107 authored source specs and generated atlases
  manifests/art-sources.json
  contact-sheets/art-sources.svg
```

`art-src/` contains editable/export source frames and metadata. Browser runtime code must not load it directly. Files under `assets/manifests/` and `assets/contact-sheets/` are deterministic generated review artifacts; runtime atlas outputs remain under `assets/atlases/`.

## Catalog contract

`art-src/manifest.json` uses schema `fields-of-resolve.art-source-catalog`, version `1`.

The catalog declares:

- semantic palette tokens and exact six-digit sRGB values;
- generated manifest and contact-sheet paths;
- stable asset ID, kind, family, faction, source directory, and UFR-107 atlas source;
- complete provenance and review status;
- every exported frame's source path, runtime atlas key, animation, direction index, frame index, duration, canvas, content bounds, transparent padding, palette slots, anchor, and attachments.

Asset IDs and path segments use lowercase ASCII letters, digits, dots, and hyphens. Runtime/display names, artist initials, dates, and temporary labels do not belong in stable IDs.

## Canonical frame naming

Every export is named:

```text
<asset-id>__<animation>__d<direction>__f<frame>.<png|svg>
```

Direction is a zero-padded index into the owning atlas source's declared direction order. Frame metadata and filename fields must agree exactly. Examples:

```text
ua.line-infantry__move__d03__f05.png
ru.breakthrough-tank__attack__d06__f02.png
neutral.logistics-site__controlled-ua__d00__f00.svg
```

The same source path or `<atlas-source>#<runtime-frame-id>` key may not be claimed twice.

## Export validation

### PNG

Production raster exports are non-interlaced RGBA8 PNG files. Validation:

- verifies the PNG signature and every chunk CRC;
- rejects `iCCP`, `gAMA`, and `cHRM` chunks so accidental profile conversion cannot enter generated output;
- decodes all standard PNG row filters without an image dependency;
- calculates exact non-transparent pixel bounds;
- rejects fully transparent images;
- requires declared canvas and content bounds to match the pixels;
- requires the declared transparent margin on all four sides;
- rejects every non-transparent RGB value not named by the frame's palette tokens.

### SVG

Source SVG exports require explicit positive `width` and `height`, crisp source geometry, declared content bounds, and semantic palette colors. Embedded color-profile declarations are rejected. Hex colors used by the SVG must exactly match declared palette tokens.

SVG transparent bounds are contract metadata rather than raster-inferred data. Asset reviewers must inspect generated contact sheets and may require a PNG export when pixel-exact alpha auditing is needed.

### Atlas handoff

For every catalog frame, validation opens the referenced UFR-107 `fields-of-resolve.sprite-atlas-source` file and proves that:

- the runtime frame ID exists;
- its source path resolves to the exact `art-src/` export;
- source and atlas palette-token values agree;
- the gameplay anchor is identical;
- the direction index resolves through the atlas direction order;
- the shared or directional animation sequence contains the frame;
- frame duration agrees exactly.

This prevents the source catalog and runtime packing input from becoming parallel authorities.

## Provenance

Each asset records:

- creator and creation date;
- original repository or external source description;
- license and redistribution status;
- transformations performed;
- whether generative tools were used, with details and human corrections;
- reviewer and approval state.

Diagnostic, pending, approved, and rejected are explicit states. Production-family tasks may use pending records during development, but release/provenance gates must require approved records. No record makes an unlicensed or copied input acceptable.

## Commands

Generate the export manifest and contact sheet:

```bash
node scripts/build-art-sources.mjs
```

Verify sources and generated outputs without modifying the tree:

```bash
node scripts/build-art-sources.mjs --check
node scripts/verify-art-sources.mjs
```

Then pack and validate runtime atlases through UFR-107:

```bash
node scripts/pack-sprite-atlas.mjs assets/atlases/<family>.source.json
node scripts/verify-sprite-atlases.mjs
```

`bash verify.sh` runs source validation before atlas validation. A changed source frame therefore requires both generated source-review outputs and its generated atlas outputs to be updated in the same branch.

## Determinism

Catalog assets, frames, palette tokens, and generated records use binary stable-ID ordering. The export manifest includes SHA-256 and byte length for every frame. Contact-sheet cells use the same order and embed the exact source bytes. `--check` compares complete generated text, so stale or environment-dependent output fails verification.

## Downstream asset-family checklist

Each UFR-109 through UFR-121 family must:

1. create canonical source directories and frames under `art-src/`;
2. add complete catalog/provenance records;
3. declare every palette slot, transparent bound, anchor, attachment, animation direction, and duration;
4. reference the exact files from a UFR-107 atlas source;
5. regenerate the export manifest, contact sheet, and atlas outputs;
6. run source, atlas, full verifier, browser, zoom, grayscale, and task-specific visual checks;
7. record missing states or review limitations explicitly rather than relying on runtime fallback.

UFR-108's diagnostic fallback proves the pipeline only. It is not production coverage and must remain conspicuous when a runtime asset is missing.
