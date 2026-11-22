// main.ts — the hand-in step for COSTA HEAT.
//
// What this does, in order: it figures out where the game lives on disk, stages a
// copy of the game/ tree (and any screenshots/) into the make.fun output directory,
// and asks buildDossier (in vendor/makefun-game.ts) to turn that staged tree into
// the dossier.json the competition scorer reads. It is written for Node 22 running
// TypeScript directly, so it uses only the standard library and no type syntax that
// the runtime would choke on.

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDossier } from './vendor/makefun-game.ts';

// Where the whole repository lives: the directory this file is in. Resolving
// against import.meta.url (instead of process.cwd()) is what lets main.ts run
// correctly from any working directory, because every other path below hangs
// off this one.
function repositoryRoot(): string {
  return fileURLToPath(new URL('.', import.meta.url));
}

// The directory the dossier and its staged files are written into. It comes from
// the MAKEFUN_OUTPUT_DIR environment variable so a CI runner or a local shell can
// point it anywhere; when unset we fall back to /output, the platform default.
function handInDirectory(): string {
  return process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
}

// Copy the game/ directory, recursively, to <out>/game. cpSync with recursive:true
// mirrors the whole tree — files, subdirectories (src/, vendor/), everything — in
// one call, which is exactly the "a game is a directory of static files" shape the
// dossier expects.
function stageGame(outDir: string, repo: string): void {
  const from = join(repo, 'game');
  const to = join(outDir, 'game');
  cpSync(from, to, { recursive: true });
}

// Screenshots are optional for the directory itself but expected by the scorer, so
// we always create <out>/screenshots. If the repository ships a screenshots/
// directory, its contents are copied in as-is; otherwise the empty directory we just
// made stands (buildDossier will report no renders, but the tree is still correct).
function stageScreenshots(outDir: string, repo: string): void {
  const to = join(outDir, 'screenshots');
  mkdirSync(to, { recursive: true });
  const from = join(repo, 'screenshots');
  if (existsSync(from)) {
    cpSync(from, to, { recursive: true });
  }
}

// Run buildDossier against the staged output directory and write whatever bytes it
// returns straight to <out>/dossier.json. buildDossier returns canonical JSON bytes
// (a Uint8Array), so we write them verbatim — no re-encoding, no reformatting — and
// report how big the result was so the hand-in line stays readable.
function writeDossier(outDir: string, options: Parameters<typeof buildDossier>[1]): number {
  const bytes = buildDossier(outDir, options);
  writeFileSync(join(outDir, 'dossier.json'), bytes);
  return bytes.byteLength;
}

// The caps buildDossier is held to for this competition, passed through verbatim
// from the gate: how much text a dossier may carry, how many screenshots and how
// heavy each may be, and how many files / bytes / path-bytes the game/ tree may use.
const dossierOptions = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function run(): void {
  const repo = repositoryRoot();
  const out = handInDirectory();

  // Refuse early, with a clear message, if there is no page to hand in. buildDossier
  // would throw too, but its error is generic; checking here lets us name the exact
  // file the scorer needs and exit non-zero before doing any copying.
  if (!existsSync(join(repo, 'game', 'index.html'))) {
    console.error(`main.ts: game/index.html is missing — a game entry must ship its index.html at game/index.html`);
    process.exit(1);
  }

  mkdirSync(out, { recursive: true });
  stageGame(out, repo);
  stageScreenshots(out, repo);

  const size = writeDossier(out, dossierOptions);
  console.log(`dossier written: ${join(out, 'dossier.json')} (${size} bytes)`);
}

run();
