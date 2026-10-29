# Reading screens — build-ready spec

**Status:** decision for wayfinder [#11](https://github.com/SixStringBny/fieldbound/issues/11).
Builds on #5 (composition), #6 (prototype), #7 (tokens), #8 (battle screen),
#9 (menu, solo setup, reward) and #10 (duel flow). Not implemented yet; #15
executes it.
**Tokens:** [`tokens.css`](./tokens.css) · **Battle:** [`battle-screen.md`](./battle-screen.md) ·
**Solo:** [`solo-flow.md`](./solo-flow.md) · **Duel:** [`duel-flow.md`](./duel-flow.md).

How to Play and Settings are **reading documents**: one parchment sheet on the
warm slate table, a contents surface, and prose at reading size. The run result
and the two duel results are **verdicts**: a slate outcome block plus, for a
solo run only, parchment record sheets holding the numbers.

Everything here is presentation and interaction. The rules copy, the settings
schema, the run summary and stats record, the duel match/round transitions and
the battle log keep their semantics.

---

## 1. Two idioms, one table

| Surface | Idiom | Why |
| --- | --- | --- |
| How to Play | reading document — masthead, contents, one parchment sheet | It is 3,000 words of reference; it must be read, not played. |
| Settings | reading document — masthead, two-row parchment sheet | Same sheet, one short page. |
| Run result | verdict plaque + two parchment ledgers | A run has numbers worth recording. |
| Round result | verdict plaque, no paper | A round has a winner and a score, nothing to ledger. |
| Match result | verdict plaque, no paper | The series strip is the only record. |

This resolves the framing conflict with #9 §6 and #10 §5.2: results stay table
surfaces with a parchment record *inside* them; the full document treatment is
reserved for How to Play and Settings. There is exactly one result idiom, and
it is a verdict, not a form.

No reading screen uses the manifest art. The field-cycle seals, wax seals and
switch thumbs are CSS objects built from tokens, so the five new surfaces add
zero image and font bytes.

---

## 2. Document shell

Shared by How to Play and Settings.

### 2.1 Page

- Surface: `--fb-surface-board` + `--fb-material-slate` + `--fb-material-vignette`.
- Content column: `--fb-board-max` (1080px), centred, `--fb-gutter` side padding.
- **Page scroll is allowed vertically; horizontal scroll is forbidden.** These
  are documents, not `100svh` battle boards: no fixed height, no internal
  scroller, no clipping.
- Bottom padding 32px at phone, 48px at ≥768.
- The existing skip link and one-line app shell stay; nothing on these routes is
  pinned except the phone contents strip (§3.3).

### 2.2 Masthead

```
document__masthead
├─ eyebrow    Rules reference | Preferences
├─ Back       quiet 44px action, top right, on the eyebrow line
├─ h1         How to Play | Settings   (tabindex="-1", route focus target)
└─ tagline    16px --fb-text-soft, max 34rem
```

- The masthead sits directly on the slate, never on paper: the document is the
  sheet below it.
- `Back` is a quiet brass text action, ≥44×44, vertically aligned with the
  eyebrow. It never wraps under the h1 and never moves into an overflow menu.
- h1: 32px at 375, 34px at 390, 40px at 768/1024, 44px at 1280, Fraunces 700,
  `--fb-text`, tight leading. It is the only `h1` on the route.
- Tagline: the existing copy, unchanged.

### 2.3 Sheet

```css
.document {
  display: grid;
  gap: 24px;
  align-items: start;
  padding-bottom: var(--fb-space-6);
}
@media (min-width: 1024px) {
  .document {
    grid-template-columns: 14rem minmax(0, var(--fb-document-max));
    gap: var(--fb-space-5);
  }
}
.document__sheet {
  max-width: var(--fb-document-max); /* 42rem */
  padding: var(--fb-space-6);
  background-color: var(--fb-surface-document);
  background-image: var(--fb-material-paper);
  border: var(--fb-rule-on-paper);
  border-radius: var(--fb-radius-md);
  box-shadow: var(--fb-elev-3);
  color: var(--fb-text-on-paper);
}
```

- Sheet padding: 20px at phone, 32px at 768, 40px at 1280.
- Below 1024 the sheet is `margin-inline: auto` (42rem max inside the gutter) and
  the contents is the strip in §3.3. At ≥1024 the contents rail is column 1 and
  the sheet column 2; 224px + 24px + 672px = 920px, inside the 1080px column.
- Paper material is a material, not a light theme: page background stays dark,
  `color-scheme` stays `dark`, and the sheet is the only light object.

### 2.4 Section rhythm and reading type

- Sections are separated by a 1px `--fb-rule-on-paper` hairline with 28px above
  and below at phone, 32px at 768, 40px at 1280.
- Reading body: **16px / 1.6**, `--fb-text-on-paper`, capped at **34rem** (≈65
  characters) inside the sheet at ≥768 so long paragraphs do not run the full
  sheet width.
- h2: 22px at phone, 24px at ≥768, Fraunces 700, `--fb-text-on-paper`, 8px
  above the first paragraph. h3: 18px, Fraunces 700.
- Lists and `dl` rows use `--fb-text-on-paper-soft` for secondary text and never
  drop below 13px; labels above values are 11px uppercase with
  `--fb-tracking-label`.
- Links that appear in prose are brass-700 with an underline; there are no
  in-prose links in this revision beyond the contents set.
- Contrast on paper: body 12:1, soft body 7:1, muted/hint (brass-700) 5.8:1,
  danger (danger-700) 7.4:1. On slate: body 15.5:1, soft 9.8:1.

---

## 3. How to Play

### 3.1 Composition

```
document
├─ document__masthead        eyebrow, Back, h1, tagline
├─ document__contents        ≥1024 rail; <1024 sticky strip + disclosure
└─ document__sheet
   ├─ section  A turn in three steps
   ├─ section  Energy
   ├─ section  The field cycle
   ├─ section  Defense
   ├─ section  Statuses
   └─ section  Modes
```

Copy is **verbatim**: same headings, same sentences, same order, no new prose
and no reworded rules. `How to Play` keeps its tagline. The redesign changes how
the same facts look, never what they say.

Section ids stay the ones the code already uses — `rules-turn-title`,
`rules-energy-title`, `rules-field-title`, `rules-defense-title`,
`rules-status-title`, `rules-modes-title` — moved onto the `h2` elements, which
become the anchor targets with `tabindex="-1"`.

### 3.2 Section dressing

| Section | Presentation |
| --- | --- |
| A turn in three steps | The `<ol>` becomes three numbered parchment stones joined by a 2px brass connector (vertical on phone, three across at ≥768). The number is a small wax seal with the digit as text; the step body stays 16px reading type. |
| Energy | Prose only. The card cost is explained in the existing sentences; a brass drop rule opens the section. |
| The field cycle | The cycle chain (§3.4) plus the existing beats list; the "Neutral sits outside it" paragraph follows. |
| Defense | Prose only, with the "caps at 8 and resets between encounters and duel rounds" sentence set as a brass-ruled callout — same words, no new claim. |
| Statuses | The `dl` becomes three brass-ruled rows: `dt` 18px display over `dd` 16px reading type. No cap chip is added: the existing "Stacks up to 3." sentence already carries it, and a chip would restate the copy. |
| Modes | Three `h3` blocks (`Solo run`, `Local duel`, `Winning`) separated by brass rules. No nested paper: nested sheets on paper read as stickers and cost padding at 375. |
| Footer | `Back to menu`, 48px ember primary, full width at phone, left-aligned at ≥768. |

### 3.3 Contents

- **≥1024 — rail.** Column 1, `position: sticky; top: 24px;` inside a
  `<nav aria-label="On this page">`; six links at 13px, each a ≥44px target, in
  section order, with a brass bullet. No `aria-current` and no scroll-spy
  (§12).
- **<1024 — sticky strip + disclosure.** A 44px parchment strip pinned to the
  top of the viewport (`top: 0`, brass bottom rule) holding one button
  `Contents` (`aria-expanded`, `aria-controls`) and the hint `6 sections`. The
  button opens an inline list of the same six links directly beneath the strip;
  the list pushes the sheet down rather than overlaying it. The open state is
  not animated (no height transition, no layout animation).
- Activating a link:
  1. `preventDefault` — no hash is written, no history entry is created, the
     router is not involved;
  2. focus moves to the target `h2` (`tabindex="-1"`), which scrolls it into
     view (`scroll-margin-top: 56px` below 1024 so the sticky strip does not
     cover the heading; `0` at ≥1024);
  3. below 1024 the disclosure closes.
- `Escape` while the disclosure is open closes it and returns focus to the
  `Contents` button. The disclosure is not a dialog, traps no focus and has no
  backdrop.
- The strip is the only pinned element in the app's documents and exists only on
  How to Play below 1024.

### 3.4 Field cycle chain

The five-element cycle is drawn, not printed:

- Each step is an `<li>` in the existing `rules__cycle` list carrying the visible
  sentence `Ember beats Frost` (and so on, unchanged) at 13px
  `--fb-text-on-paper-soft`.
- Above the sentence, a pair of **element seals**: a 44px circle filled from the
  element palette tokens (`--fb-ember-bg` …) with a 2px brass rim, carrying the
  element glyph and name in `--fb-ember-ink` on the element ground. Seals are
  `aria-hidden="true"` decoration.
- At ≥768 the four steps are one horizontal chain, `Ember → Frost → Gale →
  Stone → Ember`, with brass arrows between the seal pairs; at phone they stack
  as four rows (seal pair above caption). Nothing scrolls horizontally: the
  chain wraps to a 2×2 grid at 375 if the horizontal form would overflow, and
  the wrapped form keeps the arrow between pairs.
- The neutral sentence stays a plain paragraph under the chain.
- Field changes are out of scope here: this is a static explanation, not the
  live field banner, which keeps #8's roundel and its `aria-current` cycle.

---

## 4. Settings

### 4.1 Composition

```
document
└─ document__sheet
   ├─ h1 Settings
   ├─ intro: Sound and motion save as soon as you change them.
   ├─ row  Sound          / hint / switch
   ├─ row  Reduce motion  / hint / switch
   └─ settings__notice    (only when storage is unavailable)
```

- Sheet is 42rem, no contents rail, nothing sticky: the page is one screen at
  ≥768 and under two at 375.
- The masthead `Back` is the only action. A trailing second `Back` is not
  rendered: it would duplicate the same intent one short screen apart and make
  two controls share the accessible name `Back` (§12).

### 4.2 Rows

| Part | Spec |
| --- | --- |
| Row | `li` inside a `ul`, minimum 72px at phone and 88px at ≥768, separated by a 1px brass-on-paper hairline; 16px inline padding 0, 12px block. |
| Label | `h2` at 16px `--fb-text-on-paper`, Fraunces 400/UI 600; it is the switch's label, never a heading level below the page `h1` skipped — `h2` is correct here. |
| Hint | 12px `--fb-text-on-paper-muted`, max 34rem, 4px under the label. |
| Switch | 72×44 button, pinned right, vertically centred. `role="switch"`, `aria-checked`, `aria-labelledby` the label, `aria-describedby` the hint. |
| Switch — on | Brass-300 track (`--fb-material-brass`), wax thumb 28px at the right, visible word `On` at 13px `--fb-text-on-paper` on the brass. |
| Switch — off | Parchment-300 recessed track with a parchment-800 thumb at the left and a 1px brass rim; visible word `Off` at 13px. |
| Focus | The #7 two-tone gold ring, inset by 2px so the ring is not clipped by the row's hairline. |
| Motion | Thumb travels in `--fb-dur-lift` (120ms) `--fb-ease`; reduced motion is instant (§8.4). |

The row itself is **not** a label or a button: only the switch is interactive.
Making the row clickable would fold the hint into the control's accessible name
and give the page a second interactive region per setting.

### 4.3 Copy and behaviour

- Intro, labels, hints and the storage notice keep their exact current strings:
  `Sound`, `Reduce motion`, `Synthesized cues play after your first tap or key
  press.`, `Following your device setting.`, `Set on this device.`, and
  `This browser cannot save settings. Your choices apply for this session only.`
- `On` / `Off` remain the visible switch words; `aria-checked` is the actual
  state.
- Two switches only. There is no third "follow device" state, no storage row, no
  reset action and no new setting (§12).
- Toggling writes immediately through the existing settings store; the screen
  stays presentational and never reads storage itself.

### 4.4 Storage notice

- Static `<p class="settings__notice">`, **no `role="status"`**: it reports a
  condition discovered on mount, not feedback to an action, and the app already
  owns the single live region.
- 13px `--fb-text-on-paper`, 2px danger left rule (`--fb-danger-on-paper`), 12px
  padding, 16px top margin, inside the sheet above the trailing `Back`.
- No announcement is made when it appears. The switch still works in memory and
  its state is visible.

---

## 5. Run result

### 5.1 Composition

```
result[data-screen="run-result"]           max 45rem (720px), centred
├─ result__outcome                          on the slate
│  ├─ result__seal     wax Victory / Defeat seal, 64px, aria-hidden
│  ├─ eyebrow          Solo Run · Result
│  ├─ h1               Run complete | Run over   (tabindex="-1")
│  └─ outcome line     You cleared all 4 encounters. | You reached encounter N of 4.
├─ result__ledger result__ledger--totals    on paper
│  ├─ h2 Run totals
│  └─ dl  4 stats
├─ result__ledger result__ledger--best      on paper, only when stats !== null
│  ├─ h2 Best run
│  ├─ dl  3 stats
│  ├─ result__best     New best wax seal, only when isNewBest
│  └─ result__notice   save-failure line, only when !saved
└─ result__actions                          on the slate
   ├─ New Run   ember 48px
   └─ Menu      quiet 44px
```

- The outcome block is **not** paper: the verdict belongs to the table, the
  numbers to the record. The seal sits beside the eyebrow, not above the h1, so
  the heading stays the first thing the eye lands on.
- The outcome line is 16–18px `--fb-text-soft`, max 34rem.
- Actions: side by side at ≥768 (`New Run` then `Menu`, 16px gap); stacked full
  width at phone (`New Run` then `Menu`, 12px gap). Both keep their names.
- Page scroll is allowed; no horizontal scroll; nothing sticky.

### 5.2 Totals ledger

| Viewport | Grid | Cell |
| --- | --- | --- |
| 375×667 | 2×2, 10px gap | ≈164×84 |
| 390×844 | 2×2, 12px gap | ≈167×88 |
| 768×1024 | 4 across, 14px gap | ≈164×96 |
| 1024×768 | 4 across, 16px gap | ≈158×96 |
| 1280×800 | 4 across, 16px gap | ≈156×104 |

- Each cell: 11px uppercase label (`Encounters cleared`, `Turns`, `Cards added`,
  `Damage taken`) over a 26px phone / 30px table display numeral. Values stay
  `dt`/`dd` pairs inside `.run-result__stat`, in this order.
- Cells are separated by brass-on-paper hairlines, never by grey rules and never
  by colour alone; numbers are text, so the record survives forced-colors.
- `Encounters cleared` keeps its `N of M` value form.

### 5.3 Best-run ledger

- Present only when `stats !== null`; when it is null the sheet is omitted
  entirely. No empty sheet, no "unavailable" placeholder: a run with no record
  simply has no record section.
- Three items — `Furthest encounter` (`N of M`), `Boss clears`, `Fewest
  completed turns` — three across at ≥768, three 56px rows at phone.
- `Fewest completed turns` renders `—` (U+2014) when `bestCompletedTurns` is
  null.
- `New best` is a 28px wax seal with the words `New best` in parchment ink at
  11px uppercase, positioned in the sheet's top-right corner, vertically aligned
  with the `Best run` heading. It is text, not a colour wash, so it survives
  forced-colors.
- The save-failure line sits at the foot of this sheet with a 2px danger left
  rule, 13px, exact copy `This record could not be saved; it applies to this
  session only.` It is static text, not a live region.

---

## 6. Duel results

Both are verdict plaques on the slate, `45rem` (720px) max, centred, with no
paper and no ledger.

### 6.1 Round result

```
[data-duel-result="round"]
├─ eyebrow           Local Duel · Round N
├─ h1                Player 1 wins round 1      (tabindex="-1")
├─ result__score     Series 1–0                 (.duel-result__score)
├─ result__series    the three-pip strip from #10 §4.9
├─ result__next      Next round: Player 2 opens.
├─ result__copy      Rounds reset health, defense, statuses, hands and the field.
│                    The next round shuffles from its own seed.
└─ Next Round        ember 48px, full width at phone, inline at ≥768
```

- The next opener is the deterministic public first player from #10 §8.2
  (`nextPlayer`); it is text, never a pip interpretation.
- The reset sentence is unchanged.
- No hand, health, defense, field, log, deck or card name appears on this route.

### 6.2 Match result

```
[data-duel-result="match"]
├─ eyebrow           Local Duel · Best of three
├─ h1                Player 1 wins the match   (tabindex="-1")
├─ result__score     Final score 2–0           (.duel-result__score)
├─ result__series    the same three-pip strip
└─ result__actions
   ├─ Rematch        ember 48px (primary)
   ├─ Change decks   brass 44px (secondary)
   └─ Menu           quiet 44px
```

- Three actions across at ≥768 (16px gap, 12px at 768); stacked full width at
  phone (`Rematch`, `Change decks`, `Menu`, 12px/10px gap).
- The strip is sourced from `roundWinners` (#10 §8.2); each pip is named by its
  round winner and is not colour-only.
- `Rematch` keeps both locked decks and returns to privacy for round 1;
  `Change decks` returns to a fresh step 1; `Menu` discards the match. No
  confirmation dialog.
- No per-round health, turn or log history is added.

---

## 7. Geometry reference

Page boxes; documents and results scroll, so heights are content-driven and not
budgeted. Widths and paddings are the target.

| Viewport | Page padding | Column | h1 | Sheet padding | Contents | Section gap |
| --- | --- | --- | --- | --- | --- | --- |
| 375×667 | 16px 10px | 355px | 32px | 20px | strip 44px | 28px |
| 390×844 | 16px 12px | 358px | 34px | 20px | strip 44px | 28px |
| 768×1024 | 24px 16px | 672px sheet / 720px result | 40px | 32px | strip 44px | 32px |
| 1024×768 | 32px 20px | 224 + 24 + 672 | 40px | 32px | rail 224px | 40px |
| 1280×800 | 48px 24px | 224 + 24 + 672 | 44px | 40px | rail 224px | 48px |

- Result column: `min(100%, 45rem)` centred, page padding as above; outcome
  block padding 20px at phone, 32px at 768, 40px at 1024 and 48px at 1280;
  ledger sheets use 20px at phone, 32px at 768 and 40px at ≥1024.
- At 1024 the content column is 984px: 224 + 24 + 672 = 920, leaving 64px slack.
  At 1280 it is 1080px, leaving 160px slack — the sheet stays at 42rem rather
  than stretching.
- Nothing on these routes exceeds the viewport width at any of the five targets;
  no horizontal scroll and no clipped text.

---

## 8. Keyboard, focus, announcements and motion

### 8.1 Route focus

One shared rule in `App.tsx`, applied to every route (not just these five):
on mount, focus the route's `h1` (`tabindex="-1"`). Re-renders, setting toggles
and contents jumps never re-run it.

| Route | Focus on mount |
| --- | --- |
| `how-to-play` | `How to Play` h1 |
| `settings` | `Settings` h1 |
| `run-result` | `Run complete` / `Run over` h1 |
| `round-result` | `Player N wins round R` h1 |
| `match-result` | `Player N wins the match` h1 |
| (unchanged) `battle`, `duel-setup`, `privacy`, `reward`, `solo-setup`, `run-overview`, `menu` | see #8/#9/#10; the shared rule must not fight their documented focus |

This closes a gap: no route focus exists in the current build, while #9 and #10
already assume it.

### 8.2 Tab order

- How to Play (<1024): skip link → `Back` → `Contents` → the six links (only
  while open) → `Back to menu`.
- How to Play (≥1024): skip link → `Back` → the six rail links → `Back to menu`.
- Settings: skip link → `Back` → `Sound` → `Reduce motion`. The notice is not
  focusable.
- Run result: skip link → `New Run` → `Menu`.
- Round result: skip link → `Next Round`.
- Match result: skip link → `Rematch` → `Change decks` → `Menu`.
- No positive `tabindex`; native buttons and links; Enter/Space activate.

### 8.3 Announcements

- The app keeps **one** polite `role="status"`. The settings storage notice loses
  its own `role="status"` (Q6), so the storage-unavailable state can no longer
  produce two live regions.
- Duel results announce exactly once when the route settles, per #10 §6.3:
  `Player 1 wins round 1. 1–0.` and `Player 1 wins the match. 2–0.`
- The run result adds **no** live line: its h1 and outcome line are focused and
  read on arrival, and a sentence would duplicate them.
- How to Play and Settings announce nothing on mount; contents jumps, disclosure
  open/close and switch toggles are not announced by the app (focus and native
  switch state already speak).
- No announcement for hover, focus, scroll or re-render.

### 8.4 Motion

- Only two transitions exist on these screens: the 120ms hover/focus lift on
  `Back`, the actions and the document links, and the 120ms switch thumb travel.
- The contents disclosure opens and closes instantly at every setting; it is
  never height-animated.
- Scroll is never smooth: no `scroll-behavior: smooth` anywhere; jump links move
  focus and let the browser scroll.
- Reduced motion (OS preference or `[data-reduced-motion="true"]`) removes both
  transitions and every transform; the same information stays visible and no
  state depends on an animation finishing.
- `prefers-contrast: more` and `forced-colors: active` take the token branches:
  materials become `none`, the sheet becomes `Canvas` with `CanvasText` rules,
  the seals and switch keep their text words.

---

## 9. State matrix

| Surface | Default | Empty / unavailable | Disabled | Error |
| --- | --- | --- | --- | --- |
| How to Play | Six sections, rail or strip | n/a — static document | n/a | n/a |
| Settings | Two switches at their resolved values | Storage unavailable → static notice, switches still work in memory | n/a | Never throws; storage failure is the notice |
| Run result — victory | `Run complete`, seal, totals, best sheet | `stats === null` → best sheet omitted | n/a | Save failure → note inside the best sheet |
| Run result — defeat | `Run over`, seal, totals, best sheet | same | n/a | same |
| Round result | Winner, score, strip, next opener, reset line | n/a | n/a | n/a |
| Match result | Winner, final score, strip, three actions | n/a | n/a | n/a |
| Any reading route | No loading state: rendering is synchronous | — | — | — |

There is no loading spinner, no skeleton and no empty-document state on any of
these routes.

---

## 10. DOM and test contract

### 10.1 Must stay stable

| Contract | Selector / name |
| --- | --- |
| Router | `#main-content[data-screen="how-to-play"\|"settings"\|"run-result"\|"round-result"\|"match-result"]`, `role=main`, `tabindex="-1"` |
| How to Play | h1 `How to Play`; buttons `Back`, `Back to menu`; h2 `A turn in three steps`, `Energy`, `The field cycle`, `Defense`, `Statuses`, `Modes`; the cycle strings `Ember beats Frost`, `Frost beats Gale`, `Gale beats Stone`, `Stone beats Ember`; `three energy`, `Empowered`, `Countered`, `caps at 8`; `Focus`, `Weaken`, `Regen`; `Solo run`, `Local duel`, `best of three`; existing section ids `rules-*-title` |
| Settings | h1 `Settings`; `role="switch"` named `Sound` and `Reduce motion`; `aria-checked`; hints `Following your device setting.`, `Set on this device.`; notice text `/This browser cannot save settings/`; exactly one button named `Back` on the route |
| Run result | h1 `Run complete` / `Run over`; `.run-result__outcome` exact line; `.run-result__stat` `dt`/`dd` pairs for `Encounters cleared`, `Turns`, `Cards added`, `Damage taken`, `Furthest encounter`, `Boss clears`, `Fewest completed turns`; `.run-result__best`; buttons `New Run`, `Menu` |
| Duel results | `[data-duel-result="round"\|"match"]`; h1 `Player N wins round R` / `Player N wins the match`; `.duel-result__score` exact `Series x–y` / `Final score x–y`; buttons `Next Round`, `Rematch`, `Change decks`, `Menu`; `[data-series-score]`, `[data-series-pip]` from #10 |
| Shared | skip link `Skip to main content`; exactly one `role="status"`; no `aria-live` inside documents or results |
| Data | `data-screen`, `.document`, `.document__sheet`, `.result`, `.run-result__stat`, `.duel-result` |

### 10.2 Deliberate changes

Exactly four:

1. **Route h1 focus** on all five routes (new; §8.1), plus `tabindex="-1"` and
   `scroll-margin-top` on section headings.
2. **The settings storage notice loses `role="status"`** (Q6). One live region
   app-wide, unchanged elsewhere.
3. **How to Play gains the contents surface**: the sticky `Contents` disclosure
   below 1024, the rail at ≥1024, six anchors, jump-then-focus behaviour.
4. **New wrapper classes and styles** for documents and result ledgers
   (`.document*`, `.contents*`, `.field-cycle*`, `.result*`,
   `.result__ledger*`), replacing `.shell__panel` usage on these routes.

### 10.3 Tests that change

- `src/App.navigation.test.tsx`: keep every existing name and string; add the
  six contents links, the toggle's `aria-expanded`, the jump-to-heading focus,
  the disclosure closing after a jump, and route h1 focus for How to Play.
- `src/App.settings.test.tsx`: keep switch lookups, `aria-checked`, hints and the
  notice match; add "the notice is not a live region" and route h1 focus.
- `src/App.solo.test.tsx`: the `statValue(dt → parent dd)` helper keeps working;
  add ledger class/order assertions and run-result h1 focus. Totals and best-run
  values are unchanged.
- `src/App.duel.test.tsx`: add the series strip, the next-opener line, the
  result announcements and h1 focus for both result routes (#10 already lists
  these; this spec confirms the reading layout does not alter them).
- `src/App.a11y.test.tsx`: add route focus for the five routes, the contents
  toggle's Escape/focus-return, `role="switch"` focus ring, and "one live region
  while the storage notice is shown".
- `tests/e2e/smoke.spec.ts`: How to Play `Back` still returns to the menu; add
  the contents jump at 375 and no horizontal scroll.
- `tests/e2e/responsive-a11y.spec.ts`: add How to Play, Settings, run result,
  round result and match result at 375/390/768/1024/1280 — no horizontal scroll,
  no clipped text, 44px targets, visible focus ring, sticky strip only below
  1024, rail at 1024/1280, reduced motion from both sources.
- New `tests/e2e/reading-screens.spec.ts`: contents open/jump/close and focus;
  the cycle's accessible beats text with decorative seals; the settings notice is
  non-live; the run-result ledgers at 375; the duel plaques carry no paper, no
  hand and no card name; exactly one live region on every reading route.

### 10.4 Tests that must not change semantically

Engine, controllers, `run/` and `persistence/` (including the settings schema and
stats record), `duel/match`, `duel/round`, battle-log derivation/text/validate,
content catalogs, the asset manifest, privacy and the battle board's `100svh`
contract.

---

## 11. Acceptance criteria

1. How to Play renders one 42rem parchment sheet on the slate with its existing
   copy verbatim, six anchored sections, and no horizontal page scroll at any of
   the five viewports.
2. At ≥1024 a 224px sticky contents rail sits left of the sheet; below 1024 a
   44px sticky `Contents` disclosure replaces it, and the rail/strip never both
   show.
3. Activating a contents link closes the disclosure, moves focus to the target
   `h2`, and leaves no hash or history entry; Escape closes the disclosure and
   returns focus to the button.
4. The field cycle shows five CSS element seals with the four `X beats Y`
   sentences visible and accessible, wrapping to a 2×2 grid at 375 without
   horizontal scroll.
5. Settings shows its two switches in one parchment sheet with 72×44 switches,
   ≥44px targets, the exact existing copy, and no third motion state.
6. The storage notice is a static, non-live note; the settings route and the app
   expose exactly one `role="status"` at all times.
7. The run result shows the outcome block on the slate, a 2×2 (phone) / 4-across
   (≥768) totals ledger, a best-run ledger only when a record exists, `New best`
   as a seal, and the save-failure note inside the best sheet.
8. The round and match results are plaques with the score line, the three-pip
   series strip, the next-opener line on the round result, and their documented
   actions — with no paper, no ledger, no hand, no card name and no log.
9. Every reading route focuses its `h1` on mount; the duel results announce their
   documented score line once; the run result, How to Play and Settings add no
   live line.
10. All targets are ≥44×44, the focus ring is visible on slate and paper,
    reduced motion removes the two transitions, forced-colors/high-contrast take
    the token branches, and only the tests listed in §10.3 change.

---

## 12. Resolved decisions

- **Results stay table verdicts, not paper documents.** The run result keeps the
  plaque + parchment ledger idiom; the duel results stay plaques. The document
  treatment is How to Play and Settings only, which resolves the conflict with
  #9 §6 and #10 §5.2 without reversing either.
- **How to Play is one continuous sheet** with a contents rail at ≥1024 and a
  collapsed `Contents` disclosure below; no accordions, no pagination, no
  scroll-spy and no `aria-current` in the contents.
- **The document is a 42rem parchment sheet** on the slate table, prose capped
  at 34rem / 16px / 1.6, 20–40px sheet padding, 28–48px section rhythm.
- **The field cycle is a CSS seal chain** with the beats sentences visible; no
  manifest art, no images, and a 2×2 wrap at 375 rather than horizontal scroll.
- **Settings keeps two switches** and adds no third "follow device" state. The
  persisted `reducedMotion: null` therefore remains reachable only before the
  first explicit toggle; changing that is a settings-model change and is out of
  scope for this overhaul.
- **The settings storage notice becomes static** (no `role="status"`), keeping
  its copy and its memory-only behaviour.
- **Route focus is implemented once for all routes**: each route focuses its
  `h1` on mount, and section headings receive focus from contents links.
- **Result announcements are asymmetric on purpose**: duel results announce
  their score line per #10 §6.3, the run result announces nothing because its
  heading and outcome line already say it.
- **Back actions:** How to Play keeps its masthead `Back` and its trailing
  `Back to menu`; Settings keeps only the masthead `Back`, because two controls
  named `Back` on one short page would collide in the accessible-name contract
  and duplicate the same action one screen apart.
- **No copy is rewritten** in How to Play or Settings; the redesign changes
  presentation only, and no cap chip or summary sentence is added that would
  restate the existing text.
- **Test migration is additive** except the four items in §10.2; class names,
  `dt`/`dd` stat pairs, switch roles/names and every asserted string survive.
