# Fields of Resolve — faction doctrine bible

## Status, scope, and authority

This document is the approved design contract for UFR-069. It defines the strategic identities of the playable Ukrainian and Russian factions for later technology-tree, roster, AI, campaign, balance, art, audio, and user-interface work.

It is not a historical, political, or military assessment. **Fields of Resolve** is stylized historical fiction. The factions below are original game abstractions built to produce readable, asymmetric RTS decisions. Later content must not present these mechanics, fictional operations, dialogue, or outcomes as factual reporting.

This document owns doctrine and asymmetry principles only. It does not add units, buildings, upgrades, missions, runtime rules, balance values, or assets. Numeric tuning belongs to later implementation and balance tasks.

The governing product constraints are:

- player comprehension and trustworthy command before spectacle;
- tactical terrain and explicit counters;
- a complete economy-to-victory loop;
- deterministic, data-driven systems;
- a campaign-led single-player experience;
- no palette-mirrored factions;
- no hidden stat cheats as the default difficulty model;
- no roster breadth that lacks visible purpose, counterplay, and production ownership.

## Shared conflict model

Both factions contest the same strategic resources and battlefield spaces, but they solve those problems differently.

The shared match loop is:

1. establish information about terrain, routes, objectives, and enemy composition;
2. secure a sustainable economy and command capacity;
3. shape the battlefield through positioning, obstacles, fires, and denial;
4. create a temporary local advantage;
5. exploit that advantage before the opponent adapts;
6. preserve enough force and infrastructure to repeat the cycle;
7. convert operational advantage into objectives rather than relying on total annihilation alone.

Every faction must be able to:

- gather, construct, produce, research, repair, reinforce, and recover;
- field credible infantry, anti-armor, reconnaissance, indirect-fire, air-defense, engineering, logistics, and command capabilities;
- contest every target domain in the combat schema;
- detect and answer every major threat class, although not with the same cost, timing, or method;
- recover from local losses without receiving an automatic comeback victory;
- win through more than one army composition;
- lose because of understandable decisions rather than hidden hard counters.

Asymmetry changes **how** a faction solves a problem, not whether it is allowed to participate in the core game loop.

## Asymmetry guardrails

### No palette mirroring

A faction distinction is insufficient when it only changes names, colors, silhouettes, or small stat percentages. A valid asymmetric difference changes at least two of the following:

- information required before commitment;
- production or research timing;
- preferred force concentration;
- movement and deployment pattern;
- command burden;
- sustainment pattern;
- risk taken when using the capability;
- counterplay window exposed to the opponent.

### No unilateral superiority

Neither faction may be globally superior in economy, reconnaissance, fires, mobility, durability, and command at the same time. A strength must create at least one of:

- a resource opportunity cost;
- a command-capacity burden;
- a setup, exposure, or recovery window;
- a dependency on information, logistics, or infrastructure;
- a predictable countermeasure;
- reduced flexibility elsewhere.

### No deterministic opening trap

No standard opening should become unwinnable because the player did not guess one hidden faction-specific option. Early threats must have:

- a visible tell;
- at least one baseline response;
- enough reaction time for an attentive player;
- a more efficient specialized response that rewards scouting and preparation.

### No faction-wide stereotype bonuses

Do not encode national, ethnic, or political stereotypes as morale, intelligence, bravery, accuracy, discipline, or competence modifiers. Doctrine is expressed through systems, organization, production choices, and battlefield tools.

### Competent opposition

The Russian faction is an opposing force, not a joke faction. Its strengths must be credible, its internal logic must be learnable, and its AI must use its doctrine competently. The Ukrainian faction is the campaign lead, not an all-purpose superior faction. Its advantages require player attention and can fail under pressure.

## Doctrine at a glance

| Dimension | Ukrainian doctrine | Russian doctrine | Primary counterplay |
| --- | --- | --- | --- |
| Strategic identity | Networked initiative and adaptive combined arms | Prepared mass and layered operational pressure | Disrupt the enabling network or prevent concentration |
| Economy rhythm | Distributed, flexible, efficient at redirecting scarce resources | Throughput-oriented, infrastructure-heavy, efficient when production lines remain stable | Raid flexible nodes versus sever major logistics hubs |
| Reconnaissance | High-value, precise, rapidly shared information | Broad, persistent, layered observation with greater footprint | Jam, deceive, screen, relocate, and destroy sensor links |
| Fires | Precision, responsive targeting, shorter exploitation windows | Volume, preparation, area denial, and sustained pressure | Disperse and relocate versus penetrate the fire-support chain |
| Mobility | Route flexibility, protected repositioning, rapid task-organizing | Deliberate corridors, echelon movement, reserves, and breakthrough follow-up | Deny maneuver space versus force premature deployment |
| Durability | Preservation through repair, recovery, concealment, and avoidance | Preservation through armor, redundancy, reserves, and replacement depth | Overload recovery versus isolate and defeat layers |
| Command | Local initiative inside a shared information network | Strong planned coordination and command-supported concentration | Create uncertainty versus overload the plan and command nodes |
| Power curve | Earlier flexibility; strength rises with information quality and force preservation | Slower setup; strength rises with infrastructure, reserves, and sustained tempo | Deny scouting and attrit specialists versus prevent stable buildup |
| Failure mode | Fragmentation, attention overload, specialist losses, interrupted links | Rigidity, congestion, exposed logistics, delayed adaptation | Force simultaneous crises versus create multiple unexpected axes |

## Ukrainian faction doctrine

### Strategic identity: networked initiative

The Ukrainian faction wins by seeing an opportunity sooner, assembling the right local combination, acting quickly, and preserving the force after the engagement. Its army should feel responsive and modular rather than universally faster or stronger.

The core decision loop is:

1. acquire specific information;
2. select a limited objective;
3. compose a task group for that objective;
4. create a local information or precision advantage;
5. strike, breach, rescue, defend, or disengage;
6. recover damaged units and reassign specialists;
7. repeat from a new direction before the opponent stabilizes.

The faction rewards:

- control groups and mixed-unit coordination;
- reconnaissance-to-fires links;
- terrain use and route changes;
- timely repair, recovery, smoke, engineering, and withdrawal;
- preserving experienced or specialized units;
- redirecting production when new information appears.

It punishes:

- unsupported specialists;
- fighting broad frontal battles without information;
- leaving damaged high-value units in attritional exchanges;
- excessive simultaneous micro demands;
- losing command, relay, recovery, or reconnaissance assets.

### Economy rhythm: distributed adaptation

The Ukrainian economy should support flexible redirection rather than effortless abundance.

Doctrine requirements:

- smaller or distributed economic nodes should remain useful longer than one monolithic base cluster;
- production should permit meaningful reprioritization when scouting reveals a new threat;
- advanced capabilities should compete for scarce research, production, command, or specialist capacity;
- repair and recovery should often be more efficient than replacement, but must consume time, access, and resources;
- expansion should improve route options and resilience, not merely increase income;
- the faction must not receive a blanket resource-income bonus simply for being Ukrainian.

Preferred economic decisions:

- whether to invest in information, precision, mobility, sustainment, or immediate line strength;
- whether to establish another flexible node or harden an existing one;
- whether to repair an experienced force or replace it with cheaper baseline units;
- whether to preserve a specialist slot or broaden the army.

Counterplay:

- force repeated defensive reactions that consume attention and repositioning time;
- raid exposed distributed nodes and recovery routes;
- pressure multiple resource types to make flexible production choices costly;
- destroy specialist production or relay infrastructure rather than only attacking the headquarters.

### Reconnaissance: precise and shareable

Ukrainian reconnaissance should provide high-quality, actionable information but depend on links, survivable platforms, and player attention.

Doctrine requirements:

- reconnaissance tools should differ by persistence, risk, precision, and link dependency;
- identifying a target must not automatically destroy it;
- precision fires and strike systems should gain substantial value from current spotting;
- relays and command assets should improve information sharing without granting omniscience;
- stale contacts, jamming, concealment, and line-of-sight loss must remain meaningful;
- reconnaissance assets should be valuable enough that careless losses alter the player's plan.

Player expression:

- use scouts, observation posts, drones, terrain, and probing attacks to resolve uncertainty;
- hand off information from a risky forward sensor to a safer strike or command element;
- create temporary information superiority over one sector rather than permanent map-wide vision.

Counterplay:

- layered air defense, counter-recon patrols, camouflage, smoke, decoys, and jamming;
- rapid relocation after firing or detection;
- attacks on relay and command links;
- feints that consume precision weapons or reposition the task group.

