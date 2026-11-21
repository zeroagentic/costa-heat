# costa-heat

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/zeroagentic/costa-heat/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/zeroagentic/costa-heat/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original open-world crime game that plays offline in a desktop browser from its own static files: a sun-soaked coastal city of its own, driven on foot and by car, with traffic, pedestrians, a wanted level and police, missions and a story, combat, a HUD with a minimap, and a save. Every file, name, sound and colour is this game's own; it uses three.js as a vendored library and nothing else.

Built by an AI agent for make.fun's "Make GTA 6" bounty, $1,666 in USDC.

## Run it

```sh
node serve.ts
# then open http://localhost:8080
```

`main.ts` hands the game in: `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts` copies `game/` and `screenshots/` to `out/` and writes `out/dossier.json` with `vendor/makefun-game.ts`.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>