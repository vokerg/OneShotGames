# Economy balance baseline

UFR-066 defines a versioned, deterministic balance contract for the current economy without taking ownership of gathering, construction, production, research, repair, command capacity, faction content, or mission mechanics.

The executable profile lives in `src/core/economy-balance.js`. It consumes the public costs and mission starts in `src/config.js` together with the resource vocabulary and extraction/carry/salvage rules from `src/core/resource-policy.js`.

## Version 1 constraints

### Opening package

The Donbas opening must afford one infantry production structure and one frontline infantry squad while retaining at least:

- 100 fuel;
- 20 intelligence;
- no required metal reserve.

With the current data, the package costs 235 metal and leaves 5 metal, 110 fuel, and 25 intelligence.

### Expansion timing

The first logistics-and-vehicle expansion is represented by one depot plus one workshop. After the opening package, two metal workers and one fuel worker must cover the remaining deficit within:

- 9 extraction-seconds under the authoritative UFR-054 rates;
- 8 aggregate carry-load equivalents.

The current deficit is 315 metal, resolving to 8.75 extraction-seconds and 7.875 carry-load equivalents.

This is a deterministic economy-rate proxy. It intentionally excludes travel distance and drop-off congestion, which remain owned by UFR-051 and UFR-053 and are exercised by the later UFR-068 integration scenarios.

### Unit affordability

Unit prices are normalized into aggregate carry-load equivalents using the authoritative per-resource carry capacities. Version 1 limits are:

| Group | Included units | Maximum carry-load equivalents |
| --- | --- | ---: |
| Frontline | Infantry, medic | 3.00 |
| Precision | Drone | 3.10 |
| Armor and fires | IFV, tank, artillery | 9.75 |

This keeps light battlefield responses materially cheaper than armor and artillery without rewriting faction-specific combat values.

### Research opportunity cost

Upgrade costs are compared with the current tank cost as a durable combined-resource reference:

- tier 1 maximum: 0.75 tank-cost equivalents;
- tier 2 maximum: 1.25 tank-cost equivalents.

The constraint prevents research from becoming either a negligible automatic purchase or an implausibly expensive dead end. Research duration and queue contention remain owned by UFR-061.

### Depletion curve

The baseline fixture assigns:

- four workers to 1,800 metal;
- two workers to 900 fuel;
- one worker to 360 intelligence.

Under UFR-054 extraction rates, the resources deplete at 25, 30, and 36 seconds. The accepted window is 20–45 seconds. The fixture is deliberately deterministic and comparative; authored-map resource placement and worker travel are integration concerns for UFR-068 and campaign maps.

### Comeback floor

A player reduced to 110 metal plus one authoritative metal salvage burst must be able to rebuild:

- one engineer;
- one logistics depot.

The current package costs exactly 165 metal, matching the 110 reserve plus the 55-metal salvage burst. This establishes a narrow recovery floor without granting free units, hidden income, or automatic rebuilding.

## Ownership and extension

`economy-balance.js` owns only:

- profile versioning and validation;
- deterministic cost normalization;
- extraction-time and depletion-window analysis;
- balance-check results suitable for tests, tooling, and later telemetry.

It does not mutate runtime resources or alter `src/config.js`. A future balance change should update the public content/resource data and then intentionally adjust this profile only when the new product target changes. A failing check is evidence of drift, not permission to silently relax the threshold.

UFR-068 remains responsible for assembled economy scenarios with travel, queues, construction loss, repair, capacity, and recovery. UFR-080 may consume the same constraints when implementing economy AI, but must not duplicate the numeric rules.

## Verification

Focused verification:

```bash
node --test tests/economy/economy-balance.test.mjs
```

Authoritative verification:

```bash
bash verify.sh
```