### Fires: responsive precision

Ukrainian fires should be strongest when linked to current information and used to create a short exploitation window.

Doctrine requirements:

- precision and responsiveness are strengths, not unlimited range or perfect accuracy;
- artillery, drones, missiles, and attack-ground tools should have different spotting, setup, ammunition, exposure, and counter-battery profiles;
- high-value strikes should require target confirmation, limited availability, or meaningful opportunity cost;
- fires should support maneuver and objectives rather than replace the need for ground forces;
- repeated firing from one location must create detectable risk.

Preferred use:

- suppress or disable one critical defense;
- break a logistics or command link;
- isolate a local group;
- cover a withdrawal or breach;
- punish an exposed reserve or firing position;
- immediately exploit before the target recovers or relocates.

Counterplay:

- dispersion, concealment, layered air defense, jamming, rapid movement, decoys, hardened positions, and counter-battery fire;
- accepting minor losses while denying a decisive target;
- forcing the player to spend precision assets on low-value emergencies.

### Mobility: route flexibility

Ukrainian mobility should emphasize changing axes, protected repositioning, and task-group modularity.

Doctrine requirements:

- the faction should have multiple ways to move infantry, specialists, reconnaissance, and support assets;
- route choice, bridges, roads, mud, obstacles, mines, and damaged vehicles must matter;
- mobility should not mean every Ukrainian unit has superior base speed;
- transport and protected mobility should trade firepower, capacity, protection, and availability;
- withdrawal and recovery should be valid decisions, not automatic failure states.

Preferred use:

- reposition before a prepared response arrives;
- bypass a strongpoint and attack its support;
- reinforce one sector with a tailored group;
- extract damaged or valuable units;
- exploit an information gap.

Counterplay:

- mines, obstacles, chokepoints, artillery interdiction, route surveillance, reserve forces, and pressure on transport capacity;
- forcing the Ukrainian player to commit on several separated axes;
- destroying recovery and bridging assets.

### Durability: preserve the force

Ukrainian durability should come from avoiding unfavorable damage, repairing promptly, recovering disabled equipment, and maintaining experienced specialists.

Doctrine requirements:

- strong repair and recovery options must require access, time, resources, and vulnerable support assets;
- smoke, concealment, movement, cover, and information are part of durability;
- veterancy and specialist preservation should matter without making elite units unkillable;
- damaged units should present a real choice between continued risk and operational withdrawal;
- a lost high-value platform must not be instantly replaced at trivial cost.

Counterplay:

- finish disabled or isolated targets;
- attack repair sites, routes, and recovery vehicles;
- maintain pressure so damaged units cannot cycle safely;
- use area denial to separate support from the fighting line.

### Command: delegated initiative

Ukrainian command should improve responsiveness, information distribution, and coordination of small mixed groups.

Doctrine requirements:

- command assets should reduce friction or enable coordination, not apply invisible global stat superiority;
- local groups should continue basic behavior after losing command support, but lose efficiency, information quality, or special coordination;
- command-capacity choices should force tradeoffs between many baseline units and more specialized task groups;
- the player should be able to understand which command or relay asset enables a capability.

Counterplay:

- disrupt command or relay nodes;
- force simultaneous crises that exceed player attention;
- separate task groups from their support;
- create false or stale information;
- compel premature commitment before the network is assembled.

### Power curve and failure state

Opening: flexible baseline forces and early reconnaissance create options, but the faction lacks depth for wasteful exchanges.

Midgame: combined reconnaissance, mobility, engineers, fires, and recovery create the strongest expression of doctrine. The player should feel able to solve different problems, but not all at once.

Late game: preserved specialists and modernization create a capable networked force. The faction must still respect mass, prepared defenses, logistics, and attrition. Late-game power should come from a functioning system, not a roster of individually superior units.

Systemic failure occurs when the player has units but loses the network that makes them effective: scouts are gone, relays are disrupted, specialists are isolated, repair capacity is overloaded, and too many local emergencies compete for attention.

## Russian faction doctrine

### Strategic identity: layered operational pressure

The Russian faction wins by preparing a stable base of production and logistics, building layered information and fire support, concentrating sufficient force, and sustaining pressure longer than the opponent can adapt.

The core decision loop is:

1. establish infrastructure and broad observation;
2. define a main effort and supporting sectors;
3. assemble line forces, fires, air defense, engineers, logistics, and reserves;
4. prepare the target area through reconnaissance and denial;
5. advance in echelons or force a defensive commitment;
6. reinforce success or rotate a depleted layer;
7. maintain pressure until an objective, route, or economy collapses.

The faction rewards:

- planned production and reserve management;
- layered combined-arms groups;
- broad reconnaissance coverage;
- sustained fires and area denial;
- deliberate route preparation;
- maintaining logistics and command continuity;
- using depth rather than relying on one irreplaceable unit.

It punishes:

- congested deployment;
- exposed infrastructure;
- committing reserves too early;
- rigidly repeating an identified plan;
- outrunning air defense, engineers, logistics, or command;
- allowing the opponent to defeat layers separately.

### Economy rhythm: stable throughput

The Russian economy should reward protected infrastructure, planned queues, and sustained production.

Doctrine requirements:

- major production and logistics investments should become efficient when kept active;
- switching a mature production plan should carry more friction than Ukrainian redirection;
- reserves and replacement depth should be available through preparation, not free unit generation;
- large infrastructure should create strategic targets and route dependencies;
- economy strength should be vulnerable to disruption, congestion, and loss of key hubs;
- the faction must not receive hidden income or free units as a default AI crutch.

Preferred economic decisions:

- which production line supports the main effort;
- when to bank reserves versus reinforce immediately;
- whether to invest in broad support layers or accelerate the assault mass;
- where to establish logistics hubs and protected routes;
- when to accept temporary over-cap or infrastructure risk.

Counterplay:

- raid logistics hubs, rally routes, bridges, and production exits;
- force costly production switches;
- threaten multiple sectors so concentration becomes risky;
- destroy enabling support rather than trading directly into the main force.

### Reconnaissance: broad and persistent

Russian reconnaissance should create a wide operational picture through layered sensors, patrols, observation, and reconnaissance-strike integration.

Doctrine requirements:

- broad coverage should require more footprint, infrastructure, or visible assets;
- persistence should trade against precision, concealment, or rapid redeployment;
- reconnaissance must support fires and route security but remain vulnerable to destruction, deception, and jamming;
- the faction should be good at maintaining contact with a known front, not omniscient about hidden flanks;
- observation gaps should appear when the force advances faster than its sensor layers.

Player expression:

- maintain overlapping observation zones;
- use reconnaissance to screen routes and protect the main effort;
- identify general concentrations, then refine targets for fires;
- use patrols and forward observation to prevent surprise.

Counterplay:

- decoys, smoke, jamming, concealed routes, sudden axis changes, and attacks on observation infrastructure;
- presenting several plausible threats;
- exploiting the delay between broad detection and precise engagement.

### Fires: volume and preparation

Russian fires should shape terrain, suppress areas, isolate routes, and sustain pressure.

Doctrine requirements:

- volume must consume ammunition, setup time, logistics, exposure, or command attention;
- artillery and rockets should create visible preparation and counter-battery signatures;
- area denial should influence movement without becoming unavoidable map-wide damage;
- fires should be strongest against fixed, concentrated, or predictable targets;
- direct assault still requires ground forces and engineers.

Preferred use:

- suppress a defensive belt;
- close a bridge, road, or reinforcement route;
- force dispersion;
- cover deliberate movement;
- exhaust repair and recovery capacity;
- punish predictable firing positions or static economy.

Counterplay:

- relocate, disperse, harden, infiltrate, jam, counter-battery, and attack ammunition or command links;
- create false concentrations;
- move during gaps in the fire cycle;
- force close engagements where broad fires are dangerous or inefficient.

### Mobility: deliberate corridors and reserves

Russian mobility should emphasize prepared routes, echelon movement, protected follow-up, and reserves rather than universal speed.

Doctrine requirements:

- engineers, bridging, route clearance, and traffic management should materially enable movement;
- the main force should be powerful when its layers remain connected;
- congestion and blocked exits must be real planning risks;
- reserve units should exploit or stabilize after the first layer commits;
- off-road shortcuts should carry terrain, formation, or sustainment costs.

Preferred use:

- secure a corridor and move multiple layers through it;
- rotate depleted units while maintaining pressure;
- hold a reserve behind the main effort;
- widen a breach after engineers and fires create access;
- use protected mobility to sustain a deliberate advance.

Counterplay:

- mine, obstruct, interdict, destroy bridges, attack exits, and create traffic conflicts;
- threaten rear routes;
- force the reserve to deploy defensively;
- open a second axis after the main force commits.

### Durability: layers, redundancy, and depth

Russian durability should come from armor, formation depth, support layers, redundancy, and replacement planning.

Doctrine requirements:

- individual durable units must still have explicit anti-armor, mobility, air, engineering, and sustainment counters;
- redundancy should cost resources, capacity, and deployment space;
- reserve and replacement strength should depend on production and logistics;
- air defense, infantry screens, engineers, repair, and command should protect armor without making a death ball invulnerable;
- losses to support layers should progressively expose the force.

Counterplay:

- isolate the leading layer from support;
- attack logistics, air defense, engineers, command, or recovery;
- use terrain and obstacles to prevent mass from applying simultaneously;
- force repeated redeployment and production switching;
- avoid symmetric attrition when the opponent's throughput is intact.

### Command: planned concentration

Russian command should improve coordination of layered groups, prepared fires, reserves, and sustained operations.

Doctrine requirements:

- command assets should enable synchronized actions and clear main-effort bonuses or permissions;
- changing the main effort should be possible but slower or more expensive than local Ukrainian retasking;
- subordinate groups should retain baseline function after command loss, while planned coordination and response quality degrade;
- the player and AI must receive visible warnings for overloaded routes, unsupported advances, and missing layers;
- command strength must not become a hidden global accuracy or damage bonus.

Counterplay:

- create unexpected threats after the plan commits;
- strike command posts or communications;
- force the main effort to split;
- trigger reserve deployment away from the decisive sector;
- maintain uncertainty so preparation targets the wrong place.

### Power curve and failure state

Opening: baseline line forces and broad scouting can secure space, but advanced pressure requires infrastructure and support layers.

Midgame: stable production, fires, engineers, air defense, and reserves allow deliberate concentration. The faction becomes dangerous when it controls routes and can repeat attacks.

Late game: infrastructure and replacement depth support sustained operations. The faction must remain vulnerable to logistics disruption, congestion, command loss, and attacks across multiple axes.

Systemic failure occurs when the faction still owns a large force but loses coherence: routes are blocked, support layers are separated, logistics hubs are exposed, reserves are committed piecemeal, and the main effort cannot adapt to a new axis.

## Explicit cross-faction counterplay

### Information contest

Ukrainian advantage:

- precise, rapidly shared contacts;
- fast conversion of current information into local action.

Russian answer:

- broad observation, layered air defense, jamming, decoys, and persistent route screening.

Russian advantage:

- persistent coverage of known fronts and prepared sectors;
- stronger ability to maintain contact during sustained pressure.

Ukrainian answer:

- route changes, concealment, relay redundancy, deception, precision attacks on observation nodes, and short exposure windows.

### Precision versus volume fires

Ukrainian fires should remove or disable a critical element when information and timing are correct.

Russian counterplay is to provide redundant layers, decoys, concealment, and enough depth that one precision success does not collapse the whole force.

Russian fires should shape areas and exhaust static defenders over time.

Ukrainian counterplay is to disperse, reposition, maintain alternate routes, use counter-battery reconnaissance, and avoid presenting fixed concentrations.

### Flexible task groups versus prepared mass

Ukrainian task groups should defeat isolated elements and exploit gaps.

Russian counterplay is to maintain connected layers, reserve coverage, protected routes, and enough observation to prevent local defeat in detail.

Russian mass should dominate a prepared axis when support remains intact.

Ukrainian counterplay is to deny concentration, attack support, create simultaneous threats, and disengage from the strongest sector.

### Recovery versus replacement depth

Ukrainian force preservation should reward extracting and repairing valuable units.

Russian counterplay is to maintain pressure, interdict recovery routes, and finish disabled targets.

Russian replacement depth should sustain operations after ordinary losses.

Ukrainian counterplay is to destroy infrastructure, logistics, and specialist layers so replacement throughput cannot restore the full combined-arms system.

### Initiative versus plan

Ukrainian command should excel at local adaptation.

Russian counterplay is to create broad pressure that generates more crises than the player can solve with limited specialists and attention.

Russian command should excel at synchronized preparation.

