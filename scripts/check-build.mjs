/**
 * Fieldbound static-build audit.
 *
 * Proves, without a browser, that:
 *  - the production build honors a non-root VITE_BASE;
 *  - dist/index.html carries the same-origin CSP before the first script;
 *  - the dev server HTML does not carry a CSP (Fast Refresh stays healthy);
 *  - every script, style and image reference is same-origin and resolves;
 *  - application source contains no dangerous HTML or dynamic-code APIs.
 *
 * Run with `npm run check:build`. Set VITE_BASE to audit another subpath.
 */
import { execFileSync } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const distDir = path.join(repoRoot, 'dist');

function normalizeBase(rawBase) {
  if (!rawBase || rawBase === '/') {
    return '/';
  }
  const withLeading = rawBase.startsWith('/') ? rawBase : `/${rawBase}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

const base = normalizeBase(process.env.VITE_BASE ?? '/Card-Game-Project/');

const failures = [];
const notes = [];

function fail(message) {
  failures.push(message);
  console.error(`FAIL ${message}`);
}

function pass(message) {
  console.log(`ok   ${message}`);
}

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
  const indexPath = path.join(distDir, 'index.html');
  const html = await readFile(indexPath, 'utf8');

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

  const external = [
    ...html.matchAll(/https?:\/\/[^"'\s<>]+/gi),
  ].map((match) => match[0]);
  const disallowedExternal = external.filter(
    (url) => url !== 'http://www.w3.org/2000/svg',
  );
  if (disallowedExternal.length > 0) {
    fail(
      `dist/index.html references external URLs: ${disallowedExternal.join(', ')}`,
    );
  } else {
    pass('dist/index.html has no cross-origin subresource URLs');
  }

  const references = extractAssetReferences(html);
  if (references.length === 0) {
    fail('dist/index.html references no built assets');
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
        pass(`asset ${reference} (${fileStat.size} bytes)`);
      }
    } catch {
      fail(`asset ${reference} is missing from dist`);
    }
  }

  notes.push(`base=${base} references=${references.length}`);
  return { html, references };
}

async function auditSource() {
  const sourceDir = path.join(repoRoot, 'src');
  const files = await walk(sourceDir);
  const forbidden = [
    { label: 'dangerouslySetInnerHTML', pattern: /dangerouslySetInnerHTML/ },
    { label: 'eval(', pattern: /\beval\s*\(/ },
    { label: 'new Function', pattern: /\bnew\s+Function\s*\(/ },
  ];

  for (const file of files) {
    if (!/\.(?:ts|tsx|js|jsx)$/.test(file)) {
      continue;
    }
    const source = await readFile(file, 'utf8');
    for (const rule of forbidden) {
      if (rule.pattern.test(source)) {
        fail(`${path.relative(repoRoot, file)} uses ${rule.label}`);
      }
    }
  }

  pass('source scan found no dangerous HTML or dynamic-code APIs');
}

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

  const origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function auditServedBuild(references) {
  const server = await serveDist();
  try {
    const indexResponse = await fetch(`${server.origin}${base}`);
    if (!indexResponse.ok) {
      fail(`served index returned ${indexResponse.status}`);
      return;
    }
    pass(`served index at ${base} (${indexResponse.status})`);

    for (const reference of references) {
      const response = await fetch(`${server.origin}${reference}`);
      if (!response.ok) {
        fail(`served ${reference} returned ${response.status}`);
      } else {
        pass(`served ${reference} (${response.status})`);
      }
    }
  } finally {
    await server.close();
  }
}

async function auditDevServer() {
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
      pass('dev server HTML has no CSP');
    }
  } finally {
    await server.close();
  }
}

async function main() {
  console.log(`Fieldbound build audit (base ${base})`);
  build();
  const { references } = await auditHtml();
  await auditSource();
  await auditServedBuild(references);
  await auditDevServer();

  for (const note of notes) {
    console.log(`note ${note}`);
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} build audit failure(s).`);
    process.exitCode = 1;
    return;
  }

  console.log('\nBuild audit passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
