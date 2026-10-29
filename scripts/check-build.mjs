/**
 * Fieldbound static-build and origin audit (REL-FR-04, VIS-SEC-01, VIS-SEC-02).
 *
 * One command proves the deployable artifact is the one the PRD describes:
 *
 *  1. Build with `VITE_BASE=/Card-Game-Project/` (the GitHub Pages project
 *     subpath) and keep `dist/` as the only subject under test.
 *  2. Read `dist/index.html`, collect every script, style and image reference,
 *     and fail when a reference escapes the base or has no file behind it.
 *  3. Walk every emitted text file and fail on an external http(s) subresource
 *     URL. XML/SVG namespace identifiers and React's error-decoder documentation
 *     string are reported, never requested, and are the only allowed matches.
 *  4. Read the emitted asset manifest, require every entry to resolve to a file,
 *     and serve the build under the real subpath so the HTML, each reference,
 *     the manifest and each manifest file must answer 200. A deliberately
 *     missing path must answer 404, otherwise the 200s prove nothing.
 *  5. Launch Chromium against the subpath, seed a solo run, play one affordable
 *     card from the hand and fail on a console error, a page error, a failed
 *     request, a non-GET request or any request that leaves the origin.
 *  6. Scan `src/` for `dangerouslySetInnerHTML`, `eval(` and `new Function`,
 *     ignoring comments and string literals so the guard tests that name those
 *     tokens are not mistaken for their use.
 *
 * Run with `node scripts/check-build.mjs` (or `npm run check:build`).
 */
import { execFileSync } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const distDir = path.join(repoRoot, 'dist');
const sourceDir = path.join(repoRoot, 'src');

/** GitHub Pages project-site base path. Overridable for another static host. */
const DEFAULT_BASE = '/Card-Game-Project/';

/** Seed used for the audit run; any unsigned 32-bit integer is valid. */
const AUDIT_SEED = 424242;

/** Requests the browser makes on its own and the app never references. */
const AUTOMATIC_PROBES = new Set(['/favicon.ico']);

/**
 * Absolute URLs that are identifiers or documentation, not subresources.
 * Nothing in this list is ever requested by the page; the browser audit below
 * proves that empirically with a zero cross-origin request count.
 */
const ALLOWED_EXTERNAL_URLS = [
  {
    pattern: /^https?:\/\/(?:www\.)?w3\.org\//i,
    reason: 'W3C XML/SVG namespace identifier',
  },
  {
    pattern: /^https:\/\/react\.dev\//i,
    reason: 'React error-decoder documentation string',
  },
];

