// Coral Heat — hand-in program for the make.fun gta6-01 bounty.
//
// The actual game is the static site in game/ next to this file: plain HTML
// plus classic-script JavaScript driving a vendored three.js build, so it
// runs in a desktop browser with no server and no network. This program is
// only the courier. It copies game/ and screenshots/ into the output
// directory the grader points at (MAKEFUN_OUTPUT_DIR, default /output) and
// then asks the vendored make.fun library to summarise that tree into
// dossier.json, which is what the judge reads.
//
// Run it the same way the grader does:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const rootDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const SCREENSHOT_LIMIT = 262144; // 256 KiB per shot, the scorer's cap

// Pre-flight checks, run before anything is copied: fail loudly here with a
// readable message instead of letting the dossier builder (or worse, the
// scorer) reject a tree we could have fixed. Returns the screenshot names
// so the summary at the end can report exactly what was handed in.
function validateEntry(dir) {
  const gameDir = join(dir, 'game');
  if (!existsSync(join(gameDir, 'index.html'))) {
    throw new Error('Coral Heat: game/index.html is missing — there is no game to hand in.');
  }
  const shotsDir = join(dir, 'screenshots');
  const shots = existsSync(shotsDir)
    ? readdirSync(shotsDir).filter((name) => /\.(jpe?g|png)$/i.test(name)).sort()
    : [];
  if (shots.length > 4) {
    throw new Error(`Coral Heat: ${shots.length} screenshots found, the bounty allows at most 4.`);
  }
  for (const name of shots) {
    const size = statSync(join(shotsDir, name)).size;
    if (size > SCREENSHOT_LIMIT) {
      throw new Error(`Coral Heat: screenshot ${name} is ${size} bytes, over the ${SCREENSHOT_LIMIT}-byte cap.`);
    }
  }
  return shots;
}

const screenshotNames = validateEntry(rootDir);

// Fresh output directory contents: game tree first, then the screenshots
// folder (created even if the source one is missing, so the dossier builder
// always sees the shape it expects).
mkdirSync(outputDir, { recursive: true });
cpSync(join(rootDir, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(rootDir, 'screenshots'))) {
  cpSync(join(rootDir, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// Caps mirror the scorer's gate for this bounty: the dossier text budget,
// at most four screenshots of at most 256 KiB each, and a game tree of at
// most 993 files / 48 MiB with no single path longer than 1000 bytes.
const dossierText = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossierText);

console.log(`Coral Heat handed in: game/ + screenshots/ copied to ${outputDir}, dossier.json written.`);
console.log(`Screenshots (${screenshotNames.length}): ${screenshotNames.join(', ') || 'none'}`);
