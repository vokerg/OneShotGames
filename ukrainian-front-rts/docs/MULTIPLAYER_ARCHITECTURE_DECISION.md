# Multiplayer architecture decision — UFR-161

Status: **NO-GO for the current product/release line**  
Decision date: 2026-09-01  
Scope: optional Gate F (`UFR-161`–`UFR-168`)

## Decision

Do **not** introduce network multiplayer into the current Fields of Resolve product line.

Gate F is explicitly an optional P3 post-release expansion, and UFR-161 is the mandatory decision gate before any network code. The current product is a dependency-free static browser RTS with deterministic single-runtime simulation/replay facilities and reproducible static packaging. It has no signaling service, session backend, identity/account service, authoritative game server, TURN budget, operator/on-call model, abuse-reporting service, or multiplayer privacy/security policy.

Adding a fake in-memory transport, same-tab adapter, `BroadcastChannel` prototype, or manually exchanged SDP would make tests look network-shaped without satisfying UFR-162/UFR-163 acceptance. Those approaches are therefore explicitly rejected as completion shortcuts.

The decision can be revisited only through new queue work (`UFR-169+`) after the prerequisites in this document are funded and owned. Existing UFR-162–UFR-168 IDs remain permanent and should be closed individually with supersession markers referencing this NO-GO rather than deleted, renumbered, or implemented as stubs.

## Product scope considered

The smallest credible future multiplayer product would be private-session skirmish first:

- 1v1 as the primary supported topology, with small co-op considered only after the same synchronization model is proven;
- invite/room-code sessions rather than public matchmaking;
- no player-to-player chat in the initial scope;
- deterministic fixed-step simulation, replay capture, reconnect/drop policy, version compatibility, and hidden-information protection;
- campaign remains single-player unless a later product decision explicitly authors co-op campaign semantics.

Even this reduced scope requires infrastructure and product surfaces absent from the current static release.

## Alternatives evaluated

### A. Browser P2P command lockstep over WebRTC

**Advantages**

- Preserves the current client-side simulation architecture and can send compact command streams instead of world snapshots.
- Avoids continuously hosting an authoritative simulation for every match.
- Fits UFR-147 replay concepts conceptually: commands, seed, version metadata, and checksums can become synchronization evidence.

**Blocking risks**

- UFR-147 proves deterministic reconstruction inside the supported simulation harness; it does **not** prove bit-identical long-running state across Chrome, Firefox, Safari, Edge, operating systems, CPU implementations, or future JS-engine versions.
- WebRTC still requires session signaling. Reliable NAT traversal in real deployments also requires STUN and, for a meaningful fraction of users, TURN relay capacity. That creates a hosted service and ongoing availability/cost obligation even though packets are otherwise peer-to-peer.
- Direct peer connectivity may expose network-address metadata to the other peer or infrastructure. Privacy disclosure and retention policy therefore become product requirements.
- Lockstep trusts every peer with authoritative inputs and usually with enough simulation state to undermine fog-of-war secrecy. It has weak anti-cheat properties without additional verification or authority.
- Slow peers, tab throttling, suspend/resume, mobile power management, packet loss, reconnect, host departure, and version drift all need deterministic policies before the first player-facing session flow is acceptable.

**Verdict:** technically plausible future direction, but **NO-GO now** until cross-browser determinism and service ownership are proven.

### B. Authoritative game server

**Advantages**

- Best boundary for hidden information, command validation, anti-cheat, reconnect, dispute diagnostics, and a single authoritative simulation timeline.
- Client rendering/timing differences cannot directly choose the match result.

**Blocking risks**

- The current application has no production headless server process or server deployment boundary. Creating one is a new runtime product, not a thin adapter.
- Requires session/identity design, hosting, capacity planning, autoscaling or bounded concurrency, region strategy, availability targets, observability, patch/version coordination, secure configuration, incident response, and cost ownership.
- Server-side simulation must remain compatible with the browser client while preventing client-owned hidden state from leaking through APIs.
- Abuse controls, rate limiting, authentication/session integrity, denial-of-service exposure, dependency patching, and operational security become release blockers.

**Verdict:** stronger long-term trust model, but materially larger than the existing static product. **NO-GO now**.

### C. Browser-local / LAN-only substitutes

`BroadcastChannel`, `SharedWorker`, same-origin tabs, in-memory transports, or test-process sockets are valuable deterministic test adapters but are not internet/LAN multiplayer products. Browser LAN discovery is not a portable substitute for session infrastructure, and manually exchanging opaque WebRTC offers is not acceptable release UX.

**Verdict:** may be used later as test infrastructure, but cannot satisfy UFR-162/UFR-163 and must not be shipped as “multiplayer.”

## Determinism gate for any future lockstep design

Before selecting lockstep, a future architecture task must demonstrate all of the following on exact game/content versions:

