# COSTA HEAT

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/zeroagentic/costa-heat/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/zeroagentic/costa-heat/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original open-world crime game that plays offline in a desktop browser from its own static files. Vista Mar is a sun-soaked coastal city of its own making: drive or walk it, steal cars, dodge traffic and crowds, pull jobs for Sal Duarte at the Vista Mar Motel, and outrun the VCPD through five escalating wanted levels — cruisers, officers on foot, Air One overhead and roadblocks across every avenue.

Everything in it is original: the city, the cast, the story, the art and the sound. The only vendor is three.js, minified under `game/vendor/`.

- **City** — procedural coastal grid, beach and sea, palms, downtown towers, streetlights, curbs, crosswalks
- **On foot and by car** — third-person character, mouse-look camera, enter and steal vehicles, handbrake drifting
- **Traffic and pedestrians** — AI cars following the lane graph, pedestrians who walk, panic and flee
- **Wanted level** — five tiers from INVESTIGATING to CITY LOCKDOWN, with roadblocks and Air One at the top
- **Missions and story** — five missions with a named cast, dialogue, objectives and a heist finale
- **Combat** — two weapons, tracers, muzzle flash, impact sparks and magazines
- **HUD and minimap** — cash, health, stars, objective checklist, district names and a live rotating minimap
- **Garage and save** — store stolen cars, two save slots persisting cash, position, wanted level and progress
- **Audio** — procedural engine, gunfire and footsteps with the Web Audio API, no audio files

## Run it

```sh
node serve.ts
# then open http://localhost:8080
```

`main.ts` hands the game in: `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts` copies `game/` and `screenshots/` to `out/` and writes `out/dossier.json` with `vendor/makefun-game.ts`.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>