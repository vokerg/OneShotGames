# Construction placement

`src/systems/construction-placement-system.js` owns deterministic building-site geometry, validation, terrain preparation, construction access, and the placement command adapter introduced by UFR-055.

## Player flow

1. Select a Ukrainian engineer and choose a build ability.
2. Move the pointer to preview the exact tile footprint.
3. Press `R` to rotate structures whose tile dimensions have a distinct 90-degree orientation.
4. Read the preview state:
   - green: valid site;
   - amber: valid site that severs a currently connected local ground route;
   - red: invalid site, with a reason-specific message.
5. Left-click to pay the cost, flatten eligible terrain, create the under-construction building, and order the assigned engineer to the recorded approach.

Cancelling placement preserves resources. An invalid click also preserves resources and keeps placement active so the player can choose another site.

## Footprint contract

Building width and height from `BUILDING_TYPES` are converted to whole navigation cells with `ceil(pixelSize / WORLD.tile)`. Placement snaps the entire footprint rather than only the building center.

The placed building stores:

- `rotation`;
- exact navigation `origin`;
- exact cell `footprint`;
- the deterministic construction `approachCell`;
- changed terrain cells and their previous runtime values;
- whether the preview detected a local route severance.

`src/systems/navigation-movement-system.js` consumes this stored footprint when rebuilding dynamic blockers. Legacy and mission-start buildings without placement metadata continue to derive their blocker from configured pixel dimensions.

Rotation is supported only when swapping width and height changes the tile footprint. A square tile footprint reports that it has no alternate orientation.

## Foundation and flattening policy

Valid foundations may contain:

- open ground;
- roads;
- mud;
- rubble.

Mud, rubble, and road cells are normalized to current runtime open-ground terrain when placement succeeds. Water, bridges, blocked cells, map edges, existing dynamic blockers, resource sites, and live units make the site invalid.

The flattening policy is intentionally narrow. UFR-055 does not add excavation costs, slopes, retaining walls, bridge construction, water placement, or terrain restoration after demolition.

## Navigation and path preview

The synchronized navigation grid remains the authoritative source for terrain and blocker queries.

A candidate footprint is overlaid as a temporary ground/amphibious blocker. Validation requires at least one perimeter approach reachable by the assigned engineer. The approach search and all tie-breaking use stable cardinal order.

The preview also compares local perimeter connectivity before and after the temporary blocker. If placement splits a route that was connected inside the bounded preview area, placement remains legal but is shown in amber with a warning. This permits deliberate walls and choke control while making path consequences visible before resources are spent.

Preview calculations are cached for the same tile, rotation, navigation revision, worker cell, and simulation time. The local route-impact scan is bounded around the candidate footprint.

## Ownership boundaries

- `src/systems/construction-placement-system.js`: geometry, reasons, path impact, terrain flattening, placement command adapter, and shared building blocker metadata.
- `src/input/construction-placement-input.js`: `R` rotation input while placement is active.
- `src/render/construction-preview.js`: read-only canvas overlay after the base frame.
- `src/systems/navigation-movement-system.js`: active grid synchronization and consumption of stored building footprints.
- `src/game.js`: existing construction cost, building creation, and construction-progress behavior remains compatible and is adapted at composition.

Later tasks own:

- UFR-056: multiple builders, pause/resume, cancellation/refunds, and builder-loss policy;
- UFR-057: lifecycle, capture, sell/scuttle, rubble, and capacity transitions;
- UFR-059: production exits and rally behavior;
- UFR-064: buildable fortifications, mines, and active defenses.

## Verification

Run from `ukrainian-front-rts/`:

```bash
node --check src/systems/construction-placement-system.js
node --check src/input/construction-placement-input.js
node --check src/render/construction-preview.js
node --check src/systems/navigation-movement-system.js
node --check src/main.js
node --test tests/economy/construction-placement-system.test.mjs
bash verify.sh
```

Browser checks should cover all three buildable structures, valid and invalid previews, `R` rotation, resource/building/unit overlap, mud/rubble flattening, route warnings, cancellation, insufficient resources, and an engineer unable to reach the site.
