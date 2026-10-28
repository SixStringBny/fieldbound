# Fieldbound

A turn-based card battler built around one shared elemental field. The app is a
static, local-only React build with no backend, accounts or runtime network
calls.

This repository is currently at the **workspace scaffold** stage: the
composition root and toolchain are ready, while the game surfaces and rules
arrive in later build steps.

## Requirements

- Node.js 22.13 or newer (verified on Node 22.13.0)
- npm 10 or newer

## Toolchain notes

- TypeScript 7.0.2 was verified at scaffold time: `npm run typecheck` and
  `npm run build` both pass, so no 5.x fallback is in use.
- The PRD lists jsdom 30.1.3, but that release requires Node
  `^22.22.2 || ^24.15.0 || >=26.0.0`. The verified local runtime is Node
  22.13.0, so the scaffold pins **jsdom 29.0.0**, which supports Node 22.13.
  This is the only toolchain deviation; revisit it when the Node runtime is
  upgraded. Every other package matches the versions verified in PRD 6.1.

## Install

```bash
npm install
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server with React Fast Refresh. No CSP is injected in dev. |
| `npm run build` | Typecheck with `tsc --noEmit`, then emit the static production build to `dist/`. |
| `npm run preview` | Serve `dist/` locally with `vite preview`. |
| `npm run serve:dist` | Serve the production build on `127.0.0.1:4173` for E2E and manual checks. |
| `npm run typecheck` | Run strict TypeScript checking without emitting. |
| `npm test` | Run the Vitest suite once in jsdom. |
| `npm run test:e2e` | Run the Playwright specs in `tests/e2e` (install browsers first). |
| `npm run check:build` | Build with a subpath base, audit the CSP, same-origin assets and dev-server CSP absence. |
| `npm run check:budget` | Build and enforce the 307200-byte gzip JavaScript + CSS budget. |

Install Playwright browsers once before the first E2E run:

```bash
npx playwright install
```

## Base path

`VITE_BASE` is the single deployment switch. The value must start and end with
a slash.

```bash
# Local root deployment
VITE_BASE=/ npm run build

# GitHub Pages project deployment
VITE_BASE=/Card-Game-Project/ npm run build
```

The build config normalizes a missing leading or trailing slash. Every script,
style and asset URL in `dist/index.html` is emitted under that base; no runtime
code reads a host name. Use the same `VITE_BASE` when running `preview` or
`serve:dist` against a subpath build, or the server will look for assets at the
root. Use `npm run check:build` to prove the subpath build end to end.

## Security

- The production HTML receives a same-origin Content-Security-Policy meta tag
  through a build-only Vite plugin. The dev server HTML deliberately has no CSP
  so Fast Refresh keeps working.
- No `dangerouslySetInnerHTML`, `eval` or `new Function` is allowed in `src/`.
  `npm run check:build` scans for all three.
- No analytics, telemetry, remote fonts, remote images or third-party scripts.

## Project layout

```text
src/
  main.tsx        mounts the composition root
  App.tsx         screen union and application shell
  App.test.tsx    composition-root interaction test
  styles/         plain CSS tokens and layout
  test/setup.ts   Vitest + Testing Library setup
scripts/
  check-build.mjs static build, CSP and origin audit
  check-budget.mjs gzip bundle budget audit
tests/e2e/        Playwright specs (added with the release harness)
```

## Deployment

`npm run build` writes a static `dist/`. Deploy that folder to any static host.
For GitHub Pages, build with `VITE_BASE=/<repository>/` and publish `dist/`.
