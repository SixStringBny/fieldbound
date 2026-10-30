# Battle screen — build-ready spec

**Status:** decision for wayfinder #8. Builds on #5 (composition), #6 (prototype) and
#7 (design system). Not implemented yet; #15 executes it.
**Tokens:** [`tokens.css`](./tokens.css) · **Prototype:** [battle-refined](https://github.com/SixStringBny/fieldbound/tree/prototype/battle-refined/.prototype/battle-refined).

This spec fixes the battle screen at 375×667, 390×844, 768×1024, 1024×768 and
1280×800. It supersedes the battle-board geometry in `docs/features/game-shell.md`
§4.2 when #15 lands; the rules, controller, persistence, content and asset
contracts do not change.

---

## 1. Layout model

The screen is exactly `100svh` on battle. It never scrolls the page. The only
scrollers are:

1. the hand rack, horizontally;
2. the log rail at ≥1024px and the log drawer below 1024px, vertically;
3. the intent list if it exceeds its band (engine-capped, see §3.2);
4. the card-detail sheet content;
5. document screens (How to Play, Settings), which are not battle.

```
battle-screen
├─ battle-header                       pinned, 44px + rule
└─ battle-board (region: Battle)       fills the rest
   ├─ battle-arena                     enemy → field → player
   ├─ battle-log                       table: right rail; phone: footer block
   ├─ battle-hand                      table: spans both columns; phone: auto
   └─ battle-footer                    phone only: log + energy + End Turn
```

At ≥1024px the board is a two-column grid: arena in column 1, log rail in column
2, hand spanning both below. At <1024px it is a single column; the player panel
merges into the footer, the log becomes a drawer, and the hand becomes a rack.

### 1.1 Reference geometry

Exact target boxes; the field absorbs slack, and each row may flex by ±8px
without changing the scroll contract. Values are CSS pixels at the named
viewport.

| Viewport | Header | Table | Arena | Enemy | Field | Player | Hand | Rail | Footer |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 375×667 | 52 | 537 | 348 | 174 | 165 | in footer | 158 | — | 75 |
| 390×844 | 52 | 709 | 493 | 200 | 285 | in footer | 192 | — | 75 |
| 768×1024 | 55 | 884 | 650 | 195 | 358 | 80 | 214 | — | 73 |
| 1024×768 | 55 | 689 | 461 | 160 | 211 | 70 | 204 | 240 | — |
| 1280×800 | 55 | 721 | 469 | 160 | 219 | 70 | 228 | 288 | — |

`Table` is the flex/grid region between the header and the phone footer; it
includes its top padding and the gap before the hand. `Arena` is enemy + field +
player plus two 10px gaps (8px on phone). The totals close exactly:

- 375: 6 top + 52 + 537 + 72 footer = 667.
- 390: 8 top + 52 + 709 + 75 footer = 844.
- 768: 12 top + 55 + 884 + 73 footer = 1024.
- 1024: 12 top + 55 + 689 + 12 bottom = 768.
- 1280: 12 top + 55 + 721 + 12 bottom = 800.

At 1024/1280 the rail is the full content-row height and stops at the hand line.
At 375/390 the board uses 6/8px gaps; at 768+ 10–12px. Reference boxes may flex
by ±8px; the field absorbs the residual.

On phone the field is capped: it stops at 300px and is never more than 40% of
the board height (at 390×844 it measures 285px, 36%). The arena splits its
spare height 2:1 between the field and the enemy panel, so the intent takes the
room the field gives back instead of leaving a dead band beneath a small
roundel; taller phones also give the hand the 168px card. The enemy band is
therefore 165–208px on phone.

### 1.2 Grid/CSS contract

```css
.battle-screen {
  display: flex;
  flex-direction: column;
  height: 100svh;
  padding: 12px var(--fb-gutter) 0;
  overflow: hidden;
  background: var(--fb-surface-board);
}

.battle-header {
  min-height: var(--fb-target);
  padding-bottom: 10px;
  border-bottom: var(--fb-rule);
}

.battle-board {
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--fb-rail-width);
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 12px;
  flex: 1;
  min-height: 0;
  padding-top: 12px;
}

.battle-arena {
  grid-column: 1;
  grid-row: 1;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 10px;
  min-height: 0;
}

.battle-log { grid-column: 2; grid-row: 1; min-height: 0; overflow: hidden; }
.battle-hand { grid-column: 1 / -1; grid-row: 2; }
```

At 1024–1279px use `--fb-rail-width-compact` (240px) and the compact card width
(118px). At <1024px switch the board to flex column:

```css
.battle-board { display: flex; flex-direction: column; gap: 8px; padding-top: 8px; }
.battle-arena { flex: 1; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
.battle-field { flex: 2 1 auto; min-height: 150px; max-height: 300px; }
.battle-arena > .enemy-panel { flex: 1 1 auto; }
```

`--fb-gutter` is `clamp(10px, 2vw, 22px)`; the board never exceeds
`--fb-board-max` (1080px) and is centred on wider screens. The top padding is
6px at 375, 8px at 390 and 12px at 768+; the bottom padding is 12px at
1024/1280 and 0 where the footer owns the safe area.

At 1280 the content cap leaves 1080px for the board: 288px rail + 12px gap +
736px arena + the board gutters. The table background may bleed to the viewport,
but the interactive panels, hand and rail stay inside 1080px. At 1024 the board
is 984px wide (1024 − 2×20 gutter): 240px rail + 12px gap + 732px arena.

### 1.3 Single-instance rule

Render the player summary, End Turn, latest log line, Log toggle and log history
**once**. Place them with grid areas/`order` at each width; do not duplicate a
control for phone and table. Duplicated controls would add tab stops, duplicate
IDs/name targets and break the role/name contract in §7. The log region is one
element whether it is the table rail or the phone footer block.

---

## 2. Zones

### 2.1 Header

- 44px minimum. Left: `FIELDBOUND` wordmark/mark and `Turn N · Your move`.
- Right: `Run overview` (solo only) and `Leave`; both 44px targets.
- On phone, both actions remain visible; no overflow menu. The wordmark may
  shorten to the mark plus “Fieldbound”.
- Outcome copy replaces the turn label: `Victory`, `Defeat`, `Battle over`.
- The header is pinned; it never scrolls.

### 2.2 Enemy panel

- Table: 160px band; 100×108 portrait, name, element chip, statuses, HP/DEF
  meters, intent column on the right (or below at 1024–1279px).
- Phone: 165–208px band; 62–68px portrait, name/chips, compact HP/DEF, statuses,
  intent summary; `Show all N steps` (44px) when the plan has more than one step.
  The band grows with the room the capped field gives back, so the intent is not
  the cramped zone.
- Intent: step rows (dot, name, effect, cost), total line, lethal badge, note
  that the preview is recomputed from live field/defense. Table shows the full
  plan; phone collapses to three steps + expand, and expands inline.
- Intent maximum height: 96px phone, 120px table; `overflow-y: auto` inside the
  intent region. Engine plan steps are bounded by energy (≤4 at 3 energy); if a
  future card grants energy, the list scrolls, never clips.
- Statuses: engine caps are 3/3/2, so at most three chips; they wrap. If a
  future status set exceeds one line, the chips wrap within the band and the
  intent region takes the remaining height.
- No plan (`null`): “No plan yet.”; empty plan: “No cards planned.”
- Lethal: visible `Lethal` badge and danger left rule; no flashing, no modal.
- The plan is public in solo. In duel this panel is the opponent’s redacted
  panel (hand count only), not an intent preview.

### 2.3 Field banner

- Table: 108px roundel, field name, “X is empowered; Y is countered; Z beats X”,
  full five-element cycle with `aria-current="step"`.
- Phone: 68px roundel at 375×667 and 96px at taller phones, the manifest field
  art behind the shared scrim, field name, matchup sentence, current element +
  “beats X” only; the full cycle is in How to Play. The cycle is not interactive.
  There is no second name tag or inset ring inside the roundel.
- Neutral copy: “Neutral field. No element is empowered; no card is countered.”
- The field is the physical centre and the zone that absorbs slack, up to its
  cap. Its minimum is 150px phone, 180px tablet, 190px table; on phone it is
  capped at 300px and at 40% of the board height, and the enemy intent takes the
  remainder.
- Field changes are palette + text; never colour-only.

### 2.4 Player panel / footer

- Table/tablet: full panel with name, element, HP/DEF meters, statuses, energy
  number + pips, and the End Turn button. 70px table, 80px tablet.
- Phone: merged into the footer. Keep a `region` named **You** (for the existing
  region/meter tests) containing compact HP/DEF meters and the energy text; the
  End Turn button is beside it. Do not remove the region from the DOM.
- Energy shows the number and pips; pips may be aria-hidden. The number is the
  accessible value.
- End Turn: 46–48px, primary ember fill, disabled when not the player’s turn or
  the battle is over. It is the last control in the footer.

### 2.5 Hand

- Table: fixed 138×194 cards, ±4° arc, 10px gaps, full non-overlapping hit
  boxes. Five cards fit at 1280; at 1024–1279 use 118×168.
- Phone: fixed 108×152 cards, 8px gaps, horizontal snap rack, ~3.2 visible; the
  fourth/fifth are reachable by swipe and Tab. Cards must not flex-shrink. At
  `max-height: 700px`, use 108×136.
- Hand head: `Your hand`, count, `Scroll sideways` on phone; deck/discard counts
  on table. The next card may peek at the edge.
- Empty hand: keep the zone height; show “Your hand is empty.”; End Turn remains.
- Card order is the engine hand order; no sorting by the UI.

### 2.6 Log

- Table rail: 288px at 1280, 240px at 1024–1279; head, latest strip, scrollable
  history. No toggle. Only the history scrolls; the rail stops at the hand line.
- The log is the quietest surface: a muted header with no fill, the latest line
  as ordinary 12px text with no bright strip or brass edge, 12px history and an
  11px turn/meta label. Its one divider is solid.
- Phone: the log region sits in the footer above the control bar. It contains
  the latest one-line strip, the ghosted `Log` toggle, and the hidden history
  drawer. Latest line is 12px, one line, ellipsis. The Log toggle keeps its
  44px target without a pill outline. Tab order: cards → Log → End Turn.
- Drawer: 82svh max, own vertical scroll, newest entry scrolled into view,
  Escape closes and returns focus to the toggle. Not a modal; no focus trap;
  history entries are not interactive.
- The log is never `aria-live`; the single polite announcement is the only
  spoken summary. The latest strip is `role="group"` labelled “Latest battle log
  entry”.
- Log cap and dialogue determinism are untouched (80 entries, public-only duel).

### 2.7 Card detail

- Table: centred 460px, 12px radius, 24px padding, max 94svh; backdrop `rgba(7 5
  4 / 78%)`.
- Phone: bottom sheet, top corners 16px, max 88svh, internal scroll, safe-area
  bottom padding.
- Order: eyebrow (element · cost · type), name, value, art (126×176 table /
  96×134 phone), full effect, field-bonus note, badges, Play (`cost`), close.
- Dismissal: backdrop, close button, Escape. Focus returns to the invoking card;
  if the card was played/removed, focus the next card, then End Turn.
- Play: closes the sheet, dispatches the card intent; disabled with a reason
  when unaffordable/not player turn.
- The sheet is the only source of full rules text; the phone face may omit it.

---

## 3. Height and overflow budgets

### 3.1 Minimums

The reference boxes in §1.1 close exactly. These are the floors each zone may
shrink to before the degradation order starts; the field always receives the
residual up to its reference height.

| Zone | 375×667 | 390×844 | 768×1024 | 1024×768 | 1280×800 |
| --- | --- | --- | --- | --- | --- |
| Header | 44 | 44 | 44 | 44 | 44 |
| Enemy | 160 | 180 | 190 | 160 | 160 |
| Field | 150 | 150 | 180 | 190 | 190 |
| Player | in footer | in footer | 70 | 70 | 70 |
| Hand | 158 | 174 | 204 | 204 | 228 |
| Footer | 64 | 68 | 64 | — | — |

The field grows from its floor to the §1.1 reference. The board never clips a
zone; when the floors no longer fit, §3.2 applies.

### 3.2 Degradation order

1. Field shrinks from its reference height down to its minimum (phone 150, tablet
   180, table 190). It is the only zone that absorbs slack.
2. Intent list scrolls inside its band (max 96/120px). Plan steps remain
   readable; the total and lethal badge stay pinned above the list.
3. Status chips wrap; engine caps make this at most one extra line.
4. Hand card height drops to the compact 136px at `max-height: 700px`; the rack
   still scrolls horizontally.
5. Log history scrolls; latest strip stays one reserved line.
6. Card detail and log drawer scroll internally.
7. Below a 600px viewport height, allow **vertical page scroll** as a last
   resort rather than clipping. Never allow horizontal page scroll.

No zone may clip text, numbers or controls. A hidden/ellipsized line is
acceptable only for the latest log strip (full text in the log history) and
truncated card names (full name in the detail sheet).

---

## 4. Card face hierarchy

| Slot | Table 138×194 | Phone 108×152 | Content |
| --- | --- | --- | --- |
| Cost seal | 27px, top-left | 21px | energy cost, wax fill |
| Art | 66px, 6/5 crop | 48px | manifest SVG, scrim + vignette |
| Name | 13px display, 2 lines | 11px, 2 lines | card name |
| Value | 20px | 16px | damage/defense/draw/shift + label |
| Badge | 11px | 11px | at most one: Pierce or the field bonus |
| State | “Unaffordable” label | same | unaffordable only |

The face is cost, name, value and at most one badge. Element and type, the
printed effect summary and any further badges live in the detail sheet. The
accessible name still carries `cost, name, element type, primary, badges,
unaffordable` (the existing `cardAccessibleName`), so the face is meaningful
without colour. Unaffordable cards are `aria-disabled="true"`, remain
focusable/inspectable, do not lift on hover, and are rejected by the controller.
The table fan does not overlap hit boxes; phone cards are fixed-width and never
shrink.

---

## 5. Keyboard, focus and announcements

### 5.1 Tab order

Table: skip link → Run overview → Leave → hand cards (left to right) → End Turn.
Table log has no toggle; its history is not focusable.

Phone: skip link → Run overview → Leave → intent expand (if present) → hand
cards → **Log** → **End Turn** (Log sits before End Turn in the footer so history
is reachable without passing the primary action; verify with the a11y test).

Detail sheet: focus moves to close, then Play (or Play then close) within a
trapped dialog; Escape/close returns focus to the invoking card, else the next
card, else End Turn. No positive `tabindex`.

### 5.2 Focus ring

Use the design system recipe: 2px gold outline + 2px offset + light/dark halo.
Visible on parchment cards and slate panels. Never `outline: none` without a
replacement. Focus return is explicit, not browser-default.

### 5.3 Announcements

One polite `role="status"` for settled transitions: turn change, damage/heal
totals, defense/status changes, field shift, refusal and outcome. It announces
once per sequence, never on re-render. The log stays non-live; preview
recomputes, hover, intent expansion and focus changes are not announced. Lethal
is visible in the intent and announced only when the settled transition carries
it.

### 5.4 Privacy boundary

Duel privacy is a **separate screen**, not an overlay: the battle screen is
unmounted before `PrivacyScreen` mounts. While privacy is visible, the DOM must
contain no battle board, hand, health, field, intent, log region/strip/history,
card names or hand count. Focus is trapped on “I’m ready”; Escape is a no-op; no
auto-dismiss. After the explicit dismissal, the active-turn board mounts with
only the viewer’s hand and public log entries. No opponent card id, name or hand
count may appear in `data-*`, `aria-*`, CSS or the log.

---

## 6. State matrix

| State | Trigger | Presentation | Interaction |
| --- | --- | --- | --- |
| Loading | none in v1 (local/synchronous) | No spinner. Art boxes reserve manifest aspect ratios and decode async; fallback after error. If a future async resume exists, `aria-busy="true"` on the board and a polite “Loading battle” after 1s. | Controls disabled until ready. |
| Empty hand | all cards played/discarded | “Your hand is empty.” in the fixed rack; hand count 0. | End Turn still enabled; log/detail unaffected. |
| Empty log | fresh battle before first entry | Region/strip visible with reserved height; “The battle log is empty.” in history. | Log toggle works; no live announcement. |
| No plan | enemy turn/ended before a plan exists | “No plan yet.”; no step list. | Intent region keeps its height. |
| Disabled | not player turn, battle over | End Turn disabled; card play rejected; visible reason/outcome. | Cards remain inspectable; no hover lift. |
| Unaffordable | cost > energy | Paper-deep face, “Unaffordable” text; `aria-disabled`; detail opens. | Play disabled with reason; controller rejects. |
| Lethal | `plan.lethal` | Danger `Lethal` badge + player danger rule; no flashing. | Player can still play/end; outcome announced when it settles. |
| Battle end | outcome ≠ ongoing | Header/board outcome `Victory`/`Defeat`/`Battle over`; status announced once; End Turn disabled; cards not playable but inspectable; log remains. | Result screen is a separate route; no modal on the battle screen. |

---

## 7. DOM, roles and test contract

### 7.1 Must stay stable

These are the existing tests' contract; #15 must preserve them (class names are
not a contract except where noted, but these roles/names/attributes are):