const TEXT_ASSET_EXTENSIONS = new Set([
  '.html',
  '.css',
  '.js',
  '.mjs',
  '.json',
  '.svg',
  '.txt',
  '.webmanifest',
  '.map',
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

const failures = [];
const notes = [];

function fail(message) {
  failures.push(message);
  console.error(`FAIL ${message}`);
}

function pass(message) {
  console.log(`ok   ${message}`);
}

function note(message) {
  notes.push(message);
  console.log(`note ${message}`);
}

function normalizeBase(rawBase) {
  if (!rawBase || rawBase === '/') {
    return '/';
  }
  const withLeading = rawBase.startsWith('/') ? rawBase : `/${rawBase}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

const base = normalizeBase(process.env.VITE_BASE ?? DEFAULT_BASE);

function build() {
  console.log(`\n== Build (VITE_BASE=${base}) ==`);
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

function relativeToRoot(filePath) {
  return path.relative(repoRoot, filePath).replaceAll(path.sep, '/');
}

function formatBytes(bytes) {
  return `${bytes} B`;
}

function isAllowedExternalUrl(url) {
  return ALLOWED_EXTERNAL_URLS.find((entry) => entry.pattern.test(url));
}

/* -------------------------------------------------------------------------- */
/* HTML: CSP position, base-prefixed references and on-disk resolution        */
/* -------------------------------------------------------------------------- */

function decodeHtmlAttribute(value) {
  return value
    .replaceAll('&#39;', "'")
    .replaceAll('&#x27;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&');
}

function extractCspTag(html) {
  const tag = html.match(
    /<meta[^>]+http-equiv=("|')Content-Security-Policy\1[^>]*>/i,
  )?.[0];
  return tag ? decodeHtmlAttribute(tag) : undefined;
}

function extractAssetReferences(html) {
  const references = new Set();
  const patterns = [
    /<script\b[^>]*\bsrc=("|')([^"']+)\1/gi,
    /<link\b[^>]*\bhref=("|')([^"']+)\1/gi,
    /<img\b[^>]*\bsrc=("|')([^"']+)\1/gi,
  ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const reference = match[2];
      if (reference) {
        references.add(reference);
      }
    }
  }

  return [...references].filter(
    (reference) =>
      !reference.startsWith('data:') &&
      !reference.startsWith('#') &&
      !reference.startsWith('mailto:'),
  );
}

async function auditHtml() {
  console.log('\n== HTML contract ==');
  const indexPath = path.join(distDir, 'index.html');
  let html;
  try {
    html = await readFile(indexPath, 'utf8');
  } catch {
    fail('dist/index.html was not emitted by the build');
    return { references: [] };
  }

  const cspTag = extractCspTag(html);
  if (!cspTag) {
    fail('dist/index.html has no Content-Security-Policy meta tag');
  } else {
    for (const directive of [
      "default-src 'self'",
      "script-src 'self'",
      "object-src 'none'",
      "connect-src 'self'",
    ]) {
      if (!cspTag.includes(directive)) {
        fail(`CSP is missing the directive: ${directive}`);
      }
    }

    const firstScript = html.search(/<script\b/i);
    if (firstScript !== -1 && html.indexOf(cspTag) > firstScript) {
      fail('CSP meta tag appears after the first script tag');
    } else {
      pass('CSP precedes the first script tag in dist/index.html');
    }
  }

  const references = extractAssetReferences(html);
  if (references.length === 0) {
    fail('dist/index.html references no built assets');
    return { references };
  }

  for (const reference of references) {
    const pathname = reference.split(/[?#]/)[0] ?? reference;
    if (!pathname.startsWith(base)) {
      fail(`asset ${reference} is outside the configured base ${base}`);
      continue;
    }

    const relativePath = pathname.slice(base.length);
    const filePath = path.join(distDir, relativePath);
    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        fail(`asset ${reference} is not a file`);
      } else {
        pass(
          `referenced asset ${reference} -> ${relativeToRoot(filePath)} (${formatBytes(fileStat.size)})`,
        );
      }
    } catch {
      fail(`asset ${reference} is missing from dist`);
    }
  }

  note(`base=${base} html references=${references.length}`);
  return { references };
}

/* -------------------------------------------------------------------------- */
/* Built output: no external subresource URL anywhere                         */
/* -------------------------------------------------------------------------- */

async function auditBuiltOutput() {
  console.log('\n== Emitted output: external subresource scan ==');

  let files;
  try {
    files = await walk(distDir);
  } catch {
    fail('dist/ does not exist; the build did not emit output');
    return;
  }

  const textFiles = files.filter((file) =>
    TEXT_ASSET_EXTENSIONS.has(path.extname(file).toLowerCase()),
  );

  if (textFiles.length === 0) {
    fail('dist/ contains no text assets to scan');
    return;
  }

  for (const file of textFiles.sort()) {
    const contents = await readFile(file, 'utf8');
    const urls = [...contents.matchAll(/https?:\/\/[^\s"'<>`)\]]+/gi)].map(
      (match) => match[0].replace(/[.,;:]+$/, ''),
    );

    const allowed = [];
    const offending = [];
    for (const url of urls) {
      const allowedEntry = isAllowedExternalUrl(url);
      if (allowedEntry) {
        allowed.push(allowedEntry.reason);
      } else {
        offending.push(url);
      }
    }

    if (offending.length > 0) {
      fail(
        `${relativeToRoot(file)} contains external subresource URL(s): ${[
          ...new Set(offending),
        ].join(', ')}`,
      );
    } else {
      const suffix =
        allowed.length === 0
          ? 'no absolute URLs'
          : `${allowed.length} namespace/documentation reference(s), none requested`;
      pass(`${relativeToRoot(file)}: ${suffix}`);
    }
  }

  note('W3C namespace identifiers and React error-decoder links are never fetched; the Chromium audit observes the actual request list.');
}