Ukrainian counterplay is to introduce uncertainty, change axes, strike command links, and force premature reserve commitment.

## Match pacing contract

### Opening phase

The first meaningful decision must occur within two minutes.

Ukrainian opening questions:

- which information source or route should reveal the opponent's plan;
- whether to protect economy flexibility or contest forward terrain;
- which baseline specialist prevents an early trap.

Russian opening questions:

- where to place the first durable economic and observation layer;
- which corridor or objective will become the main effort;
- how much line strength to field before investing in support depth.

Both factions must have baseline answers to early infantry, light vehicle, reconnaissance, and static-defense pressure.

### Midgame phase

The midgame is the primary asymmetry showcase.

Ukrainian play should involve task-group composition, scouting updates, precision windows, recovery, and axis changes.

Russian play should involve production commitment, layered support, fires preparation, route control, reserves, and sustained pressure.

A player who ignores the opponent's doctrine should suffer inefficient trades, but retain a visible path to adapt.

### Late-game phase

Late-game armies should become broader systems, not collections of uncapped super-units.

Ukrainian late game:

- stronger network effects from preserved specialists and modernization;
- greater risk of attention overload and expensive specialist loss.

Russian late game:

- stronger throughput, reserves, and layered concentration;
- greater risk from infrastructure targets, congestion, and strategic rigidity.

No late-game technology may erase an entire counter class. Upgrades may improve efficiency, unlock a new method, or reduce a vulnerability, but must preserve opponent agency.

## Anti-snowball and recovery constraints

The doctrine supports advantage without making the first lost engagement decisive.

Required constraints:

- core counter capability remains reachable after losing one production structure;
- repair, recovery, reserves, and reconstruction consume resources and time;
- destroying advanced infrastructure creates advantage but not permanent tech deletion unless a mission explicitly says so;
- expansion increases exposure and route burden as well as income;
- command-capacity loss creates visible over-cap pressure rather than silently deleting units;
- veterancy rewards preservation but remains bounded;
- artillery, drones, and advanced support require replenishment, cooldown, setup, or limited production capacity;
- objectives, terrain, and alternate routes provide ways to trade space for time;
- AI difficulty changes planning quality, information limits, reaction delay, risk tolerance, and economy efficiency rather than granting unexplained combat multipliers.

A losing player should be able to choose between:

- stabilizing a smaller defensible area;
- raiding the opponent's enabling infrastructure;
- changing production toward a cost-efficient counter;
- preserving a core force while rebuilding;
- contesting an alternate objective;
- forcing the leading player to split attention.

Recovery must not become automatic. The leading player should be rewarded for scouting the recovery, protecting logistics, and converting advantage into objectives.

## Technology and roster implications

UFR-070 must translate this doctrine into complete technology trees and roster slots.

Required technology-tree properties:

- each faction has distinct roots, branches, prerequisites, and opportunity costs;
- both factions reach all required battlefield roles;
- faction-exclusive nodes express doctrine through capabilities and constraints, not only numeric bonuses;
- mutually exclusive choices represent meaningful operational commitments;
- campaign locks and availability overrides remain explicit in the technology graph;
- no branch is mandatory in every standard match;
- every advanced branch has a visible counter path available to the opponent.

Required roster properties:

- every unit has a primary role, secondary utility, explicit weakness, production source, command cost, and expected support relationship;
- similar real-world categories may occupy different gameplay roles across factions;
- baseline units remain relevant through positioning, support, veterancy, or economical efficiency;
- specialist density is bounded by cost, production access, capacity, or command burden;
- units do not receive faction identity from color and names alone.

## AI doctrine requirements

UFR-079 through UFR-082 must encode doctrine as inspectable planning policy.

Ukrainian AI should:

- value current reconnaissance and uncertainty reduction;
- assemble objective-specific task groups;
- redirect production when high-confidence threats appear;
- preserve damaged high-value or veteran units;
- use alternate routes and limited local concentration;
- attack enabling infrastructure when direct combat is inefficient;
- avoid dividing specialists across too many simultaneous operations.

Russian AI should:

- define and expose a main effort;
- construct production, logistics, observation, air-defense, engineer, and fire-support layers;
- maintain a reserve until a trigger justifies commitment;
- prepare routes and target areas before major attacks;
- rotate or reinforce layers rather than sending isolated units continuously;
- adapt when the main effort is repeatedly denied;
- protect infrastructure and relieve congestion.

