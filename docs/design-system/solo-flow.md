# Menu, solo setup, run overview and reward — build-ready spec

**Status:** decision for wayfinder #9. Builds on #5 (composition), #6 (prototype),
#7 (tokens) and #8 (battle screen). Not implemented yet; #15 executes it.
**Tokens:** [`tokens.css`](./tokens.css) · **Battle spec:** [`battle-screen.md`](./battle-screen.md) · **Prototype:** [#6](https://github.com/SixStringBny/fieldbound/tree/prototype/battle-refined/.prototype/battle-refined).

The table metaphor reaches the menu, solo setup, run overview, reward and the
shared result shell. These are **scrollable table surfaces**, not
`100svh` battle boards: the page may scroll vertically, never horizontally. How
to Play and Settings remain paper documents owned by #11.

---

## 1. Shared shell

- Page: `--fb-surface-board` + `--fb-material-slate` + vignette; a centred
  `--fb-board-max` (1080px) content column; `--fb-gutter` side padding;
  24–48px vertical rhythm.
- Header: same wordmark/turn treatment as the battle screen but no locked
  height; screen title in Fraunces; back/menu actions on the right.
- Objects: parchment panels/cards with brass rules, wax seals for primary
  actions, brass rows for quiet navigation. No generic form rows, no translucent
  light panels, no grey rules.
- Type floors: 11px uppercase labels, 12px body, 14px default UI, 16px reading
  paragraphs, display 20–52px. Text on paper uses the paper ink tokens.
- Targets: 44px minimum; 8px gaps; focus ring from #7; no hover-only action.
- Page scroll: allowed. Horizontal scroll: forbidden at every target width.
- Route focus: each screen focuses its `h1` (`tabindex="-1"`) on mount; the
  existing skip link remains. Re-renders do not steal focus.

---

## 2. Menu as the table hub

### 2.1 Composition

At ≥1024px: two columns inside 1080px — hero (wordmark, tagline, run plaque)
and hub (the five entries). At <1024px: one column, hero then hub. The page may
scroll at 375×667 if the content exceeds the viewport.

| Viewport | Padding | Layout | Hub | Entry size |
| --- | --- | --- | --- | --- |
| 1280×800 | 48px 24px | 2 cols (1.05fr / 0.95fr), 48px gap | 512px | Play/Local 150px tall; Continue 88; quiet 56 |
| 1024×768 | 32px 24px | 2 cols, 32px gap | 440px | Play/Local 140; Continue 84; quiet 56 |
| 768×1024 | 24px 16px | 1 col | full width | Play/Local 96; Continue 84; quiet 56 |
| 390×844 | 16px 12px | 1 col | full width | Play/Local 76; Continue 76; quiet 56 |
| 375×667 | 12px 10px | 1 col | full width | Play/Local 72; Continue 72; quiet 56 |

The hero: `FIELDBOUND` display wordmark, tagline “One field. Three energies. Two
ways to play.”, and a run plaque:

- No save: quiet “No run in progress” line; no empty entry slot.
- Valid save: parchment bookmark card with the exact continue hint
  `Encounter N of 4 · X of 40 health`, plus `Ember deck · 11 cards` when the
  composition root supplies the deck view.

### 2.2 Entry points

DOM and tab order stay: **Play Solo**, **Local Duel**, **Continue Run** (only
with a validated save), **How to Play**, **Settings**. The nav keeps
`aria-label="Main menu"` and the `h1` stays **Fieldbound**.

- Play Solo: largest parchment card, wax/ember seal, “Four fights, one 40-health
  run.”
- Local Duel: parchment card, brass seal, “Best of three, pass and play.”
- Continue Run: parchment bookmark spanning the hub; encounter, health and deck
  line; clicking resumes exactly where the save left off.
- How to Play / Settings: quiet brass rows at the bottom, not equal-weight cards.
- A corrupt/missing save must not render Continue; no error toast is needed.
- No hover-only cue; the whole card/row is the 44px+ target.

### 2.3 Menu states

| State | Presentation |
| --- | --- |
| No save | No Continue entry; “No run in progress” plaque; Play/Local/How/Settings. |
| Valid save | Continue bookmark between Local Duel and How to Play; resume hint + deck line. |
| Corrupt save | Treated as no save; no Continue. |
| Loading | None: the composition root validates the save before rendering and the menu is synchronous. |

---

## 3. Solo setup — physical deck choice

### 3.1 Composition

- Header: eyebrow `Solo Run`, `h1 Solo Run`, the existing explanatory copy.
- Four deck cards in a 2×2 grid at ≥768px, one column below; page scrolls
  vertically. A sticky action bar sits at the bottom at every width.
- Each deck card is a native button (`aria-pressed`) containing:
  - element seal + deck name (Fraunces 20–24px);
  - identity line, e.g. `Ember: aggressive, piercing`;
  - `10 cards · 2 Shift cards`;
  - the ten printed card names in a 2-column list at 12px, with the two Shift
    names marked by a brass tag (not colour alone); the contents block has an
    id and the button's `aria-describedby` points at it, so the full deck is
    available to assistive technology without inflating the button name;
  - selected wax seal + `Selected` text.
- The card is a physical stack: 2–3 offset parchment edges, brass rule, wax seal,
  `--fb-elev-2`; selected lifts 2px and gets a 2px brass rim. No nested
  interactive elements (the contents are text, not buttons).

| Viewport | Page padding | Grid | Deck card |
| --- | --- | --- | --- |
| 1280×800 | 32px 24px 120px | 2×2, 20px gap | 512×260 |
| 1024×768 | 24px 20px 120px | 2×2, 16px gap | 460×250 |
| 768×1024 | 20px 16px 120px | 2×2, 14px gap | 340×280 |
| 390×844 | 16px 12px 112px | 1 col, 12px gap | 343×280 |
| 375×667 | 12px 10px 108px | 1 col, 10px gap | 351×280 |

The action bar: 72px + safe area, parchment/table strip, `Start Run` primary
ember (48px) and `Back to menu` quiet (44px); the chosen deck name appears in the
bar. Start is disabled until one deck is selected, with the hint “Select one of
the four decks to enable Start Run.”

### 3.2 Selection and states

- One selection at a time; clicking/Enter sets `aria-pressed="true"`, moves the
  wax seal, and enables Start.
- Start dispatches exactly one `onStart(element)`; double activation cannot start
  two runs (button disables on press).
- Missing/corrupt deck: render a labelled unavailable card and keep Start
  disabled; the frozen catalog should make this unreachable.
- No selection is not an error; the hint explains the disabled Start.
- Page scroll is expected at 375; the action bar stays pinned and never covers
  the last deck card because the content reserves bottom padding.

---

## 4. Run overview — the ladder

### 4.1 Composition

| Viewport | Layout | Ladder | Status/next | Actions |
| --- | --- | --- | --- | --- |
| 1280×800 | 2 cols (720 / 320), 24px gap | 4 steps across, each 170×190 | right column | right column |
| 1024×768 | 2 cols (660 / 300), 20px gap | 4 across, each 155×180 | right column | right column |
| 768×1024 | single column | 4 across, each 170×180 | stacked below | below |
| 390×844 | single column | vertical list, 72px rows | stacked | sticky bottom bar |
| 375×667 | single column | vertical list, 68px rows | stacked | sticky bottom bar |

Header: eyebrow `Solo Run`, `h1 Run overview`, progress `N of 4`.

Ladder: an `ol` labelled **Run progress**; each step is a parchment stone with a
brass connector, enemy portrait (56–64px), name, status text `Cleared` /
`Current` / `Upcoming`, element and max health. The current step has a 2px brass
ring and `aria-current="step"`; cleared shows a wax check; upcoming is quieter
but still ≥4.5:1. At <768px the connector becomes a vertical brass line. The
ladder is not interactive; it is a status map, not a screen switcher.

Run status panel: `Health` meter labelled **Run health**; `Deck N cards`;
`Turns N`. Next/current enemy panel: portrait, name, element, max health; title
`Next enemy` between battles and `Current enemy` during a fight.

Actions: primary **Next Battle** between battles, **Back to battle** during one;
secondary **Menu**. Actions are 48/44px; at phone they sit in a sticky bottom bar
with safe-area padding. `Menu` leaves the run to the autosaved menu.

### 4.2 States

- Between battles: Next Battle enabled; deck size includes rewards; health is
  the carried value.
- During battle: Back to battle; current enemy; health is the live battle value.
- No next enemy: hide the enemy panel and disable Next; terminal runs go to the
  result screen, never stay here.
- Corrupt run: the composition root does not mount the overview.

---

## 5. Reward — three dealt cards, then confirm

### 5.1 Composition

| Viewport | Padding | Cards | Confirm bar |
| --- | --- | --- | --- |
| 1280×800 | 32px 24px 120px | 3 across, 220×300, 24px gap | sticky 84px |
| 1024×768 | 24px 20px 112px | 3 across, 200×280, 20px gap | 80px |
| 768×1024 | 20px 16px 108px | 3 across, 180×250, 16px gap | 80px |
| 390×844 | 16px 12px 104px | 3 across, 108×152, 8px gap | 88px |
| 375×667 | 12px 10px 100px | 3 across, 104×146, 6px gap | 88px |

Header: eyebrow `Solo Run · Reward`, `h1 Choose a reward`, the existing
“Exactly one option. There is no skip…” copy, and `Health: N / 40`.

Three offers, always exactly three; the third is `Heal 12` when health is
strictly below 20, otherwise a card. Offer order and card ids come from the
generated offers; the UI never re-rolls or sorts.

Card face: parchment, cost seal, 6/5 art, name, element, primary value, a
two-line effect summary at table width; phone shows name/value/meta only. A
selected card lifts 2px, gets the brass rim and a `Selected` seal. Cards are
buttons with `aria-pressed`; only one is pressed.

Heal option: a wax/brass “seal” card with `Heal 12`, `+12 health`, current HP and
“No card is added to the deck.” It is the same target size as a card.

### 5.2 Select, then confirm

Selection and confirmation are two deliberate steps:

1. Click/tap/Enter a card (or Heal) → `aria-pressed="true"`, selection seal,
   confirm bar shows the selected name and a two-line effect summary (phone) and
   enables `Take <name>` / `Take Heal 12`; the option description carries the
   full effect for assistive technology.
2. Click/Enter the confirm button → dispatch exactly one `onChoose(index)`, then
   the run overview for the next encounter. The screen does not advance on the
   first click.

Changing the selection is allowed before confirmation. There is no skip, no
“later”, no menu escape mid-reward; the run remains in the reward phase until a
choice is confirmed. Double activation is prevented by the phase guard and a
disabled confirm while the transition is in flight.

Confirm bar: selected summary (name + two-line effect summary on phone, HP/health
cap for heal), primary 48px, 88px total at phone. It is sticky with safe-area padding and never
covers the third card because the page reserves bottom space.

### 5.3 States

| State | Presentation |
| --- | --- |
| None selected | Cards unpressed; confirm disabled; prompt “Select one reward to continue.” |
| Selected | Card lifted/pressed; confirm enabled and labelled with the choice. |
| Heal offered | Third slot is Heal 12; card options keep their order; still 3. |
| Missing card data | Fallback card labelled “Card data unavailable”; that option disabled; other choices remain. |
| Offers invalid/empty | Show a labelled error and do not mount the confirm bar; the composition root should not reach this state. |
| Confirmed | Advance once to the next overview; no second call can apply. |

The existing `App.solo` and `solo-run.spec` helpers currently click an option and
expect the overview immediately; they must select and then confirm. This is the
deliberate test change.

---

## 6. Run result shares the shell

Run result uses the same table background and parchment objects, not a paper
document: a centred plaque (max 720px) with the Victory/Defeat wax seal, `Run
complete` / `Run over`, outcome line, totals and best-run panel; `New Run`
primary, `Menu` secondary. 375 is full-width with page scroll. The detailed
result copy/reading treatment belongs to #11; #9 fixes only the shared shell and
actions.

---

## 7. Keyboard, focus and announcements

### 7.1 Route focus

On entering each screen, focus its `h1` (`tabindex="-1"`) so the route is
announced once. Re-renders and selection changes do not move focus. The existing
skip link stays. Back/Menu/New Run lands on the destination `h1`; no stale focus
on an unmounted control.

### 7.2 Tab order

- Menu: hero is not focusable; nav entries in DOM order — Play Solo → Local Duel
  → Continue (if present) → How to Play → Settings.
- Setup: deck cards in documented order (Ember, Frost, Gale, Stone) → Start Run
  → Back to menu. Start uses native `disabled` until a deck is selected, so it
  leaves the tab order; the visible hint explains why. Activation is rejected
  while disabled.
- Overview: Next Battle / Back to battle → Menu. The ladder is static.
- Reward: cards in offer order → confirm. Confirm uses native `disabled` until a
  selection exists and leaves the tab order until then; the prompt explains why.
  No skip/back.
- Result: New Run → Menu.
- No positive `tabindex`; native buttons; Enter/Space activate.

### 7.3 Live announcements

One polite `role="status"` (the app already mounts it):

- Setup selection: “Ember deck selected. Start Run is enabled.”
- Reward selection: “Cinder Jab selected. Take reward is enabled.”
- Reward confirmation: no extra live line; the route `h1` focus announces the
  overview. The run totals are visible.
- Do not announce hover, focus, disabled state, or re-renders. No screen adds a
  second live region.

### 7.4 Privacy

These screens are solo-only. Duel setup/privacy is #10; no duel hand, count or
opponent state may be added to the menu, setup, overview or reward surfaces.

---

## 8. State matrix

| Screen | Empty / loading | Disabled | Selected / current | Error |
| --- | --- | --- | --- | --- |
| Menu | No save → no Continue; no loading | n/a | Valid save → Continue bookmark | Corrupt save → no Continue |
| Setup | Four frozen decks; no loading | Start disabled with hint until a deck is chosen | One deck `aria-pressed`, wax seal | Missing deck card disabled/labelled |
| Overview | No next enemy → hide panel | Next disabled if terminal/no enemy | Current step `aria-current`, brass ring | Corrupt run not mounted |
| Reward | Always 3 offers; no loading | Confirm disabled until selection | Selected card + `aria-pressed` | Missing card option disabled; invalid offers error |
| Result | Stats null → omit best panel | n/a | Victory/defeat seal; New best | Stats save failure notice |

---

## 9. DOM and test contract

### 9.1 Must stay stable

| Contract | Selector / name |
| --- | --- |
| Router | `#main-content[data-screen="menu" | "solo-setup" | "run-overview" | "reward" | "run-result"]` |
| Menu | `nav` **Main menu**; `h1` **Fieldbound**; buttons **Play Solo**, **Local Duel**, **Continue Run**, **How to Play**, **Settings**; `#menu-continue-run-hint` exact hint |
| Setup | `h1` **Solo Run**; button **Choose the <Deck> deck**; `aria-pressed`; `data-element`; **Start Run**; **Back to menu**; identity text |
| Overview | `h1` **Run overview**; `N of 4`; list **Run progress**; `aria-current="step"`; meter **Run health**; `Deck N cards`; **Next Battle** / **Back to battle**; **Menu** |
| Reward | `h1` **Choose a reward**; list **Reward options**; buttons **Choose <name>** / **Choose Heal 12**; `aria-pressed`; `Health: N / 40`; new **Take <name>** / **Take Heal 12** |
| Result | `h1` **Run complete** / **Run over**; totals labels; **New Run**; **Menu** |
| Data | `data-screen`, `data-element`, `aria-pressed`, `aria-current`, `data-offer-index` (new, optional), `.solo-deck`, `.run-progress__step`, `.reward-option` |

### 9.2 Tests that change

- `src/App.solo.test.tsx`: reward helpers select then confirm; add menu/setup/
  overview/reward geometry-independent assertions. Keep exact screen names,
  Continue hint, `1 of 4`, `10 cards`, `Run health`, `Choose Heal 12`,
  `Health: 16 / 40`, result headings.
- `src/App.navigation.test.tsx`: menu entry order and names stay; update only if
  markup nesting changes (keep `nav` Main menu).
- `src/App.a11y.test.tsx`: add route `h1` focus, setup selection announcement,
  reward select/confirm announcement and focus; keep skip link/target tests.
- `tests/e2e/solo-run.spec.ts`: `chooseReward` selects then clicks `Take …`;
  all downstream transitions unchanged.
- New Playwright: menu/setup/overview/reward at 375/390/768/1024/1280 — no
  horizontal scroll, 44px, sticky action bar, deck readability, three reward
  cards, select-then-confirm, low-health heal, route focus.
- No engine/controller/persistence/content/log/privacy test changes.

### 9.3 Tests that must not change semantically

Run creation/transition, reward generation/validation, save/resume, stats,
content and deck catalogs, and the battle/log/privacy contracts.

---

## 10. Acceptance criteria

1. Menu shows the five entry points in the documented order, Continue only with a
   validated save, the exact resume hint and deck line; no save leaves no empty
   slot; no horizontal scroll at 375.
2. Solo setup shows four physical deck cards with all ten card names readable at
   375; one selection, `aria-pressed`, Start disabled until selected, sticky
   Start/Back; no horizontal scroll.
3. Run overview shows the four-step ladder with `aria-current`, `N of 4`, Run
   health, deck size, turns, next/current enemy and Next/Back + Menu; page scroll
   allowed, no horizontal scroll.
4. Reward always shows three distinct offers, Heal 12 at <20 health, select then
   confirm, exactly one dispatch, no skip; phone cards 104–108px and confirm bar
   sticky; no horizontal scroll.
5. Run result shares the table shell and keeps its headings/actions; detailed
   result reading is #11.
6. Route focus lands on the destination `h1`; one polite announcement per
   selection; no duplicate live region; all targets ≥44px; reduced motion is
   honored.
7. Existing role/name/`data-*` contracts hold; only the listed tests change.

---

## 11. Resolved decisions

- The menu is a table hub, not a list of form rows: two large mode cards, a
  continue bookmark, two quiet document rows.
- Setup is a scrollable 2×2 (1-column on phone) deck-card table with a sticky
  Start bar; all ten names stay visible at 12px rather than a modal preview.
- Run overview is a horizontal four-step ladder at ≥768 and a vertical ladder on
  phone, with the status/next-enemy column beside it at ≥1024.
- Reward becomes a two-step select → confirm interaction; this is the deliberate
  change from the current immediate choice.
- Run result shares the table shell; #11 owns the reading-screen detail.
- Page scroll is allowed on these screens; horizontal scroll is not. The battle
  screen keeps its `100svh` contract.
