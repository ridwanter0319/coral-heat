[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/ridwanter0319/coral-heat/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/ridwanter0319/coral-heat/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Coral Heat

An original open-world crime caper set in **Coral Bay**, a pastel beach city
at golden hour — built with three.js (vendored locally, so the game runs
fully offline) for the make.fun **gta6-01** bounty, "Make GTA 6".

You work for fixer **Marisol Vega**. Three chained jobs — *Package Deal*,
*Hot Goods*, and *Cash Rain* — take you from a hotel back-alley to the
marina garage and along Ocean Drive, with Coral Bay PD piling on stars the
whole way. Finish the chain and the bay is yours: free roam.

> Listed on make.fun with referral code **vk2zqxqw**.

## Play it

Open `game/index.html` in a desktop browser — no server, no network, no
build step. Or run the hand-in program, which also packages the entry:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts   # copies game/ + screenshots/ to out/, writes dossier.json
node serve.ts                                          # optional local server for development
```

## What's in the bay

- **Procedural city** — road grid with intersections and sidewalks, pastel
  buildings with lit-window facades, palm trees, streetlights, a boardwalk,
  beach umbrellas, and open sea under a gradient sunset sky.
- **On foot** — third-person WASD movement, Shift sprint, mouse-orbit
  camera, and a pistol (click to shoot, R to reload, ammo + reserve).
- **Cars** — five invented body styles in beach-town colours. Parked cars
  can be stolen (F/E); traffic AI cruises the grid, brakes for trouble and
  turns at intersections; driving is pure arcade with a chase camera.
- **People** — pedestrians stroll the sidewalks and scatter when shots ring
  out or a car bears down on them.
- **Wanted system** — crimes raise your stars (0–5). Police interceptors
  spawn, chase, and ram; get pinned and you're **BUSTED**, lose your health
  and you're **WASTED**. Break line of sight and the heat decays.
- **Missions** — three chained jobs with world beacons and minimap blips,
  cash rewards, and a free-roam epilogue. Cash and mission progress save to
  `localStorage` (Continue on the start screen).
- **HUD** — health, cash, wanted stars, ammo, objective text, speedometer
  when driving, and a live circular minimap (player, traffic, police,
  mission target).
- **Sound** — 100% WebAudio synthesis: engine hum, two-tone sirens,
  gunshots, cash blips, and a sea-breeze ambient loop. No audio files.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Move / drive |
| Shift | Sprint |
| Mouse | Orbit camera / aim |
| Left click | Shoot |
| R | Reload |
| F or E | Enter / exit car |
| Space | Handbrake |
| Esc | Pause |

## Screenshots

`game/index.html?shot=vista|foot|chase|mission&seed=1` stages a
deterministic scene (fixed seed, staged actors and camera, HUD live), which
is how the four shots in `screenshots/` were rendered from this very code —
see `shots.json`.

## Layout

- `game/` — the game itself: `index.html`, `src/*.js` (one job per file:
  city, people, cars, missions, HUD, audio, RNG, main loop), `vendor/three.min.js`.
- `main.ts` — the hand-in program (Node 22, stdlib only): copies `game/` and
  `screenshots/` to the output dir and writes `dossier.json` via the vendored
  make.fun library in `vendor/makefun-game.ts`.
- `screenshots/` — four 1280×720 JPEGs rendered from the game.

## License

MIT — see `LICENSE`.
