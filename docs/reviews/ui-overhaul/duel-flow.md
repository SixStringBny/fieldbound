# Duel flow review — ticket 7

**Routes:** `duel-setup`, `privacy`, `round-result`, `match-result`; the duel board shares the `battle` route and its record
**Ticket:** [#24 Duel flow: setup, privacy and board](https://github.com/SixStringBny/fieldbound/issues/24)
**Commit reviewed:** `62bbb1c`
**Decision:** approved

## Human review

| Field | Value |
| --- | --- |
| Reviewer | Ben McCusker (@SixStringBny), project owner |
| Date | 2026-10-30 |
| Viewports | 390×844, 768×1024, 1280×800 (plus 375×667 and 1024×768 in the attached sweep) |
| Evidence | 35 full-page frames on #24 and the local production build |
| Result | **Approved**, no issues |

## What was reviewed

- **Setup:** the shared deck table with the look-away banner, the step-2 sealed
  card-back marker with no name or element, the locked summary with both decks and
  `Start Match`, the sticky bar and the step-`h2` focus/announcement.
- **Privacy:** a fixed, fully opaque slate surface with one parchment plaque, the
  incoming player, the look-away line, the public score and one `I'm ready`; the
  board is unmounted, not covered; focus traps; Escape is a no-op.
- **Duel board:** the `100svh` shell, opponent band with the CSS card-back fan and
  `N cards in hand`, the field, the self band and End Turn, own hand, public log
  rail/strip/drawer, and the `Round N · Series x–y` header with the three-pip strip.
- **Results:** round verdict with the score, strip and next opener; match verdict
  with the final score and Rematch / Change decks / Menu. No hand, health, field,
  log or card name survives.

## Judgement calls recorded

- `deckName` and `roundWinners` are added by a pure presentation projection in
  `src/ui/screens/duel-view.ts`, because `src/duel/round*.ts` is frozen; the same
  public facts, no controller edit.
- The sealed marker and the opponent fan share the `[data-duel-card-back]` object;
  neither carries a name, element, colour or naming `data-*`.
- The recorded `label-content-name-mismatch` axe exemption stays for the shared
  deck card on `duel-setup`; privacy runs with no exemption, and the board keeps
  only the battle hand-card entry.
- Below 390px the header mark is dropped so the eyebrow, pips and `Leave duel`
  fit the 52px header.
- The self band and End Turn share the table row instead of nesting the control in
  the region.

## Deliberately deferred

None. Release verification (#25) remains for the map.