/* -------------------------------------------------------------------------- */
/* Manifest: every entry resolves to an emitted file                          */
/* -------------------------------------------------------------------------- */

async function readManifest() {
  console.log('\n== Asset manifest ==');
  const manifestPath = path.join(distDir, 'assets', 'assets.manifest.json');
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    fail('dist/assets/assets.manifest.json is missing or is not valid JSON');
    return { entries: [], manifestPath };
  }

  if (typeof manifest.version !== 'number') {
    fail('asset manifest has no numeric version');
  }

  if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) {
    fail('asset manifest has no assets array');
    return { entries: [], manifestPath };
  }

  const entries = [];
  const seenIds = new Set();
  const seenPaths = new Set();

  for (const entry of manifest.assets) {
    if (
      !entry ||
      typeof entry.id !== 'string' ||
      typeof entry.path !== 'string' ||
      !/\.(?:svg|png|webp|avif)$/i.test(entry.path)
    ) {
      fail(`asset manifest entry is malformed: ${JSON.stringify(entry)}`);
      continue;
    }

    if (seenIds.has(entry.id)) {
      fail(`asset manifest repeats the id ${entry.id}`);
    }
    if (seenPaths.has(entry.path)) {
      fail(`asset manifest repeats the path ${entry.path}`);
    }
    seenIds.add(entry.id);
    seenPaths.add(entry.path);

    const filePath = path.join(distDir, 'assets', entry.path);
    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        fail(`manifest entry ${entry.id} points at ${entry.path}, which is not a file`);
      } else {
        entries.push({ id: entry.id, relativePath: `assets/${entry.path}`, size: fileStat.size });
      }
    } catch {
      fail(`manifest entry ${entry.id} points at ${entry.path}, which is missing from dist`);
    }
  }

  if (entries.length > 0) {
    pass(
      `asset manifest v${String(manifest.version)}: ${entries.length}/${manifest.assets.length} entries resolve to emitted files`,
    );
  }

  return { entries, manifestPath };
}

/* -------------------------------------------------------------------------- */
/* Application source: no dangerous HTML or dynamic-code APIs                 */
/* -------------------------------------------------------------------------- */

/**
 * Blank comments and string/template literals while preserving newlines so a
 * line number still points at the original file. Template interpolations return
 * to code mode, so an expression inside `${...}` is still scanned.
 */
