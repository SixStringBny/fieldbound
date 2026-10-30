#!/usr/bin/env node
/**
 * Fieldbound frozen-path gate (OVERHAUL section 7.1, ticket #18).
 *
 * The UI overhaul changes presentation only. Engine rules, content catalogs,
 * persistence schemas, the run model, the duel match/round controllers, the
 * shared app state, the battle log, the asset manifest loader and the audio
 * suite are frozen: no execution ticket may touch them. This script is the
 * first of the two enforcements (the second is every ticket's G4 diff posted in
 * its evidence comment).
 *
 * Usage:
 *
 *   node scripts/check-frozen-paths.mjs [base]
 *   node scripts/check-frozen-paths.mjs --base origin/main
 *   node scripts/check-frozen-paths.mjs --base origin/main --list
 *
 * `base` defaults to `origin/main`. The comparison is against the merge base of
 * that ref and `HEAD`, so a long-lived feature branch is judged on its own
 * commits rather than on everything `main` gained in the meantime. A ref with
 * no merge base (a fresh orphan branch, or a shallow clone without the ref)
 * falls back to comparing `<base>..HEAD` directly and says so.
 *
 * `--list` prints the whole changed-file list as well as the verdict, which is
 * exactly the list gate G4 asks for in the evidence comment.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

/**
 * The frozen roots, verbatim from OVERHAUL section 7.1. A directory entry ends
 * with `/`; a file entry may use `*` for the ticket-numbered controllers
 * (`src/duel/match*.ts`, `src/duel/round*.ts`).
 */
const FROZEN_PATHS = [
  'src/engine/',
  'src/content/',
  'src/persistence/',
  'src/run/',
  'src/duel/match*.ts',
  'src/duel/round*.ts',
  'src/state/',
  'src/battle-log/',
  'src/assets/',
  'src/audio/sfx.test.ts',
];

/**
 * Parity-guarded consumer refactors (motion ticket #21 amendment, OVERHAUL
 * section 7.1). `motion-and-feedback.md` section 2.1 requires the log derivation
 * and the cue mapping to read the shared `BattleDeltas`. These two files may
 * change *how* the delta is mapped, never what is output: the guard is
 * `src/ui/feedback/parity.test.ts`, which must exist and pass in the same tree.
 * Nothing else in a frozen root may move.
 */
const PARITY_GUARD = 'src/ui/feedback/parity.test.ts';
const PARITY_GUARDED = new Set([
  'src/battle-log/derive.ts',
  'src/state/battle-controller.ts',
]);
const parityGuardPresent = existsSync(path.join(repoRoot, PARITY_GUARD));

/** Turn a frozen-path entry into an anchored regular expression. */
function toPattern(entry) {
  const escaped = entry.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const wildcard = escaped.replaceAll('*', '[^/]*');

  return new RegExp(`^${wildcard}`);
}

const PATTERNS = FROZEN_PATHS.map((entry) => ({ entry, pattern: toPattern(entry) }));

function parseArguments(argv) {
  let base = 'origin/main';
  let list = false;

  for (const argument of argv) {
    if (argument === '--list') {
      list = true;
      continue;
    }

    if (argument === '--help' || argument === '-h') {
      console.log(
        'Usage: node scripts/check-frozen-paths.mjs [--base <ref>] [--list]\n' +
          '  --base  ref to diff against (default: origin/main)\n' +
          '  --list  also print every changed file',
      );
      process.exit(0);
    }

    if (argument.startsWith('--base=')) {
      base = argument.slice('--base='.length);
      continue;
    }

    if (argument === '--base') {
      base = 'set-by-next-argument';
      continue;
    }

    if (base === 'set-by-next-argument') {
      base = argument;
      continue;
    }

    if (!argument.startsWith('-')) {
      base = argument;
      continue;
    }

    throw new Error(`unknown argument: ${argument}`);
  }

  if (base === 'set-by-next-argument') {
    throw new Error('--base needs a ref');
  }

  return { base, list };
}

function git(args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function resolveBase(base) {
  try {
    return { ref: base, mergeBase: git(['merge-base', base, 'HEAD']), exact: true };
  } catch {
    // No merge base: still compare against whatever history the ref provides.
    return { ref: base, mergeBase: base, exact: false };
  }
}

function changedFiles(mergeBase) {
  const output = git(['diff', '--name-only', '--no-renames', `${mergeBase}..HEAD`]);

  return output === '' ? [] : output.split('\n');
}

function frozenMatches(file) {
  return PATTERNS.filter(({ pattern }) => pattern.test(file)).map(({ entry }) => entry);
}

function main() {
  const { base, list } = parseArguments(process.argv.slice(2));
  const resolved = resolveBase(base);

  let head;
  try {
    head = git(['rev-parse', '--short', 'HEAD']);
  } catch {
    console.error('FAIL not a git repository, or HEAD does not resolve');
    process.exitCode = 1;
    return;
  }

  console.log('Fieldbound frozen-path gate (OVERHAUL section 7.1)');
  console.log(`base ${resolved.ref} -> merge base ${resolved.mergeBase.slice(0, 12)}..${head}`);

  if (!resolved.exact) {
    console.log(
      `note ${resolved.ref} has no merge base with HEAD; comparing ${resolved.ref}..HEAD instead`,
    );
  }

  const files = changedFiles(resolved.mergeBase);

  if (files.length === 0) {
    console.log('ok   no files changed against the base ref');
    return;
  }

  const violations = [];

  for (const file of files) {
    const matches = frozenMatches(file);

    if (matches.length > 0) {
      if (PARITY_GUARDED.has(file) && parityGuardPresent) {
        console.log(`ok   ${file} is a parity-guarded consumer (${PARITY_GUARD})`);
        continue;
      }

      violations.push({ file, matches });
    }
  }

  if (list) {
    console.log(`\n== Changed files (${files.length}) ==`);
    for (const file of files) {
      const frozen =
        frozenMatches(file).length === 0
          ? '      '
          : PARITY_GUARDED.has(file) && parityGuardPresent
            ? 'PARITY'
            : 'FROZEN';
      console.log(`${frozen}  ${file}`);
    }
    console.log('');
  }

  if (violations.length > 0) {
    for (const { file, matches } of violations) {
      console.error(`FAIL ${file} touches frozen root ${[...new Set(matches)].join(', ')}`);
    }
    console.error(
      `\n${violations.length} frozen-path violation(s): the overhaul does not edit ${FROZEN_PATHS.join(', ')}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(`ok   ${files.length} changed file(s), none inside a frozen root`);
}

try {
  main();
} catch (error) {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
