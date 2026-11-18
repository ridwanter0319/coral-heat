[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/ridwanter0319/coral-heat/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/ridwanter0319/coral-heat/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# CORAL HEAT

Built by an AI agent for make.fun's "Make GTA 6" bounty — referral code vk2zqxqw.

An original open-world crime game in miniature. You are **Dario Solano**, a wheelman who
washed up in the sun-soaked coastal city of **Coral Bay** with a fast car, an empty wallet
and a debt to fixer **Lena Voss**. Run her jobs, dodge the Coral Bay PD, and turn one hot
summer into a fortune. Every place, person, car and line of story here is invented for this
game — nothing comes from Rockstar Games or Grand Theft Auto.

## What's in the bay

- **A living city** — a procedural road grid with intersections, pastel tower blocks with
  painted window facades, parking lots, plazas, palm trees, streetlights, a boardwalk,
  a beach with umbrellas, and golden-hour water.
- **On foot and behind the wheel** — third-person walking with a mouse-orbit camera, and
  seven invented car styles (sedans, a taxi, a roadster, a pickup, a van…) with arcade
  driving, parked cars to steal and traffic that drives the grid and brakes for trouble.
- **Pedestrians** who stroll the sidewalks and scatter when things get loud.
- **A pistol** with mouse aim, muzzle flash, ammo and reloads.
- **A 0–5 star wanted system** — crimes witnessed raise your heat, CBPD interceptors spawn
  to hunt and ram you, heat decays when you break line of sight. Get pinned on foot and
  you're **BUSTED**; run out of health and you're **WASTED**.
- **A three-job story** for Lena Voss (a pier pickup, a hot delivery, a cash-drop round-up)
  with world beacons, minimap blips, cash rewards — then free roam with endless paid errands.
- **HUD + minimap** — health, cash, wanted stars, objective text, vehicle name and speed,
  and a live top-down map with police, traffic and mission markers.
- **Sound with no audio files** — engine hum, police siren, gunshots, cash blips and a
  sunset chord loop, all synthesised with WebAudio.
- **Saving** — cash and story progress persist in `localStorage`; Continue picks up where
  Dario left off.

## Controls

| Input | Action |
| --- | --- |
| W A S D / arrows | Move / drive |
| Mouse | Orbit camera & aim (click the game to lock the pointer) |
| Shift | Sprint |
| F or E | Enter / exit the nearest car |
| Mouse click | Shoot pistol |
| R | Reload |
| Space | Handbrake |
| Esc | Pause |

## Run it

```sh
node serve.ts
```

then open <http://localhost:8080> in desktop Chrome. To hand the entry in:
`mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts` copies `game/` and `screenshots/`
to the output folder and writes `dossier.json`.

Deterministic screenshot scenes (used for the entry's screenshots) are staged with
`?shot=vista`, `?shot=foot`, `?shot=chase`, `?shot=mission` plus `&seed=1` — see
`shots.json`.

## Tech note

three.js r160 is vendored at `game/vendor/three.min.js` and loaded with a classic script
tag; the game code is plain scripts under `game/src/` (`world`, `vehicles`, `people`,
`missions`, `hud`, `audio`, `main`). The game makes **no network requests at runtime** —
every texture is painted on a canvas at boot, every sound is synthesised, and the whole
city is generated from a seed.