function sanitizeSource(source) {
  let out = '';
  const modes = [{ type: 'code', depth: 0 }];

  const emit = (character) => {
    out += character;
  };
  const blank = (character) => {
    out += character === '\n' ? '\n' : ' ';
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    const mode = modes[modes.length - 1];

    if (mode.type === 'code') {
      if (character === '/' && next === '/') {
        modes.push({ type: 'line' });
        blank(character);
        blank(next);
        index += 1;
        continue;
      }
      if (character === '/' && next === '*') {
        modes.push({ type: 'block' });
        blank(character);
        blank(next);
        index += 1;
        continue;
      }
      if (character === "'") {
        modes.push({ type: 'single' });
        blank(character);
        continue;
      }
      if (character === '"') {
        modes.push({ type: 'double' });
        blank(character);
        continue;
      }
      if (character === '`') {
        modes.push({ type: 'template' });
        blank(character);
        continue;
      }
      if (mode.depth > 0 && character === '{') {
        mode.depth += 1;
      } else if (mode.depth > 0 && character === '}') {
        mode.depth -= 1;
        if (mode.depth === 0) {
          blank(character);
          modes.pop();
          continue;
        }
      }
      emit(character);
      continue;
    }

    if (mode.type === 'line') {
      blank(character);
      if (character === '\n') {
        modes.pop();
      }
      continue;
    }

    if (mode.type === 'block') {
      blank(character);
      if (character === '*' && next === '/') {
        blank(next);
        index += 1;
        modes.pop();
      }
      continue;
    }

    if (mode.type === 'single' || mode.type === 'double') {
      blank(character);
      if (character === '\\') {
        if (next !== undefined) {
          blank(next);
          index += 1;
        }
        continue;
      }
      if (character === (mode.type === 'single' ? "'" : '"')) {
        modes.pop();
      }
      continue;
    }

    if (mode.type === 'template') {
      if (character === '\\') {
        blank(character);
        if (next !== undefined) {
          blank(next);
          index += 1;
        }
        continue;
      }
      if (character === '`') {
        blank(character);
        modes.pop();
        continue;
      }
      if (character === '$' && next === '{') {
        blank(character);
        blank(next);
        index += 1;
        modes.push({ type: 'code', depth: 1 });
        continue;
      }
      blank(character);
      continue;
    }
  }

  return out;
}

