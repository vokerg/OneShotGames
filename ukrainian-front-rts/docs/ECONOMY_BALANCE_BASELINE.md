# Economy balance baseline

Task: UFR-066  
Profile: `gate-b2-baseline-v1`  
Schema: `ECONOMY_BALANCE_SCHEMA_VERSION = 1`

## Purpose

UFR-066 freezes a deterministic economy benchmark before the UFR-068 integration scenarios and UFR-080 economy AI consume the merged economy systems. It does not add a new resource, construction, production, research, repair, capacity, or refund mechanic. Those remain owned by UFR-051 through UFR-065.

The authoritative profile is `src/content/economy-balance.js`. Its evaluator consumes the active runtime unit/building/upgrade records, mission starts, UFR-051 resource rules, and the resource sources produced by `Game.start()`.

## Benchmark model

The model is intentionally transparent and deterministic:

- workers assigned to a resource contribute the merged extraction rate continuously;
- benchmark commitments are sequential, while resource income continues during construction, production, or research time;
- travel, pathing, harassment, worker interruption, queue contention, and player execution are excluded here and belong to UFR-068 scenario testing;
- affordability uses one worker on every resource required by the item, making cross-resource costs visible without hiding them inside a single exchange rate;
- research opportunity cost is expressed as resource-pressure seconds divided by the same value for a Ukrainian line-infantry squad;
- depletion is a two-worker stress allocation against each live map source;
- comeback is constrained so a salvage burst alone cannot create a free replacement worker, while the documented minimum liquid reserve plus one burst can fund exactly one recovery worker.

This model is a balance contract, not a claim that a human player will hit the benchmark timestamps exactly.

## Frozen baseline

### Opening and expansion

Each current mission has a three-step benchmark using its exact starting resources:

| Mission | Allocation | Commitments | Maximum completion |
| --- | --- | --- | --- |
| Donbas | one metal, one intel worker | line squad, workshop, thermal sights | 60 s |
| Zaporizhzhia | one metal, one fuel worker | FPV team, workshop, cage armor | 65 s |
| Kherson | one metal, one intel worker | tank, artillery, digital C2 | 70 s |

A change to a mission start, item cost, resource rate, or duration must either continue to satisfy these windows or deliberately version the profile with updated evidence.

### Unit affordability

From zero stock, with one worker assigned to each required resource, maximum wait targets are:

- worker: 12 seconds;
- infantry/support: 15 seconds;
- air/UAS: 18 seconds;
- armored/fires: 20 seconds;
- command: 22 seconds.

These are recovery and accessibility ceilings. They do not imply that every unit should be produced as soon as it becomes affordable.

### Research opportunity cost

Every active upgrade must cost between 1.5 and 6.0 line-squad resource-pressure equivalents. The lower bound prevents automatic, consequence-free research; the upper bound prevents one upgrade from suppressing normal force production for an excessive period under the same income assumptions.

### Depletion

The live first-mission source set is frozen at:

- metal: 1,600 and 1,800;
- fuel: 1,100 and 1,200;
- intel: 900.

With two workers stress-assigned to one source, every source must deplete between 30 and 55 seconds before travel and interruption. The test reads the actual nodes created by `Game.start()` so map-source drift is visible.

### Comeback constraint

The designated recovery purchase is `uaEngineer`. One merged salvage burst must remain insufficient by itself. A minimum reserve of 15 metal plus the salvage burst must fund exactly one engineer, not a replacement army. Production/research cancellation and structure lifecycle refunds remain governed by their owning systems.

## Validation and downstream ownership

`tests/content/economy-balance.test.mjs` proves:

- the profile is immutable and versioned;
- all mission openings and expansion commitments meet their windows;
- every active unit meets its class affordability ceiling;
- every active upgrade preserves a meaningful production tradeoff;
- runtime resource nodes match the depletion baseline and remain inside the curve bounds;
- the comeback package funds exactly one recovery worker;
- representative drift in every dimension produces an actionable error.

UFR-068 remains responsible for end-to-end economy scenarios with travel, placement, queues, repairs, base loss, and recovery. UFR-080 may consume the profile and reports for AI planning, but must not silently redefine the human economy contract.
