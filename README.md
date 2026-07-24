# Bălți City Walk

A small first-person walking scene inspired by the civic centre of Bălți, Moldova. The visual language is deliberately blocky—somewhere between Roblox, Minecraft and a low-poly architectural model—while retaining recognisable local cues.

## Run

From the repository root:

```bash
npm start
```

That is the complete startup procedure. The command uses a dependency-free Node.js server and opens `http://127.0.0.1:8080` automatically, so no `npm install` or directory change is required.

## Controls

- `W`, `A`, `S`, `D`: walk
- Mouse: look
- `Shift`: move faster
- `Esc`: release the mouse / pause

## Visual direction

The scene is not a survey-accurate reconstruction. It combines characteristic details visible in central Bălți:

- the broad paved pedestrian space around Piața Vasile Alecsandri and Strada Independenței;
- mixed low-rise retail buildings and taller Soviet-era residential blocks;
- leafy rows of trees, including white-painted lower trunks;
- overhead trolley and decorative wires;
- a simplified pale bell/clock tower;
- a block-built interpretation of the blue-and-white Cathedral of Saints Constantine and Helena;
- Romanian-language civic and shop signs.

No third-party photographs are bundled. All geometry and textures are generated in code.

## Research references

- Bălți municipal overview of monuments: https://balti.md/monumente-istorie-intruchipata-in-piatra/
- Wikimedia Commons — central Bălți: https://commons.wikimedia.org/wiki/Category:Centru,_B%C4%83l%C8%9Bi
- #diez photo walk along Bălți's pedestrian street: https://diez.md/2018/07/10/galerie-foto-ce-poti-vedea-plimbandu-te-pe-cea-mai-mare-strada-pietonala-din-moldova-situata-orasul-balti/
- Historical and architectural monuments of Bălți: https://aboutmoldova.md/en/view_free.php?id=361

## Scope

This first pass intentionally has no objectives, scoring, inventory or fail state. The entire interaction is walking and looking around.