| Contract | Selector today | Keep |
| --- | --- | --- |
| Router surface | `#main-content[data-screen="battle"]`, `role=main` | yes |
| Battle screen/board | `[data-battle-screen="true"]`, `[data-battle-board="true"]`, region **Battle** | yes |
| Enemy region | region **Cinder Warden** / enemy name | yes |
| Field region | region **Ember field**, **Neutral field**; `data-field` | yes |
| Player region | region **You**; meters **Your health**, **Your defense** | yes (phone compact too) |
| Hand region | region **Your hand**; `.hand .card-view`, `data-instance-id`, `data-card-id`, `data-affordable` | yes |
| Turn controls | group **Turn controls**; `.battle-controls__end` name **End Turn**; `.battle-controls__energy` | yes |
| Card detail | `[data-card-detail-layer="true"]`, dialog name = card name, buttons **Play card**, **Close card detail** | yes |
| Log region | region **Battle log**, `[data-battle-log="true"]`, `[data-battle-log-latest]`, `[data-battle-log-entry]`, list **Battle log entries**, toggle **Log** with `aria-expanded`/`aria-controls` | yes |
| Log not live | no `aria-live` inside the log; one `role=status` live region | yes |
| Skip link | link **Skip to main content**; `main` tabindex -1 | yes |
| Announcement | one `role=status` | yes |
| Duel | `[data-duel-battle]`, `[data-viewer]`, `[data-duel-privacy]`, dialog **Pass to …**, button **I’m ready**, `[data-hand-count]` | yes |
| Board max | `.battle-board` ≤1080px and centred at ≥1080px | yes |
| CSS contract | `.shell[data-screen='battle']` max-width var; `.hand__row` overflow-x/snap; card/End Turn/close min 44px; reduced-motion selectors | update selectors, keep assertions |

