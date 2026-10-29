# Duel flow and privacy handover — build-ready spec

**Status:** decision for wayfinder [Specify the duel flow and privacy handover](https://github.com/SixStringBny/fieldbound/issues/10). Builds on #5 (composition), #6 (prototype), #7 (tokens), #8 (battle screen) and #9 (menu, solo setup, reward). Not implemented yet; #15 executes it.
**Tokens:** [`tokens.css`](./tokens.css) · **Battle spec:** [`battle-screen.md`](./battle-screen.md) · **Solo spec:** [`solo-flow.md`](./solo-flow.md) · **Prototype:** [#6](https://github.com/SixStringBny/fieldbound/tree/prototype/battle-refined/.prototype/battle-refined).

The local duel inherits two locked contracts: the `100svh` battle shell from #8 for the active
turn, and the physical deck table from #9 for choosing decks. Its one new surface is the
**privacy handoff**, which is not an overlay over the board but a separate route that unmounts it.
The duel adds no rules, no AI, no intent preview and no persistence.

Everything below is presentation and interaction. `src/duel/match.ts` and `src/duel/round.ts`
keep their transitions, seeds, score and public-only log. The only controller-adjacent change is
a redacted-view projection that adds the locked deck name and the public round-winner history.

---

## 1. Flow and routes

```
Local Duel
  └─ duel-setup
       ├─ step 1: Player 1 chooses behind "Player 2, look away."
       ├─ step 2: Player 2 chooses; Player 1's pick is a sealed marker
       └─ summary: both decks locked → Start Match
            └─ privacy ──I'm ready──▶ battle
                 ▲                    │
                 │                    ├─ Play card / End Turn
                 │                    ├─ settled → round-result
                 └── next round ──────┘
                                      └─ settled match → match-result
                                           ├─ Rematch      → privacy (round 1, 0–0)
                                           ├─ Change decks → duel-setup (fresh)
                                           └─ Menu         → menu (duel discarded)
```

- Routes: `duel-setup`, `privacy`, `battle`, `round-result`, `match-result`. The main shell keeps
  `data-screen` set to one of these.
- Best of three; first player alternates Player 1, Player 2, Player 1; the round seed and match
  seed stay controller-owned.
- A duel is ephemeral. Reload, `Menu`, `Leave duel` and `Change decks` discard it; no storage key
  is written. There is no resume and no Continue Run entry.
- `Rematch` keeps both locked decks and returns to 0–0 with a new match seed. `Change decks`
  returns to step 1 with no selection, no score and no seed carried over.
- Two players may lock the same deck. The deck is public from the summary onward.

---

## 2. Setup — the physical deck table

### 2.1 Composition

The setup is a **scrollable table surface**: the page may scroll vertically, never horizontally.
The route h1 stays `Local Duel`; the step question is an h2. The four frozen starter decks are
always rendered in catalog order (Ember, Frost, Gale, Stone).

Each step uses the solo setup deck card:

- element seal + deck name in the display face (20–24px);
- identity line (for example `Ember: aggressive, piercing`);
- `10 cards · 2 Shift cards`;
- the ten printed card names in a two-column list at 12px, with the two Shift names carrying a
  brass `Shift` tag (not colour alone);
- the contents block has an id and the button's `aria-describedby` points at it, so the full deck
  is available to assistive technology without inflating the button name;
- selected state: wax seal + `Selected` text + 2px brass rim; the whole card is the target.

The step header carries the callout as a full-width banner:

- Step 1: `Step 1 of 2`, h2 `Player 1, choose your deck`, banner `Player 2, look away.`, then the
  explanatory copy.
- Step 2: `Step 2 of 2`, h2 `Player 2, choose your deck`, banner `Player 1 has chosen.`, then the
  copy. Above the grid sits the **sealed pick marker**: one neutral card back (56×78) and the
  text `Player 1's deck is locked`, plus `No name is shown until both decks are locked.` The
  marker carries no deck name, element, element colour, `aria-label` or `data-*` that names the
  choice.
- Summary: h2 `Both decks are locked`, the copy `These choices stay fixed for the whole match,
  including a rematch.`, two compact locked-deck cards, the exact lines `Player 1: Ember` and
  `Player 2: Frost`, and `Start Match`.

The action bar is sticky at the bottom at every width:

- Step 1/2: primary `Confirm Player 1 deck` / `Confirm Player 2 deck` (48px), quiet
  `Back to menu` (44px). On phone the primary is full-width and the back text sits beneath it;
  on table they sit side by side.
- Summary: primary `Start Match` (48px), quiet `Back to menu` (44px), same arrangement.
- The bar has safe-area bottom padding and the page reserves its height so the last deck card is
  never covered.

| Viewport | Page padding | Deck grid | Deck card | Action bar | Bottom reserve |
| --- | --- | --- | --- | --- | --- |
| 1280×800 | 32px 24px | 2×2, 20px gap | 512×260 | 80px | 112px |
| 1024×768 | 24px 20px | 2×2, 16px gap | 460×250 | 80px | 112px |
| 768×1024 | 20px 16px | 2×2, 14px gap | 340×280 | 80px | 112px |
| 390×844 | 16px 12px | 1 col, 12px gap | 343×280 | 112px | 144px |
| 375×667 | 12px 10px | 1 col, 10px gap | 351×280 | 112px | 144px |

The sealed pick marker is 88px tall at table and 96px at phone, spanning the same width as the
grid. The summary's locked-deck cards are two columns at ≥768 and one column below: 500×200 at
1280, 460×190 at 1024, 340×200 at 768, 343×160 at 390 and 351×160 at 375. They are not buttons.

### 2.2 Selection and states

| State | Presentation | Interaction |
| --- | --- | --- |
| No selection | All four cards unpressed; confirm disabled with the hint `Select one of the four decks to enable Confirm.` | Confirm leaves the tab order; the hint explains why. |
| Selected | One card `aria-pressed="true"`, wax seal, brass rim; confirm enabled | Click, Enter or Space selects; one selection per step. |
| Step 2 | Empty selection; Player 1's pick is only the sealed marker | All four cards are unselected; no name or element of Player 1's deck is in the text, aria-label or data. |
| Summary | Both decks named and counted | `Start Match` dispatches once; no second match can start from a double activation. |
| Missing deck | A labelled unavailable card; Start stays disabled | The frozen catalog makes this unreachable. |
| Partial choice + Back | The screen unmounts and the choice is discarded | Returning to setup starts at step 1 with nothing selected. |

Selection is a single deliberate step per player; there is no auto-advance. Confirming Player 1
moves to step 2; confirming Player 2 moves to the summary. `Back to menu` is available at every
step and discards the partial choice. No hover-only cue; all targets are ≥44px.

### 2.3 Focus and announcements

- On route mount, focus the `Local Duel` h1. Each step change focuses the new step h2, not the
  confirm button, so the question is announced without moving focus past it.
- The summary focuses its h2. Re-renders and `aria-pressed` changes never move focus.
- One polite line per deliberate change:
  - selection: `Ember deck selected. Confirm Player 1 deck is enabled.` (or Player 2);
  - step 2: `Player 2, choose your deck.`;
  - summary: `Both decks are locked. Start Match is ready.`
- No second live region; the app-wide `role="status"` remains the only one.

---

## 3. Privacy handoff

### 3.1 Composition

The privacy screen is a fixed, fully opaque slate-table surface (`position: fixed; inset: 0`) with
the table material and vignette. It covers the viewport and owns the whole screen; nothing from
the board is underneath it because the board is not mounted.

Inside, one parchment plaque:

- eyebrow `Local Duel · Round N`;
- h1 `Pass to Player 1` / `Pass to Player 2` in the display face;
- hint `Other player, look away.`;
- a quiet public score line `Series 1–0` (text only, no pips);
- exactly one action: `I'm ready`, an ember 48px button, full-width on phone.

The plaque is 30rem (480px) wide at ≥768 and the viewport minus 32px at phone, with 32/24px
padding. The h1 is 44px at 1280, 40px at 768/1024 and 34–36px at phone. The screen never scrolls
the page; if the viewport is shorter than the plaque it scrolls inside the fixed surface rather
than clipping.

| Viewport | Plaque | Padding | H1 | Button |
| --- | --- | --- | --- | --- |
| 1280×800 | 480px | 32px | 44px | 48px |
| 1024×768 | 480px | 32px | 44px | 48px |
| 768×1024 | 480px | 32px | 40px | 48px |
| 390×844 | 358px | 24px | 36px | 48px |
| 375×667 | 343px | 24px | 34px | 48px |

The only copy is the round, the incoming player, the look-away instruction, the public series
score and the ready action. There is no deck name, hand count, card back, health, defense, energy,
field, turn number, log, intent or card name.

### 3.2 The unmount invariant

Privacy is a **route**, not an overlay. While `#main-content[data-screen="privacy"]` is mounted,
the battle route is not rendered at all. The battle state stays in the in-memory controller; the
privacy view carries only `viewer`, `round` and `wins`.

The following must be absent from the entire document while privacy is shown:

- `.duel-battle`, `.battle-board`, `.battle-arena`, `.duel-panel`, `.field-banner`;
- `.hand`, `button.card-view`, `[data-card-id]`, `[data-instance-id]`;
- `[data-hand-count]`, `.duel-card-back`, `[data-duel-card-back]`;
- `[data-battle-log]`, `[data-battle-log-entry]`, `.battle-log`, `.battle-log__history`;
- `[role="meter"]`, `[data-battle-board]`;
- every card name from the frozen catalog, in text, `aria-label`, `title` or `alt`.

No `aria-hidden`, `visibility: hidden`, clip, portal, or CSS cover counts as a substitute: the
elements must not exist. The Playwright privacy scan keeps its text/aria/title/alt search and
adds the new selectors above.

### 3.3 Focus and dismissal

- On mount, focus `I'm ready`. The dialog traps Tab and Shift+Tab on that single control.
- `I'm ready` is the only dismissal. Enter and Space activate it; Escape is a no-op; the backdrop
  is not clickable; there is no timer or automatic dismissal.
- On activation the privacy route unmounts, the battle route mounts, and a one-shot focus request
  lands on the first card of the incoming hand (leftmost), or on `End Turn` when the hand is
  empty. Re-renders, redraws and later turns never steal focus.
- The app-wide polite live region says `Pass the device to Player 1.` when the handoff opens.
  The dialog's own label and hint are announced when focus enters; no second live region is added.
- The `E` end-turn shortcut is mounted only by the battle route. It cannot dismiss, skip or act
  during privacy.

---

## 4. Duel board

### 4.1 Layout model

The board is exactly `100svh` and never scrolls the page. The only scrollers are the hand rack,
the log rail (table) or drawer (below 1024), and the card-detail sheet. The board has no intent
panel, no AI, no timer and no enemy plan.

```
duel-board (region: Battle)
├─ header                       pinned, 44px + rule
└─ board                        fills the rest
   ├─ opponent panel            name, deck, HP/DEF, statuses, card backs + count, piles
   ├─ field roundel             the shared element, absorbs slack
   ├─ self panel / footer row   compact on phone, full at tablet/table
   ├─ hand                      own hand only; rack on phone, fan at table
   ├─ log                       rail at ≥1024; strip + drawer below
   └─ footer (phone/tablet)     latest line + Log + End Turn
```

At ≥1024 the board is a two-column grid: the arena in column 1, the log rail in column 2, the
hand spanning both below the rail. At <1024 it is one column; the hand is a rack and the log is a
footer strip plus drawer. The 44px header is pinned at every width.

### 4.2 Reference geometry

Exact target boxes at the five viewports. The field absorbs slack; each band may flex by ±8px
without changing the scroll contract.

| Viewport | Top | Header | Table | Opponent | Field | Self | Hand | Rail | Footer |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 375×667 | 6 | 52 | 537 | 132 | 231 | in footer | 158 | — | 72 |
| 390×844 | 8 | 52 | 709 | 150 | 363 | in footer | 180 | — | 75 |
| 768×1024 | 12 | 55 | 884 | 160 | 400 | 80 | 214 | — | 73 |
| 1024×768 | 12 | 55 | 689 | 140 | 245 | 70 | 204 | 240 | — |
| 1280×800 | 12 | 55 | 721 | 140 | 253 | 70 | 228 | 288 | — |

`Table` is the region between the header and the footer; it includes its top padding and the
gaps. At 375/390 the self panel is merged into the footer, so the table is opponent + field + hand
plus two gaps. At 768 the self panel is a full 80px band above the hand and the footer holds only
the latest log line, `Log` and `End Turn`; the tab order stays cards → Log → End Turn. At
1024/1280 the self panel is 70px and owns `End Turn`; the rail runs the full content row and stops
at the hand line.

At 1024 the content column is 984px: 240px rail + 12px gap + 732px arena. At 1280 the interactive
board is capped at 1080px including gutters: 288px rail + 12px gap + 736px arena. The table
background may bleed; the panels do not.

Card widths: 108×152 at 390×844; 108×136 at 375×667 (viewport height under 700px); 118×168 at
768/1024; 138×194 at 1280. The hand zone heights above include the head.

### 4.3 Header

- 44px minimum, rule underneath.
- Left: `FIELDBOUND` wordmark/mark, then the eyebrow `Round N · Series x–y` with the three-pip
  series strip inline.
- Right: `Leave duel`, a 44px quiet action.
- The h1 is `<Player>'s turn`; the line beneath is `Turn N`.
- On phone the wordmark may shorten to the mark + `Fieldbound`; the eyebrow and pips wrap within
  the 52px row if needed, and the header may flex by ±8px. `Leave duel` never moves into an
  overflow menu.
- Leaving is immediate; it discards the series and returns to the menu. There is no confirmation
  dialog.

### 4.4 Opponent panel

- 132px at 375, 150 at 390, 160 at 768, 140 at 1024/1280. Padding 8px phone, 12px table.
- Header: `<Player>` (region title), the locked deck line `<Deck> deck · <Element>` and the
  element chip. The deck name comes from the redacted view (`deckName`), never from a hand card.
- HP and defense meters side by side on phone; stacked at table if the band has room. Values are
  text as well as bars; labels are `Player 2 health` and `Player 2 defense`.
- Status chips wrap; the engine caps at 3/2, so at most one extra line.
- **Hidden hand well:** a fan of up to five mini card backs at table/768 (three at phone), each
  26×36 at table/768 or 20×28 at phone, `aria-hidden`, followed by the visible count
  `N cards in hand` in `[data-hand-count]`. The fan never renders a card face, a card id, a card
  name or a cost. At 0 cards the fan disappears and the count reads `0 cards in hand`.
- Piles line: `N in deck · N discarded`, quiet text. No energy: the opponent's unspent energy is
  not public and their next turn starts at the engine's fixed value.

### 4.5 Field roundel

- Table: 108px roundel, field name, matchup sentence, full five-element cycle with
  `aria-current="step"`.
- Phone: 68px roundel, field name, matchup sentence, current element + `beats X`; the full cycle
  is in How to Play. The cycle is not interactive.
- Neutral copy: `Neutral field. No element is empowered; no card is countered.`
- The field is the only zone that absorbs slack. Its floor is 150px phone, 180px tablet, 190px
  table. Field changes are palette + text, never colour alone.

### 4.6 Self panel and footer

- Table/tablet: full panel with name, locked deck line, HP/DEF meters, statuses and energy number +
  pips. At table it also owns `End Turn`; at 768 `End Turn` sits in the footer with `Log`. 70px at
  table, 80px at 768.
- Phone: a compact self row inside the footer: `HP`, `DEF` and `energy` as text, then `End Turn`.
  The region `Player 1 (you)` remains in the DOM for the region/meter contract.
- `End Turn` is a 46–48px primary ember button, disabled when the round is not live. It is the
  last control in the tab order.
- Footer at 375/390 is two rows: a 20/23px latest-log line, then a 48/52px control row with the
  compact self, `Log` (44×44) and `End Turn`. At 768 the footer is the latest line + `Log` +
  `End Turn`; the self panel above carries the stats. At 1024+ there is no footer; the rail
  replaces the log strip and the self panel carries `End Turn`.

### 4.7 Hand

- Own hand only, in engine order. Five cards at the start of a turn; the opponent is never
  rendered as cards.
- Table: fixed 138×194 at 1280, 118×168 at 1024, ±4° arc, 10px gaps, non-overlapping hit boxes.
- 768: 118×168 in a horizontal rack, 8px gaps, ~5 visible.
- Phone: 108×152 (108×136 at 375×667), 8px gaps, horizontal snap, ~3.2 visible; the fourth and
  fifth are reachable by swipe and Tab.
- Cards never flex-shrink. `Your hand` head shows the count and `Scroll sideways` on phone. The
  next card may peek at the edge. An empty hand keeps the zone height and says
  `Your hand is empty.`; `End Turn` remains.
- Tapping/clicking a card opens the detail sheet, not a direct play. The detail sheet is the only
  source of full rules text; `Play card` closes it and dispatches the play. Unaffordable cards stay
  focusable and inspectable, are labelled `Unaffordable`, and are rejected by the controller.

### 4.8 Card backs

The back is a CSS object, not a manifest asset and not final art:

- parchment material + 1px brass rule, radius `--fb-radius-sm`, a 1px inset brass hairline and a
  centred neutral brass diamond; no text, no element colour, no deck hint, no image;
- 26×36 at table/768, 20×28 at phone; up to five in a fan at table/768 and three at phone, with
  6px overlap and ±6° rotation;
- decorative only: `aria-hidden="true"`, never a `button`, never `.card-view`, no
  `data-card-id`/`data-instance-id`; the adjacent count is the accessible value;
- the same back is used for both seats and in the setup's sealed marker, so it cannot identify a
  deck.

### 4.9 Series strip

- Three pips for the best-of-three, inline in the header eyebrow.
- The strip is an `ol` named `Series score` with `data-series-score="true"`; each `li` carries
  `data-series-pip` and is named by its round: `Round 1: Player 1`, `Round 2: Player 2`,
  `Round 3: not played`. The `li` text is visually hidden; the visible pips are `aria-hidden`, so
  the strip stays one compact line in the header.
- Visual pips: completed pips are brass-filled, unplayed pips are hollow with a 1px brass rule.
  The strip is never colour-only and is not interactive.
- The score text `Series x–y` stays visible; the strip is the same source on the board, the round
  result and the match result.

### 4.10 Log

- The duel log is the public-only log from the controller: one battle-start entry, one card entry
  per settled play, one turn entry per handoff, cap 80, dialogue keyed by the round seed.
- At ≥1024: rail 288px at 1280, 240px at 1024, with head, latest strip and scrolling history.
  No toggle; the rail stops at the hand line.
- Below 1024: footer latest line, `Log` toggle and a drawer (max 82svh, own vertical scroll,
  newest entry in view). Tab order cards → Log → End Turn. The drawer is non-modal; Escape closes
  and returns focus to the toggle; history entries are not focusable.
- The log is never `aria-live`; it carries only public facts. It is absent on privacy and both
  result routes, and the privacy view has no log field.

### 4.11 States

| State | Presentation | Interaction |
| --- | --- | --- |
| Active turn | Header names the viewer; own hand; opponent backs + count; field; End Turn | Play and End Turn are live; the detail sheet opens from the hand. |
| Empty hand | Fixed rack height; `Your hand is empty.` | End Turn remains; no card faces. |
| Opponent hand 0 | No backs; `0 cards in hand` | Nothing to inspect; the panel keeps its height. |
| Unaffordable | Paper-deep face, `Unaffordable`, `aria-disabled` | Still inspectable; Play is disabled with a reason. |
| Card detail | Bottom sheet/table modal | Focus trapped; close returns to the invoking card, else the next card, else End Turn. |
| Round settled | No board state: the route changes to `round-result` immediately | No “battle over” board, no End Turn on a dead round. |
| Reduced motion | Static outcomes, no draw/play/damage animation | The same information is present without motion. |
| Loading | None: local synchronous | No spinner; art boxes reserve their aspect ratios. |

There is deliberately no duel “battle end” state: a settled round navigates away, so the board
never shows a dead hand or a second outcome surface.

### 4.12 Degradation

1. Field shrinks from its reference to its floor (150/180/190).
2. Opponent band shrinks to its floor (120 phone, 132 tablet, 140 table).
3. Hand card height drops to 136px under 700px viewport height; the rack still scrolls.
4. Status chips wrap; the engine caps keep this to one extra line.
5. Log history scrolls; the latest line keeps one reserved line.
6. The detail sheet and log drawer scroll internally.
7. Below a 600px viewport height, allow vertical page scroll as a last resort rather than
   clipping. Horizontal page scroll is never allowed.

No zone may clip text, numbers or controls. A truncated card name is acceptable only on a card
face; the detail sheet carries the full name.

---

## 5. Results

### 5.1 Round result

A scrollable table surface, not a battle board. A centred parchment plaque (max 720px) carries:

- eyebrow `Local Duel · Round N`;
- h1 `Player 1 wins round 1`;
- the series strip + `Series 1–0`;
- `Next round: Player 2 opens.` — the deterministic public first player of the next round;
- the explanatory line about resetting health, defense, statuses, hands and field;
- one primary `Next Round`.

No hand, health, field or log survives on this route. Page scroll is allowed at 375; horizontal
scroll is not. The h1 receives route focus and the winner/score is announced once.

### 5.2 Match result

The same shell, with:

- eyebrow `Local Duel · Best of three`;
- h1 `Player 1 wins the match`;
- `Final score 2–0`;
- the series strip, each pip named by its round winner;
- actions: `Rematch` (primary ember), `Change decks` (secondary brass), `Menu` (quiet row).

`Rematch` keeps both locked decks, resets to 0–0 and opens the privacy handoff for round 1 with
Player 1 first. `Change decks` returns to a fresh step 1 with no selection or score. `Menu`
discards the match and returns to the menu. There is no confirmation dialog and no per-round
health/turn history. Focus lands on the h1; the winner and final score are announced once.

### 5.3 Geometry

| Viewport | Plaque | Padding | Actions |
| --- | --- | --- | --- |
| 1280×800 | 720px | 48px | 3 across, 16px gap |
| 1024×768 | 720px | 40px | 3 across, 16px gap |
| 768×1024 | 720px | 32px | 3 across, 12px gap |
| 390×844 | 358px | 24px | stacked, 12px gap |
| 375×667 | 343px | 20px | stacked, 10px gap |

The result pages may scroll vertically; they never scroll horizontally. The plaque is never
clipped and its actions are ≥44px.

---

## 6. Keyboard, focus and announcements

### 6.1 Focus

| Arrival | Focus |
| --- | --- |
| `duel-setup` mount | `Local Duel` h1 |
| Step 1 → 2, or 2 → summary | the new step/summary h2 |
| Privacy mount | `I'm ready` |
| Privacy dismissed | first card of the incoming hand, else `End Turn` |
| `round-result` | its h1 |
| `match-result` | its h1 |
| Next Round / Rematch | the privacy screen, then `I'm ready` |

Re-renders and selection changes never move focus. The skip link remains; `main` stays
`tabindex="-1"`.

### 6.2 Tab order

- Setup: deck cards in catalog order → confirm → `Back to menu`. A disabled confirm leaves the
  tab order; the visible hint explains why.
- Summary: `Start Match` → `Back to menu`.
- Privacy: `I'm ready` only; the dialog traps Tab and Shift+Tab.
- Battle phone/tablet: skip link → `Leave duel` → hand cards (left to right) → `Log` → `End Turn`.
- Battle table: skip link → `Leave duel` → hand cards → `End Turn`; the rail is not focusable.
- Card detail: the dialog traps focus on close/play; Escape or close returns focus to the invoking
  card, else the next card, else `End Turn`.
- Log drawer: non-modal; Escape returns focus to `Log`; entries are not focusable.
- Results: `Next Round`, or `Rematch` → `Change decks` → `Menu`.

No positive `tabindex`; native buttons; Enter/Space activate. `E` is mounted only by the battle
route and is inert during privacy and on every result/setup route.

### 6.3 Announcements

One app-wide polite `role="status"`:

- setup selection, step change and summary, as listed in §2.3;
- privacy opening: `Pass the device to Player 1.`;
- after ready: `Player 1's turn. Turn 1.`;
- a settled play: `Player 1 played a card.`;
- a refusal: `That action was refused. <reason>`;
- round result: `Player 1 wins round 1. 1–0.`;
- match result: `Player 1 wins the match. 2–0.`

No announcement for hover, focus, re-render, the opponent hand count, the card backs or a card
being inspected. The log is never live. No screen adds a second live region.

### 6.4 Targets, contrast and motion

- Every interactive target is ≥44×44; the deck card, card face, End Turn, Log, Leave, ready and
  result actions included.
- Focus uses the #7 two-tone gold ring; `outline: none` without a replacement is forbidden.
- Text floors: 11px uppercase labels, 12px body; no body text below 12px. Deck names, counts and
  stat values are text, never colour-only.
- Motion: the privacy plaque may fade/scale in 160–240ms; the card-back fan and score strip are
  static. Reduced motion (OS or `[data-reduced-motion="true"]`) removes the plaque transition and
  every board motion, with the same information visible. No auto-advance depends on animation.

---

## 7. State matrix

| Surface | Default | Empty | Disabled | Error |
| --- | --- | --- | --- | --- |
| Setup step 1 | Four decks, no selection | n/a | Confirm disabled until a deck is chosen | Missing deck card labelled unavailable |
| Setup step 2 | Sealed `Player 1's deck is locked` marker, no name | n/a | Confirm disabled until a deck is chosen | Same unavailable card |
| Summary | Both deck names + counts | n/a | Start disabled if either id is missing (unreachable with the frozen catalog) | n/a |
| Privacy | One ready action, incoming player, score | n/a | n/a | n/a |
| Board | Active hand, opponent backs + count, field, log | Empty hand line; 0-card opponent | Unaffordable card inspectable, play rejected; End Turn disabled only when not live | Refusal announced; no dead board |
| Round result | Winner, score, next opener, Next Round | n/a | n/a | n/a |
| Match result | Winner, final score, three actions | n/a | n/a | n/a |
| Unavailable | Duel surface mounted with no live duel | n/a | n/a | `No duel is in progress...` + `Back to menu` |

A duel is never loading: creation is synchronous and a bad setup is a typed failure rendered as a
recoverable panel.

---

## 8. DOM and test contract

### 8.1 Must stay stable

| Contract | Selector / name |
| --- | --- |
| Router | `#main-content[data-screen]` with `duel-setup`, `privacy`, `battle`, `round-result` or `match-result` |
| Setup | h1 `Local Duel`; h2 `Player 1, choose your deck` / `Player 2, choose your deck` / `Both decks are locked`; `Player 2, look away.`; `Player 1 has chosen.`; buttons `Choose the <Deck> deck`, `Confirm Player 1 deck`, `Confirm Player 2 deck`, `Start Match`, `Back to menu`; `aria-pressed`; lines `Player 1: Ember` / `Player 2: Frost` |
| Privacy | `[data-duel-privacy="true"]`; dialog `Pass to Player 1` / `Pass to Player 2`; `Other player, look away.`; button `I'm ready`; `Series x–y` |
| Board | `[data-duel-battle="true"]`, `[data-viewer]`; h1 `<Player>'s turn`; regions `Player 1 (you)` / `Player 2`, `Your hand`, `Turn controls`, `Battle log`; `[data-hand-count]` text `N cards in hand`; `[data-duel-card-back]`; `[data-series-score]` / `[data-series-pip]`; `End Turn`; `Log`; `[data-card-id]`/`[data-instance-id]` only inside the active hand |
| Results | `[data-duel-result="round"]` / `[data-duel-result="match"]`; h1 `Player 1 wins round 1` / `Player 1 wins the match`; `Series 1–0`; `Final score 2–0`; `Next round: Player 2 opens.`; `Next Round`, `Rematch`, `Change decks`, `Menu` |
| Shared | skip link `Skip to main content`; one `role="status"`; no `aria-live` in the log |

### 8.2 Redacted view additions

Presentation only, no rule and no hidden data:

- `DuelSelfView` and `DuelOpponentView` gain `deckName` (resolved from the locked deck id).
- `DuelBattleView` gains `roundWinners` (the public completed-round history) for the series strip.
- `RoundResultScreen` gains `nextPlayer` (the match's next-round first player) and both result
  screens receive `roundWinners` from the match, so the board, round result and match result render
  the same strip.
- The privacy view stays `viewer`, `round`, `wins`; it gains no hand, deck, health, field or log.

### 8.3 Tests that change

- `src/App.duel.test.tsx`: setup structure (deck contents, sealed marker, summary lines), board
  deck names and card backs, series strip, next-opener line, focus/announcement assertions. All
  existing copy and action names stay.
- `src/App.a11y.test.tsx`: duel privacy one-action/trap/Escape, post-ready focus, phone tab order
  cards → Log → End Turn, table tab order cards → End Turn, one live region, `E` inert on privacy.
- `tests/e2e/duel.spec.ts`: the privacy helper's forbidden list adds `[data-hand-count]`,
  `.duel-card-back`, `[data-duel-card-back]` and `[data-battle-board]`; add five-viewport geometry,
  no page scroll, card backs are not card faces, deck names, series strip, results and the
  rematch/change-decks paths. Keep the card-name scan, one-hand assertion and no-auto-dismiss
  watch.
- `tests/e2e/responsive-a11y.spec.ts`: add duel setup, privacy and board at 375/390/768/1024/1280;
  assert 44px targets, no horizontal scroll, no battle page scroll, visible focus ring, reduced
  motion from both sources.
- `tests/e2e/battle-log.spec.ts`: duel rail at 1280, footer strip at 375, drawer at 768, non-live,
  public-only and the 80-entry cap.
- `tests/e2e/helpers.ts`: extend the shared privacy helper with the new forbidden selectors.

### 8.4 Tests that must not change semantically

Engine, `duel/match`, `duel/round`, battle-log derivation/text/validate, persistence, content
catalogs, stats and the asset manifest keep their semantics. The duel remains in-memory; no test
may start reading or writing a duel key.

---

## 9. Acceptance criteria

1. Menu → Local Duel walks Player 1 → Player 2 → summary; step 2 exposes no deck name, element or
   selection from Player 1; the summary shows both locks; Start is disabled until both confirm;
   Back discards a partial choice.
2. Setup shows four physical deck cards with all ten names readable at 375, a sealed marker at
   step 2, a sticky action bar and no horizontal scroll.
3. Privacy is fixed and opaque, names only the incoming player, offers exactly one action, traps
   focus, ignores Escape and never auto-dismisses.
4. While privacy is mounted, the DOM contains no board, hand, card face, card id, hand count, card
   back, meter, field, log or catalog card name — in text, `aria-label`, `title` or `alt`.
5. The board has no page scroll at 375×667, 390×844, 768×1024, 1024×768 or 1280×800; only the
   rack, log rail/drawer and detail sheet scroll; the five zones match §4.2 within ±8px.
6. Only the viewer's hand renders as card faces; the opponent panel shows card backs plus
   `N cards in hand` and no card id/name; exactly one `.hand` and five card buttons exist.
7. The header shows `Round N · Series x–y` plus the three-pip strip; both panels name their
   locked decks; no score or state is colour-only.
8. Round result names the winner, score and next opener and offers `Next Round`; match result
   names the winner and final score and offers `Rematch`, `Change decks`, `Menu`; rematch keeps
   decks and resets, change decks clears, menu discards.
9. Focus follows §6.1; the phone tab order is cards → Log → End Turn and the table order is cards
   → End Turn; there is one polite live region and the log is non-live; `E` is inert on privacy.
10. All targets are ≥44px; reduced motion is a hard branch; the stable selectors and names in
    §8.1 hold and only the tests listed in §8.3 change.

---

## 10. Resolved decisions

- Duel setup reuses the solo physical deck table; both players get the same ten-name deck cards,
  with the look-away banner and a sticky confirm/Start bar.
- Step 2 shows a sealed card back and `Player 1's deck is locked`; Player 1's deck name and element
  are absent until the summary.
- The summary is a third state with both locked deck cards, the fixed-for-rematch line and one
  `Start Match`.
- Privacy is a separate route: a fixed, opaque slate surface with one parchment plaque, the
  incoming player, the look-away line, the public series score and one `I'm ready`. No board is
  in the DOM, not merely covered.
- The board adopts #8's `100svh` shell. The opponent band is tighter than the solo enemy band
  because there is no intent list (132/150/160/140/140); the field absorbs the difference.
- The hidden hand is a CSS card-back fan plus a count. Backs are decorative, carry no name/id and
  are never card faces; the count is the accessible value.
- Both panels name their locked deck; `deckName` is added to the redacted self/opponent views.
- The series strip is three named pips sourced from the public round-winner history, alongside the
  existing `Round N · Series x–y` text.
- Results are table plaques. The round result names the next opener; the match result shows the
  strip and the three actions. No per-round health or log history is added.
- Leaving a duel is immediate; no confirmation dialog is introduced.
- Setup step changes focus the step h2 and announce once; the route h1, deck buttons and all
  existing copy stay.
- The phone footer is two rows (latest line, then compact self + Log + End Turn); 768 is the
  expanded phone composition with both panels and no rail; 1024/1280 use the rail.
- The privacy invariant is enforced by unmounting the battle route, with a written forbidden-
  selector list and a card-name scan in Playwright.
- After privacy, focus lands on the first card of the incoming hand (or End Turn), not the h1; the
  polite pass message is the single live announcement.
- The test migration is presentation-only: engine, duel controllers, battle log, persistence and
  content tests keep their semantics.
