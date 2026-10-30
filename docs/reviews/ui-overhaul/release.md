# Release review — ticket 8

**Scope:** the whole overhaul, all twelve routes
**Ticket:** [#25 Release verification and sign-off](https://github.com/SixStringBny/fieldbound/issues/25)
**Branch:** `feat/ui-overhaul` at `f2b75e6`
**Decision:** approved with one recorded outstanding item

## Human release pass

| Field | Value |
| --- | --- |
| Reviewer | Ben McCusker (@SixStringBny), project owner |
| Date | 2026-10-30 |
| Viewports | 390×844, 768×1024, 1280×800 (all twelve routes) |
| Routes | menu, how-to-play, settings, solo-setup, run-overview, battle, reward, run-result, duel-setup, privacy, round-result, match-result |
| Decision | Approved — no route failed; the 375px device note is outstanding |

The pass covered each route at the three distinct compositions, including the
gated journeys (reward, run result, round result, match result) reached through a
real played run and a real best-of-three duel. No concrete issue was raised
against `H-C1`, `H-C2`, `H-P1` or `H-T1` on any route.

## Outstanding item (accepted by the owner)

- **Real 375px device note for `H-P1`.** The 375×667 composition passes the
  mechanical checks and was reviewed at emulated width, but the project owner has
  not yet attested a physical 375px device for one-handed reach. The route
  records keep their emulated-width notes; this is a recorded gap, not a failing
  check. The owner accepted shipping with it outstanding.

## Mechanical evidence

| Gate | Result |
| --- | --- |
| `npm run typecheck` | pass |
| `npm test` | 1332 passed / 1332, 46 files |
| `npx playwright test` — Chromium | 322 passed, 0 failed, 0 skipped |
| `npx playwright test` — Firefox | 316 passed, 0 failed, 6 skipped (Chromium-only journeys) |
| `npx playwright test` — WebKit | 316 passed, 0 failed, 6 skipped (Chromium-only journeys) |
| `node scripts/check-budget.mjs` | pass — 132,459 B gzip of 307,200 B |
| `node scripts/check-build.mjs` | pass — subpath, CSP, 41/41 manifest assets, zero cross-origin requests |
| `node scripts/check-frozen-paths.mjs --base origin/main` | pass — 103 files, two PARITY-guarded consumers, zero violations |
| `npm run check:ui-review` | pass — 12/12 records, no pixel baseline |
| `AB-E2` sweep | 60 frames, Chromium, CI artifact `ui-screenshots` |

## Release-branch test repairs (recorded per OVERHAUL §7.3)

`eb3a70a`: five engine-correctness repairs (Firefox `304` on revalidated
documents, Firefox inline-box clipping, Firefox `prefers-contrast` cascade timing,
sub-pixel 44/88px boxes, WebKit click-focus before Escape). No assertion was
weakened and no application code changed.

`8c0f89d`: `AB-E2` gained an owner — a Chromium five-viewport sweep and a CI
artifact upload. `f2b75e6`: the CI job ceiling raised from 30 to 180 minutes
because the single-worker tri-browser suite measures 95.4 minutes before retries.

## Record maintenance

`menu.json` is re-issued with this pass: its earlier record predated the motion
ticket removing a hover `box-shadow` transition from `menu.css`. The composition,
copy, geometry and static frame are unchanged; the release pass re-confirmed the
route.