### 7.2 Tests that change

- `src/ui/components/BattleBoard.test.tsx`: section order now includes the log
  region; the board is the full-width grid; update the section/role assertions
  and the stylesheet-contract regexes (`.battle-board`, `.battle-arena`,
  `.battle-hand`, `100svh`, fixed card width, no page scroll, reduced-motion).
- `src/App.a11y.test.tsx`: tab order becomes cards → Log → End Turn on phone;
  update the traversal. Keep the focus-return, skip link, dialog trap, 44px and
  live-region assertions.
- `src/App.battle-log.test.tsx`: latest strip/toggle now live in the footer at
  375px; the region remains visible; history drawer still non-live; Escape
  returns to the toggle. No log assertions change semantically.
- `tests/e2e/responsive-a11y.spec.ts`: add 390×844 and 1024×768; assert no
  **vertical** document scroll on battle at all five sizes; assert the zone
  budgets and fixed card widths; assert the fifth card is reachable at 375; keep
  the 44px, focus, reduced-motion and 1080px board checks.
- `tests/e2e/battle-log.spec.ts`: at 375 the strip sits above the control bar and
  End Turn remains reachable; at 1280 the rail is the right column and the hand
  spans beneath; keep the non-live/public-only/durability checks.
- New Playwright checks: five-viewport geometry/no-clip; state matrix
  (empty/unaffordable/lethal/end); privacy unmount; detail focus return; intent
  internal scroll with a long plan; log drawer scroll.

