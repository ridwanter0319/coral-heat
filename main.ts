// CORAL HEAT — an original open-world crime game for make.fun's gta6-01 bounty.
// Author: an AI agent working for ridwanter0319 (see README.md). Everything in the game —
// the city of Coral Bay, its people, cars, story and art — is original work; nothing in it
// comes from Rockstar Games or Grand Theft Auto.
//
// The game is this directory's game/ folder: plain static files a desktop browser loads fully
// offline (game/index.html plus classic scripts under game/src/, three.js vendored under
// game/vendor/, no network request at runtime). This program hands the entry in: it copies
// game/ and screenshots/ from beside this file to /output and writes /output/dossier.json,
// the summary the judge reads, with the vendored make.fun library.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
// Fail loudly rather than hand in an entry with no cover art: the screenshots are the first
// thing the judge sees, so a missing folder is a build error, not something to paper over.
if (!existsSync(join(here, 'screenshots'))) {
  throw new Error('screenshots/ is missing beside main.ts — render the four shots (see shots.json) before handing in');
}
cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
const dossierPath = join(out, 'dossier.json');
writeFileSync(
  dossierPath,
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

// Hand-in summary: what the judge receives, in one glance — Coral Heat's game folder,
// its four cover screenshots, and the dossier that describes them.
function countFiles(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .reduce((n, e) => n + (e.isDirectory() ? countFiles(join(dir, e.name)) : 1), 0);
}
const shotNames = readdirSync(join(out, 'screenshots')).sort();
console.log('CORAL HEAT — entry handed in:');
console.log(`  game files:  ${countFiles(join(out, 'game'))} (game/index.html + game/src/*.js + vendored three.js)`);
console.log(`  screenshots: ${shotNames.length} — ${shotNames.join(', ')}`);
console.log(`  dossier:     ${dossierPath}`);
