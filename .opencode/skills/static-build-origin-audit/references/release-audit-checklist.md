# Release Audit Checklist

> Load when writing or debugging `scripts/check-build.mjs`, `scripts/check-budget.mjs` or the CI and Pages workflows.

## Command sequence

```bash
npm ci
npm run typecheck
npm test
VITE_BASE=/Card-Game-Project/ npm run build
node scripts/check-build.mjs
node scripts/check-budget.mjs
```

On PowerShell, set the base first: `$env:VITE_BASE="/Card-Game-Project/"; npm run build`.

## Thresholds

| Gate | Pass condition |
|------|----------------|
| Subpath fetch | HTML, every referenced script and style, and `assets/assets.manifest.json` return 200 |
| External URLs | No `http://` or `https://` subresource in emitted output, except `http://www.w3.org/2000/svg` |
| Browser load | Chromium loads the prefixed URL with zero console errors |
| Card play | One affordable card changes the energy text |
| Requests | Zero cross-origin requests after the document load |
| Source scan | No `dangerouslySetInnerHTML`, `eval(` or `new Function` under `src/` |
| Budget | Sum of per-file gzip JS + CSS at or below 307200 bytes |
| Manifest coverage | Every manifest entry resolves to an existing file |

## check-build.mjs outline

1. Build with `VITE_BASE=/Card-Game-Project/`; fail if the build exits non-zero.
2. Start a static server rooted at `dist` and mounted under `/Card-Game-Project/`.
3. Parse `dist/index.html` for script, style and manifest references; fetch each and record status and bytes.
4. Read every emitted JS, CSS, HTML and JSON file; reject external URLs except the SVG namespace.
5. Launch Chromium, navigate to `http://127.0.0.1:<port>/Card-Game-Project/`, collect `console` errors and `request` events.
6. Click the first affordable card; assert the energy text changed.
7. E2E assertion: no console error, no failed request, no cross-origin request after the document load.
8. Scan `src/` recursively for the three forbidden patterns.
9. Print a table of path, status and bytes, then exit non-zero on any failure.

Keep the server and browser on the same host string. Print the port so a failed run can be reproduced by hand.

## CSP expectations

- Present in `dist/index.html` only; absent from the dev-server HTML.
- Emitted inside `<head>` before any `<script>` element.
- Restricts `default-src`, `script-src`, `style-src`, `img-src` and `connect-src` to the same origin.
- Allows inline styles only if React style props are used; prefer class-based styling and keep `style-src` free of `'unsafe-inline'` where practical.
- No `frame-ancestors` or `report-uri` inside a meta tag; those are ignored and belong in a header, which Pages cannot set.

## check-budget.mjs outline

1. Build.
2. Read `dist/assets/` and select emitted `.js` and `.css` files.
3. Gzip each file individually; sum the gzip sizes.
4. Print a table: file, raw bytes, gzip bytes, running total.
5. Fail with the overage when the total exceeds 307200.
6. Fail when a manifest entry has no file on disk.
7. Print remaining headroom on success.

## Workflow outlines

`ci.yml`:

```yaml
on:
  push:
  pull_request:
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test
```

`pages.yml`:

```yaml
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
        env:
          VITE_BASE: /${{ github.event.repository.name }}/
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - id: deployment
        uses: actions/deploy-pages@v4
```

## Failure triage

| Symptom | First check |
|---------|-------------|
| Blank page under the subpath | Base lacks a trailing slash, or an asset URL starts with `/assets` |
| 404 on a script or manifest | Build ran without `VITE_BASE`, or the server prefix differs from the base |
| CSP errors in the console | Meta tag after the first script, or a blocked inline style |
| Cross-origin request reported | Server and browser host differ, or a remote font or image slipped in |
| Budget above 307200 | New dependency, unminified asset, or gzip measured on the wrong file set |
| Required request fails | Missing committed SVG, missing favicon, or manifest path typo |
| Pages deploy fails after build | Missing `pages: write` or `id-token: write` permission |
| Audit passes locally, fails in CI | Playwright browsers not installed, or Node version below 22.12 |
