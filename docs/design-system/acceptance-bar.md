# Feels-like-a-game acceptance bar

**Status:** decision for wayfinder [#16](https://github.com/SixStringBny/fieldbound/issues/16).
Input to [#14](https://github.com/SixStringBny/fieldbound/issues/14) and the
definition of done for the execution tickets under
[#15](https://github.com/SixStringBny/fieldbound/issues/15).
**Builds on:** [design system](./README.md) · [battle screen](./battle-screen.md) ·
[solo flow](./solo-flow.md) · [duel flow](./duel-flow.md) ·
[reading screens](./reading-screens.md) · [motion and feedback](./motion-and-feedback.md) ·
[execution sequence #13](https://github.com/SixStringBny/fieldbound/issues/13).

This document turns the map's three priorities — *reads as a game, not a form*,
*one-handed clarity at 375px*, *desktop/tablet uses its space* — into checks a
reviewer can fail a build against. It adds no design decisions: every number it
tests is already owned by a spec, and every check cites that spec instead of
restating it.

---

## 1. How to use this bar

1. **Checks, not a second spec.** This is the only place checks are named. A
   check cites its source; if a source number changes, the check changes with it
   and this document is not edited to carry a copy of the value.
2. **A check is pass/fail with evidence.** Adjectives are not checks. "Feels
   premium" is not here; "the rail measures 288px at 1280" is.
3. **Stable ids.** Mechanical checks are `AB-<group><n>`; human checks are
   `H-<group><n>`. Ticket bodies, review records and test titles refer to these
   ids, never to prose descriptions.
4. **Two columns, two owners.** The mechanical column is decided by test output;
   the human column by a named person. No agent signs a human check, and a
   human check is never passed from a screenshot alone when the route can be
   played.
5. **The bar is fixed; the tests may move.** A check may be implemented by a new
   spec file or an extended one. Moving a test never changes a check's pass
   condition without amending this document.
6. **No waivers yet.** Until a waiver policy exists (open item in §11), a failing
   check fails the screen. An unmeetable check is amended here, not excused
   per screen.
7. **What this bar does not own.** Engine determinism, battle-log derivation and
   cap, dialogue determinism, persistence schemas, the 300KB gzip budget,
   same-origin and the subpath audit keep their existing gates. This document
   only adds the UI checks and points at those gates where a screen touches them.

---

## 2. The bar in one sentence

A screen passes when every mechanical check in its coverage row passes at the
five target viewports, and the human column signs it at 390×844, 768×1024 and
1280×800 — with no open concrete issue and no failing check.

**"Reads as a game"** has a testable meaning here: the route presents named game
objects in a scene, its primary action is a physical control, a change is
answered through at least two channels, and the composition uses the viewport it
was given. **"Reads as a form"** is the failure of one of those: a stack of
label/value rows, a text link where an action belongs, a value that changes with
no response, or a phone-width column adrift in a desktop viewport.

---

## 3. The three priorities as observables

### 3.1 Reads as a game, not a form

| Priority | Observable | Check |
| --- | --- | --- |
| Game objects are present | Each play route renders its spec's named objects (enemy, field, hand, deck table, dealt cards, verdict plaque, record ledger) | `AB-C1` |
| The action is a control, not a link | Exactly one primary action per route, rendered as the action seal, a real `button` with an accessible name | `AB-C2` |
| No form furniture on play surfaces | No `form`, `input`, `select`, `textarea`, `table` or `dl` on a play route; the only form controls in the product are the two Settings switches | `AB-C3` |
| The field is the physical centre | The field roundel exists exactly once on board routes and sits at the arena's centre | `AB-C4` |
| A stranger can read the screen | In five seconds the reviewer names the screen and its next action without reading body copy | `H-C1` |
| It looks like this game | Carved stone, parchment, brass rules and a wax-red action — not generic dark fantasy; placeholder art does not clash | `H-C2` |

### 3.2 One-handed clarity at 375

| Priority | Observable | Check |
| --- | --- | --- |
| The action is under the thumb | Every primary action sits fully inside the lowest 288px of a 375×667 viewport with ≥8px side margin | `AB-P1` |
| Nothing needs a second hand | Battle, duel board and privacy never page-scroll; scroll routes never scroll sideways; only the rack, log, drawer and detail sheet scroll | `AB-P2` |
| The hand behaves like a rack | Below 1024 the hand is a horizontal scroller with all five cards; at ≥1024 the rack scroller is gone | `AB-P3` |
| No zoom, no truncation | No ellipsis on card names, log lines or intent text; text floors hold; the detail sheet shows the full card | `AB-P4` |
| Holdable in one hand | On a real 375px device, the reviewer plays a turn with one thumb, reads five card names without zoom, and never scrolls the battle page | `H-P1` |

### 3.3 Desktop and tablet use their space

| Priority | Observable | Check |
| --- | --- | --- |
| Both axes are used | At ≥1024 each route's spec-named pair is side by side: arena + log rail, hub + bookmark, deck table + summary, reading document + contents rail, verdict + ledger | `AB-T1` |
| The board owns its cap | Board content ≤1080px, centred within 2px, no internal empty column wider than 240px at 1280 | `AB-T2` |
| The rail is a rail | 240px at 1024, 288px at 1280, sticky, stopping at the hand line | `AB-T3` |
| No phone composition at table width | At ≥1024 the rack, the phone footer strip and the single-column stack are absent from board routes | `AB-T4` |
| Nothing looks boxed | At 1024 and 1280 no screen reads as a phone app in a frame | `H-T1` |

---

## 4. Mechanical check catalogue

Every check runs against the committed production build. Chromium is the gate
engine; the tri-browser run at release covers the engine-sensitive checks marked
**(bis)**. Viewports are 375×667, 390×844, 768×1024, 1024×768, 1280×800 unless a
row narrows them.

### 4.1 Composition — `AB-C`

| ID | Applies to | Pass condition |
| --- | --- | --- |
| `AB-C1` | every route | The route's named objects from the spec exist and are exposed by role or accessible name: menu = the five entry points with Continue only under a validated save; solo setup = four deck cards, all ten card names, one `aria-pressed` selection; overview = four-step ladder with `aria-current` plus run health, deck size, turns and next enemy; reward = three distinct offers plus Heal 12 below 20; battle = **Battle**, the enemy name, the field region, **You**, **Your hand**, **Turn controls**, **Battle log**; run result = verdict plaque plus record ledger, best-run omitted when no record; duel setup = deck table, sealed step-2 marker, locked summary; privacy = the incoming player's name and one action; round result = winner, score, next opener, **Next Round**; match result = winner, final score, **Rematch**, **Change decks**, **Menu**; reading screens = masthead, reading document, contents surface. |
| `AB-C2` | every route | Exactly one element carries the action-seal treatment; it is a native `button` (or `role="button"` with keyboard parity) with an accessible name matching the route's named action in the spec. A text link, a card row or a clickable panel as the primary action fails. |
| `AB-C3` | every route | On play routes the DOM contains zero `form`, `input`, `select`, `textarea`, `table` and `dl` elements. On Settings the only form controls are the two 72×44 switch rows. |
| `AB-C4` | battle, duel board | Exactly one field roundel renders; its horizontal centre is within 1px of the arena's centre and its box lies between the enemy and player panels. No field roundel renders on any non-board route. |

### 4.2 Phone — `AB-P`

| ID | Applies to | Pass condition |
| --- | --- | --- |
| `AB-P1` | every play route at 375×667 and 390×844 | The primary action's box is fully inside the viewport, wholly below `height − 288px`, and ≥8px from each side edge. On scroll routes the action bar is sticky or fixed so this holds before any scrolling. |
| `AB-P2` | battle, duel board, privacy | `document.scrollHeight ≤ innerHeight + 1` and `document.scrollWidth ≤ innerWidth + 1` at all five viewports; vertical scrolling is confined to the rack, log, drawer and detail sheet. |
| `AB-P3` | battle, duel board below 1024 | Five card buttons render; the rack is the only element with `scrollWidth > clientWidth` in the hand; at 375 the fifth card is revealed by keyboard focus and by rack scroll. |
| `AB-P4` | every route | No rendered text uses `text-overflow: ellipsis` on card names, log lines or intent text; computed sizes hold the spec floors (≥11px uppercase labels, ≥12px body, 16px/1.6 reading prose); the detail sheet renders the card's full text. |

### 4.3 Game table — `AB-T`

| ID | Applies to | Pass condition |
| --- | --- | --- |
| `AB-T1` | every route at 1024×768 and 1280×800 | Where the spec names a pair, both regions render side by side with no vertical stacking: arena + log rail (board), hub + continue bookmark (menu), deck table + run summary (solo setup), reading document + contents rail (How to Play), verdict + ledger (run result). |
| `AB-T2` | board routes | Interactive board width ≤1080px; left and right gaps differ by ≤2px; no empty column or gutter wider than 240px inside the board at 1280. |
| `AB-T3` | board routes at ≥1024 | The log rail measures 240±1px at 1024 and 288±1px at 1280, is sticky, and its bottom stops at the hand line rather than scrolling under it. |
| `AB-T4` | board routes at ≥1024 | The hand rack scroller, the phone footer strip and the single-column stack are absent; the hand fan and the log rail are present. |

### 4.4 Geometry and overflow — `AB-G`

| ID | Applies to | Pass condition |
| --- | --- | --- |
| `AB-G1` | battle, duel board, privacy | No page scroll in either axis at all five viewports (the battle locks to `100svh`). |
| `AB-G2` | battle, duel board | Zone boxes, card widths (108 phone, 118 compact, 138 table), rail widths and detail-sheet bounds match the battle spec within ±8px. |
| `AB-G3` | every route | No text or focusable control is clipped: each text node's `scrollWidth ≤ clientWidth + 1` unless it lives in a designated scroller; the detail sheet's last control is reachable by scrolling; no `overflow: hidden` traps focusable content. |
| `AB-G4` | every route, all five viewports (bis) | `document.scrollWidth ≤ innerWidth + 1`; no horizontal page scroll anywhere. |
| `AB-G5` | every route, all five viewports (bis) | Every rendered interactive element measures ≥44×44 CSS px. |
| `AB-G6` | every route | Route change moves focus to the destination `h1`; focus is visible as the two-tone ring (2px gold plus inner edge, 2px offset) on slate and on paper; detail and privacy dialogs trap focus and return it to the invoker or the documented survivor. |

### 4.5 Accessibility — `AB-A`

| ID | Applies to | Pass condition |
| --- | --- | --- |
| `AB-A1` | every route at 375 and 1280 | `@axe-core/playwright` reports zero WCAG 2.1 A/AA violations. Suppressing a rule requires a one-line reason recorded here; the list starts empty. Axe is evidence, never a substitute for the human column. |
| `AB-A2` | every route | Every stateful control carries a glyph plus a word: affordability, selection, current step, element and outcome are never colour-only. |
| `AB-A3` | every route | Computed contrast ratios meet the token sheet's floors: ≥4.5:1 all text, ≥7:1 stat values and primary text, ≥3:1 interactive boundaries and glyphs. Any rendered pair not listed in the token sheet is measured before it ships. |
| `AB-A4` | battle, duel board | Exactly one polite live region; exactly one announcement per settled transition; the log is non-live; no second live region is added by a beat. |
| `AB-A5` | privacy | While privacy is mounted the DOM contains no board, hand, card face, card id, hand count, card back, meter, field or log — in text, `aria-label`, `title` or `alt` — at both phone and table widths. |
| `AB-A6` | battle, duel board | Reduced motion from the OS query and from the persisted override both still the board: every animated element reports `animationName: none`, durations ≤1ms, `transform: none`, and no impact number is rendered. |
| `AB-A7` | every route | `prefers-contrast: more` and `forced-colors: active` render as described by the token sheet: materials off, rules ≥1px, system colours, `Highlight` focus. |

### 4.6 Feedback — `AB-F`

| ID | Applies to | Pass condition |
| --- | --- | --- |
| `AB-F1` | battle, duel board | Exactly one feedback beat per settled transition with an observable delta; all parts start at t=0 and finish by 400ms; a refusal produces no beat. |
| `AB-F2` | battle, duel board | A health change shows the affected panel's flash and one net signed impact number anchored inside that panel, clamped so it covers no meter text, intent, control, roundel or other number; it does not change `scrollHeight`; it is `aria-hidden`. A defence change shows the chip instead. |
| `AB-F3` | battle, duel board | A new player turn shows the handoff beat, the intent reveal when a new plan appears, and a draw beat only for newly drawn cards; the opening hand never animates and expanding the plan list never re-animates. |
| `AB-F4` | battle, duel board | See the floor table in §5: at least two channels answer every observable change, one of them transient for health; a bare meter snap fails. |
| `AB-F5` | battle, duel board | No JS timer, interval, rAF, Web Animations API or animation library in the beat path; ≤8 animated elements and ≤2 impact numbers per beat; only `transform`, `opacity` and ≤300ms small-surface colour transitions animate; no `box-shadow` transition remains. A fast second play replaces the first number, and the log keeps both entries. |

### 4.7 Visual identity — `AB-V`

| ID | Applies to | Pass condition |
| --- | --- | --- |
| `AB-V1` | source | Components consume semantic tokens: no hex, `rgb()`, shadow, radius or duration literal outside `tokens.css`; component-local variables use the `--fb-<component>-` prefix. Raw palette reads only through the element bridge tokens. |
| `AB-V2` | every route | The identity is one warm slate table and one parchment material: no light theme, no alternate theme file, brass as the only rule colour, ember as the primary action fill. |
| `AB-V3` | every route | Art renders only through the manifest loader, behind the warm scrim, with its reserved aspect ratio; no remote URL; a missing file shows the labelled fallback; the swap contract holds. |
| `AB-V4` | every route | The display face is the self-hosted Fraunces 700 subset; body and UI use the system sans stack; no remote font request. |
| `AB-V5` | source and rendered route | The ban list in §6 is absent, checked by a source scan for the listed motifs plus a rendered check where the motif would show. |

### 4.8 Evidence — `AB-E`

| ID | Applies to | Pass condition |
| --- | --- | --- |
| `AB-E1` | every route | `docs/reviews/ui-overhaul/<route>.json` records the mechanical result with check ids and failing messages, the viewports exercised, the human sign-off (name, date, viewports) and every concrete issue. |
| `AB-E2` | every route, all five viewports | A full-page screenshot per route per viewport is captured on each run as a CI artifact named `<route>-<viewport>-<seed>-<sha>.png`. Artifacts are evidence, never committed baselines. |
| `AB-E3` | repository | No pixel-diff baseline exists and no screenshot is a pass/fail gate. |

---

## 5. Feedback floor per settled transition

"One beat" is the motion spec's unit; this table is the minimum density that
makes that beat read as a game responding rather than a form updating. A
**channel** is one of: transient visual (flash, number, chip, shift, handoff,
draw), durable log entry, one polite announcement, an existing sound cue.

| Settled transition | Required minimum | Timing |
| --- | --- | --- |
| Card played, health or defence moved | Flash on the affected panel + signed net number (or `+N DEF` chip) + log entry + announcement; the existing cue where one is defined | One beat, t=0, ≤400ms |
| End turn → enemy plan resolves | One beat folding every effect into one net number per target + handoff + log entry + announcement | One beat, t=0, ≤400ms |
| Enemy turn → player turn | Handoff + intent reveal when a new plan appears + draw beat only for newly drawn cards + log entry + announcement | One beat, t=0, ≤400ms |
| Field shift | Disc fade + brass ring; name and matchup text change instantly + log entry + announcement | 300ms, text never waits |
| Card drawn | Draw beat on the newly mounted cards only + log entry + announcement | 180ms |
| Refused action (unaffordable, wrong turn, battle over) | Announcement only; no beat, no number, no flash | Immediate |
| Victory or defeat | Header label instant + cue + log entry + announcement; no battle-screen animation | Immediate |
| Duel privacy mounted | Nothing: no beat, no announcement, board unmounted | — |
| Any observable change, reduced motion | Two non-motion channels: the changed value in place, the log entry and the announcement | ≤1ms |
| Any observable change, muted audio | Unchanged visual and text floor; sound is never the only channel | — |
| Reward selection | One polite announcement per selection; no beat | — |

Two rules follow and are checked by `AB-F4`:

1. **A change answered by one channel fails.** If the meter snaps and nothing
   else moves, the turn was a form update.
2. **Reduced motion lowers the floor, never the bar.** Motion channels are absent
   by design, so the floor becomes the changed value plus the durable record and
   announcement. A reduced-motion screen must never be failed for lacking a beat.

---

## 6. May not appear anywhere

The list is explicit so a reviewer can point at a violation instead of arguing
taste. `AB-V5` scans the source and the rendered route for each item.

| Banned | Why |
| --- | --- |
| Form-like rows as primary content on a play route: settings-style toggle rows, `<dl>` stat tables, label/value grids, `table`-based layout | Priority 1 — a table of rows is a form, not a table of cards. |
| A text link, card row or panel acting as the primary action | Priority 1 — the action must be a physical control. |
| Gothic or blackletter type, purple/blue gradients, skull or rune iconography, glassmorphism, neon glow, true black `#000` surfaces | "Generic dark fantasy" — the carved warm-slate identity is the alternative. |
| Codex spreads and rune-style intent blocks | Rejected as defaults when the direction was locked. |
| Live SVG turbulence or `feTurbulence` for material | Measured 106ms/frame in WebKit; materials are baked gradients and tile noise. |
| Unused space at 1024+: a phone-width column, a single stacked column, a gutter or empty region wider than 240px inside the board | Priority 3 — the game table must use its space. |
| A phone screen that needs two hands: a primary action above the thumb envelope, a vertical page scroll on the battle, a zoom step | Priority 2. |
| Horizontal page scroll, clipped information, truncation of card or log text | The measured no-scroll contract; information is never hidden to fit. |
| Hover-only affordances; colour-only state cues; a second live region; an animated log | Baseline accessibility and the single-announcement contract. |
| `box-shadow`, `filter`, layout-property transitions, JS timers or a choreographed multi-step turn | The motion performance envelope. |
| Remote fonts, remote assets, a light theme or an alternate theme file | Same-origin, manifest-only art, one identity. |
| Pixel-diff screenshot baselines | False failures from placeholder art and rasterisation; assertions decide pass/fail. |

---

## 7. Coverage matrix

`M` = mechanical checks required; `H` = human sign-off required; `—` = not
applicable to that route. Mechanical checks run at all five viewports in
Chromium unless the check narrows them; `AB-C`, `AB-V` and `AB-A1/A2/A3/A7` run
on every route.

| Route | C | P | T | G | A | F | V | H |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Menu | M | M | M | M | M | — | M | H |
| How to Play | M | M | M | M | M | — | M | H |
| Settings | M | M | — | M | M | — | M | H |
| Solo setup | M | M | M | M | M | — | M | H |
| Run overview | M | M | M | M | M | — | M | H |
| Battle | M | M | M | M | M | M | M | H |
| Reward | M | M | M | M | M | — | M | H |
| Run result | M | M | M | M | M | — | M | H |
| Duel setup | M | M | M | M | M | — | M | H |
| Privacy | M | M | — | M | M | — | M | H |
| Round result | M | M | M | M | M | — | M | H |
| Match result | M | M | M | M | M | — | M | H |

Human checks map one-to-one per route: `H-C1` and `H-C2` everywhere, `H-P1` on
the phone pass, `H-T1` at 1024 and 1280. A route is not signed off until all four
have been answered.

---

## 8. Sign-off

| Column | Checks | Owner | Recorded in |
| --- | --- | --- | --- |
| Mechanical | `AB-C1`–`C4`, `AB-P1`–`P4`, `AB-T1`–`T4`, `AB-G1`–`G6`, `AB-A1`–`A7`, `AB-F1`–`F5`, `AB-V1`–`V5`, `AB-E1`–`E3` | qa-automation-engineer | test output plus `docs/reviews/ui-overhaul/<route>.json` |
| Human | `H-C1`, `H-C2`, `H-P1`, `H-T1` | project owner | the same record, with name, date and viewports actually used |

**Per-screen gate** (from the execution sequence): typecheck, unit tests,
Chromium E2E, five-viewport screenshots, frozen-test diff, and human review at
390×844, 768×1024 and 1280×800. A screen merges only with both columns green.

**Release gate:** the tri-browser E2E suite, `AB-G4`/`AB-G5` on all three
engines, `AB-A1` at 375 and 1280, the subpath build audit, the 300KB gzip budget,
and one human pass across all twelve routes including the real 375px device note.

**What a human may not do** is overrule a mechanical failure with taste, or pass
a route they did not play. **What a human may do** is fail a mechanical-green
route with one concrete issue (`H-C1`, `H-C2`, `H-P1`, `H-T1`), and that failure
is as binding as a red test.

---

## 9. Evidence

- **Screenshots:** five per route per run, full page, captured by the E2E job as
  artifacts (`AB-E2`). They feed the human column and are never compared
  byte-wise.
- **Review records:** one JSON per route under `docs/reviews/ui-overhaul/`,
  listing the check ids, the viewports, failures with measured values, and the
  human verdict. This is the artifact #15's completion is judged on (`AB-E1`).
- **Failure messages** carry the route, viewport, seed and expected value, as the
  existing suite does, so a red check is actionable without rerunning locally.
- **No baseline images** (`AB-E3`): the placeholder set will be swapped, and
  rasterisation differs across engines.

---

## 10. Sample failure language

These are the sentences a reviewer should be able to write from a red check:

- "Battle at 1024×768: the log rail measures 224px, not the 240px the battle spec
  requires (`AB-T3`)."
- "Reward at 375×667: the confirm control's box starts at y=352, above the
  288px thumb envelope (`AB-P1`)."
- "Battle at 1280×800: a 6-damage play changed the meter and nothing else — no
  flash, no number, no new log line (`AB-F2`, `AB-F4`)."
- "Menu at 1280×800: the hub renders as one 480px column with 300px of dead
  space either side; no second region (`AB-T1`, `AB-T2`)."
- "Privacy at 375×667: `card-back` appears in the DOM while the privacy screen is
  mounted (`AB-A5`)."
- "Settings: the switch row is a 44px-tall control inside a form grid of five
  rows on the menu's play surface (`AB-C3`)."

---

## 11. Open items handed to the assembly ticket

These are deliberately not decided here; each needs an owner before #15 starts:

1. **Waiver policy** — whether a check may ever be waived per screen, by whom,
   and for how long. Until then §1.6 applies: no waivers.
2. **Review record schema** — the exact keys of
   `docs/reviews/ui-overhaul/<route>.json`, reconciled with the existing
   `docs/reviews/*.json` shape.
3. **Check-to-test mapping** — the owning spec file and test title for each
   `AB-*` check, so a red check names its test directly.
4. **Any route whose spec states no surface width** — #14 supplies the width the
   route's `AB-T1`/`AB-T2` should measure, rather than this bar inventing one.

---

## 12. Resolved decisions

- **One bar, one document.** `docs/design-system/acceptance-bar.md` holds numbered
  checks; the screen specs keep their numbers and this document cites them.
- **Mechanical and human are separate columns with separate owners.** Tests
  decide the first, the project owner decides the second, and no agent signs a
  human check.
- **"Game not form" is four structural invariants plus two human judgements**,
  not an adjective: named objects, a physical primary action, no form furniture
  on play surfaces, the field at the centre.
- **One-handed has a numeric envelope:** primary actions inside the lowest 288px
  at 375×667, ≥8px side margin, no battle page scroll, no zoom, no truncation.
- **Table width is tested as a composition, not a fill percentage:** named pairs
  side by side at ≥1024, a 1080px board centred within 2px, a 240/288px rail, no
  empty gutter wider than 240px.
- **The feedback floor is two channels, one of them transient for health**, with
  the reduced-motion branch lowering the floor to non-motion channels rather
  than failing the accessibility contract.
- **The ban list is explicit** and includes form-like rows, generic dark-fantasy
  chrome, unused table space, two-handed phone screens and pixel-diff baselines.
- **Evidence is assertions plus artifacts, never pixel baselines.**
- **All twelve routes carry the bar**; Settings and How to Play are held to the
  reading-screen contract rather than the play-surface composition checks.