Debug inspection must explain:

- current doctrine profile;
- main objective or effort;
- known and uncertain threats;
- resource and capacity budgets;
- requested unit roles;
- reason for attack, delay, retreat, reserve commitment, or production switch.

Difficulty must not invalidate doctrine through omniscience or free-force injection by default.

## Campaign and mission implications

Campaign missions should teach and test doctrine through geography and objectives.

Ukrainian-led missions should create decisions involving:

- incomplete information;
- limited specialist availability;
- reconnaissance and precision timing;
- route changes and extraction;
- repair, recovery, and force preservation;
- defending several needs with a flexible but finite force.

Russian opposition should create:

- layered defenses and observation;
- prepared fires and route denial;
- infrastructure and logistics targets;
- reserve counterattacks;
- sustained pressure that can be disrupted through intelligent objectives.

Mission scripts must avoid claiming that fictional doctrine, dialogue, unit behavior, or outcomes document real events. Briefings may describe the fictional operation's game logic in clear terms.

Skirmish maps must provide:

- more than one viable axis;
- meaningful infrastructure and logistics locations;
- room for concealment, observation, fires, and maneuver;
- chokepoints that can be contested but not permanently sealed without counterplay;
- objectives that reward both flexible raids and deliberate concentration.

## Art, audio, and interface implications

Faction readability must survive grayscale, motion, combat effects, and ordinary play zoom.

Ukrainian presentation should emphasize:

- compact, modular task groups;
- clear reconnaissance, relay, recovery, and precision-support silhouettes;
- concise acknowledgements and information updates;
- visual cues for links, current spotting, specialist state, and extraction readiness.

Russian presentation should emphasize:

- formation depth, support layers, prepared positions, logistics, and reserves;
- readable silhouettes for artillery, air defense, engineers, command, and route-support assets;
- clear preparation, salvo, deployment, and reinforcement cues;
- visible distinction between the leading layer and enabling rear elements.

These are readability directions, not mandates for copied uniforms, insignia, vehicles, audio, or interface conventions. Asset tasks must use original, traceable sources and avoid documentary-looking presentation.

The interface must communicate:

- why a capability is available or unavailable;
- which sensor, command, logistics, or production dependency enables it;
- the countermeasure suggested by observed enemy behavior;
- whether information is current, stale, jammed, or uncertain;
- whether a force is unsupported, over capacity, blocked, or at recovery risk.

## Balance review questions

Before approving a faction capability, reviewers must answer:

1. What decision does this add?
2. Which doctrine pillar does it express?
3. What information tells the opponent it exists?
4. What baseline response prevents an opening trap?
5. What efficient specialized counter rewards preparation?
6. What cost, dependency, setup, exposure, or command burden pays for the strength?
7. Can the AI use it and explain its decision?
8. Does it preserve the economy-to-victory loop?
9. Does it create a new role or merely duplicate another unit?
10. Does it remain understandable at ordinary play zoom?
11. Does it serialize and restore without hidden state?
12. Does it avoid factual, national, or political claims outside the fictional game contract?

A capability that cannot answer these questions is not ready for roster or balance implementation.

## Ownership map for downstream tasks

- UFR-070 owns technology-tree, production-structure, roster-slot, prerequisite, unique-mechanic, and counter-matrix translation.
- UFR-071 through UFR-077 own faction unit-family data and system integrations.
- UFR-078 owns logistics, resupply, transport, command, recovery, bridging, and off-map support mechanics.
- UFR-079 owns AI architecture and the inspectable doctrine profile.
- UFR-080 and UFR-081 own economy and tactical planning implementations.
- UFR-082 owns difficulty profiles without default hidden-stat cheating.
- UFR-083 owns skirmish setup and map-level integration.
- UFR-091 owns campaign modernization choices and respec policy.
- UFR-094 through UFR-103 own mission-specific application and campaign balance.
- UFR-106 and later production tasks own art-direction translation, original assets, audio, and presentation.
- UFR-066 owns final numeric economy and timing balance.
- UFR-068 and later integration tasks own end-to-end scenario proof.

Later tasks may refine implementation details, but changing the strategic identities, global guardrails, or cross-faction counterplay in this document requires an explicit doctrine or product-scope decision.
