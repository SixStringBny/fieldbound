---
name: static-build-origin-audit
description: "Produce and audit the GitHub Pages subpath build with build-only CSP injection, zero cross-origin requests after load, a 307200-byte gzip budget and committed CI and Pages workflows."
---

# Skill: Static Build and Origin Audit

Use this skill when changing the Vite build, the deployment base path, the CSP, the bundle budget, or the CI and Pages workflows, and whenever the production build must be proven before a release. It runs one audit that serves the real subpath build, plays a card in Chromium and fails on missing files, external subresources, cross-origin requests or an over-budget bundle.

Load `references/release-audit-checklist.md` when writing or debugging `scripts/check-build.mjs`, `scripts/check-budget.mjs` or the workflows.

---

## Process

### Step 1: Build with an explicit Pages base

```powershell
$env:VITE_BASE="/Card-Game-Project/"; npm run build
```

```bash
VITE_BASE=/Card-Game-Project/ npm run build
```

The base needs a leading and a trailing slash. Open `dist/index.html` and confirm every script, style and asset URL starts with `/Card-Game-Project/`. A base without the trailing slash produces `/Card-Game-Projectassets/...` and the page loads blank.

**Output:** a `dist` build that carries the project subpath.

### Step 2: Inject the CSP for production only

The Content-Security-Policy meta tag belongs to the production HTML, not the shared `index.html` template used by the dev server. Add it with a Vite `transformIndexHtml` step that runs only when `apply === "build"`, or in a post-build step.

- The meta tag sits in `<head>` before the first script tag; a CSP declared after a module script does not apply to it.
- Restrict scripts, styles, images and connections to the same origin.
- Keep the dev server free of the tag so HMR websockets and inline dev scripts still run.
- Search `src/` for `dangerouslySetInnerHTML`, `eval(` and `new Function`; each is a release blocker.

**Output:** build-only CSP injection plus a source scan that fails on those patterns.

### Step 3: Serve the subpath build and fetch every referenced file

`scripts/check-build.mjs`:

1. Builds with the Pages base into `dist`.
2. Serves `dist` under the same prefix on `127.0.0.1`.
3. Fetches the HTML, every referenced script and style, and `assets/assets.manifest.json`.
4. Fails on any non-200 response. If a fetch fails, then fix the emitting path or the base first; never relax the audit to match a broken build.
5. Scans the emitted output for `http://` or `https://` subresource URLs, ignoring the SVG namespace `http://www.w3.org/2000/svg`.
6. Prints each served path with its byte size.

**Output:** an audit command that fails on a missing asset or an external subresource.

### Step 4: Drive the served build in Chromium

The same script launches the installed Chromium, loads `http://127.0.0.1:<port>/Card-Game-Project/`, records console errors and every request, plays one affordable card and asserts the energy text changed. Fail on any console error, any failed request, or any cross-origin request after the document load.

Use the same host for the server and the browser (`127.0.0.1`, not `localhost`), or the navigation counts as cross-origin. If the audit reports a blocked or missing request, then fix the policy or the asset path; if that doesn't work, work the triage table in the reference before retrying.

**Output:** a browser-verified subpath build with request evidence in the log.

### Step 5: Enforce the gzip budget

`node scripts/check-budget.mjs` builds, gzip-compresses each emitted JS and CSS file, sums the results, prints per-file raw and gzip sizes and fails above 307200 bytes total (300 KiB). It also fails when a manifest entry points at a missing file.

Do not minify away behaviour or change build config to buy headroom; reduce the bundle or raise a documented scope change instead.

**Output:** a printed budget table with remaining headroom.

### Step 6: Commit CI and Pages workflows

- `.github/workflows/ci.yml` on push and pull request: `npm ci`, typecheck, unit and integration tests, build, `npx playwright install --with-deps`, E2E.
- `.github/workflows/pages.yml` on `main`: build with `VITE_BASE=/<repository>/`, upload `dist` with the Pages artifact action and deploy with the official Pages action. Needs `pages: write` and `id-token: write`; no secrets.
- `README.md` documents install, dev, test, build, preview, E2E, deploy and the asset swap procedure.

**Output:** workflows and README committed, both green on a clean clone.

---

## Gotchas

- **CSP hard-coded into the shared `index.html`.** The dev server then blocks HMR and inline dev scripts, and the failure looks like a broken app rather than a config bug. Inject on build only.
- **CSP meta emitted after the module script.** The policy is ignored for anything already parsed; verify the tag precedes the first script in `dist/index.html`.
- **Inline `style` attributes blocked by a strict `style-src`.** React style props need `'unsafe-inline'` for styles or a class-based rewrite; test the built page, not just the source.
- **`localhost` in the audit but `127.0.0.1` in the server.** The browser reports a cross-origin request and the audit fails for the wrong reason. Use one host end to end.
- **A bare `300 KB` comparison against decimal bytes.** The gate is 307200 bytes of gzip; comparing against 300000 fails a compliant build.
- **Summing gzip of concatenated assets.** Compress each emitted JS and CSS file separately and add the gzip sizes; a concatenated blob understates the real transfer.
- **External URL scan catching the SVG namespace.** `http://www.w3.org/2000/svg` is a namespace, not a request; allow exactly that value and nothing else.
- **Missing Playwright browsers in CI.** `npm ci` does not install them; add `npx playwright install --with-deps chromium` before the E2E step.
- **A 404 favicon counted as a failed request.** Commit a favicon or remove the reference; the audit treats any failed request as a blocker.
- **Pages deployment without permissions.** Missing `pages: write` or `id-token: write` fails the deploy step after a successful build.

---

## Validation

Run this self-check before calling the build release-ready:

- [ ] `node scripts/check-build.mjs` exits 0 and every fetched script, style and manifest path returns 200 under `/Card-Game-Project/`.
- [ ] The built HTML carries the CSP meta tag in `<head>` before the first script; the dev server HTML does not.
- [ ] Chromium plays one card from the hand and reports zero console errors and zero cross-origin requests after load.
- [ ] The source scan finds no `dangerouslySetInnerHTML`, `eval(` or `new Function` under `src/`.
- [ ] `node scripts/check-budget.mjs` exits 0, prints per-file sizes and reports remaining headroom under 307200 bytes.
- [ ] `ci.yml` runs typecheck, tests, build and Playwright; `pages.yml` deploys `dist` from `main` with the repository base path.
- [ ] `README.md` lists dev, test, build, preview, E2E and deploy commands plus the manifest swap steps.

If a check fails, load `references/release-audit-checklist.md` and work the matching triage row before changing application behaviour.
