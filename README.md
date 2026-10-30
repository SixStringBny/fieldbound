# Fieldbound

A turn-based card battler built around one shared elemental field. The field
empowers attacks that match it, lets them pierce defense and halves attacks it
beats; two modes share one deterministic rules engine:

- **Solo run** — pick a starter deck, win three escalating encounters and a boss,
  choosing a reward between fights. A settled action writes a versioned save, so
  a reload resumes the exact battle.
- **Local duel** — pass-and-play best-of-three on one device, with a full-screen
  privacy handoff before every turn.

The product is a static, local-only React build. There is no backend, no
accounts, no cloud save, no telemetry and no runtime network call: the only
persisted state lives in three `localStorage` keys.

- Node.js **22.13.0** or newer (verified on Node 22.13.0), npm 10 or newer
- Any current Chromium, Firefox or WebKit browser (E2E installs Playwright
  builds locally)

## Install

```bash
npm install
npx playwright install   # once, before the first E2E run
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server with React Fast Refresh. No CSP is injected in dev. |
| `npm test` | Run the Vitest unit and integration suite once (jsdom, through `scripts/run-vitest.mjs`). |
| `npm run typecheck` | Strict TypeScript checking (`tsc --noEmit`) with no output. |
| `npm run build` | Typecheck, then emit the static production build to `dist/`. |
| `npm run preview` | Serve `dist/` with `vite preview`, honoring the `VITE_BASE` used at build time. |
| `npm run serve:dist` | Serve `dist/` on `127.0.0.1:4173` with `--strictPort` for E2E and manual checks. |
| `npm run test:e2e` | Run the Playwright specs in `tests/e2e` against a freshly built `dist`. |
| `npm run check:build` | Build with the Pages subpath and audit the static build, origin and source. |
| `npm run check:budget` | Build and enforce the 307200-byte gzip JavaScript + CSS budget. |

### Run locally

```bash
npm run dev
```

The dev server is for development only: React Fast Refresh needs its WebSocket,
so the production CSP is deliberately not injected there.

To exercise the deployable artifact instead:

```bash
npm run build
npm run preview
```

`preview` reads the same `VITE_BASE` the build used, so a root build is at
`http://localhost:4173/` and a Pages build
(`VITE_BASE=/Card-Game-Project/`) at
`http://localhost:4173/Card-Game-Project/`.

### Test

```bash
npm test                                  # unit + integration
npm run test:e2e                          # smoke, responsive, solo and duel journeys
npm run test:e2e -- tests/e2e/smoke.spec.ts
npm run test:e2e -- tests/e2e/solo-run.spec.ts --project=chromium
```

The Playwright configuration (`playwright.config.ts`) never starts the dev
server. Its `webServer` runs `npm run build && npm run serve:dist`, forces
`VITE_BASE=/` for that build, and serves the result on `127.0.0.1:4173` with
`reuseExistingServer: false` and `--strictPort`, so a port collision is a hard
failure rather than a silent test against another process.

The suite defines Chromium, Firefox and WebKit projects. Smoke and
responsive/accessibility checks run on all three; the long solo and duel
journeys run on Chromium only. Seeding goes through `?seed=<n>` — no spec writes
`localStorage`.

## Build and deploy

`VITE_BASE` is the single deployment switch; the value is normalized to start
and end with a slash. Every emitted script, style, manifest and asset URL is
relative to that base, and no runtime code reads a host name.

```bash
# Local root deployment
VITE_BASE=/ npm run build

# GitHub Pages project deployment
VITE_BASE=/Card-Game-Project/ npm run build
```

`npm run build` writes only static files to `dist/`. To serve a subpath build
locally, use the same `VITE_BASE` for the build and the preview server:

```bash
VITE_BASE=/Card-Game-Project/ npm run build
VITE_BASE=/Card-Game-Project/ npm run preview
```

### GitHub Pages

`.github/workflows/pages.yml` deploys `main`:

1. `npm ci`
2. `npm run build` with `VITE_BASE=/${{ github.event.repository.name }}/`
3. `actions/configure-pages`, then upload `dist/` as the Pages artifact
4. `actions/deploy-pages` in the `github-pages` environment

It uses only the repository `GITHUB_TOKEN`; no deployment secrets are stored.
Enable it once in the repository under **Settings → Pages → Build and deployment
→ Source: GitHub Actions**. The site is served from
`https://<owner>.github.io/<repository>/`.

Manual alternative: build with `VITE_BASE=/<repository>/` and publish the
contents of `dist/` to the Pages branch or any static host. Because every URL is
base-relative, the same artifact works on any host at the same subpath.

### CI

`.github/workflows/ci.yml` runs on every push and pull request:
`npm ci` → `npm run typecheck` → `npm test` → `npm run build` →
`npx playwright install --with-deps chromium firefox webkit` →
`npm run test:e2e` → `node scripts/check-build.mjs` →
`node scripts/check-budget.mjs`. On failure it uploads `test-results/` as a
workflow artifact; on every run it uploads the five-viewport sweep from
`test-results/screenshots/` (`AB-E2`, retained 14 days). No secrets are
required.

## Release audits

### `node scripts/check-build.mjs`

One command that proves the deployable artifact matches the deployment contract.
It needs the Playwright Chromium build (`npx playwright install chromium`, already
covered by the install step above).

- builds with `VITE_BASE=/Card-Game-Project/` and audits only that `dist/`;
- checks the CSP meta tag is present and precedes the first script;
- resolves every `<script src>`, `<link href>` and `<img src>` under the base and
  fails when the file is missing from `dist/`;
- walks every emitted text file and fails on an external `http(s)` subresource
  URL (W3C XML/SVG namespace identifiers and React's error-decoder documentation
  string are reported as never requested, not treated as subresources);
