# Battle route review — ticket 3

**Route:** `battle` (solo and duel share the shell; duel-specific states land with ticket 7)
**Ticket:** [#20 Battle screen: phone and game table](https://github.com/SixStringBny/fieldbound/issues/20)
**Commit reviewed:** `1fa094d`
**Decision:** approved for the structural merge

## Human review

| Field | Value |
| --- | --- |
| Reviewer | Ben McCusker (@SixStringBny), project owner |
| Date | 2026-10-30 |
| Viewports | 390×844, 768×1024, 1280×800 (plus 375×667 and 1024×768 in the attached sweep) |
| Evidence | 20 full-page frames on #20, the corrected 390 intent frame, and the local production build |
| Result | **Approved**, no issues |

## What was reviewed

The `100svh` battle screen on the foundation tokens: the pinned 44px header; enemy
panel with public intent (collapsed three-step preview on phone, inline expansion);
the field roundel absorbing slack; the **You** band and End Turn; the hand fan at
the table and the 108px rack on phone; the log rail at ≥1024 and the latest line +
Log drawer below it; the card detail sheet; and the empty, no-plan, unaffordable,
lethal and end states.

## Judgement calls recorded

- Single `battle-board` grid; below 1024 `display: contents` places the latest
  strip, Log and End Turn once per width (single-instance rule).
- The collapsed phone intent keeps the first three steps as compact chips, as the
  prototype and README §8.7 show; the full list stays behind `Show all N steps`.
- Unaffordable cards open the detail sheet for inspection; only Play is disabled.
  This required a ticket-3 allowlist amendment to `CardView.test.tsx`.
- `AB-A1` keeps one recorded exemption: `label-content-name-mismatch` on hand
  cards, because the frozen `cardAccessibleName` is not a contiguous match for
  the visible shift/draw text. Written into the acceptance bar.

## Feedback column (re-issued with ticket 4)

`AB-F1`–`F5` are green via `tests/e2e/feedback.spec.ts`: one beat per settled
transition, the net signed impact number (inside the panel, clamped, no layout
change, aria-hidden), handoff/intent-reveal/draw gating, the two-channel floor,
and the CSS-only newest-wins allowlist. The number anchors over the enemy
portrait and the player meter's middle rather than the spec's HP-meter trailing
edge; the owner accepted that placement at the motion gate because the 375 player
band cannot seat it without covering the value.

## Deliberately deferred

- The duel board, series strip and privacy states land with ticket 7.
- A battle-end screenshot is not reachable (a settled solo battle goes to reward,
  a duel round to its result); the end state is unit-covered and announced.
