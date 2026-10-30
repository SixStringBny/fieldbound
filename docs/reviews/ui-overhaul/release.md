# Release review — ticket 31 (UI polish)

**Scope:** the whole overhaul plus the polish pass, all twelve routes
**Map:** [#27 UI polish: home and battlefield](https://github.com/SixStringBny/fieldbound/issues/27)
**Ticket:** [#31 Consistency sweep and re-release](https://github.com/SixStringBny/fieldbound/issues/31)
**Branch:** `feat/ui-polish` at `ebae15c` (records re-issued in the following commit)
**Decision:** approved, no outstanding item

## Human release pass

| Field | Value |
| --- | --- |
| Reviewer | Ben McCusker (@SixStringBny), project owner |
| Date | 2026-10-30 |
| Viewports | 390×844, 768×1024, 1280×800 (all twelve routes) |
| Routes | menu, how-to-play, settings, solo-setup, run-overview, battle, reward, run-result, duel-setup, privacy, round-result, match-result |
| Decision | **Approved** — no route failed a human check |

The pass covered each route at the three compositions, including the gated
journeys (reward, run result, round result, match result) reached through a real
played run and a real best-of-three duel. No concrete issue was raised against
`H-C1`, `H-C2`, `H-P1` or `H-T1` on any route.

## 375px device note — resolved

The project owner **attested the real 375px one-handed pass on 2026-10-30**: a
turn is playable with one thumb, five card names are readable without zoom, and
the battle page never scrolls. The earlier release carried this note outstanding;
it is resolved here, not carried again.

## Bar amendments recorded in this pass

- **`AB-G6`** (#28): the route-focus ring is keyboard-only; a pointer route
  change and the cold first paint still focus the destination `h1` but paint no
  ring. `App.tsx` records the input modality; the owning test moved to
  `ui-bar.spec.ts`.
- **Menu `AB-P1` exception and `AB-T1` pair** (#29): the menu fills the viewport
  instead of reserving the thumb band, with on-screen primary action, ≤48px
  masthead hand-over, no band over 15%, no vertical scroll, and each mode card at
  least 3× a document row. The `AB-T1` menu pair is the two mode cards.
- **Battle `AB-G2`** (#30): the field is never more than 40% of the board height
  (284.5px / 36.1% at 390×844); a separate source check forbids dashed or dotted
  board rules.
- **One rule set** (#31): `docs/design-system/README.md` now states the single
  uppercase-label rule (11px, 700, 0.1em), one outline per panel plus at most one
  solid divider, no dashed state outlines, the 24/32/48 panel rhythm, and the lean
  card face.

## Consistency sweep result

| Route | What changed |
| --- | --- |
| how-to-play | turn stones are numbered seals and copy joined by the brass connector, not bordered cards inside the sheet |
| settings | uppercase label style only; rows and switch unchanged |
| solo-setup | deck cards lose the offset stacked-paper frames; one sheet per deck |
| run-overview | label style and panel rhythm only |
| reward | heal/disabled offers use a solid muted border plus their existing word |
| run-result | panel padding snapped to 24/32/48; uppercase labels bold |
| duel-setup | shared deck table loses the stacked frames |
| privacy | eyebrow/label style only |
| round-result / match-result | panel padding and label style |

No composition, copy or interaction changed on those routes.

## Mechanical evidence

| Gate | Result |
| --- | --- |
| `npm run typecheck` | pass |
| `npm test` | **1345 passed / 1345**, 48 files |
| `npx playwright test` — Chromium | **328 passed**, 0 failed, 0 skipped |
| `npx playwright test` — Firefox | **322 passed**, 0 failed, 6 skipped (Chromium-only journeys) |
| `npx playwright test` — WebKit | **322 passed**, 0 failed, 6 skipped (Chromium-only journeys) |
| `node scripts/check-budget.mjs` | pass — **132,463 B gzip** of 307,200 B |
| `node scripts/check-build.mjs` | pass — subpath, CSP, 41/41 manifest assets, zero cross-origin requests |
| `node scripts/check-frozen-paths.mjs --base origin/main` | pass — 33 changed files, zero frozen roots |
| `npm run check:ui-review` | pass — 12/12 records, no pixel baseline |
| `AB-E2` sweep | 60 frames, Chromium, CI artifact `ui-screenshots` |

No test was skipped that was not already Chromium-only by design. No pixel-diff
baseline exists (`AB-E3`).

## Record maintenance

All twelve records are re-issued with this release commit and the owner's four
human checks signed on 2026-10-30. `menu.json` records the amended `AB-P1` and
`AB-T1` pair; `battle.json` records the 40% field ceiling and the density test;
the remaining ten records carry the swept route with the same check ids. The
`battle.md` and `menu.md` narratives below were updated to the shipped polish and
their `sha256` evidence updated in the records.
