# Menu route review — ticket 2, re-issued at the polish release

**Route:** `menu`
**Ticket:** [#19 Menu: the table hub](https://github.com/SixStringBny/fieldbound/issues/19), polished by [#29](https://github.com/SixStringBny/fieldbound/issues/29)
**Commit reviewed:** `ebae15c`
**Decision:** approved

## Human review

| Field | Value |
| --- | --- |
| Reviewer | Ben McCusker (@SixStringBny), project owner |
| Date | 2026-10-30 |
| Viewports | 390×844, 768×1024, 1280×800 (plus 375×667 and 1024×768 in the sweep) |
| Evidence | the `AB-E2` five-viewport frames and the local production build |
| Result | **Approved**, no issues |

## What was reviewed

The menu as a filled table: the masthead, the two mode cards as the page's
largest objects (each carrying the field roundel), the Continue bookmark only
under a validated save, and one quiet footer row for How to Play and Settings.
Fresh and saved states; the five-entry contract; the single action seal; route
`h1` focus in both input modalities; no horizontal scroll.

## Judgement calls recorded

- The composition fills the viewport rather than reserving the thumb band, so
  `AB-P1` gained a menu exception: the primary action is on screen without
  scrolling and clear of both edges, the masthead hands over within 48px, no band
  exceeds 15% of the viewport, the page does not scroll, and each mode card is at
  least 3× a document row. A docked quick-start was rejected — a second Play Solo
  control would break the five-entry and single-seal contracts.
- The mode roundel is built from tokens (brass ring, element seal, a second
  raised counter for the duel), so the menu carries the field motif with no
  manifest image, no scrim and no extra bytes. `AB-V3`'s menu assertion stays
  honest with zero `<img>`/`<svg>`.
- `AB-T1`'s menu pair is the two mode cards; `AB-T2` measures 476 each at 1024 and
  528 each at 1280 inside the centred column.
- `AB-G6` is keyboard-only after #28: pointer route changes still move focus to
  the `h1` but paint no ring.

## Deliberately deferred

None for this route. `AB-A7` and `AB-G3` pass, and the real 375px one-handed
note for `H-P1` was attested at the polish release.