const FORBIDDEN_TOKENS = [
  { label: 'dangerouslySetInnerHTML', pattern: /dangerouslySetInnerHTML/ },
  { label: 'eval(', pattern: /\beval\s*\(/ },
  { label: 'new Function', pattern: /\bnew\s+Function\s*\(/ },
];

function findForbiddenTokens(sanitizedSource) {
  const found = [];
  for (const rule of FORBIDDEN_TOKENS) {
    const match = rule.pattern.exec(sanitizedSource);
    if (match) {
      const line = sanitizedSource.slice(0, match.index).split('\n').length;
      found.push({ label: rule.label, line });
    }
  }
  return found;
}

/**
 * Prove the detector works before trusting a clean scan: each forbidden token is
 * caught in code and ignored inside a string or comment.
 */
function verifySourceScanner() {
  const positives = [
    'const node = <div dangerouslySetInnerHTML={{ __html: html }} />;',
    'eval("2 + 2");',
    'const build = new Function("return 1");',
  ];
  const negatives = [
    "const tokens = ['dangerouslySetInnerHTML', 'eval(', 'new Function'];",
    '// eval( is forbidden\n/* new Function */\nconst label = "dangerouslySetInnerHTML";',
    'const template = `eval( and new Function`;',
  ];

  for (const snippet of positives) {
    if (findForbiddenTokens(sanitizeSource(snippet)).length === 0) {
      fail(`source scanner self-check missed a real occurrence: ${snippet}`);
    }
  }

  for (const snippet of negatives) {
    const found = findForbiddenTokens(sanitizeSource(snippet));
    if (found.length > 0) {
      fail(
        `source scanner self-check flagged a quoted/comment occurrence: ${found
          .map((entry) => entry.label)
          .join(', ')}`,
      );
    }
  }

  pass('source scanner self-check: detects code usage, ignores quoted and commented tokens');
}

async function auditSource() {
  console.log('\n== Application source scan ==');
  verifySourceScanner();

  let files;
  try {
    files = (await walk(sourceDir)).filter((file) =>
      SOURCE_EXTENSIONS.has(path.extname(file).toLowerCase()),
    );
  } catch {
    fail('src/ is missing; the source scan cannot run');
    return;
  }

  if (files.length === 0) {
    fail('the source scan found no files under src/');
    return;
  }

  let reported = 0;
  for (const file of files.sort()) {
    const source = await readFile(file, 'utf8');
    for (const finding of findForbiddenTokens(sanitizeSource(source))) {
      reported += 1;
      fail(`${relativeToRoot(file)}:${finding.line} uses ${finding.label}`);
    }
  }

  if (reported === 0) {
    pass(`scanned ${files.length} source files: no dangerous HTML or dynamic-code APIs`);
  }
}

/* -------------------------------------------------------------------------- */
/* Static server scoped to the deployment base                                */
/* -------------------------------------------------------------------------- */

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

async function serveDist() {
  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
    let pathname = decodeURIComponent(requestUrl.pathname);

    if (pathname === base || pathname === `${base}index.html`) {
      pathname = `${base}index.html`;
    }

    if (!pathname.startsWith(base)) {
      response.writeHead(404).end('not found');
      return;
    }

    const relativePath = pathname.slice(base.length) || 'index.html';
    const filePath = path.resolve(distDir, relativePath);

    if (!filePath.startsWith(`${path.resolve(distDir)}${path.sep}`)) {
      response.writeHead(403).end('forbidden');
      return;
    }

    try {
      const body = await readFile(filePath);
      response.writeHead(200, {
        'content-type': contentType(filePath),
        connection: 'close',
      });
      response.end(body);
    } catch {
      response.writeHead(404).end('not found');
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unable to determine the audit server port.');
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/* -------------------------------------------------------------------------- */
/* Served subpath: HTML, references, manifest and files all answer 200        */
/* -------------------------------------------------------------------------- */

async function expectServed(origin, urlPath, label) {
  let response;
  try {
    response = await fetch(`${origin}${urlPath}`);
  } catch (error) {
    fail(`${label} ${urlPath} could not be fetched: ${String(error)}`);
    return undefined;
  }

  if (response.status !== 200) {
    fail(`${label} ${urlPath} returned ${response.status}, expected 200`);
    return undefined;
  }

  const body = await response.arrayBuffer();
  pass(`200 ${urlPath} (${formatBytes(body.byteLength)})`);
  return { body: Buffer.from(body), headers: response.headers };
}

async function auditServedBuild(origin, references, manifestEntries) {
  console.log('\n== Served subpath ==');

  const indexResponse = await expectServed(origin, base, 'served document');
  if (indexResponse) {
    const contentTypeHeader = indexResponse.headers.get('content-type') ?? '';
    if (!contentTypeHeader.includes('text/html')) {
      fail(`served document content-type is ${contentTypeHeader}, expected text/html`);
    }
  }

  for (const reference of references) {
    await expectServed(origin, reference, 'referenced asset');
  }

  const manifestUrl = `${base}assets/assets.manifest.json`;
  const manifestResponse = await expectServed(origin, manifestUrl, 'manifest');
  if (manifestResponse) {
    try {
      const parsed = JSON.parse(manifestResponse.body.toString('utf8'));
      if (!Array.isArray(parsed.assets) || parsed.assets.length === 0) {
        fail('served manifest has no assets array');
      }
    } catch {
      fail(`served manifest ${manifestUrl} is not valid JSON`);
    }
  }

  for (const entry of manifestEntries) {
    await expectServed(origin, `${base}${entry.relativePath}`, `manifest asset ${entry.id}`);
  }

  // A catch-all 200 would make every check above meaningless: prove a missing
  // path is a hard 404 on the same server.
  const missingUrl = `${base}assets/__audit-missing-asset__.svg`;
  const missingResponse = await fetch(`${origin}${missingUrl}`);
  if (missingResponse.status === 404) {
    pass(`missing-asset guard: ${missingUrl} returns 404 as required`);
  } else {
    fail(
      `${missingUrl} returned ${missingResponse.status}; a server that answers 200 for a missing file cannot prove asset coverage`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Chromium: real subpath load, one played card, zero leaks                  */
/* -------------------------------------------------------------------------- */

async function auditBrowser(origin) {
  console.log('\n== Chromium subpath journey ==');

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);

  const consoleErrors = [];
  const pageErrors = [];
  const requests = [];
  const failedRequests = [];
  const badResponses = [];

  page.on('console', (message) => {
    if (message.type() !== 'error') {
      return;
    }
    const location = message.location();
    const at = location.url ? ` (${location.url}:${String(location.lineNumber)})` : '';
    consoleErrors.push(`${message.text()}${at}`);
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });
  page.on('request', (request) => {
    requests.push({
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
    });
  });
  page.on('requestfailed', (request) => {
    failedRequests.push(
      `${request.method()} ${request.url()} (${request.failure()?.errorText ?? 'unknown error'})`,
    );
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      badResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  try {
    const documentUrl = `${origin}${base}?seed=${AUDIT_SEED}`;
    const documentResponse = await page.goto(documentUrl, {
      waitUntil: 'networkidle',
    });

    if (!documentResponse || documentResponse.status() !== 200) {
      fail(
        `the subpath document ${documentUrl} returned ${String(
          documentResponse?.status(),
        )}, expected 200`,
      );
      return;
    }

    await page.waitForSelector('#main-content[data-screen="menu"]', {
      state: 'visible',
    });

    await page.getByRole('button', { name: 'Play Solo', exact: true }).click();
    await page.waitForSelector('#main-content[data-screen="solo-setup"]', {
      state: 'visible',
    });

    await page
      .getByRole('button', { name: 'Choose the Ember deck', exact: true })
      .click();
    await page.getByRole('button', { name: 'Start Run', exact: true }).click();
    await page.waitForSelector('#main-content[data-screen="battle"]', {
      state: 'visible',
    });
    await page.waitForSelector('.hand .card-view', { state: 'visible' });

    const energyBefore =
      (await page.locator('.battle-controls__energy').first().innerText()).trim();

    const affordable = page.locator('.hand .card-view[data-affordable="true"]');
    const affordableCount = await affordable.count();
    if (affordableCount === 0) {
      fail(
        `seed ${AUDIT_SEED}: the opening hand has no affordable card, so no card can be played`,
      );
      return;
    }

    // Pick a card that costs at least one energy so the energy readout must
    // change; every Ember-deck card at this cost spends energy.
    let chosenIndex = -1;
    let chosenLabel = '';
    for (let index = 0; index < affordableCount; index += 1) {
      const card = affordable.nth(index);
      const costText = (await card.locator('.card-view__cost').innerText()).trim();
      const cost = Number.parseInt(costText, 10);
      if (Number.isFinite(cost) && cost >= 1) {
        chosenIndex = index;
        chosenLabel = (await card.getAttribute('aria-label')) ?? '';
        break;
      }
    }

    if (chosenIndex === -1) {
      fail(
        `seed ${AUDIT_SEED}: every affordable card costs zero energy, so the play cannot be verified from the energy readout`,
      );
      return;
    }

    const chosen = affordable.nth(chosenIndex);
    const instanceId = await chosen.getAttribute('data-instance-id');
    await chosen.click();

    await page.waitForSelector('[data-card-detail-layer="true"]', {
      state: 'visible',
    });
    await page.getByRole('button', { name: 'Play card', exact: true }).click();
    await page.waitForSelector('[data-card-detail-layer="true"]', {
      state: 'hidden',
    });

    const energyAfter =
      (await page.locator('.battle-controls__energy').first().innerText()).trim();

    if (energyAfter === energyBefore) {
      fail(
        `playing ${String(instanceId)} ("${chosenLabel}") left the energy readout at "${energyBefore}"; the card did not resolve`,
      );
    } else {
      pass(
        `played ${String(instanceId)} ("${chosenLabel}"): energy "${energyBefore}" -> "${energyAfter}"`,
      );
    }

    const screen = await page
      .locator('#main-content')
      .getAttribute('data-screen');
    if (screen !== 'battle') {
      fail(`the router left the battle after one card play (data-screen=${String(screen)})`);
    }

    // Let any trailing request settle before judging the request list.
    await page.waitForLoadState('networkidle');

    const originUrl = new URL(origin).origin;
    const crossOrigin = requests.filter((request) => {
      const requestOrigin = new URL(request.url).origin;
      return requestOrigin !== originUrl && requestOrigin !== 'null';
    });
    const nonGet = requests.filter((request) => request.method !== 'GET');
    const ignoredResponses = badResponses.filter((entry) =>
      AUTOMATIC_PROBES.has(new URL(entry.split(' ')[1] ?? '', origin).pathname),
    );
    const unexpectedResponses = badResponses.filter(
      (entry) => !ignoredResponses.includes(entry),
    );

    const byType = new Map();
    for (const request of requests) {
      const key = new URL(request.url).pathname;
      byType.set(key, (byType.get(key) ?? 0) + 1);
    }
    for (const [requestPath, count] of [...byType.entries()].sort()) {
      console.log(`     request ${requestPath}${count > 1 ? ` x${count}` : ''}`);
    }

    if (crossOrigin.length > 0) {
      fail(
        `cross-origin requests observed: ${crossOrigin
          .map((request) => request.url)
          .join(', ')}`,
      );
    } else {
      pass(`zero cross-origin requests across ${requests.length} request(s)`);
    }

    if (nonGet.length > 0) {
      fail(
        `non-GET requests observed (the app must transmit nothing): ${nonGet
          .map((request) => `${request.method} ${request.url}`)
          .join(', ')}`,
      );
    } else {
      pass('every request was a GET; no payload was transmitted');
    }

    if (failedRequests.length > 0) {
      fail(`failed requests: ${failedRequests.join('; ')}`);
    } else {
      pass('no failed requests');
    }

    if (unexpectedResponses.length > 0) {
      fail(`HTTP error responses: ${unexpectedResponses.join('; ')}`);
    } else {
      pass(
        ignoredResponses.length === 0
          ? 'every response was a 2xx'
          : `every response was a 2xx (ignored the browser's own ${ignoredResponses.join(', ')} probe)`,
      );
    }

    if (consoleErrors.length > 0) {
      fail(`console errors: ${consoleErrors.join(' | ')}`);
    } else {
      pass('no console errors');
    }

    if (pageErrors.length > 0) {
      fail(`uncaught page errors: ${pageErrors.join(' | ')}`);
    } else {
      pass('no uncaught page errors');
    }
  } catch (error) {
    fail(`Chromium subpath journey threw: ${String(error)}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

/* -------------------------------------------------------------------------- */
/* Dev server: the CSP stays build-only                                       */
/* -------------------------------------------------------------------------- */

async function auditDevServer() {
  console.log('\n== Dev server ==');
  process.env.VITE_BASE = base;
  const { createServer: createViteServer } = await import('vite');
  const server = await createViteServer({
    configFile: path.join(repoRoot, 'vite.config.ts'),
    server: { host: '127.0.0.1', port: 5199, strictPort: true },
    logLevel: 'silent',
  });

  try {
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === 'string') {
      throw new Error('Unable to determine the dev server port.');
    }

    const response = await fetch(`http://127.0.0.1:${address.port}${base}`);
    const html = await response.text();
    if (!response.ok) {
      fail(`dev server returned ${response.status}`);
    } else if (extractCspTag(html)) {
      fail('dev server HTML must not include a Content-Security-Policy tag');
    } else {
      pass('dev server HTML has no CSP (the policy is build-only)');
    }
  } finally {
    await server.close();
  }
}

/* -------------------------------------------------------------------------- */

async function main() {
  console.log(`Fieldbound build and origin audit (base ${base})`);

  build();
  const { references } = await auditHtml();
  await auditBuiltOutput();
  const { entries } = await readManifest();
  await auditSource();

  const server = await serveDist();
  try {
    await auditServedBuild(server.origin, references, entries);
    await auditBrowser(server.origin);
  } finally {
    await server.close();
  }

  await auditDevServer();

  if (failures.length > 0) {
    console.error(`\n${failures.length} build audit failure(s):`);
    for (const message of failures) {
      console.error(`  - ${message}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('\nBuild and origin audit passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
