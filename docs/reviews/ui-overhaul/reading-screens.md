# Reading screens review — ticket 6

**Routes:** `how-to-play`, `settings`, `run-result`, `round-result`, `match-result`
**Ticket:** [#23 Reading screens](https://github.com/SixStringBny/fieldbound/issues/23)
**Commit reviewed:** `a0d6c76`
**Decision:** approved

## Human review

| Field | Value |
| --- | --- |
| Reviewer | Ben McCusker (@SixStringBny), project owner |
| Date | 2026-10-30 |
| Viewports | 390×844, 768×1024, 1280×800 (plus 375×667 and 1024×768 in the attached sweep) |
| Evidence | 33 full-page frames on #23 and the local production build |
| Result | **Approved**, no issues |

## What was reviewed

- **How to Play:** one 42rem parchment sheet on the slate with the six existing
  sections verbatim; a 224px contents rail at ≥1024 and a 44px sticky `Contents`
  disclosure below it; jump focuses the heading with no hash or history; Escape
  closes and returns focus; the field cycle is a CSS seal chain that wraps to 2×2
  at 375 with no side scroll; numbered stones, brass callout and `dt`/`dd`
  statuses; `Back to menu`.
- **Settings:** one parchment sheet, two 72×44 switches with the exact copy and
  hints, one `Back`, no third motion state; the storage notice is a static note,
  so the app keeps one live region.
- **Run result:** the verdict block on slate above parchment ledgers — totals
  2×2 on phone / 4-across at ≥768, best-run ledger only when a record exists,
  `New best` as a wax capsule, save-failure note inside the sheet.
- **Round and match results:** verdict plaques with the score line, three-pip
  series strip, the round result's next-opener line, and the documented actions.

## Judgement calls recorded

- Settings uses the shared masthead (its existing intro as the tagline) and one
  centred 672px column at ≥1024.
- `New best` is a 28px wax capsule rather than a 28px circle, because "New best"
  at the 11px floor cannot fit a circle.
- The results announce only the settled-transition lines from `App`; the reading
  surfaces add none.

## Deliberately deferred

None — this ticket completes the reading side of the overhaul. Duel setup/board
(#24) and release verification (#25) remain.
