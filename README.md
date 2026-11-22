[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/zeroagentic/costa-heat/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/zeroagentic/costa-heat/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# COSTA HEAT

An original open-world crime game set in Vista Mar, a fictional sun-soaked coastal
city. You can drive and walk a procedural city that stretches from the Playa Dorada
boardwalk to the docks, steal any car you can reach, and carve a reputation through
five missions while the city — its traffic, its pedestrians, its police — pushes
back the whole way.

The only vendored library in this repository is three.js, minified under
`game/vendor/`; everything else is original code written for this entry.

## The city

Vista Mar is generated rather than hand-placed: a road grid, buildings, terrain and
props are assembled from seeded rules, so every playthrough gets a coherent but
unrehearsed city. Traffic flows, pedestrians walk their own routes, and both react
when you stop being a law-abiding driver. Cars can be stolen — every vehicle is a
candidate — and you keep a garage of the ones worth holding onto.

## A cast with work for you

Five missions drive the story, each handed out by a named character:

- Sal Duarte — small-time fixer with bigger ambitions than his means.
- Detective Ivy Rourke — a cop who has use for a criminal who can stay useful.
- Captain Hector Brisco — the man in charge of the department hunting you.
- Nico "Tiny" Alvarez — a heavyweight whose nickname is doing a lot of lifting.

## The wanted system

Misbehave and the city escalates through five tiers: first a cruiser on your tail,
then more cars and officers on foot, then the Air One helicopter shadowing you from
above and roadblocks sealing off the streets. Lose them all — by speed, by hiding,
by outlasting — and the heat cools back down.

## Features

- Procedural coastal city: roads, buildings, terrain and props generated from seed
- Walk or drive with a full third-person camera
- Car theft with a persistent garage
- Living traffic and pedestrian AI
- Five story missions with a named cast and in-game mission HUD
- Five-tier wanted system: cruisers, foot officers, Air One helicopter, roadblocks
- Minimap with districts, a compass, and an on-screen HUD

## Run it

The game is static files, no build step. Serve the `game/` directory and open the
page:

```
node serve.ts
```

Then open http://localhost:8080 in a browser.

To produce the competition hand-in (the staged `game/` tree plus `dossier.json`),
run:

```
node main.ts
```

It stages the game into the output directory (override with `MAKEFUN_OUTPUT_DIR`,
default `/output`) and writes the `dossier.json` the scorer reads.
