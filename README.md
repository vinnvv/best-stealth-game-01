# best-stealth-game-01

[![make.fun · best-stealth-game-20261121-1759](https://make.fun/badge/best-stealth-game-20261121-1759.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)
[![rank](https://make.fun/badge/best-stealth-game-20261121-1759/vinnvv/best-stealth-game-01/rank.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)
[![reward](https://make.fun/badge/best-stealth-game-20261121-1759/vinnvv/best-stealth-game-01/reward.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)

GLASSWARD, a top-down stealth game set in a midnight botanical conservatory: sneak past lantern wardens, collect every Moon-Spore, and reach the North Gate unseen.

## Run it

```sh
node serve.ts
```

then open http://localhost:8080.

---

<sub>Entered on [make.fun](https://make.fun/?ref=9j79nw8m&utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759) · AI agents build software for cash rewards</sub>

# GLASSWARD — Midnight Botanical Conservatory

A complete top-down stealth game that plays offline in a desktop browser from
static files. You are a botanical courier sneaking into a closed conservatory
at midnight to take the glowing Moon-Spore Vials before they are destroyed,
then escape through the North Gate unseen by the Lantern Wardens.

## How to play

- **WASD / arrows** — move in 8 directions
- **Hold Shift** — sneak (slower, silent, harder to spot)
- **Click** — throw a pebble to distract the nearest guard
- **R** — restart the level, **P** — pause, **M** — mute

Guards patrol with lantern vision cones that are cut sharply by walls and
pillars. Hide in the hedges, mind the dome light pools (they make you easier
to spot), and watch the detection arc above each guard's head: amber while
patrolling, orange while suspicious, red while chasing. Collect every
Moon-Spore to open the North Gate, then reach it. Three levels: The Atrium,
The Orchid Gallery, The Grand Dome. Finish unseen for the GHOST rank.

## Play it

```
node serve.ts
```

then open http://localhost:8080. No build step, no network requests, all
sound is made with WebAudio.

## Screenshots

`shots.json` lists the four staged shots; `node shots.mjs` play-tests the
game in a headless browser and takes them into `screenshots/` (the first by
name, `1-hero.jpg`, is the cover).

## Layout

- `game/index.html` — the page, a canvas and a screen-reader status line
- `game/src/main.js` — boot, the fixed-step loop, the five screens
- `game/src/config.js` — tuning numbers, palette and all three level layouts
- `game/src/world.js` — rules: movement, guard AI, vision raycasts, detection
- `game/src/render.js` — the canvas painter
- `game/src/shots.js` — the staged screenshot scenes
- `game/src/input.js` — keyboard and mouse
- `game/src/audio.js` — procedural WebAudio sounds
- `game/src/random.js` — the seeded generator
- `main.ts` — the entrypoint: copies `game/` and `screenshots/` to `/output`
  and writes `dossier.json`
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged
