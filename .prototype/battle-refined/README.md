# Throwaway prototype — refined battle screen

Answers the wayfinder ticket **Refine the winning direction into a battle prototype**
(#6), against the direction locked in #5: C's carved arena and field centre, A's
parchment cards and hand, B's dedicated field roundel.

## Run it

Open `index.html` in a browser. It is a single self-contained file: the eight
placeholder SVGs are inlined as data URIs, so it works by double-clicking with no
server and makes no network requests.

Switch states with `?state=`, the arrow keys, or the floating prototype bar:

`?state=turn|draw|play|damage|shift|intent|detail|focus|reduced|log`

`?chrome=0` hides the prototype bar for screenshots. `?motion=reduce` forces the
reduced-motion branch. The bar's **Motion** toggle does the same; the `reduced`
state does it automatically.

Rebuild after editing `index.template.html`:

```bash
node .prototype/battle-refined/build.mjs
```

## What it shows

| State | Frame |
| --- | --- |
| `turn` | Mid-turn at 390x844 and 1280x800: Cinder Warden 16/30 with 4 defense and Weaken 1, Ember field, player 30/40, 3 energy, five cards, full intent, log strip/rail. |
| `draw` | Probe is played and Expose enters the hand; the drawn card is pinned with a DRAWN tag and the deck count drops. |
| `play` | Cinder Jab leaves the fan, floats over the field, the enemy is targeted, and energy falls to 2. |
| `damage` | The resolved hit: `−5` with the `base 3 / Ember +2 / defense ignored` breakdown, health at 11/30 and the corresponding log line. |
| `shift` | Neutral → Ember: the roundel dims behind the transition, the banner states the new matchup, and the intent shows the recomputed 3-damage Jabs. |
| `intent` | The full three-step plan with costs and the recomputed note; on phone the full list expands inline from the enemy band. |
| `detail` | The card sheet (centred at ≥1024px, bottom sheet below) with full rules, field bonus and keyboard hints. |
| `focus` | A real focus ring on Cinder Jab, the keyboard hints in the hand header, and focus return after the sheet closes. |
| `reduced` | The static equivalents: damage still, shift banner, and a strip naming the instant draw, play, damage, shift and intent outcomes. |
| `log` | The phone log drawer; on table the sticky rail is the same history. |

The seeded frame uses real content only: Ember starter cards, Cinder Warden, the
real +2/pierce field rule, Weaken, defense, the 3/3 energy turn and the 4-defense
Ash Guard. The player's log includes an earlier Expose and Inferno from the same
run. No production code, state, engines or persistence are imported.

## Composition decisions this proves

- **Table (≥1024px):** two columns — arena `minmax(0, 1fr)` and a sticky log rail
  (15rem at 1024–1279px, 18rem at 1280px+). The arena is the enemy → field → player
  axis; the hand fan spans both columns below the rail. The board is locked to
  `100svh`; the rail is the only table scroller.
- **Phone (<1024px):** 44px header with Run overview and Leave, compact enemy band,
  field roundel, scrollable 108px card rack (about 3.2 cards visible), latest log
  line, and a sticky control bar carrying health/defense, energy, End Turn and Log.
  The full intent expands inline. The player panel merges into the control bar.
- **Tablet portrait (700–1023px):** the phone composition, expanded: single column,
  both panels visible, larger cards, inline intent, drawer log, same 44px targets.
- **Hand:** table fan is ±4° with no overlapping hit boxes; every card is at least
  108×152px. Phone rack scrolls horizontally with snap.
- **Field:** a brass-ringed roundel at the centre of the etched arena, with the
  cycle reduced to the current element plus “beats Frost” on phone.
- **Art:** every placeholder sits behind `saturate(.82) brightness(.94)` and an
  inner vignette, inside a stone frame. No assets were added or changed.

## Verification

Measured with Chromium at 390x844, 375x667, 768x1024, 1024x768 and 1280x800:

- `documentElement.scrollWidth == innerWidth` and `scrollHeight == innerHeight` at
  every state and viewport; no console or page errors.
- The hand rack and the log rail/drawer are the only scrollers.
- Every visible control is at least 44px except the prototype bar itself, which is
  throwaway and hidden with `?chrome=0`.
- Secondary text contrast against the warm slate is 9.97:1, muted text 6.86:1,
  stat values 15.73:1; parchment body text 6.98–13.02:1. The focus ring is a 3px
  gold outline with a white inner edge and a dark halo, so it reads on both
  parchment and slate.
- Detail close returns focus to the invoking card; Escape closes the sheet and
  returns focus; the log drawer is a modal dialog and closes on Escape.

Screenshots used in the review comment live in `screenshots/` (390x844 and
1280x800 for every state, plus 375x667 and the two tablet widths).

## What the implementation must invent beyond the engine surface

The engine is deliberately pure and returns a new `BattleState`; it has no
animation event log. These frames therefore mix engine facts with presentation
state. The implementation must add a small **presentation derivation** (beside the
battle-log derivation, not inside the engine):

1. **Draw identity and burn feedback.** `BattleState` shows hand/deck before and
   after, but no “one card entered the hand” event. The UI must diff `instanceId`s.
   The engine burns an overdraw silently; showing a burn needs a diff or a new
   presentation event.
2. **Play identity and destination.** The log records `cardId`, not the instance
   that left the hand; the UI must diff the hand → discard move to animate the
   right copy, including two copies of the same card.
3. **Damage attribution and ordering.** The resolved state carries health, and the
   log carries one damage effect per settled transition; the UI must split or
   group them to drive one damage number per hit. The plan's `PlanStep.damage`
   covers incoming previews; overflow/overkill is not an engine event.
4. **Field before/after.** The UI must capture the previous field (or read the
   log's field effect) to draw the Neutral → Ember frame.
5. **Status before/after.** Counters are state, not events; status chips and any
   “Weaken spent” beat need a snapshot diff or the log's status effects.
6. **Intent expansion and reveal.** Open/closed, the recomputed badge and the
   inline phone expansion are UI state. The engine supplies the plan, step costs,
   totals and `lethal`.
7. **Hand scroll, fan lift, selected card, detail sheet, log drawer and focus
   return.** All UI state; the detail sheet must remember the invoking card so
   focus can return after close.
8. **Affordability styling.** The engine rejects an unaffordable card; the “dimmed
   / unplayable” rule is derived from `cost <= energy`.
9. **Motion timing and reduced-motion mapping.** The prototype's 180/160/400/300ms
   beats and the static equivalents are presentation contracts; reduced motion
   must swap outcomes without translation, scale, rotation or path animation.
10. **Announcements and the latest-line strip.** The log is a capped history and
    must stay non-live; the single-line strip and polite announcements are derived
    from the newest settled entry.
11. **Keyboard mode and focus return.** Tab order, Enter to inspect, Escape to
    close, and returning focus to the card are UI; the engine only accepts the
    explicit play/end-turn actions.

The prototype draws these as fixed frames rather than implementing the timing.
The production implementation should keep the engine untouched and derive the
frames from snapshot diffs plus the existing battle-log effects.

## Not production

No React, no tests, no persistence, no network. The prototype is evidence for a
design decision; the battle screen is rewritten properly before it ships.