- reads `dist/assets/assets.manifest.json`, requires every entry to resolve to an
  emitted file and serves HTML, every reference, the manifest and all 41 asset
  files under the real subpath — each must answer 200, and a deliberately
  missing path must answer 404;
- launches Chromium on `http://127.0.0.1:<port>/Card-Game-Project/`, seeds a solo
  run, opens the Ember deck, plays one affordable card from the hand and asserts
  the energy readout changes; it fails on any console error, page error, failed
  request, non-GET request or cross-origin request;
- scans `src/` for `dangerouslySetInnerHTML`, `eval(` and `new Function`,
  ignoring comments and string literals, and self-checks the detector first;
- confirms the dev server HTML carries no CSP, so the policy stays build-only.

Anything the audit cannot verify is a failure, never a warning.

### `node scripts/check-budget.mjs`

Gzip-compresses every emitted JavaScript and CSS file, prints a per-file table
and fails above **307200 bytes** (300 KiB) with the overage shown, plus any
manifest entry that points at a missing file.

## Asset swap contract

All art is a committed, same-origin SVG placeholder selected by a versioned
manifest. No component imports an SVG directly: every image goes through
`resolveAsset(id, baseUrl)` in `src/assets/asset-manifest.ts`, which returns
`<base>assets/<manifest path>`. That indirection is what makes a replacement a
file swap with no code change.

- **Manifest:** `public/assets/assets.manifest.json`, copied to
  `dist/assets/assets.manifest.json` at build time.
- **Schema:** `version: 1`, a class-wide `spec` block (card 300×420, enemy
  512×512, field 256×256, with safe areas) and an `assets` array sorted by id.
  Each entry has `id` (`card:<card-id>`, `enemy:<enemy-id>`, `field:<element>`),
  `kind`, `element`, `name`, a relative `path` (`cards/<card-id>.svg`,
  `enemies/<enemy-id>.svg`, `fields/field-<element>.svg`), `width`, `height`,
  `format` and `safeArea`.
- **Coverage:** 41 entries — 32 cards, 4 enemies and 5 fields.

### Replace one SVG

1. Find the entry by id in `public/assets/assets.manifest.json`.
2. Read its `path`, `width`, `height` and `safeArea`.
3. Replace the file at exactly that path with an SVG of the same canvas size.
4. Keep the file name and the manifest entry unchanged.
5. Do **not** run `node scripts/generate-placeholder-assets.mjs` afterwards for a
   single replacement: regeneration rewrites every placeholder and would
   overwrite the new art.
6. Validate with `npm test -- src/assets/asset-manifest.test.ts`,
   `node scripts/check-budget.mjs` and `node scripts/check-build.mjs`.
7. Commit the SVG. No engine, controller or UI edit is needed.

### Add or remove content

1. Change the card/enemy catalog in `src/content/`.
2. Run `node scripts/generate-placeholder-assets.mjs` to regenerate the manifest
   and SVGs.
3. Run `npm test -- src/assets/asset-manifest.test.ts` and
   `npm test -- src/content/content.test.ts`.
4. Commit the catalog, manifest, SVGs and any `docs/ASSET-SPEC.md` change
   together.

The full schema, palette, safe-area rules and determinism guarantees live in
[docs/ASSET-SPEC.md](docs/ASSET-SPEC.md).

## Security and privacy

- The production HTML receives a same-origin `Content-Security-Policy` meta tag
  from a build-only Vite plugin; the dev server HTML deliberately has none.
- `src/` contains no `dangerouslySetInnerHTML`, `eval` or `new Function`.
  `npm run check:build` scans for all three.
- No analytics, telemetry, third-party scripts, remote fonts, remote images or
  remote audio. Sound is synthesized with WebAudio.
- After the same-origin asset load the app makes no further request and
  transmits nothing; the Chromium audit proves zero cross-origin requests.
- Only three versioned keys are persisted:
  `fieldbound.run.v1` (run and battle snapshot), `fieldbound.settings.v1`
  (mute and reduced-motion override) and `fieldbound.stats.v1` (best run). Each
  payload is validated before use; a corrupt or foreign key is discarded on its
  own and defaults take over.
- When storage is unavailable or full the session continues in memory with a
  non-blocking notice.

## Project layout

```text
src/
  main.tsx        mounts the composition root
  App.tsx         screen union, seeding and flow wiring
  engine/         pure rules, AI, intent and snapshot code
  content/        card, deck and enemy data plus the generator input
  state/          battle, run and duel controllers
  persistence/    versioned settings, run save and stats
  assets/         base-URL-aware manifest loader
  audio/          WebAudio cues
  ui/screens/     one component per screen
  ui/components/  board, hand, cards, dialogs, live region
  styles/         plain CSS tokens and layout
public/assets/    generated SVG placeholders and assets.manifest.json
scripts/          asset generator, build/origin audit, budget audit, test runner
tests/e2e/        Playwright helpers and journeys
.github/workflows/ ci.yml and pages.yml
docs/             PRD, feature specs and the asset specification
```

## Browser support

Current and previous major versions of Chrome, Edge, Firefox and Safari,
including iOS 16+ Safari at 375×667. The Playwright matrix covers Chromium
(Chrome/Edge), Firefox and WebKit (Safari).

## Toolchain notes

- TypeScript 7.0.2 was verified at scaffold time: `npm run typecheck` and
  `npm run build` both pass, so no 5.x fallback is in use.
- The PRD lists jsdom 30.1.3, but that release requires Node
  `^22.22.2 || ^24.15.0 || >=26.0.0`. The verified local runtime is Node
  22.13.0, so the project pins **jsdom 29.0.0**, which supports Node 22.13.
  This is the only toolchain deviation; revisit it when the Node runtime is
  upgraded. Every other package matches the versions verified in PRD 6.1.
