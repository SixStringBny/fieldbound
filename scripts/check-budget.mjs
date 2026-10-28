/**
 * Fieldbound production budget audit.
 *
 * Builds the app, gzip-compresses every emitted JavaScript and CSS file
 * separately, prints per-file sizes and fails above 307200 bytes (300 KiB)
 * total. A manifest entry that points at a missing file also fails.
 *
 * Run with `npm run check:budget`. Set VITE_BASE to audit another subpath.
 */
import { execFileSync } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const distDir = path.join(repoRoot, 'dist');
const BUDGET_BYTES = 307200;

function normalizeBase(rawBase) {
  if (!rawBase || rawBase === '/') {
    return '/';
  }
  const withLeading = rawBase.startsWith('/') ? rawBase : `/${rawBase}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

const base = normalizeBase(process.env.VITE_BASE ?? '/');

function build() {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  execFileSync(npmCommand, ['run', 'build'], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, VITE_BASE: base },
    shell: process.platform === 'win32',
  });
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

function formatBytes(bytes) {
  return `${bytes} B`;
}

async function collectSizes() {
  const files = await walk(distDir);
  const assets = files
    .filter((file) => /\.(?:js|css)$/.test(file) && !file.endsWith('.map'))
    .sort();

  let total = 0;
  const rows = [];

  for (const file of assets) {
    const contents = await readFile(file);
    const gzipSize = gzipSync(contents, { level: 9 }).byteLength;
    total += gzipSize;
    rows.push({
      file: path.relative(distDir, file).replaceAll(path.sep, '/'),
      raw: contents.byteLength,
      gzip: gzipSize,
    });
  }

  return { rows, total };
}

function collectManifestPaths(node, paths) {
  if (Array.isArray(node)) {
    for (const entry of node) {
      collectManifestPaths(entry, paths);
    }
    return;
  }

  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string' && /\.(?:svg|png|webp|avif)$/i.test(value)) {
        paths.add(value);
      } else if (key === 'path' && typeof value === 'string') {
        paths.add(value);
      } else {
        collectManifestPaths(value, paths);
      }
    }
  }
}

async function auditManifest() {
  const manifestPath = path.join(distDir, 'assets', 'assets.manifest.json');
  try {
    await stat(manifestPath);
  } catch {
    console.log('note no asset manifest emitted yet; skipping manifest file check');
    return [];
  }

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const paths = new Set();
  collectManifestPaths(manifest, paths);

  const failures = [];
  for (const entry of paths) {
    const relative = entry.replace(/^\/+/, '').replace(/^assets\//, '');
    const candidates = [
      path.join(distDir, 'assets', relative),
      path.join(distDir, entry.replace(/^\/+/, '')),
    ];
    let found = false;
    for (const candidate of candidates) {
      try {
        if ((await stat(candidate)).isFile()) {
          found = true;
          break;
        }
      } catch {
        // try the next candidate
      }
    }
    if (!found) {
      failures.push(entry);
    }
  }

  return failures;
}

async function main() {
  console.log(`Fieldbound bundle budget (base ${base}, limit ${BUDGET_BYTES} B gzip)`);
  build();

  const { rows, total } = await collectSizes();
  if (rows.length === 0) {
    console.error('No JavaScript or CSS files were emitted.');
    process.exitCode = 1;
    return;
  }

  for (const row of rows) {
    console.log(
      `${row.file.padEnd(42)} ${formatBytes(row.raw).padStart(9)} raw ${formatBytes(row.gzip).padStart(9)} gzip`,
    );
  }

  const remaining = BUDGET_BYTES - total;
  console.log(
    `\ntotal ${formatBytes(total)} gzip / ${BUDGET_BYTES} B (${remaining >= 0 ? `${formatBytes(remaining)} headroom` : `${formatBytes(-remaining)} over budget`})`,
  );

  const missingAssets = await auditManifest();

  if (total > BUDGET_BYTES) {
    console.error('Bundle budget exceeded.');
    process.exitCode = 1;
    return;
  }

  if (missingAssets.length > 0) {
    console.error(
      `Manifest entries missing from dist: ${missingAssets.join(', ')}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log('Budget audit passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