### 7.3 Tests that must not change semantically

Engine, controller, persistence, content, asset-manifest, battle-log text,
privacy/public-only, 80-entry cap and dialogue determinism tests stay as they
are. The overhaul is presentation only.

---

## 8. Acceptance criteria

1. At 375×667, 390×844, 768×1024, 1024×768 and 1280×800 the battle document has
   no vertical or horizontal page scroll; only the rack/log/drawer/detail scroll.
2. All five cards are reachable and playable by keyboard; the fifth card is fully
   revealed by the rack scroll at 375px.
3. Every interactive target is ≥44×44; the focus ring is visible on card and
   slate; detail close returns focus to the invoking card (or the documented
   survivor).
4. Table: arena + rail + hand spans; 1280 rail 288px, 1024 rail 240px; the rail
   stops at the hand line; the interactive board content is ≤1080px and centred.
5. Phone: latest log line above the control bar; intent expands inline; player
   stats remain a **You** region in the footer.
6. Empty/unaffordable/lethal/battle-end states match §6 without clipping or
   colour-only cues.
7. Duel privacy unmounts the battle and exposes no battle/log/opponent data; the
   active turn exposes only the viewer’s hand and public entries.
8. The existing role/name/`data-*` contract in §7.1 holds; only the listed tests
   change.
9. Reduced motion stills motion for OS and explicit settings; the log stays
   non-live; the single polite announcement still fires once per settled
   transition.

---

## 9. Resolved decisions

- The board is the full-width region; the log is inside it. At ≥1024 the rail is
  column 2 and the hand spans below; at <1024 the log is the footer block and
  the drawer.
- `100svh` and no page scroll at the five targets. The field absorbs slack; the
  degradation order is field → intent → statuses → compact cards → internal
  scroll → (only below 600px height) vertical page scroll.
- Phone footer order is latest line, then **Log**, then **End Turn**; the tab
  order is cards → Log → End Turn. This is the deliberate test change.
- Table card 138×194, compact 118×168, phone 108×152 (136 height under 700px),
  fixed widths; the prototype's 86px shrink is a bug, not the spec.
- The log stays non-live; the single polite announcement remains the only live
  summary. The detail and privacy dialogs trap focus; the log drawer does not.
- The battle screen never mounts during duel privacy; the privacy screen is a
  separate route, not a cover.
