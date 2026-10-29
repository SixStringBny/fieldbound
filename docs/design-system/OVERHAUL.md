# Fieldbound UI overhaul — assembled build-ready spec

**Status:** awaiting human sign-off (§11). Not implemented; [#15](https://github.com/SixStringBny/fieldbound/issues/15) executes it.
**Assembly:** [Assemble the build-ready overhaul spec and get sign-off](https://github.com/SixStringBny/fieldbound/issues/14), from the decisions in [#5](https://github.com/SixStringBny/fieldbound/issues/5)–[#13](https://github.com/SixStringBny/fieldbound/issues/13) and [#16](https://github.com/SixStringBny/fieldbound/issues/16).
**Prototype (evidence):** [refined battle screen](https://github.com/SixStringBny/fieldbound/tree/prototype/battle-refined/.prototype/battle-refined), commit `99c5291`.

This file is the **head of `docs/design-system/`** and the single handoff for the overhaul. The documents below it are normative and own their numbers; this head states the order, the cross-cutting contracts, the route map and the execution chapter. Where this head and a screen document differ, the screen document wins for its screen and the acceptance bar (as amended in §13) wins for a check.

---

## 0. Reading order and authority

| Order | Document | Owns |
| --- | --- | --- |
| 1 | **OVERHAUL.md** (this file) | assembly, route map, cross-cutting contracts, test migration, execution sequence, sign-off |
| 2 | [`README.md`](./README.md) | identity, token architecture, palette/contrast, materials, type, spacing, interaction states, component rules, accessibility contract |
| 3 | [`tokens.css`](./tokens.css) | the machine-readable token block; promoted to `src/styles/tokens.css` by ticket 1 |
| 4 | [`battle-screen.md`](./battle-screen.md) | battle board geometry, zones, height budgets, card face, battle DOM/role contract |
| 5 | [`solo-flow.md`](./solo-flow.md) | menu, solo setup, run overview, reward, shared result shell |
| 6 | [`duel-flow.md`](./duel-flow.md) | duel setup, privacy handover, duel board, series strip, duel results |
| 7 | [`reading-screens.md`](./reading-screens.md) | How to Play, Settings, run result, round result, match result; route `h1` focus |
| 8 | [`motion-and-feedback.md`](./motion-and-feedback.md) | `diffBattleState`, feedback derivation, beat vocabulary, reduced-motion branch |
| 9 | [`acceptance-bar.md`](./acceptance-bar.md) | numbered `AB-*` / `H-*` checks, evidence, sign-off ownership, assembly resolutions |

Rule: a number lives in exactly one place. A check cites its source; this head cites a section rather than copying a table. The only duplicated numbers are the invariants in §5, which every screen document already repeats because they are global.

---

## 1. Destination

One approved, build-ready UI overhaul for Fieldbound: a locked visual direction, a token-backed design system, responsive compositions for phone and game table, screen-by-screen specs for all twelve routes, motion and feedback, and a throwaway battle prototype proving 390×844 and 1280×800 — followed by an in-map execution phase that ships it while preserving the accessibility, privacy, same-origin and 300KB gzip contracts.

Sign-off on this document is the boundary: before it, the work is decisions; after it, [#15](https://github.com/SixStringBny/fieldbound/issues/15) may create and work implementation tickets.

---

## 2. Scope

**In scope**

- Visual, layout and interaction redesign of the twelve existing routes.
- Two compositions: portrait-first phone below 1024px, game table at 1024px and above.
- One warmed slate/parchment identity: C's carved arena and field centre, A's parchment card faces and hand, B's dedicated field roundel.
- Token system, typography, materials, motion and feedback, route focus, one polite live region.
- Deliberate, additive test migration under the policy in §7.

**Out of scope** (from the map; unchanged here)

- Final art production or commissioned replacement SVGs — the 41 manifest placeholders and the swap contract stay.
- A native wrapper, Electron, PWA/offline work, or a localisation pass.
- New screens, modes, rules, balance changes, deck editing or meta-progression.
- Online multiplayer, accounts, cloud saves or telemetry.
- New music, voice or audio assets; new sound cues.
- Changing the battle-log cap (80), dialogue determinism, or any persistence schema.
- New UI frameworks or CSS-in-JS; plain CSS with custom properties.
- A third "follow device" motion state or a settings reset action.
- A light theme, an alternate theme file, or a pixel-diff screenshot baseline.

---

## 3. The sign-off gate

Sign-off means a human has:

1. **Reviewed the prototype at 390×844 and 1280×800.** Open
   `.prototype/battle-refined/index.html` in a desktop browser, set the viewport to
   390×844 and then 1280×800, and step through the ten states (`turn`, `draw`,
   `play`, `damage`, `shift`, `intent`, `detail`, `focus`, `reduced`, `log`) with
   the arrow keys or the prototype bar. `?chrome=0` hides the bar; `?motion=reduce`
   forces the reduced branch. Screenshot-only review is not sufficient when the
   prototype can be played. A local copy is at
   `C:\Users\benjm\AppData\Local\Temp\opencode\fb-battle-prototype\.prototype\battle-refined\index.html`
   (worktree of `prototype/battle-refined`); the per-state frames are also on the
   branch under
   [`screenshots/`](https://github.com/SixStringBny/fieldbound/tree/prototype/battle-refined/.prototype/battle-refined/screenshots)
   as `phone-390x844-<state>.png` and `table-1280x800-<state>.png`.
2. **Read this head and skim the screen documents it points at** — at minimum
   §4–§9 here, plus `battle-screen.md`, `solo-flow.md`, `duel-flow.md`,
   `reading-screens.md`, `motion-and-feedback.md`, and the amended acceptance bar.
3. **Approved the spec for execution**, with any concrete issue named by check id
   or spec section.

What sign-off authorises: creation of the execution tickets in §8 and the
implementation work. It does not authorise changing a locked decision; that needs
the amendment path in §10. What it does not do: it is not the per-screen human
review, which the project owner still performs on each screen at 390×844,
768×1024 and 1280×800 (`H-C1`, `H-C2`, `H-P1`, `H-T1`).

The sign-off is recorded in §11 and mirrored in the [#14](https://github.com/SixStringBny/fieldbound/issues/14) resolution comment.

---

## 4. Route map

Twelve routes, one shell. "Idiom" is the surface treatment; "pair" is the
side-by-side pair at ≥1024 where the spec names one (checked by `AB-T1`);
"scroll" is the page-scroll contract.

| Route (`data-screen`) | Idiom | Pair at ≥1024 | Page scroll | Primary action | Spec |
| --- | --- | --- | --- | --- | --- |
| `menu` | table hub | hero + hub | vertical | **Play Solo** (mode card) | solo-flow §2 |
| `how-to-play` | reading document | contents rail + sheet | vertical | **Back to menu** | reading-screens §2–§3 |
| `settings` | reading document | — (one 42rem sheet) | vertical | **Back** | reading-screens §2, §4 |
| `solo-setup` | deck table | — (2×2 grid + sticky bar) | vertical | **Start Run** | solo-flow §3 |
| `run-overview` | table ladder | ladder + status/next column | vertical | **Next Battle** / **Back to battle** | solo-flow §4 |
| `battle` | battle board | arena + log rail | **none** (`100svh`) | **End Turn** (Play in the sheet) | battle-screen |
| `reward` | dealt cards | — (three across + sticky confirm) | vertical | **Take …** | solo-flow §5 |
| `run-result` | verdict + record | — (verdict above ledgers) | vertical | **New Run** | reading-screens §5 |
| `duel-setup` | deck table | — (grid + sealed marker + sticky bar) | vertical | **Confirm … deck** / **Start Match** | duel-flow §2 |
| `privacy` | opaque handoff | — (one plaque) | **none** (fixed) | **I'm ready** | duel-flow §3 |
| `round-result` | verdict plaque | — | vertical | **Next Round** | duel-flow §5.1, reading-screens §6.1 |
| `match-result` | verdict plaque | — | vertical | **Rematch** | duel-flow §5.2, reading-screens §6.2 |

Every route is one `#main-content[data-screen]` with `role="main"`; one app-wide
polite `role="status"`; the skip link and one-line shell stay. Route mount focuses
the route's `h1` (`tabindex="-1"`), implemented once in `App.tsx`
(reading-screens §8.1). Re-renders never steal focus.

The route inventory is checked by `AB-C1`; the primary action by `AB-C2`; the
pair by `AB-T1`; the surface width by `AB-T2` and the bar's route-width table
(§13.4).

---

## 5. Cross-cutting contracts

These bind every screen. Each is owned by the document named; the copies here are
the invariants an implementer must not lose while working screen by screen.

### 5.1 Identity

One warm slate table, one parchment material, brass as the only rule colour,
ember as the primary action fill, a wax-red action seal, carved stone and a brass
field roundel. No light theme and no alternate theme file. High contrast is
system-driven (`prefers-contrast: more`, `forced-colors: active`), never a toggle.
Owner: README §1, §3, §4, §8.

### 5.2 Tokens

Every global token is `--fb-*` and flows raw palette → semantic role → component.
Components consume semantic tokens only: no hex, `rgb()`, shadow, radius or
duration literal outside `tokens.css`, except the element bridge tokens and the
material recipes. `--fb-radius` (the duplicate) and the legacy light palette names
are deleted, not aliased. Owner: README §2; machine-readable in `tokens.css`;
promotion and the token contract test are ticket 1.

### 5.3 Typography and floors

Fraunces 700 (self-hosted OFL subset, `Fraunces Fieldbound`, 11,288 B) for the
wordmark, titles and card names; the system sans stack for body/UI; the system
symbol stack for glyphs. No body text below 12px; 11px is uppercase labels only;
reading prose is 16px/1.6; numerals are tabular. Display face is never body text.
Owner: README §5; typeface evidence in [#3](https://github.com/SixStringBny/fieldbound/issues/3).

### 5.4 Space, shape, rules

4px scale; radii 3/5/8/12/16/pill; brass 1px rules, 2px for selected/current;
elevation from the five-step scale plus the inset rim; materials are baked
gradients and tile noise — **no live SVG turbulence, no `feTurbulence`, no canvas
texture**. Owner: README §4, §6.

### 5.5 Interaction states

The state vocabulary is default, hover (`@media (hover: hover)` only), focus-visible,
pressed, disabled, selected (`aria-selected`/`aria-pressed`/`data-selected`),
unaffordable (`data-affordable="false"`) and current (`aria-current`). States are
expressed with native attributes where one exists. Focus is the two-tone recipe
(2px gold outline, 2px offset, inner light/dark halo) on slate and paper alike;
`outline: none` without a replacement is forbidden. No hover-only affordance; no
opacity-only disabled state; no colour-only cue. Single-instance rule: a control
(player summary, End Turn, latest log line, Log toggle, log history) renders once
and is placed by grid/order at each width — never duplicated for phone and table.
Owner: README §7; battle-screen §1.3, §5.

### 5.6 Composition and scroll

- **<1024px — phone/tablet:** single column, portrait-first. Tablet is
  width-driven, not device-driven; 700–1023 and 768 behave as the expanded phone.
- **≥1024px — game table:** the spec's pair side by side, 1080px content cap
  centred, 240px rail at 1024–1279 and 288px at 1280+.
- **Battle and duel board** lock to `100svh` with no page scroll; only the hand
  rack, log rail/drawer, intent list and detail sheet scroll. `100dvh` is wrong
  (browser-chrome reflow); `100svh` is the measured unit.
- **All other routes** scroll vertically and never horizontally.
- Degradation order on the board: field absorbs slack → intent scrolls → status
  chips wrap → compact 136px cards under 700px height → internal scrollers → only
  below 600px viewport height may the page scroll, and never sideways.
- No zone clips text, numbers or controls; the only permitted ellipsis is the
  one-line latest log strip (full text in history) and a card name on the face
  (full name in the sheet).

Owner: battle-screen §1, §3; duel-flow §4.1–§4.2, §4.12; solo-flow §1.

### 5.7 Motion and feedback

One **feedback beat** per settled transition, every part starting at t=0 and
ending by 400ms. CSS keyframes and transitions only — no `setTimeout`,
`setInterval`, `requestAnimationFrame`, Web Animations API or animation library.
A newer beat cancels the running one; keyed overlays remount via `key={sequence}`
inside persistent panels. The vocabulary is draw, impact flash, signed net impact
number, defense chip, field shift, intent reveal and turn handoff; play is an
impact, not a departure. Only transform/opacity animate, plus ≤300ms colour
transitions on small surfaces; `box-shadow` transitions are removed. Reduced
motion (OS or `[data-reduced-motion="true"]`) is an absolute branch: no beat, no
impact-number element in the DOM, same information visible. One shared
`diffBattleState` feeds the log, announcement, cues and feedback with
output-identical results. No new sound cues. Owner: motion-and-feedback.md.

### 5.8 Accessibility

- Every interactive target ≥44×44; 8px between adjacent targets where possible;
  fan hit boxes never overlap.
- Full keyboard path on every route; no positive `tabindex`; native buttons.
- Route `h1` focus on mount; explicit focus return after a sheet/dialog closes
  (to the invoking card, else the next card, else End Turn) and after the log
  drawer closes (to the toggle).
- Dialogs (card detail, privacy) trap focus; the log drawer does not.
- Exactly **one** polite `role="status"` app-wide, one sentence per settled
  transition; the log is never live and never animated; the latest-line strip is
  a `role="group"` labelled "Latest battle log entry", not a live region
  (battle-screen §2.6).
- Contrast floors: ≥4.5:1 all text, ≥7:1 stat values and primary text, ≥3:1
  boundaries/glyphs, measured pairs only (README §3.3); every state carries a
  glyph plus a word.
- `prefers-contrast: more` and `forced-colors: active` take the token branches;
  materials off, system colours, `Highlight` focus.
- Zero axe-core WCAG 2.1 A/AA violations at 375 and 1280 (`AB-A1`).

Owner: README §3, §11; battle-screen §5; reading-screens §8; acceptance-bar §4.5.

### 5.9 Privacy

The duel privacy handover is a **separate route**, not an overlay. While
`#main-content[data-screen="privacy"]` is mounted the battle route is not
rendered. The DOM must contain no board, arena, panel, hand, card face, card id,
instance id, hand count, card back, meter, field, log, intent, deck name,
health/defense/energy, turn number, or catalog card name — in text, `aria-label`,
`title`, `alt`, CSS or `data-*`. `aria-hidden`, `visibility`, clipping and CSS
covers do not count: the elements must not exist. The privacy view carries only
`viewer`, `round` and `wins`; one action (`I'm ready`) traps focus; Escape is a
no-op; no auto-dismiss. After dismissal the board mounts with only the viewer's
hand and public-only log entries. Owner: duel-flow §3; battle-screen §5.4.

### 5.10 Art, fonts, offline and budget

- The 41 placeholder SVGs and the manifest swap contract are untouched; art
  renders only through the manifest loader, behind the warm scrim, in the
  reserved aspect ratio, with a labelled fallback. No remote URL, no replacement
  art, no recolour.
- One self-hosted WOFF2 subset; no remote font request; licence committed; font
  bytes sit outside the JS/CSS budget.
- Same-origin only; the subpath build and origin audit (`scripts/check-build.mjs`)
  and the 300KB gzip initial JS+CSS budget (`scripts/check-budget.mjs`) keep
  their existing gates.
- Web only: GitHub Pages, the local static build, desktop/tablet/mobile browsers.
  No wrapper, no PWA.

Owner: README §8, §10; map notes; release gates in §8.

---

## 6. Screen sheets

Each sheet is the build order for one route: the objects, the anchors, the states
and the tests that may change. Numbers live in the cited section.

### 6.1 Menu — the table hub

- **Objects:** wordmark + tagline + run plaque in the hero; five entries in the
  hub — **Play Solo** and **Local Duel** as mode cards, **Continue Run** as a
  parchment bookmark (only with a validated save), **How to Play** and
  **Settings** as quiet brass rows. No form rows, no equal-weight links.
- **Anchors:** two columns 1.05fr/0.95fr at ≥1024 (hub 512@1280, 440@1024),
  one column below; entries 150/140/76/72px tall by width; sticky nothing.
- **States:** no save → no Continue entry and a quiet "No run in progress" line;
  valid save → exact hint `Encounter N of 4 · X of 40 health` + `Ember deck · 11
  cards`; corrupt save behaves as no save. No loading state.
- **Focus/tab:** hero not focusable; entries in DOM order; route `h1`
  **Fieldbound**; `nav` **Main menu**.
- **Tests that change:** `App.navigation.test.tsx`, `App.test.tsx`,
  `smoke.spec.ts`. Spec: solo-flow §2, §9; bar `AB-C1`, `AB-T1`.

### 6.2 How to Play — the reading document

- **Objects:** masthead (eyebrow, **Back**, h1, tagline) on the slate; a 42rem
  parchment sheet with the six existing sections verbatim; a contents surface.
- **Anchors:** ≥1024 contents rail 224px + 24px + 672px sheet; below 1024 a 44px
  sticky **Contents** disclosure that pushes the sheet down; sheet padding
  20/32/40px; prose 16px/1.6 capped at 34rem; section rhythm 28–48px.
- **States:** static document; no accordions, pagination, scroll-spy or
  `aria-current` in contents. Jump = focus target `h2`, no hash, no history;
  Escape closes the disclosure and returns focus to the button.
- **Focus/tab:** skip → **Back** → six contents links (rail, or disclosure while
  open) → **Back to menu**.
- **Tests that change:** `App.navigation.test.tsx`, `App.a11y.test.tsx`,
  `smoke.spec.ts`, `responsive-a11y.spec.ts`; new `reading-screens.spec.ts`.
  Spec: reading-screens §2–§3, §10.

### 6.3 Settings — the reading document

- **Objects:** the same masthead; one 42rem sheet with two rows: **Sound** and
  **Reduce motion**, each a label + hint + 72×44 switch; a static storage notice
  only when storage is unavailable.
- **Anchors:** single sheet, no contents rail, nothing sticky; rows ≥72px phone /
  88px ≥768; one **Back** only.
- **States:** exactly two switches; no third "follow device" state, no reset, no
  storage row; the notice loses its `role="status"` so the app keeps exactly one
  live region; toggling writes immediately through the existing store.
- **Focus/tab:** **Back** → **Sound** → **Reduce motion**; notice not focusable.
- **Tests that change:** `App.settings.test.tsx`, `App.a11y.test.tsx`,
  `responsive-a11y.spec.ts`. Spec: reading-screens §4, §10.2 (item 2).

### 6.4 Solo setup — the physical deck table

- **Objects:** four deck cards (Ember, Frost, Gale, Stone) as native buttons with
  `aria-pressed`, element seal, deck name, identity line, `10 cards · 2 Shift
  cards`, all ten card names at 12px in two columns, Shift tagged in words; a
  sticky action bar with **Start Run** and **Back to menu**.
- **Anchors:** 2×2 at ≥768 (512×260@1280 → 340×280@768), one column below
  (351×280@375); action bar 72px + safe area; page reserves its height so the
  last card is never covered.
- **States:** no selection → Start disabled with the exact hint; one selection;
  Start dispatches once and disables on press; missing deck → labelled
  unavailable card, Start stays disabled.
- **Focus/tab:** deck cards in catalog order → **Start Run** → **Back to menu**;
  route `h1` **Solo Run**; one polite selection announcement.
- **Tests that change:** `App.solo.test.tsx`, `App.navigation.test.tsx`,
  `App.a11y.test.tsx`, `solo-run.spec.ts`. Spec: solo-flow §3, §9.

### 6.5 Run overview — the ladder

- **Objects:** an `ol` **Run progress** with four parchment steps (portrait,
  name, `Cleared`/`Current`/`Upcoming`, element, max health) joined by a brass
  connector, `aria-current="step"` on the current step; a run status panel
  (meter **Run health**, `Deck N cards`, `Turns N`); a next/current enemy panel;
  **Next Battle** / **Back to battle** and **Menu**.
- **Anchors:** two columns at ≥1024 (720/320@1280, 660/300@1024); four across at
  ≥768; vertical 68–72px rows below 768 with the actions in a sticky bottom bar.
- **States:** between battles → Next enabled; during a battle → Back to battle;
  no next enemy → enemy panel hidden, Next disabled; terminal runs go to the
  result route; corrupt run never mounts here.
- **Focus/tab:** primary → **Menu**; ladder static; route `h1` **Run overview**.
- **Tests that change:** `App.solo.test.tsx`, `App.a11y.test.tsx`,
  `solo-run.spec.ts`. Spec: solo-flow §4, §9.

### 6.6 Battle — phone rack and game table

- **Objects:** header (wordmark, `Turn N · Your move`, **Run overview**, **Leave**);
  enemy panel with public intent; the field roundel at the arena's centre; the
  player region **You**; the hand; the log rail (table) or latest line + **Log**
  toggle + drawer (below 1024); the card detail sheet.
- **Anchors:** board = `100svh`, full-width region, 1080px cap; table = arena 1fr
  + rail (288@1280, 240@1024), hand spanning both below; phone = 44px header,
  enemy 165–200, field absorbs slack (floor 150), 108px rack (~3.2 visible),
  footer with latest line + Log + End Turn; cards 138×194 table / 118×168 compact
  / 108×152 phone / 108×136 under 700px height. Five reference viewports and the
  exact zone boxes are battle-screen §1.1; the height floors and degradation
  order are §3.
- **States:** empty hand, empty log, no plan, disabled, unaffordable, lethal,
  battle end — battle-screen §6; duel adds no battle-end state (settled rounds
  navigate away).
- **Focus/tab:** table: skip → Run overview → Leave → cards → End Turn; phone:
  skip → Run overview → Leave → intent expand → cards → **Log** → **End Turn**.
  Detail sheet traps focus and returns it to the invoking card → next card → End
  Turn. One polite announcement per settled transition; log non-live.
- **Tests that change:** `BattleBoard.test.tsx`, `App.battle.test.tsx`,
  `App.a11y.test.tsx`, `App.battle-log.test.tsx`, `responsive-a11y.spec.ts`,
  `battle-log.spec.ts`; new `battle-screen.spec.ts`. Spec: battle-screen §7.

### 6.7 Reward — three dealt cards, then confirm

- **Objects:** exactly three offers (third is **Heal 12** when health < 20);
  selectable parchment cards with `aria-pressed`; a sticky confirm bar labelled
  with the choice.
- **Anchors:** three across at every width (220×300@1280 → 104×146@375); confirm
  bar 84–88px with safe-area padding and reserved page bottom.
- **States:** none selected → confirm disabled with the prompt; selected → lifted
  card + enabled `Take …`; missing card → labelled and disabled; invalid offers →
  labelled error, no confirm bar; confirmation dispatches exactly once and the
  route advances.
- **Deliberate interaction change:** selection and confirmation are two steps.
  The old immediate-choice helpers are rewritten (see §7).
- **Focus/tab:** offers in order → **Take …**; one polite announcement per
  selection, none for the confirmation (the overview `h1` focus announces it).
- **Tests that change:** `App.solo.test.tsx`, `App.a11y.test.tsx`,
  `solo-run.spec.ts`. Spec: solo-flow §5, §9.2.

### 6.8 Run result — verdict and record

- **Objects:** a slate outcome block (wax victory/defeat seal, eyebrow, h1,
  outcome line) above parchment ledgers: **Run totals** (four `dt`/`dd` stats,
  2×2 phone / 4-across ≥768) and **Best run** (only when a stats record exists;
  `New best` as a wax seal; save-failure line inside the sheet); **New Run** and
  **Menu**.
- **Anchors:** `min(100%, 45rem)` centred; outcome padding 20–48px; no paper
  verdict, no sticky; page scroll only.
- **States:** victory/defeat copy; `stats === null` → best sheet omitted entirely;
  `Fewest completed turns` renders `—` when null; save failure is static text,
  not a live region.
- **Focus/tab:** **New Run** → **Menu**; route `h1` focus; no live line (the h1
  and outcome line already say it).
- **Tests that change:** `App.solo.test.tsx`, `App.a11y.test.tsx`,
  `responsive-a11y.spec.ts`, new `reading-screens.spec.ts`. Spec:
  reading-screens §5.

### 6.9 Duel setup — two sealed choices

- **Objects:** the same deck table as solo; a step banner (`Player 2, look
  away.` / `Player 1 has chosen.`); at step 2 a sealed card-back marker and
  `Player 1's deck is locked` with no name/element; a summary with both locked
  cards, `Player 1: Ember` / `Player 2: Frost`, and **Start Match**; sticky
  **Confirm … deck** / **Back to menu**.
- **Anchors:** same grid as solo; marker 88px table / 96px phone; summary cards
  500×200@1280 → 351×160@375; action bar 80/112px + bottom reserve.
- **States:** no selection → confirm disabled with hint; one selection per step;
  step 2 exposes nothing about Player 1's pick; summary starts once; Back
  discards a partial choice; missing deck labelled unavailable.
- **Focus/tab:** route `h1` **Local Duel**; step change focuses the step `h2`;
  summary focuses its `h2`; one polite line per deliberate change; disabled
  confirm leaves the tab order.
- **Tests that change:** `App.duel.test.tsx`, `App.a11y.test.tsx`,
  `duel.spec.ts`, `responsive-a11y.spec.ts`. Spec: duel-flow §2, §8.

### 6.10 Privacy — the opaque handover

- **Objects:** a fixed, fully opaque slate surface with one parchment plaque:
  eyebrow `Local Duel · Round N`, h1 `Pass to Player N`, `Other player, look
  away.`, the public score line, and exactly one `I'm ready` (48px).
- **Anchors:** 480px plaque at ≥768, viewport −32px on phone; 24–32px padding;
  h1 34–44px; no page scroll (internal scroll only if the viewport is shorter
  than the plaque).
- **States and invariant:** the battle route is unmounted; the forbidden list in
  §5.9 applies; Escape is a no-op; no backdrop dismissal, timer or auto-advance.
- **Focus/tab:** focus **I'm ready** on mount; Tab cycles on it; on activation
  the board mounts and focus lands on the first card of the incoming hand (else
  End Turn); the polite line is `Pass the device to Player N.`
- **Tests that change:** `App.a11y.test.tsx`, `duel.spec.ts`,
  `responsive-a11y.spec.ts`, `helpers.ts`. Spec: duel-flow §3, §8.3.

### 6.11 Round result

- **Objects:** a 45rem verdict plaque: eyebrow, h1 `Player N wins round N`, the
  series strip + `Series x–y`, `Next round: Player N opens.`, the reset sentence,
  **Next Round**.
- **Anchors:** 720px plaque; actions ≥44px, full width at phone; page scroll
  allowed, no horizontal scroll.
- **States:** no hand, health, field, log, deck or card name survives here; the
  next opener is the deterministic public value.
- **Focus/tab:** route `h1`; **Next Round**; one announcement
  `Player 1 wins round 1. 1–0.`
- **Tests that change:** `App.duel.test.tsx`, `App.a11y.test.tsx`,
  `duel.spec.ts`, new `reading-screens.spec.ts`. Spec: duel-flow §5.1,
  reading-screens §6.1.

### 6.12 Match result

- **Objects:** the same plaque: eyebrow `Local Duel · Best of three`, h1
  `Player N wins the match`, `Final score x–y`, the series strip (each pip named
  by its round), **Rematch**, **Change decks**, **Menu**.
- **Anchors:** 720px; three actions across at ≥768, stacked at phone.
- **Behaviour:** Rematch keeps both locked decks and returns to privacy at 0–0;
  Change decks returns to a fresh step 1; Menu discards. No confirmation dialog,
  no per-round history.
- **Focus/tab:** route `h1`; Rematch → Change decks → Menu; one announcement
  `Player 1 wins the match. 2–0.`
- **Tests that change:** `App.duel.test.tsx`, `App.a11y.test.tsx`,
  `duel.spec.ts`, new `reading-screens.spec.ts`. Spec: duel-flow §5.2,
  reading-screens §6.2.

---

## 7. Test migration and frozen contracts

From [Decide the execution sequence and test migration policy](https://github.com/SixStringBny/fieldbound/issues/13) §3. This chapter is binding on every execution ticket.

### 7.1 Frozen roots — no edits by the overhaul

`src/engine/`, `src/content/`, `src/persistence/`, `src/run/`, `src/duel/match*.ts`,
`src/duel/round*.ts`, `src/state/`, `src/battle-log/`, `src/assets/`,
`src/audio/sfx.test.ts`.

Enforced twice: `scripts/check-frozen-paths.mjs` fails the integration PR when
`git diff --name-only <merge-base>..HEAD` touches a frozen root, and every ticket
pastes its own diff under gate G4. The script is created by ticket 1.

### 7.2 Immutable contracts

The role / accessible name / `data-*` tables are frozen string-for-string:
battle-screen §7.1, solo-flow §9.1, duel-flow §8.1, reading-screens §10.1,
motion-and-feedback §12.2. The class names listed in those tables (`.hand
.card-view`, `.battle-board`, `.battle-controls__end`, `.battle-controls__energy`,
`.solo-deck`, `.run-progress__step`, `.reward-option`, `.document*`, `.result*`,
`.duel-result*`, `.run-result__stat`) stay. Every other class name may rename
freely. Where a test greps stylesheet text for a selector not in a table, rewrite
it to assert the same computed behaviour instead of the same string.

### 7.3 Per-screen test allowlist

Only these files may change, and only in these tickets.

| Ticket | Tests that may change |
| --- | --- |
| 0 Baseline | `duel.spec.ts` and `responsive-a11y.spec.ts` only to fix the two baseline defects |
| 1 Foundation | new `src/styles/tokens.test.ts`; `src/ui/motion/useReducedMotion.test.tsx` if selectors move |
| 2 Menu | `App.navigation.test.tsx`, `App.test.tsx`, `tests/e2e/smoke.spec.ts` |
| 3 Battle | `BattleBoard.test.tsx`, `App.battle.test.tsx`, `App.a11y.test.tsx`, `App.battle-log.test.tsx`, `responsive-a11y.spec.ts`, `battle-log.spec.ts`; new `tests/e2e/battle-screen.spec.ts` |
| 4 Motion | `useReducedMotion.test.tsx`, `BattleBoard.test.tsx`, `App.battle.test.tsx`, `App.duel.test.tsx`, `App.a11y.test.tsx`, `responsive-a11y.spec.ts`; new `src/ui/feedback/*.test.ts`, parity tests, `tests/e2e/feedback.spec.ts` |
| 5 Solo | `App.solo.test.tsx`, `App.navigation.test.tsx`, `App.a11y.test.tsx`, `tests/e2e/solo-run.spec.ts` |
| 6 Reading | `App.navigation.test.tsx`, `App.settings.test.tsx`, `App.solo.test.tsx`, `App.duel.test.tsx`, `App.a11y.test.tsx`, `smoke.spec.ts`, `responsive-a11y.spec.ts`; new `tests/e2e/reading-screens.spec.ts` |
| 7 Duel | `App.duel.test.tsx`, `App.a11y.test.tsx`, `duel.spec.ts`, `responsive-a11y.spec.ts`, `battle-log.spec.ts`, `helpers.ts` |
| 8 Release | any test, only to repair a genuine flake, with the reason in the ticket |

New suites land with the first ticket that needs them: the token contract at
foundation; `diff`/`derive`, parity and `feedback.spec.ts` at motion;
`reading-screens.spec.ts` at reading; `battle-screen.spec.ts` at battle. The
cross-route `tests/e2e/ui-bar.spec.ts` and the axe dependency land at foundation
(see the check-to-test mapping, bar §13.3).

**qa-automation-engineer is the sole test author.** ux-engineer,
frontend-engineer, solo-mode-engineer and duel-mode-engineer never edit tests;
every test edit cites the governing spec section (§7.2, §9.2, §8.3, §10.2/§10.3,
§12.3) in the commit message.

### 7.4 What must never change semantically

Engine rules, enemy planning, damage/defense math, `duel/match`, `duel/round`,
battle-log derivation/text/validation/dialogue determinism/the 80-entry cap,
persistence schemas and validation, run/reward generation, stats, content
catalogs, the asset manifest, and the privacy and `100svh` contracts.

---

## 8. Execution sequence

The map carries execution: once this spec is signed off, implementation happens
inside the map. [#15](https://github.com/SixStringBny/fieldbound/issues/15)
creates tickets 0–8 as its own child sub-issues, wires the native blocking edges,
and works them in order. The map keeps only decision tickets.

### 8.1 Branching

1. This spec set lands on `main` as a **docs-only** change touching
   `docs/design-system/` (and `docs/reviews/ui-overhaul/`) only — no app code, no
   tests.
2. Ticket 0 branches from spec-landed `main` and restores a green baseline.
3. `feat/ui-overhaul` branches from spec-landed `main` after ticket 0. Every
   screen is a short-lived `ui/<screen>` branch off it, squash-merged when its
   gates pass. One `feat/ui-overhaul` → `main` PR at the end; Pages deploys the
   overhaul exactly once.

### 8.2 Tickets and gates

| # | Ticket | Scope | Blocked by | Role order | Gates |
| --- | --- | --- | --- | --- | --- |
| 0 | Restore a green baseline | Duel privacy DOM leak; rail-aware centring assertion; docs-only spec landing verification | — | frontend → qa | Full suite on all three engines |
| 1 | Foundation: tokens, shell and primitives | Promote `tokens.css`, delete legacy tokens, base shell, Button/Panel/Chip/Meter/log-frame primitives, focus ring, materials, Fraunces 700 subset + OFL licence, route-`h1` focus for all routes, token contract test, `scripts/check-frozen-paths.mjs`, `ui-bar.spec.ts` + axe | 0 | ux → frontend → qa | G1–G5, plus budget and subpath audit |
| 2 | Menu: the table hub | Menu route, continue bookmark, document rows, nav contract | 1 | ux → frontend → qa | G1–G5 |
| 3 | Battle: phone and game table | Board geometry, card face, detail sheet, intent, log rail/strip/drawer, state matrix | 2 | ux → frontend → qa | G1–G5 |
| 4 | Motion and feedback | Shared `diffBattleState`, feedback derivation, beats, absolute reduced-motion branch | 3 | ux → frontend → qa | G1–G5 |
| 5 | Solo flow: setup, overview and reward | Physical deck table (shared with duel), sticky action bar, four-step ladder, reward select-then-confirm | 1 | ux → frontend → qa | G1–G5 |
| 6 | Reading screens | Document shell, contents rail/disclosure, cycle seals, static settings notice, result ledgers and plaques | 1, 5 | ux → solo → qa | G1–G5 |
| 7 | Duel flow: setup, privacy and board | Sealed step-2 deck table, privacy route unmount, duel board, series strip, results, `deckName`/`roundWinners` | 3, 5, 6 | ux → duel → frontend → qa | G1–G5 |
| 8 | Release verification and sign-off | Full tri-browser E2E, five-viewport sweep over every route, subpath audit, budget, integration PR, Pages deploy | 4, 6, 7 | qa → human | R |

Order rationale: foundation first because every screen consumes it; menu next
because it is small and exercises the shell, the hub idiom and route focus; battle
third while the prototype is fresh and before its shell can drift; motion
immediately after battle so structure lands before beats; solo then reading on
settled primitives; duel last because it stacks the battle shell, the shared deck
table and the result idiom; release closes.

### 8.3 Gate shorthand

- **G1** `npm run typecheck` + full `npm test`
- **G2** affected Playwright specs on **chromium only**, against the production build
- **G3** five-viewport screenshots at 375×667, 390×844, 768×1024, 1024×768, 1280×800 attached to the ticket
- **G4** frozen-path diff (`git diff --name-only`) pasted into the evidence comment
- **G5** human review at **390×844, 768×1024 and 1280×800** — the three distinct compositions; 375×667 and 1024×768 are covered mechanically for clipping and no-scroll
- **R** release-only: full E2E on firefox and webkit, `node scripts/check-build.mjs`, `node scripts/check-budget.mjs`

Ticket 1 also runs the budget and subpath audit: it is where the font subset and
the token rewrite add bytes, so it is the cheapest place to catch a breach.

### 8.4 Ownership and handoffs

- **ux-engineer** — tokens, shell, primitives, card face, detail sheet, log
  presentation, motion, every screen's visual layer.
- **frontend-engineer** — router, route focus, focus return, live regions, screen
  wiring.
- **solo-mode-engineer / duel-mode-engineer** — their view-model additions
  (`deckName`, `roundWinners`) and any controller touch.
- **qa-automation-engineer** — every test edit, the five-viewport sweep, new
  Playwright specs, the frozen-path script, budget/subpath audits.
- **content-designer** — Fraunces subset, licence file, art framing against the
  unchanged manifest contract.

Each screen ticket runs its roles in sequence — ux → frontend/solo/duel → qa →
human — and does not start before the ticket that blocks it has merged into
`feat/ui-overhaul`.

### 8.5 Completion

A screen is done when its mechanical checks are green at the five viewports, the
human column is signed at 390×844, 768×1024 and 1280×800, its review record is
written (`docs/reviews/ui-overhaul/<route>.json`, schema in §9), and its branch is
merged. The overhaul is done when ticket 8's release gates pass, the single
integration PR is merged, and GitHub Pages deploys from `main`.

---

## 9. Acceptance and evidence

The bar is [`acceptance-bar.md`](./acceptance-bar.md): numbered `AB-*` mechanical
checks (owned by qa-automation-engineer, decided by test output) and `H-*` human
checks (owned by the project owner, never signed by an agent). The bar was
amended at assembly (§13 there) to close its four open items:

- **§13.1 Waiver policy** — no waivers in execution; an unmeetable check is
  amended in the bar by the human, with the measurement recorded.
- **§13.2 Review record schema** — `docs/reviews/ui-overhaul/<route>.json`,
  JSON Schema at `docs/reviews/ui-overhaul/route-review.schema.json`, validated by
  `scripts/check-ui-review.mjs` in G1 from ticket 1 onward.
- **§13.3 Check-to-test mapping** — every `AB-*` names its owning spec file and
  test title, so a red check names its test directly.
- **§13.4 Route surface widths** — the measured box and cap for all twelve
  routes, so `AB-T1`/`AB-T2` measure a value the route specs actually state.

Evidence is assertions plus CI artifacts, never pixel baselines (`AB-E1`–`AB-E3`).
Human review at 390×844, 768×1024 and 1280×800 is required per screen; this
document's sign-off is a separate, earlier gate.

---

## 10. Risks, amendments and open questions

| Risk | Mitigation |
| --- | --- |
| Prototype is evidence, not code: the draw/play/damage/shift/intent frames are fixed, while the implementation needs a presentation derivation over snapshot diffs. | Motion spec §2: one pure `diffBattleState`; parity tests prove the log/announcement/cue outputs are unchanged. |
| Geometry budgets are tight at 375×667 (five 108px cards + footer). | The spec fixes card widths and the degradation order; if measurement fails, the executor stops on the affected criterion and proposes an amendment (below). |
| Placeholder art can clash with the stone palette. | Art sits behind `--fb-art-filter` + vignette inside a stone frame; the manifest swap contract is unchanged. |
| A visual rewrite can silently change an accessible name. | The immutable contract tables are frozen per §7.2 and every screen asserts them. |
| The suite is already red on `main` for two reasons. | Ticket 0 fixes the real privacy defect and the stale centring assertion before any screen work. |

**Amendment path (from #13 §5).** If a spec proves wrong on measurement, the
executor stops on the affected acceptance criterion, posts the measurement and a
proposed amendment on the screen ticket, and waits for the human. The amendment
is recorded in that ticket's resolution. A wayfinder ticket is reopened only if
the amendment overturns a locked decision — a palette value, a token, the
`100svh` contract, the privacy invariant, or an accessible-name contract.
Geometry fudges are ticket-level amendments. The acceptance bar changes only by
amending the bar itself (§1.5, §13.1).

**Open questions at assembly:** none blocking execution. The map's remaining open
child after sign-off is [#15](https://github.com/SixStringBny/fieldbound/issues/15)
itself.

---

## 11. Sign-off record

| Field | Value |
| --- | --- |
| Reviewer | _pending_ |
| Date | _pending_ |
| Prototype viewports reviewed | _pending_ — 390×844 and 1280×800 required |
| Decision | _pending_ — approved / rejected with issues |
| Issues raised | _pending_ |
| Execution authorised | _pending_ |

A rejection names a check id or a spec section; the assembly is amended and
re-presented. An approval unblocks [#15](https://github.com/SixStringBny/fieldbound/issues/15).
