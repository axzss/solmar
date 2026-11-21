// SOLMAR — make.fun gta6-01 entry program (Node 22, standard library only).
// The game itself is the static game/ folder beside this file: open-world
// three.js, fully offline. This program stages it for the judge: it copies
// game/ and screenshots/ into the output directory and writes dossier.json
// through the vendored make.fun library, applying the competition's own
// caps so a hand-in the scorer would refuse is refused here first.
// Run locally with MAKEFUN_OUTPUT_DIR set (the grader uses /output):
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// Caps mirror the scorer's gates: at most 4 screenshots of 256 KiB each,
// at most 993 files / 48 MiB in game/, paths under 1000 bytes, and the
// dossier text itself under 160 KiB.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
