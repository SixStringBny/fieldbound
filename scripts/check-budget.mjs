/**
 * Fieldbound production bundle budget audit (REL-FR-05, VIS-NFR-02).
 *
 * One command proves the deployable artifact fits the performance budget:
 *
 *  1. Builds the production bundle with Vite (never the dev server).
 *  2. Gzip-compresses every emitted JavaScript and CSS file, prints the raw and
 *     gzip bytes per file and the summed gzip total. Nothing is excluded: the
 *     total is the sum of every emitted JS and CSS file, source maps aside.
 *  3. Fails when the total exceeds 307200 bytes (300 KiB) and prints the exact
 *     overage in bytes and KiB.
 *  4. Reads `dist/assets/assets.manifest.json`, requires a non-empty `assets`
 *     array and fails for every entry whose `path` has no file behind it. The
 *     manifest is resolved the way the runtime resolves it: `<base>assets/<path>`.
 *
 * Run with `node scripts/check-budget.mjs` (or `npm run check:budget`). Set
 * `VITE_BASE` to audit the exact subpath build that will be deployed; the byte
 * total is base-independent, but building the deployable artifact is the point.
 */
import { execFileSync } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const distDir = path.join(repoRoot, 'dist');
const assetsDir = path.join(distDir, 'assets');
const manifestPath = path.join(assetsDir, 'assets.manifest.json');

/** 300 KiB. `at most` means 307200 passes; 307201 fails. */
const BUDGET_BYTES = 307200;

/** Every extension Vite can emit as JavaScript or CSS, counted in full. */
const BUNDLE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.css']);

const failures = [];

function fail(message) {
  failures.push(message);
  console.error(`FAIL ${message}`);
}

function pass(message) {
  console.log(`ok   ${message}`);
}

function note(message) {
  console.log(`note ${message}`);
}

