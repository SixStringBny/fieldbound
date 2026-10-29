# Motion and feedback — build-ready spec

**Status:** decision for wayfinder [#12](https://github.com/SixStringBny/fieldbound/issues/12).
Builds on #5 (composition), #6 (prototype), #7 (tokens), #8 (battle screen),
#9 (menu/solo flow), #10 (duel flow) and #11 (reading screens). Not implemented
yet; #15 executes it.
**Tokens:** [`tokens.css`](./tokens.css) · **Battle:** [`battle-screen.md`](./battle-screen.md) ·
**Reading:** [`reading-screens.md`](./reading-screens.md).

A turn already commits instantly. What the player is missing is not speed, it is
a **response**: today the HP meter snaps, the field swaps text, a played card
simply vanishes, and the only acknowledgement is a sound and a sentence read
aloud. This spec gives every settled transition exactly one visible response,
inside the 400ms ceiling, with no choreography, no timers and no reduced-motion
compromise.

Everything here is presentation. The engine, controllers, log text, announcement
strings, cue arrays, persistence and privacy contracts keep their semantics.

---

## 1. Vocabulary

| Term | Meaning |
| --- | --- |
| **Settled transition** | One engine state change committed and rendered: a card resolving, a whole enemy turn, a duel play, an end turn, a refusal-free outcome. The sequence counter identifies it. |
| **Feedback beat** | Everything the screen shows in response to one settled transition: at most a draw block, an impact flash, impact numbers, a defense chip, a field shift, an intent reveal and a turn-handoff cross-fade. |
| **Impact number** | The transient, decorative figure showing one target's net health change in a beat. `+`/`−` signed, aria-hidden. |
| **Choreography** | Beats sequenced through each other, where one animation waits for another. Forbidden at every width. |

---

## 2. One derivation for four consumers

Three modules currently diff the same transition independently: the log entry
(`battle-log/derive.ts`), the spoken sentence (`ui/a11y/announcements.ts`) and
the cue list (`battle-controller.cuesForCardPlay`). Visual feedback would be a
fourth.

### 2.1 The shared diff

```ts
// src/ui/feedback/diff.ts — pure, no engine imports
export interface BattleDeltas {
  readonly health: { player: number; opponent: number };   // signed net
  readonly defense: { player: number; opponent: number };  // signed net
  readonly statuses: readonly { side: 'player' | 'opponent'; status: StatusName; stacks: number }[];
  readonly field: { previous: FieldName; next: FieldName } | null;
  readonly outcome: BattleOutcome;
  readonly turnChanged: boolean;
  readonly turn: number;
}

export function diffBattleState(before: BattleState, after: BattleState): BattleDeltas;
```

- The log derivation, the announcement composer, the cue mapping and the new
  feedback derivation all consume `BattleDeltas`.
- The refactor must be **output-identical**: every log line, announcement string
  and cue array stays exactly as it is today. Their existing tests are the
  proof and must not need edits.
- `diffBattleState` is pure and lives under `src/ui/feedback/`, importing only
  engine types, never an engine mutator.
- Net per side per transition, not per effect: two enemy attacks fold into one
  signed number.

### 2.2 The feedback derivation

```ts
// src/ui/feedback/derive.ts
export interface FeedbackBeat {
  readonly key: number;                    // the settled sequence; remount token
  readonly draw: boolean;                  // cards entered the hand
  readonly impacts: readonly ImpactNumber[];
  readonly defense: readonly DefenseChip[];
  readonly field: FieldShift | null;
  readonly revealIntent: boolean;
  readonly handoff: boolean;
  readonly flash: readonly FlashTarget[];  // damage | heal | defense, per side
}

export interface ImpactNumber { side: Side; kind: 'damage' | 'heal'; amount: number } // signed
export interface DefenseChip { side: Side; total: number }
```

- A refusal or an action with no observable delta produces **no beat at all**
  (no flash, no number); the live region's refusal sentence is the feedback.
- The opening render of a battle is a **deal, not a draw**: the first beat never
  animates the initial hand (`draw` is false on sequence 0).
- `revealIntent` is true only when a player turn begins with a plan that was not
  on screen before.
- One beat per settled transition. Never one per effect, never one per card in
  an enemy plan.

---

## 3. Timing and lifecycle

### 3.1 The beat clock

- Every element in a beat starts at **t = 0**. The model permits up to 60ms of
  stagger for future elements; the reference language uses none, so the whole
  beat is one simultaneous response.
- Every beat **ends by 400ms**. Durations come from the existing tokens:
  lift 120, play 160, draw 180, shift 300, damage 400. No new duration tokens.
- State is committed before the first frame of the beat. No control is disabled
  during it, no input is queued, and nothing waits for an animation to finish.
- **CSS only.** No `setTimeout`, `setInterval`, `requestAnimationFrame`, no Web
  Animations API, no animation library and no JS-driven per-frame work. The beat
  is keyframes and transitions keyed off attributes the settled render already
  sets.

### 3.2 Newest beat wins

- A newer settled transition **cancels and replaces** the running beat
  immediately. There is no queue, no delay and no cross-fade between beats.
- Consequence: a fast double play shows the second number, not two stacked
  numbers. The log still records both; nothing is lost.

### 3.3 Retriggering

- The feedback layer and every keyed overlay is remounted per beat via
  `key={sequence}`. That is how a repeated identical delta replays its animation;
  no parity attribute and no animation-name toggling is needed.
- Panels themselves are **never remounted**: focus, meters and dialog state must
  survive a beat. Keyed children (flash overlay, impact number, ring sweep,
  intent block) live inside the persistent panel.
- The dead `[data-motion='draw' | 'play' | 'damage' | 'shift']` hooks and their
  unused keyframes are deleted; `data-feedback` replaces them.

---

## 4. The language

| Element | Trigger | Motion | Duration |
| --- | --- | --- | --- |
| Draw block | New cards entered the hand (`draw`) | Opacity 0→1 and `translateY(12px)→0` on each newly mounted card, as one block; no per-card stagger | 180ms |
| Impact flash | Health fell or rose, or defense rose | Inset overlay inside the affected panel, opacity 0→0.35→0; danger for damage, success for heal, brass for defense | 160ms |
| Impact number | Signed net health change | See §5 | 400ms |
| Defense chip | Defense rose | `+N DEF` chip rises from the meter edge and fades | 300ms |
| Field shift | Field changed | Inner disc `background-color` fades old→new; brass ring overlay scales 0.9→1 and fades; field name and matchup text change **instantly** | 300ms |
| Intent reveal | Player turn begins with a new plan | Plan block opacity 0→1 and `translateY(4px)→0` as one unit; never row-by-row; expanding `Show all N steps` does not reanimate | 180ms |
| Turn handoff | Turn number or active player changed | Header turn label and footer energy/last-line cross-fade in place | 160ms |
| Outcome | Outcome ≠ ongoing | No extra motion: the header outcome label replaces the turn label instantly; the existing victory/defeat cue plays | — |

Nothing else animates. Specifically: no layout animation, no FLIP, no card
flight, no particle, no screen shake, no colour pulse on the whole board, no
animation on log entries beyond their existing 180ms fade, and no animation on
the result or reading screens beyond #11's 120ms hover lift.

### 4.1 Play is an impact, not a departure

A played card unmounts in the same commit. Making it "fly out" would need a
ghost kept alive for 160ms (a timer) or a FLIP measurement pass, and both
violate §3.1. The player's action is acknowledged by the target's flash and
impact number, the hand's re-layout and the cue — the card's departure is not
animated.

---

## 5. Impact numbers

### 5.1 Content

- One number per **target** per beat, showing the **net** signed change:
  `−6`, `+2`. A net of zero shows nothing.
- Numerals are `−` (U+2212), not a hyphen; no unit, no word, no "damage" label.
- Defense is never a number; it is the `+N DEF` chip (a different element with a
  different colour and a word), so health and defense cannot be confused.
- Damage and heal never both render on one target: the net carries the sign.
- Lethal shows the same number; the danger badge and the outcome announcement
  remain the authority on death.

### 5.2 Placement and clamps

- Anchored to the target's HP meter: right-aligned over the meter's trailing
  edge, 6px above it, rising `--fb-damage-rise` (−18px).
- Clamped inside the target panel with a 6px inset; it may never cover the
  meter's numeric text, the intent list, any control, the field roundel or
  another number.
- At 375 the enemy band is 160–180px tall, so the number never rises above the
  portrait's lower third; the player's number sits over the footer meter and
  below the control row.
- Layering: feedback layer (z 5) < log drawer (z 15) < card detail sheet (z 20).
  Numbers never appear over a dialog: a beat triggered while a detail sheet is
  open plays beneath its backdrop, and no number is rendered above it.
- Numbers are absolutely positioned and do not affect layout: no scroll
  height change, no reflow, no movement of any control.

### 5.3 Type and colour

- 26px at phone, 30px at ≥768, Fraunces 700, tabular numerals, tight leading.
- Damage `--fb-danger` on the slate (5.7:1), heal `--fb-success` (8.6:1),
  defense chip `--fb-stat-defense` (8.5:1). Text is always a numeral plus a
  sign, never colour alone.
- Under `forced-colors` the figures use `CanvasText`; opacity and transform
  still run, so the beat survives without colour.

### 5.4 Accessibility

- The whole feedback layer is `aria-hidden="true"`: numbers, chips, flashes and
  the ring are decoration.
- The accessible facts stay where they already are: the meter's
  `aria-valuenow`/`aria-valuetext`, the non-live log, and the single polite
  announcement per settled transition.
- No number is focusable, no number has an accessible name, and no beat adds a
  live region or a status role.

---

## 6. Field shift

- The roundel keeps its existing DOM node and `data-field` attribute, so
  `[data-field]` palette rules, `aria-current` on the cycle and the field
  region's accessible name are untouched.
- The **inner disc** is a solid token colour and fades old→new over 300ms; the
  **ring overlay** scales 0.9→1 and fades in brass.
- The field name, the matchup sentence and the cycle's `aria-current` change
  **instantly**. Motion must never be the only signal that the field changed,
  and a screen reader hears the new name at once.
- No cross-fade between two field images: a second decoded SVG for 300ms is not
  worth it, and the disc fade already carries the change.
- The player/enemy panel border and text colour transitions stay at 300ms (small
  surfaces only).

---

## 7. Sound

Seven cues, unchanged, at unchanged trigger points.

| Cue | Trigger (unchanged) | Beat it accompanies |
| --- | --- | --- |
| `card-play` | A card resolved | Impact flash |
| `damage` | Health fell | Impact number |
| `ward` | Defense rose | `+N DEF` chip |
| `shift` | Field changed | Disc fade + ring |
| `victory` / `defeat` | Outcome settled | Header outcome label |
| `ui` | Navigation, selection, turn handoff | Header/footer cross-fade |

- **No new cues.** Draw and intent reveal stay silent: they fire every turn and
  would become wallpaper. No new synthesis recipe, no new audio file, no change
  to mute, unlock, the 300ms cap or the master gain.
- Cue order stays exactly as the controller emits it; the beat does not reorder
  or delay cues.
- Sound and motion are independent: muting removes the sound only, reduced
  motion removes the motion only.

---

## 8. Three information channels

| Fact | Log (durable, non-live) | Live region (one sentence) | Impact number (decoration) |
| --- | --- | --- | --- |
| Health change and remaining | yes | yes | yes, net only |
| Defense change | yes | yes | chip only |
| Field shift | yes | yes | no |
| Draw / turn change | yes | yes | no |
| Outcome | yes | yes | no |

Rules:

1. The **log** is the record. It is never live and never animated beyond its
   existing entry fade.
2. The **live region** speaks exactly one summary per settled transition and
   never reads an impact number, a chip or a flash.
3. **Impact numbers never introduce a fact the log does not already carry.**
   They are a second reading of the same delta, for the eye.
4. No third channel is added: no toast, no ticker, no sound-only information, no
   motion-only information.

---

## 9. Performance envelope

### 9.1 Allowlist

- Animate **`transform` and `opacity` only**.
- Colour transitions are allowed only for `color`, `border-color` and
  `background-color` on small surfaces (roundel disc, panel borders, chips),
  at ≤300ms.
- Forbidden: `box-shadow`, `filter`, `background-position`, `width`, `height`,
  `top`, `left`, `margin`, `padding`, `font-size` and every other layout
  property. The current `box-shadow` transitions on `.card-view`,
  `.card-detail*` and buttons are **removed**; hover/pressed shadow becomes an
  instant state change.
- No `will-change` left on any element after a beat; no `contain` needed.
- At most **8 animated elements** and at most **2 impact numbers** per beat.

### 9.2 Low-end protection

- No JS timers and no per-frame work, so a slow device can drop frames without
  ever desynchronising state, input or audio.
- Every beat is ≤400ms and independent; if the main thread stalls, the animation
  is skipped rather than queued.
- Animations run only on elements already on screen; nothing animates on scroll,
  resize or route change beyond #11's documented lift.
- The feedback layer adds at most 3 small nodes per side (number, chip, flash)
  plus one ring; there is no per-effect DOM growth and no accumulating history.

---

## 10. Reduced motion — absolute branch

Under `prefers-reduced-motion: reduce` **or** `[data-reduced-motion="true"]`,
none of §4 renders in any reduced form:

- no draw rise, no impact flash, no impact number, no defense chip, no field
  disc fade, no ring sweep, no intent reveal, no turn cross-fade;
- every affected selector sets `animation: none` and `transition-duration: 1ms`
  with `transform: none`;
- the impact-number elements are **not rendered at all** (not hidden, not
  transparent): a static figure would need a timer to clear;
- the facts stay visible through the meter values, the field name and matchup,
  the intent text, the log and the single live announcement.

`[data-reduced-motion="false"]` continues to restore motion last, so an explicit
"motion on" choice wins over a matching OS preference. The existing e2e
assertions — `animationName === 'none'`, all durations ≤1ms, `transform ===
'none'` — extend to the new elements and must keep passing.

---

## 11. State matrix

| State | Beat | Notes |
| --- | --- | --- |
| Battle mount (fresh or resumed) | None | A deal is not a draw; sequence 0 never animates the initial hand. |
| Player plays a card | Flash + number and/or chip, plus field shift if any | One beat, all at t=0. |
| End turn → enemy turn | Flash + number for any damage dealt to the player; handoff | One beat for the whole enemy plan. |
| Enemy turn → player turn | Handoff + intent reveal + draw block | One beat; the plan appears with the turn. |
| Field shift | Disc fade + ring; text instant | Text never waits for the motion. |
| Refused action (unaffordable, not your turn, battle over) | **None** | The refusal sentence is the feedback; no flash, no number. |
| Multi-effect enemy plan | Folded | Two attacks = one net number per target. |
| Two beats within 400ms | Newest wins | Old number is cut, not faded; nothing queues. |
| Victory / defeat | Cue + instant header label | No battle-screen animation; the result route is separate. |
| Reduced motion (either source) | None of it | End states visible, no figure rendered. |
| Duel | Same vocabulary over public deltas | No intent block exists; privacy unmounts the board, so no beat renders there. |

---

## 12. DOM and test contract

### 12.1 New attributes

| Attribute | Where | Meaning |
| --- | --- | --- |
| `data-feedback-key` | `.battle-feedback` wrapper | The settled sequence; also the React `key`. |
| `data-impact-number` | Number element | `data-side="player"\|"opponent"`, `data-kind="damage"\|"heal"`, text `−6` / `+2`. `aria-hidden`. |
| `data-defense-chip` | Chip element | `data-side`, text `+3 DEF`. `aria-hidden`. |
| `data-impact-flash` | Panel overlay | `data-kind="damage"\|"heal"\|"defense"`, `aria-hidden`. |
| `data-field-shift` | Roundel overlay | Present only during a shift beat; `aria-hidden`. |
| `data-intent-reveal` | Intent block | Present only when the plan first appears for the turn. |
| `data-feedback-handoff` | Header label / footer | Present during a handoff beat. |
| `data-dealt="true"` | `.hand` | After the first settled transition; gates the draw animation so the opening hand never animates. |

### 12.2 Must stay stable

`[data-battle-screen]`, `[data-battle-board]`, the regions (**Battle**,
**Cinder Warden**, **Ember field**, **You**, **Your hand**, **Turn controls**,
**Battle log**), `.hand .card-view`, `data-instance-id`, `data-card-id`,
`data-affordable`, `aria-valuenow`/`aria-valuetext` on meters, the single
`role="status"` and its exact sentences, cue names and their exact sequences,
`[data-field]`, the log's non-live contract, the privacy unmount invariant and
every reading-screen contract from #11.

### 12.3 Tests that change

- `src/ui/motion/useReducedMotion.test.tsx`: assert the new selectors and
  keyframes, `animation: none` and `transition-duration: 1ms` for **every** beat
  element under both reduced branches, and that no `box-shadow` transition
  remains.
- `src/ui/components/BattleBoard.test.tsx`: CSS contract asserts
  `transform`/`opacity`-only beats, the feedback layer, and the reduced branch;
  add "no forbidden property is transitioned".
- New `src/ui/feedback/diff.test.ts` and `derive.test.ts`: net folding,
  signed numbers, defense chips, zero-delta → no beat, sequence 0 → no draw,
  refusal → no beat, field shift, intent reveal, handoff.
- New parity tests: `battle-log/derive`, `ui/a11y/announcements` and
  `controller.cuesForCardPlay` produce their existing outputs from
  `BattleDeltas` fixtures (guards the shared-diff refactor).
- `src/App.battle.test.tsx` / `src/App.duel.test.tsx`: add beat assertions —
  one number per target per settle, `aria-hidden`, no number on a refusal, the
  number replaced (not stacked) by a fast second play, no number on first
  mount.
- `src/App.a11y.test.tsx`: unchanged announcement strings; add "impact numbers
  are not in the accessibility tree" and "a beat adds no live region".
- `tests/e2e/responsive-a11y.spec.ts`: extend the reduced-motion computed-style
  sweep to the feedback elements; keep `animationName === 'none'`,
  duration ≤1ms, `transform === 'none'`.
- New `tests/e2e/feedback.spec.ts`: play a card at 375 and 1280 — the number
  appears inside the target panel (bounding box within the panel), leaves no
  layout change (`scrollHeight` unchanged, no horizontal scroll), is
  `aria-hidden`, and is absent under reduced motion; field shift changes text
  immediately; a second play replaces the first number; the log still shows
  both entries; exactly one live region on the board.

### 12.4 Tests that must not change semantically

Engine rules, enemy planning, damage/defense math, `duel/match`, `duel/round`,
log derivation text, dialogue determinism, the 80-entry cap, persistence and
stats, the asset manifest, privacy, and the battle screen's `100svh` geometry.

---

## 13. Acceptance criteria

1. Every settled transition renders exactly one beat; every beat starts at t=0
   and ends by 400ms; no beat depends on another completing.
2. No JS timer, interval, frame loop or animation library exists in the beat
   path; the language is CSS keyframes and transitions only.
3. Playing a card shows a flash on the target and a net signed impact number
   (or a `+N DEF` chip), anchored to that target's HP meter and clamped inside
   the panel.
4. A two-attack enemy plan produces one net number per target, not two; a
   refusal produces none.
5. A field shift fades the disc, sweeps the ring, and changes the field name and
   `aria-current` instantly.
6. The intent block reveals as one block when a player turn brings a new plan;
   expanding the step list does not animate.
7. Fast consecutive actions replace the running beat; nothing queues; the log
   keeps every entry.
8. Impact numbers and flashes are `aria-hidden`; the meter values, non-live log
   and single live announcement remain the accessible record; no beat adds a
   live region.
9. Under either reduced-motion source every beat is absent, no impact numbers
   are rendered, `animationName` is `none`, durations are ≤1ms and transforms
   are `none` — including the new elements.
10. Only `transform`, `opacity` and small-surface colour transitions animate; the
    `box-shadow` transitions are gone; the 300KB gzip budget is unaffected (no
    new dependency, no new asset).

---

## 14. Resolved decisions

- **One shared `diffBattleState`** feeds the log, the announcement, the cues and
  the new feedback derivation; the refactor is output-identical and the existing
  text/cue tests are its proof.
- **The vocabulary is draw, impact flash, impact number, defense chip, field
  shift, intent reveal and turn handoff**; play is an impact, not a departure,
  so no card ghost and no timer.
- **Impact numbers are net-per-target, signed, `aria-hidden` decoration**, one
  per target, anchored to the HP meter and clamped inside the panel; they are
  not rendered under reduced motion.
- **All beats start at t=0 and end by 400ms**, CSS only, no timers, no
  choreography; a newer beat cancels the running one.
- **Retriggering is `key={sequence}` remounting** of keyed overlays inside
  persistent panels; the dead `[data-motion]` hooks are deleted.
- **Field shift** fades the solid disc and sweeps a brass ring; text and
  `aria-current` change instantly; no image cross-fade.
- **Intent reveal is a single 180ms block**; expanding the step list never
  re-animates.
- **No new sound cues**; the seven existing cues keep their names, triggers and
  order, and draw/intent reveal stay silent.
- **Only `transform` and `opacity` animate** (plus small-surface colour
  transitions ≤300ms); the `box-shadow` transitions are removed; ≤8 animated
  elements and ≤2 numbers per beat.
- **Reduced motion is absolute**: no beat renders in any reduced form, and no
  impact-number element exists in the DOM.
- **Information stays in three channels**: durable non-live log, one polite
  sentence, decorative numbers that add no new fact.
- **The duel uses the same vocabulary over public deltas**; it has no intent
  block, and the privacy route renders no beat because the board is unmounted.