1. Cross-browser and cross-OS replay/checksum parity for long deterministic matches using identical seed and commands.
2. No simulation result depends on wall-clock time, rendering cadence, DOM state, audio, input event timing outside the normalized command tick, unordered object traversal, or non-owned randomness.
3. A versioned canonical command schema with deterministic ordering for same-tick commands and choices.
4. Fixed buffering semantics for latency/jitter, bounded maximum stall, pause ownership, player-drop behavior, and deterministic timeout resolution.
5. Periodic checksums that identify the first divergent tick and produce a self-contained diagnostic/replay artifact.
6. Explicit policy for numeric precision and any operations whose cross-engine behavior could drift over long matches.

Passing the current single-runtime replay tests is necessary but not sufficient for this gate.

## Security, privacy, cheating, and moderation

Any future GO decision must include a threat model covering at minimum:

- malformed or replayed commands and session messages;
- spoofed identity/session membership;
- command-rate abuse and resource exhaustion;
- version/protocol downgrade attempts;
- save/replay payload validation and diagnostic-data privacy;
- fog-of-war / hidden-information leakage;
- P2P address/privacy disclosure and TURN/signaling data retention;
- client tampering and what anti-cheat claims are realistic under P2P versus server authority;
- public-session abuse if discovery/matchmaking is ever introduced.

Initial future scope should omit chat. Adding chat would require separate moderation, blocking/reporting, retention, safety, and accessibility decisions rather than being treated as a free lobby feature.

## Hosting and operational cost

A real multiplayer release must have an explicit owner and budget for whichever services the chosen model requires:

- signaling and STUN/TURN for WebRTC P2P; or
- authoritative simulation/session servers plus ingress, storage/telemetry where applicable, deployment, observability, and incident response.

The plan must specify capacity assumptions, cost ceilings, region/latency targets, retention, availability expectations, service shutdown behavior, and what happens to already-started matches during deploys or outages. “Static hosting only” is not a credible production plan for either real WebRTC matchmaking or authoritative sessions.

## Reconnect and lifecycle requirements

A future design must decide before implementation:

- who owns session identity and reconnect tokens;
- grace period and deterministic command treatment while disconnected;
- whether a dropped player stalls, is replaced by AI, forfeits, or causes match termination;
- host migration behavior for P2P, or explicitly no migration;
- browser refresh/tab suspension policy;
- synchronization snapshot/checkpoint strategy if reconnect is supported;
- replay completeness when a match desyncs or terminates early.

These are simulation/product rules and cannot be delegated to UI error handling.

## Preconditions for reopening Gate F

A new UFR-169+ architecture proposal may recommend GO only when all of these have named owners and acceptance evidence:

1. **Product authorization:** concrete multiplayer audience, topology, supported platforms, session discovery model, and non-goals.
2. **Determinism proof:** cross-browser/cross-OS checksum parity sufficient for lockstep, or an approved authoritative-server alternative.
3. **Infrastructure ownership:** signaling/TURN or server architecture, deployment environment, availability target, monitoring, cost budget, and incident owner.
4. **Security/privacy:** threat model, privacy disclosures/data-retention policy, abuse controls, hidden-information policy, and realistic anti-cheat boundary.
5. **Lifecycle protocol:** versioned commands/session messages, latency buffer, pause/drop/reconnect policy, desync handling, and replay/diagnostic capture.
6. **QA capacity:** latency/loss simulation, browser/OS matrix, reconnect/desync/load/security tests, and player usability testing.
7. **Release baseline:** single-player release evidence is no longer being represented through unresolved mandatory promotion evidence, or multiplayer is explicitly authorized as a separately gated product line.

## Consequences for UFR-162–UFR-168

The mandatory UFR-161 decision is **NO-GO**, so implementing downstream Gate F network tasks would violate their architecture dependency. Therefore:

- UFR-162 — superseded: no network simulation boundary is authorized.
- UFR-163 — superseded: no production lobby/session transport is authorized.
- UFR-164 — superseded: no live network synchronization layer exists to checksum/recover.
- UFR-165 — superseded: do not expose non-functional multiplayer UI.
- UFR-166 — superseded: do not spend balance/map scope on an unauthorized network mode.
- UFR-167 — superseded for multiplayer observer mode; existing single-player replay remains owned by its current tasks.
- UFR-168 — superseded: there is no multiplayer beta product to certify or publish.

Each permanent task ID should receive its own completion marker recording this supersession, in dependency order, so the derived queue becomes complete without falsely claiming a multiplayer beta was built or verified.

## What this decision does not change

- No single-player simulation, replay, save, UI, rendering, content, balance, packaging, or release behavior changes.
- UFR-147 deterministic replay remains valid within its recorded evidence level.
- No claim is made that Fields of Resolve has multiplayer, a multiplayer beta, LAN play, online services, matchmaking, or `RELEASE_VERIFIED` multiplayer evidence.