function normalizeBase(rawBase) {
  if (!rawBase || rawBase === '/') {
    return '/';
  }
  const withLeading = rawBase.startsWith('/') ? rawBase : `/${rawBase}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

const base = normalizeBase(process.env.VITE_BASE ?? '/');

function formatBytes(bytes) {
  return `${bytes} B`;
}

function formatKib(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function build() {
  console.log(`\n== Production build (VITE_BASE=${base}) ==`);
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  try {
    execFileSync(npmCommand, ['run', 'build'], {
      cwd: repoRoot,
      stdio: 'inherit',
      env: { ...process.env, VITE_BASE: base },
      shell: process.platform === 'win32',
    });
  } catch {
    fail('the production build failed; the budget cannot be measured');
    return false;
  }
  return true;
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(entryPath)));
    } else {
      files.push(entryPath);
    }
  }
  return files;
}

function relativeToDist(filePath) {
  return path.relative(distDir, filePath).replaceAll(path.sep, '/');
}

/* -------------------------------------------------------------------------- */
/* JavaScript + CSS: raw bytes, gzip bytes, summed total                      */
/* -------------------------------------------------------------------------- */

async function collectBundle() {
  console.log('\n== Emitted JavaScript and CSS ==');

  let files;
  try {
    files = await walk(distDir);
  } catch {
    fail('dist/ was not emitted; there is no production build to measure');
    return { rows: [], rawTotal: 0, gzipTotal: 0 };
  }

  const bundleFiles = files
    .filter((file) => BUNDLE_EXTENSIONS.has(path.extname(file).toLowerCase()))
    .sort();

  if (bundleFiles.length === 0) {
    fail('the build emitted no JavaScript or CSS files');
    return { rows: [], rawTotal: 0, gzipTotal: 0 };
  }

  const rows = [];
  let rawTotal = 0;
  let gzipTotal = 0;

  for (const file of bundleFiles) {
    const contents = await readFile(file);
    const gzip = gzipSync(contents, { level: 9 });
    rawTotal += contents.byteLength;
    gzipTotal += gzip.byteLength;
    rows.push({
      file: relativeToDist(file),
      raw: contents.byteLength,
      gzip: gzip.byteLength,
    });
  }

  return { rows, rawTotal, gzipTotal };
}

function printTable(rows, rawTotal, gzipTotal) {
  const fileWidth = Math.max('file'.length, ...rows.map((row) => row.file.length));
  const rawWidth = Math.max('raw bytes'.length, ...rows.map((row) => String(row.raw).length));
  const gzipWidth = Math.max('gzip bytes'.length, ...rows.map((row) => String(row.gzip).length));

  console.log(
    `${'file'.padEnd(fileWidth)}  ${'raw bytes'.padStart(rawWidth)}  ${'gzip bytes'.padStart(gzipWidth)}`,
  );
  console.log(`${'-'.repeat(fileWidth)}  ${'-'.repeat(rawWidth)}  ${'-'.repeat(gzipWidth)}`);

  for (const row of rows) {
    console.log(
      `${row.file.padEnd(fileWidth)}  ${String(row.raw).padStart(rawWidth)}  ${String(row.gzip).padStart(gzipWidth)}`,
    );
  }

  console.log(`${'-'.repeat(fileWidth)}  ${'-'.repeat(rawWidth)}  ${'-'.repeat(gzipWidth)}`);
  console.log(
    `${`total (${rows.length} file${rows.length === 1 ? '' : 's'})`.padEnd(fileWidth)}  ${String(
      rawTotal,
    ).padStart(rawWidth)}  ${String(gzipTotal).padStart(gzipWidth)}`,
  );
}

function checkBudget(gzipTotal) {
  console.log(
    `\nBudget: ${formatBytes(gzipTotal)} gzip / ${formatBytes(BUDGET_BYTES)} (${formatKib(
      gzipTotal,
    )} / ${formatKib(BUDGET_BYTES)})`,
  );

  if (gzipTotal > BUDGET_BYTES) {
    const overage = gzipTotal - BUDGET_BYTES;
    fail(
      `bundle budget exceeded by ${formatBytes(overage)} (${formatKib(overage)}): ${formatBytes(
        gzipTotal,
      )} gzip > ${formatBytes(BUDGET_BYTES)} ceiling`,
    );
    return;
  }

  const headroom = BUDGET_BYTES - gzipTotal;
  pass(
    `bundle budget met: ${formatBytes(headroom)} (${formatKib(headroom)}) headroom out of ${formatBytes(
      BUDGET_BYTES,
    )}`,
  );
}

/* -------------------------------------------------------------------------- */
/* Asset manifest: every entry resolves to an emitted file                    */
/* -------------------------------------------------------------------------- */

/**
 * The runtime loader builds `<base>assets/<path>`, so a usable manifest path is
 * a clean relative path with no scheme, leading separator or traversal.
 */
function isResolvableManifestPath(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return false;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return false;
  }
  if (value.startsWith('/') || value.startsWith('\\')) {
    return false;
  }
  const segments = value.replaceAll('\\', '/').split('/');
  return !segments.includes('..');
}

async function auditManifest() {
  console.log('\n== Asset manifest coverage ==');

  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    fail(
      `cannot read ${path.relative(repoRoot, manifestPath).replaceAll(path.sep, '/')}: ${
        error instanceof SyntaxError ? 'not valid JSON' : 'missing from dist'
      }`,
    );
    return { resolved: 0, total: 0 };
  }

  if (typeof manifest.version !== 'number') {
    fail('asset manifest has no numeric version');
  }

  if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) {
    fail('asset manifest has no non-empty assets array');
    return { resolved: 0, total: 0 };
  }

  let resolved = 0;
  let total = 0;

  for (const entry of manifest.assets) {
    total += 1;

    if (!entry || typeof entry.id !== 'string' || entry.id.trim() === '') {
      fail(`asset manifest entry has no id: ${JSON.stringify(entry)}`);
      continue;
    }

    if (!isResolvableManifestPath(entry.path)) {
      fail(`asset manifest entry ${entry.id} has an unusable path: ${JSON.stringify(entry.path)}`);
      continue;
    }

    const filePath = path.join(assetsDir, entry.path);
    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        fail(`asset manifest entry ${entry.id} points at ${entry.path}, which is not a file`);
        continue;
      }
      resolved += 1;
    } catch {
      fail(
        `asset manifest entry ${entry.id} points at ${entry.path}, which is missing from dist/assets`,
      );
    }
  }

  if (resolved === total) {
    pass(`manifest v${String(manifest.version)}: all ${total} entries resolve to emitted files`);
  } else {
    fail(`manifest coverage ${resolved}/${total}; every entry must have a file`);
  }

  return { resolved, total };
}

/* -------------------------------------------------------------------------- */

async function main() {
  console.log(`Fieldbound production bundle budget (REL-FR-05, VIS-NFR-02)`);

  if (!build()) {
    return report();
  }

  const { rows, rawTotal, gzipTotal } = await collectBundle();
  if (rows.length > 0) {
    printTable(rows, rawTotal, gzipTotal);
    checkBudget(gzipTotal);
  }

  await auditManifest();

  report();
}

function report() {
  if (failures.length > 0) {
    console.error(`\n${failures.length} budget audit finding(s):`);
    for (const message of failures) {
      console.error(`  - ${message}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('\nBudget audit passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
