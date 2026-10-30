# Menu route review — ticket 2

**Route:** `menu`
**Ticket:** [#19 Menu: the table hub](https://github.com/SixStringBny/fieldbound/issues/19)
**Commit reviewed:** `23e9d89`
**Decision:** approved

## Human review

| Field | Value |
| --- | --- |
| Reviewer | Ben McCusker (@SixStringBny), project owner |
| Date | 2026-10-30 |
| Viewports | 390×844, 768×1024, 1280×800 (plus 375×667 and 1024×768 in the attached sweep) |
| Evidence | 12 full-page frames on #19 (no-save and valid-save states) and the local production build |
| Result | **Approved**, no issues |

## What was reviewed

The table-hub menu on the foundation shell: hero wordmark, tagline and run plaque;
Play Solo and Local Duel as parchment mode cards with wax/brass seals; the
Continue Run bookmark only under a validated save, with the exact encounter and
deck lines; How to Play and Settings as quiet brass rows. Two columns at ≥1024,
one below; no horizontal scroll; route `h1` focus; one live region; the no-save,
valid-save and corrupt-save states.

## Judgement calls recorded

- The hub uses the spec's explicit 512px (1280) and 440px (1024) columns rather
  than the nominal 1.05fr/0.95fr ratio, which measured 490 at 1280. `AB-T1` and
  `AB-T2` measure the explicit widths.
- The hero run plaque and the Continue bookmark are one object: the bookmark is
  the validated-save plaque, so the exact hint appears once and the hero shows
  `No run in progress` only without a save.
- The deck line is derived from the restored run (`Ember deck · 10 cards` at a
  fresh run); the spec's `11 cards` is the post-reward example.
- At 375/390 the hero reserves the thumb envelope so Play Solo sits wholly in
  the lowest 288px (`AB-P1`), leaving a tall hero field on the smallest screens.
  The owner accepted this composition.
- The legacy `justify-content: center` shell rule is opted out for the menu at
  ≥640px so it starts at the spec's page padding; other routes are untouched.

## Deliberately deferred

None for this route. `AB-A7` (forced-colors / prefers-contrast) and `AB-G3`
(clipping) were added to the menu scope and pass. The CI artefact naming for
`AB-E2` lands with release verification; the per-viewport frames are attached to
the ticket as the route evidence.
