# Ukrainian UAS/EW branch

UFR-073 defines the Ukrainian unmanned-aircraft and electronic-warfare content contract for the **Networked Maneuver** doctrine established by UFR-069 and the stable technology-tree identities established by UFR-070.

## Design boundary

This task supplies immutable roster profiles and deterministic composition/validation helpers. It does not replace the authoritative drone lifecycle, link-loss, strike, interception, or air-defense rules owned by UFR-038 and UFR-039. Runtime integration should translate these profiles into those public systems rather than duplicate their mechanics.

## Capability chain

The branch covers six explicit capabilities:

1. **Reconnaissance** — `ua.recon-drone` provides persistent contact quality and observation.
2. **FPV strike** — `ua.fpv-strike-team` converts reconnaissance and shared targeting into a short-endurance precision attack.
3. **Relay** — `ua.relay-drone` extends control and targeting links but is a visible, high-value dependency.
4. **Jamming** — `ua.ew-team` protects friendly links and disrupts hostile unmanned systems while exposing an emissions signature.
5. **Counter-UAS** — `ua.mobile-counter-uas` combines limited interceptors and local electronic attack; saturation and ammunition exhaustion remain valid counters.
6. **Targeting support** — `ua.targeting-cell` coordinates sensors and fires but is vulnerable while deployed and to network disruption.

## Counterplay rules

The family must not become a self-contained answer to every threat. Every profile declares at least three counters and three vulnerabilities. The intended failure modes are link loss, relay loss, emissions detection, air-defense interception, ammunition exhaustion, weather, and disruption of the shared targeting network.

The branch therefore rewards combined arms:

- reconnaissance without fires or strike assets produces information rather than damage;
- FPV teams without relay or spectrum protection have constrained reach and resilience;
- jammers and counter-UAS teams require protection from artillery, armor, and flanking;
- targeting cells improve coordination but create a command-and-control dependency the opponent can attack.

## Stable identities

`ua.recon-drone` and `ua.ew-team` remain the UFR-070 roster anchors. Additional focused profiles use stable Ukrainian-prefixed IDs and reference UFR-070 production structures and technologies. Future runtime, AI, campaign, art, and audio work should consume these IDs instead of creating parallel aliases.

## Verification contract

`validateUkrainianUasEw` checks schema ownership, tiers, prerequisites, capability coverage, link parameters, payloads, counters, vulnerabilities, support links, costs, and the UFR-070 anchor IDs.

`resolveUasEwTaskGroup` preserves request order, rejects unknown or locked profiles with reason-specific evidence, totals costs, reports capability coverage, and computes a deterministic average link-hardening value for planning/debug presentation.
