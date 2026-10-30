# Solo flow review — ticket 5

**Routes:** `solo-setup`, `run-overview`, `reward`
**Ticket:** [#22 Solo flow: setup, overview and reward](https://github.com/SixStringBny/fieldbound/issues/22)
**Commit reviewed:** `6ab998e`
**Decision:** approved

## Human review

| Field | Value |
| --- | --- |
| Reviewer | Ben McCusker (@SixStringBny), project owner |
| Date | 2026-10-30 |
| Viewports | 390×844, 768×1024, 1280×800 (plus 375×667 and 1024×768 in the attached sweep) |
| Evidence | 25 full-page frames on #22 and the local production build |
| Result | **Approved**, no issues |

## What was reviewed

- **Solo setup:** four parchment deck cards in a 2×2 at ≥768 and one column
  below; element seal, name, identity line, `10 cards · 2 Shift cards`, all ten
  printed names with the Shift names tagged in words; one `aria-pressed`
  selection, brass rim and `Selected`; the sticky Start bar with the selected
  deck and the disabled hint.
- **Run overview:** the four-step parchment ladder with brass connectors,
  `aria-current="step"` on the current stone, `N of 4`, run health, deck size,
  turns, the current/next enemy and the Next/Back + Menu actions (fixed bar on
  phone).
- **Reward:** exactly three deals, Heal 12 under 20 health, select-then-confirm
  with one dispatch, the selected summary in the sticky confirm bar, and the
  "no skip" copy.

## Judgement calls recorded

- **Ladder stone height is 152px** rather than the 180–190 in solo-flow §4.1:
  the content measures 134px and the spec height left ~50px of empty parchment
  per stone. Ticket-level geometry amendment per #13 §5; the pair widths the bar
  measures (720/320, 660/300) are exact.
- **Reward is deliberately two-step.** The first activation selects and enables
  `Take …`; the second dispatches once and advances. The two restored-reward
  journeys in `App.continue.test.tsx` were updated to select then confirm under a
  recorded allowlist amendment.
- **`AB-A1` exemptions:** deck cards and reward cards suppress
  `label-content-name-mismatch` for the same frozen-name reason as the battle
  cards; recorded in the bar.
- The shared disabled branch on `.shell__button` was added to the primitive, so a
  disabled Start/Confirm reads as disabled on both solo and duel setup.

## Deliberately deferred

The run-result reading treatment (ledgers, best-run sheet, `New Run`/`Menu`
composition) belongs to the reading-screens ticket; the shell and actions are
unchanged here.
