# Runtime content reconciliation

## Purpose

Recovery issue #112 establishes one player-visible runtime projection over the canonical UFR-070 faction tree. The browser keeps its established camel-case unit keys for compatibility, but every active key now names exactly one canonical roster identity, producer, ordered prerequisite list, resource vocabulary, command-capacity cost, targeting domain, and declarative owner.

The projection is an adapter. It is not a second content family and must not redefine canonical records.

## Fictional command characters

The four prototype public-figure combat heroes are removed from active runtime content:

| Legacy ID | Current runtime ID | Canonical identity |
| --- | --- | --- |
| `uaZelenskyy` | `uaCommandVarta` | `ua.command-team` |
| `uaZaluzhnyi` | `uaCommandVarta` | `ua.command-team` |
| `ruPutin` | `ruCommandBastion` | `ru.command-group` |
| `ruPrigozhin` | `ruCommandBastion` | `ru.command-group` |

`Commander Varta` and `Commander Bastion` are original fictional command characters. Both legacy IDs for a faction converge on one current command identity so the active roster remains one-to-one with the canonical technology tree. Mission arrays are migrated and de-duplicated deterministically.

No campaign writing, portrait, voice, localization, or promotional capture may reintroduce a real public figure as a directly controllable combat unit. UFR-092 owns fictional narrative presentation and UFR-104 owns the final content/framing review.

## Compatibility boundary

`src/content/runtime-content-reconciliation.js` owns:

- legacy runtime-unit ID migration;
- canonical-ID-to-runtime-key migration;
- strict migration of save/config fields such as `type`, `unitType`, `unitId`, `heroes`, and `enemyHeroes`;
- actionable `unsupported` results for unknown IDs;
- deterministic de-duplication when multiple legacy aliases converge;
- idempotent runtime projection and validation.

UFR-085 must call this migration contract when versioned save/load is implemented. UFR-090 must preserve the same behavior for checkpoint payloads. Unknown unit IDs must not be silently retained.

## Active roster projection

The active runtime deliberately remains a minimum coherent subset:

- Ukrainian: engineers, line infantry, reconnaissance drone, CASEVAC, protected mobility, tank, self-propelled artillery, command team.
- Russian: engineer-sappers, motor-rifle infantry, reconnaissance UAV, medical team, APC, tank, self-propelled gun, command group.

Each runtime record receives:

- `canonicalId` from UFR-070;
- `canonicalProducerId` and ordered `canonicalRequires` from the live technology tree;
- one `contentOwner` from the declarative ownership registry;
- exactly `metal`, `fuel`, and `intel` cost fields;
- `commandCapacityCost` equal to the compatibility `pop` value;
- valid combat target domains.

Russian prototype zero-cost/zero-capacity records are normalized to the same vocabulary used by the Ukrainian runtime. This is a compatibility baseline, not final balance; UFR-066 owns economic tuning.

## Runtime building adapters

Prototype buildings remain composite runtime adapters:

| Runtime building | Canonical producer structures represented |
| --- | --- |
| `hq` | `ua.command-post` |
| `depot` | `ua.logistics-hub` |
| `barracks` | `ua.infantry-center` |
| `workshop` | `ua.motor-pool`, `ua.uas-ew-cell`, `ua.fires-center` |

Validation requires every produced runtime unit's canonical producer to be represented by its building adapter. Future authored faction construction must replace these composites rather than adding another production database.

## Duplicate ownership

`validateStableRosterOwnership()` rejects any stable canonical roster ID claimed by more than one declarative family. The active runtime projection references those owners and is not itself an owner. New UFR-071 through UFR-078 content must extend the registry and keep each ID unique.

## Integration matrix

| Contract area | Current player-visible state | Next owner |
| --- | --- | --- |
| Ukrainian/Russian active roster | Minimum canonical projection is active | UFR-066 balance; UFR-078 support breadth |
| Tactical/economy AI | Uses existing runtime entities; canonical metadata is available | UFR-080 economy AI, UFR-081 tactical AI |
| Skirmish faction selection | Not composed | UFR-083 |
| Campaign profile and flow | Not composed | UFR-084 |
| Save/load migration | Compatibility API ready; no active save service | UFR-085 |
| Mission scripting | Prototype mission objects remain | UFR-086 |
| Authored map format | Not composed | UFR-088 |
| Checkpoints | No active checkpoint consumer | UFR-090 |
| Persistent modernization | Runtime upgrades remain prototype data | UFR-091 |
| Narrative/portraits/dialogue | No final character presentation | UFR-092, then UFR-104 review |
| Donbas/Zaporizhzhia/Kherson rebuilds | Prototype missions remain | UFR-094, UFR-095, UFR-096 |
| Audio mixer and event mapping | Not composed | UFR-124 and UFR-125 |
| Semantic production UI | Existing HUD remains compatibility UI | UFR-133 and dependent UI tasks |
| Localization | Strings remain embedded | UFR-143 after UFR-104 framing review |

## Verification

The authoritative `bash verify.sh` includes `scripts/verify-runtime-content.mjs`. Focused tests cover legacy and canonical migration, unsupported IDs, non-mutating save/config migration, public-figure removal, one-to-one canonical projection, resource/capacity/target-domain metadata, production paths, mission references, and duplicate ownership.

Automated browser smoke proves that the reconciled content starts the first mission. It does not claim final faction balance, authored campaign integration, character art/voice approval, save migration in a not-yet-implemented save service, or broad manual playtesting.
