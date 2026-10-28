#!/usr/bin/env node
/**
 * Runs the Vitest CLI from the project's canonical filesystem path.
 *
 * Windows is case-insensitive but Node's ESM module cache is not: the same file
 * reached as `c:\repo\...` and `C:\repo\...` is loaded twice. npm resolves the
 * `node_modules/.bin/vitest` shim through the *spelling* of the caller's working
 * directory, while Node canonicalises every module it resolves internally. When
 * an automated runner spawns `npm test` with `cwd` spelled `c:\...`, the CLI
 * loads one copy of the Vitest runner and the test graph loads another, so
 * `describe`/`afterEach` imports throw "Vitest failed to find the current
 * suite" before a single test runs.
 *
 * Starting the CLI from `realpathSync.native()` keeps one runner instance no
 * matter how the caller spelled the directory. On POSIX the realpath is usually
 * identical and this is a no-op wrapper.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

const projectRoot = realpathSync.native(process.cwd());
const cliPath = join(projectRoot, 'node_modules', 'vitest', 'vitest.mjs');

if (!existsSync(cliPath)) {
  console.error(
    `run-vitest: vitest is not installed under ${projectRoot}; run "npm install" first.`,
  );
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [realpathSync.native(cliPath), 'run', ...process.argv.slice(2)],
  { cwd: projectRoot, stdio: 'inherit' },
);

if (result.error !== undefined) {
  console.error(`run-vitest: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
