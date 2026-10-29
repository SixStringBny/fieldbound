# Fieldbound design system

**Status:** decision for wayfinder ticket #7. Target, not yet applied to the app.
**Machine-readable source:** [`tokens.css`](./tokens.css).
**Battle screen spec:** [`battle-screen.md`](./battle-screen.md).
**Menu / solo / reward spec:** [`solo-flow.md`](./solo-flow.md).
**Evidence:** [refined battle prototype](https://github.com/SixStringBny/fieldbound/tree/prototype/battle-refined/.prototype/battle-refined), ticket #6.

The overhaul keeps one **warm slate table** and one **parchment material**. The
screen is dark, the cards and reading documents are paper, and brass is the only
rule colour. There is no light theme and no separate high-contrast theme file:
`prefers-contrast: more` hardens the same palette and `forced-colors` maps to
system colours.

The identity is: **carved arena + parchment card faces + dedicated field
roundel**, with brass rules, a wax-red action seal and warm stone instead of
generic charcoal fantasy.

---

## 1. Principles

1. **Game, not form.** Panels are objects on a table, not rows in a settings
   form. The field is the physical centre; enemy → field → player is the only
   vertical axis.
2. **One-handed first.** Every primary action is 44px, reachable at 375px, and
   never depends on hover.
3. **One identity, few branches.** Dark slate for play; parchment for reading.
   High contrast and forced colours are system branches, not alternative themes.
4. **Colour is never the only cue.** Every element and status is a glyph plus a
   word. Brass rules are decoration; text and values carry the meaning.
5. **Motion explains, it does not choreograph.** One settled transition at a
   time, 120–400ms, hard reduced-motion branch.
6. **Art is placeholder-swappable.** The manifest swap contract is unchanged;
   the design system only frames the art.

---

## 2. Token architecture

### 2.1 File and layers

| Layer | Prefix | Example | Consumed by |
| --- | --- | --- | --- |
| Raw palette | `--fb-color-*`, `--fb-ember-*` … | `--fb-color-brass-500` | semantic tokens, element bridge |
| Semantic role | `--fb-surface-*`, `--fb-text-*`, `--fb-rule-*`, `--fb-action*` | `--fb-surface-panel` | components |
| Material | `--fb-material-*` | `--fb-material-paper` | panel/card/document backgrounds |
| Layout | `--fb-space-*`, `--fb-*width`, `--fb-target` | `--fb-rail-width` | layout CSS |
| Type | `--fb-font-*`, `--fb-text-*`, `--fb-leading-*` | `--fb-text-sm` | typography |
| Shape | `--fb-radius-*`, `--fb-rule-*` | `--fb-radius-md` | surfaces and controls |
| Elevation | `--fb-elev-*`, `--fb-rim` | `--fb-elev-3` | panels, floating cards |
| Motion | `--fb-dur-*`, `--fb-ease*`, `--fb-*-y` | `--fb-dur-draw` | transitions |
| State | `--fb-state-*`, `--fb-focus-*` | `--fb-state-hover` | interaction CSS |
| Art | `--fb-art-*` | `--fb-art-filter` | asset frames |

`docs/design-system/tokens.css` is the machine-readable block. A JSON mirror is
deliberately **not** added: CSS custom properties are already parseable, and a
second file would drift. Execution promotes this file to
`src/styles/tokens.css`; it is not imported today.

### 2.2 Naming rules

- Every global token starts with `--fb-`.
- `--fb-<category>-<role>[-<variant>]`: lower-case, hyphenated, no abbreviations
  beyond `fb`.
- **Components consume semantic tokens, never raw palette values.** A component
  may not contain a hex, `rgb()`, shadow, radius or duration literal. The only
  exception is `0`, `100%`, `auto` and a structural `1px` where the token would
  add no meaning — prefer `--fb-rule-width`.
- Component-local variables are scoped to the component and prefixed
  `--fb-<component>-`, e.g. `--fb-card-art-height`. They are defined in the
  component's stylesheet, not in `tokens.css`.
- State is expressed with attributes, not modifier classes where a native
  attribute exists: `:focus-visible`, `:active`, `[aria-disabled="true"]`,
  `[aria-pressed="true"]`, `[aria-selected="true"]`, `[aria-current]`,
  `[data-affordable="false"]`, `[data-selected="true"]`.

### 2.3 Current → target mapping

The current `src/styles/tokens.css` is the light implementation. #15 replaces
it; no aliases survive.

| Current | Target | Note |
| --- | --- | --- |
| `--fb-paper` | `--fb-paper`-equivalent via `--fb-material-paper` + `--fb-surface-document` | paper is a material, not the page |
| `--fb-parchment` | `--fb-surface-board` | the page is warm slate |
| `--fb-parchment-deep` | `--fb-surface-raised` or `--fb-color-parchment-200` | depends on whether the use is chrome or paper |
| `--fb-ink` | `--fb-text` on slate; `--fb-text-on-paper` on paper | split by surface |
| `--fb-ink-soft` | `--fb-text-soft` / `--fb-text-on-paper-soft` | split by surface |
| `--fb-accent` | `--fb-action` (ember) or `--fb-rule-color` (brass) | action vs rule |
| `--fb-accent-strong` | `--fb-action-pressed` | |
| `--fb-focus` | `--fb-focus` (gold) | new two-tone ring |
| `--fb-danger` | `--fb-danger` on slate / `--fb-danger-on-paper` | |
| `--fb-border` | `--fb-rule` | |
| `--fb-border-strong` | `--fb-rule-strong` | |
| `--fb-panel` | `--fb-surface-panel` + `--fb-material-panel` | no translucent light panel |
| `--fb-shadow` | `--fb-elev-2` | |
| `--fb-shadow-raised` | `--fb-elev-3` | |
| `--fb-radius` (duplicate) | **removed**; use `--fb-radius-md` | the one duplicate to delete |
| `--fb-radius-sm/md/lg` | same names, new values 5/8/12px | |
| `--fb-font-body` | `--fb-font-display` or `--fb-font-ui` | display vs UI, no ambiguous “body” |
| `--fb-text-body/small/tiny` | `--fb-text-lg/sm/2xs` | |
| `--fb-motion-lift` | `--fb-dur-lift` | duration, not event |
| `--fb-motion-play/draw/damage/shift` | `--fb-dur-play/draw/damage/shift` | |
| `--fb-card-width` | `--fb-card-w-phone/table/compact` | explicit per composition |

---

## 3. Palette and contrast

### 3.1 Raw palette

| Token | Hex | Role |
| --- | --- | --- |
| `--fb-color-slate-950` | `#0f0c0a` | page, wells, focus halo |
| `--fb-color-slate-900` | `#171310` | board surface |
| `--fb-color-slate-850` | `#1e1915` | panel |
| `--fb-color-slate-800` | `#261f19` | raised panel, hover |
| `--fb-color-slate-700` | `#302720` | selected surface |
| `--fb-color-slate-600` | `#3b3027` | maximum lift on slate |
| `--fb-color-brass-200` | `#e6c48a` | brass highlight |
| `--fb-color-brass-300` | `#d9b06b` | labels, selected fill, strong rules |
| `--fb-color-brass-500` | `#a87c3f` | standard rule, accent |
| `--fb-color-brass-700` | `#6d552f` | rule on paper, muted paper text |
| `--fb-color-brass-800` | `#514027` | subtle rule |
| `--fb-color-parchment-50` | `#f8eed8` | paper highlight, action ink |
| `--fb-color-parchment-100` | `#f4e8cf` | paper base |
| `--fb-color-parchment-200` | `#e7d3ac` | paper shade, unaffordable |
| `--fb-color-parchment-300` | `#d8bf94` | paper deep |
| `--fb-color-parchment-700` | `#8a6a3f` | paper rule, non-text |
| `--fb-color-parchment-800` | `#5b4a35` | paper soft text |
| `--fb-color-parchment-900` | `#2a2117` | paper ink |
| `--fb-color-ink-100` | `#f4ecdd` | primary text |
| `--fb-color-ink-300` | `#c9bda9` | secondary text |
| `--fb-color-ink-500` | `#a99c88` | tertiary text |
| `--fb-color-danger-400` | `#e0704e` | danger on slate |
| `--fb-color-danger-700` | `#8f1d1d` | action fill, danger on paper |
| `--fb-color-success-400` | `#8fbca4` | Regen/success |
| `--fb-color-focus-300` | `#ffd57a` | focus |
| `--fb-color-weaken-300` | `#8fb8cf` | Weaken |
| `--fb-color-defense-300` | `#c8ac82` | defense |

### 3.2 Semantic roles

| Token | Value | Use |
| --- | --- | --- |
| `--fb-surface-page` | slate 950 | document background around the board |
| `--fb-surface-board` | slate 900 | arena/table backdrop |
| `--fb-surface-panel` | slate 850 | enemy/player/field/log panels |
| `--fb-surface-raised` | slate 800 | hover, raised chips, floating card |
| `--fb-surface-inset` | slate 950 | meter tracks, wells, art frame |
| `--fb-surface-selected` | slate 700 | selected row/card backing |
| `--fb-surface-document` | parchment 100 | How to Play and Settings sheet |
| `--fb-text` | ink 100 | primary text on slate |
| `--fb-text-soft` | ink 300 | secondary text on slate |
| `--fb-text-muted` | ink 500 | tertiary text, 11px+ labels |
| `--fb-text-inverse` | parchment 900 | text on brass |
| `--fb-text-on-paper` | parchment 900 | primary text on paper |
| `--fb-text-on-paper-soft` | parchment 800 | secondary text on paper |
| `--fb-text-on-paper-muted` | brass 700 | muted text on paper |
| `--fb-text-on-paper-danger` | danger 700 | danger text on paper |
| `--fb-rule-color` | brass 500 | standard panel/card rule |
| `--fb-rule-subtle-color` | brass 800 | decorative subdivisions |
| `--fb-rule-strong-color` | brass 300 | selected/current state |
| `--fb-rule-on-paper-color` | parchment 700 | card borders on paper |
| `--fb-action` | danger 700 | primary action fill (End Turn, Play) |
| `--fb-action-hover` | ember 600 | primary hover |
| `--fb-action-pressed` | ember 800 | primary pressed |
| `--fb-action-ink` | parchment 50 | text on primary |
| `--fb-selected` | brass 300 | selected/current fill |
| `--fb-selected-ink` | parchment 900 | text on selected |
| `--fb-danger` | danger 400 | danger on slate |
| `--fb-focus` | focus 300 | focus ring |

### 3.3 Contrast floors

Measured with the WCAG 2.x relative-luminance formula. The system targets
**4.5:1 for all text**, **7:1 for stat values and primary text**, and **3:1 for
interactive boundaries and glyphs**.

| Pair | Ratio | Use |
| --- | --- | --- |
| ink 100 on slate 900 | **15.73:1** | primary text, card count, names |
| ink 300 on slate 900 | **9.97:1** | secondary text |
| ink 500 on slate 900 | **6.86:1** | tertiary labels at 11px+ |
| brass 300 on slate 900 | **9.12:1** | section labels, intent heading |
| brass 500 on slate 900 | **4.94:1** | standard accent text |
| danger 400 on slate 900 | **5.80:1** | danger copy on slate |
| focus 300 on slate 900 | **13.24:1** | focus ring on slate |
| parchment 900 on parchment 100 | **13.02:1** | card/document text |
| parchment 800 on parchment 100 | **6.98:1** | card secondary text |
| brass 700 on parchment 100 | **5.78:1** | muted paper text |
| danger 700 on parchment 100 | **7.32:1** | danger on paper |
| parchment 50 on danger 700 | **9.44:1** | primary action text |
| parchment 900 on brass 300 | **7.81:1** | selected/current text |
| element ink on element bg | **7.20–9.86:1** | element chips |
| brass 500 on parchment 100 | **3.08:1** | **non-text only** (rule/border) |
| parchment 700 on parchment 100 | **4.10:1** | **non-text only** (card border) |

Rules:

- No text below 4.5:1. If a colour pair is not in this table, measure it before
  shipping.
- `--fb-text-muted` (6.86:1) is the lowest text token and is reserved for 11px+
  uppercase labels or short metadata.
- `--fb-text-on-paper-muted` is 5.78:1 and is the lowest paper text; never use
  `parchment-700` as text.
- `danger-400` fails on paper (2.62:1) and must not be used there; use
  `--fb-text-on-paper-danger`.
- Brass 500 on paper is 3.08:1: a border/rule only, never text.
- Large stat numbers use `--fb-text` and tabular numerals; their labels use
  `--fb-text-soft`, not muted.

### 3.4 Element palette

The five element families keep the published ASSET-SPEC values so the generator,
the SVGs and the UI cannot drift:

| Element | Base | Accent | Ink | Shade | Ink/base |
| --- | --- | --- | --- | --- | --- |
| Ember | `#7f1d1d` | `#f59e0b` | `#fff7ed` | `#450a0a` | 9.44:1 |
| Frost | `#1e3a8a` | `#a5f3fc` | `#eff6ff` | `#172554` | 9.52:1 |
| Gale | `#115e59` | `#a7f3d0` | `#ecfdf5` | `#042f2e` | 7.20:1 |
| Stone | `#5b4636` | `#d6b98c` | `#fdf6e3` | `#2f241b` | 8.20:1 |
| Neutral | `#374151` | `#e5e7eb` | `#f9fafb` | `#111827` | 9.86:1 |

These are the only raw values components may read directly, and only through the
`--fb-<element>-*` bridge tokens. Element colour is always paired with the glyph
and the label; never use element colour as the only state cue.

### 3.5 Light and high-contrast variants

**No light theme.** The game is a warm slate table; a light play surface loses
the carved-arena identity and would double every state/screenshot. Reading
screens use a **paper document surface** (`--fb-surface-document`) inside the
same palette, which gives high-contrast 16px/1.6 prose without a second theme.

**High contrast is system-driven, not a toggle.** `prefers-contrast: more`
removes material gradients and elevation, strengthens rules to 2–3px, uses
near-black surfaces and near-white text. `forced-colors: active` hands the
palette to the platform (`Canvas`, `CanvasText`, `ButtonFace`, `Highlight`) and
turns off art filters and material noise. The in-app settings stay Sound and
Reduce motion; no theme switch is added.

---

## 4. Materials

All materials are **baked gradients** and alpha, not live filters. Live SVG
`feTurbulence` measured 106ms/frame in WebKit and is ruled out. `color-mix()` is
avoided in base tokens; hover/pressed states use explicit hex/rgb values so
iOS 16.0–16.1 has no fallback gap.

| Material | Recipe | Use |
| --- | --- | --- |
| Slate table | radial warm glow + two repeating noise gradients + 178° umber-slate gradient | board/page |
| Panel | 4% top light + slate-850 → slate-900 vertical | enemy/player/field/log |
| Paper | white corner glow + 0/90° fibre lines + 158° parchment gradient | cards, sheets, documents |
| Wood | warm lamp glow + 92° grain + 2° fine grain + 180° brown gradient | optional menu/setup table accent |
| Leather | warm radial + repeating-radial grain + 160° brown gradient | log rail/header accents |
| Brass | 180° `#e6c48a → #a87c3f → #6d552f` | rules, medallion rings, seals |
| Wax | radial `#d36a55 → #8d2318 → #4c0d0b` | cost seal, action accent |
| Vignette | radial transparent centre → 45% dark edge | art and board edge |

Rules:

- A component sets `background-color: var(--fb-surface-*)` first and
  `background-image: var(--fb-material-*)` second. When a contrast branch sets
  the material to `none`, the solid surface remains.
- No `filter: blur()` on scrolling surfaces. `backdrop-filter` is allowed only
  on modal/drawer overlays, with a solid rgba fallback.
- Shadows come from the elevation scale. No ad-hoc shadow strings.
- Noise is baked into gradients; no SVG filter, no canvas, no image texture.
- Text is never placed directly on busy material without a paper/inset surface
  or an opaque scrim.

### 4.1 Elevation and depth

| Token | Value | Use |
| --- | --- | --- |
| `--fb-elev-0` | none | flat document sections |
| `--fb-elev-1` | `0 1px 0 rgb(0 0 0 / 40%)` | pressed/sunken edge |
| `--fb-elev-2` | `0 8px 18px rgb(0 0 0 / 32%)` | standard panel |
| `--fb-elev-3` | `0 14px 30px rgb(0 0 0 / 42%)` | floating card, raised control |
| `--fb-elev-4` | `0 24px 48px rgb(0 0 0 / 52%)` | sheet/dialog |
| `--fb-elev-5` | `0 30px 70px rgb(0 0 0 / 66%)` | full-screen overlay card |
| `--fb-rim` | inset top highlight + bottom dark edge | every panel/card |

Depth is carried by a **brass rim plus one shadow**, not by glass or multiple
layers. Cards on the table use `elev-3`; the detail sheet uses `elev-4`.

---

## 5. Typography

### 5.1 Families

| Token | Stack | Use |
| --- | --- | --- |
| `--fb-font-display` | `"Fraunces Fieldbound", "Bitter Fieldbound", Georgia, … serif` | wordmark, screen titles, card names, enemy/field names, dialogue |
| `--fb-font-ui` | `system-ui, -apple-system, "Segoe UI", … sans-serif` | body, labels, buttons, logs, numbers |
| `--fb-font-glyph` | `"Segoe UI Symbol", "Apple Symbols", "Noto Sans Symbols 2", …` | element and status glyphs |

The display face is the **Fraunces 700** OFL subset from the typeface research
(11,288 B, fully pinned static WOFF2, renamed `Fraunces Fieldbound`, license
committed). It is self-hosted under `font-src 'self'` and sits outside the
300KB JS/CSS budget. `Bitter Fieldbound` (9,340 B) is the licensed swap-in
fallback if Fraunces fails review; it is **not loaded by default** — the system
serif fallbacks are Georgia/Iowan/Palatino. Body and UI never use the display
face.

### 5.2 Scale

| Token | Size / line height | Use |
| --- | --- | --- |
| `--fb-text-2xs` | 11px / 1.2 | uppercase chips, badges, log meta; **minimum text size** |
| `--fb-text-xs` | 12px / 1.3 | card meta, log body, intent step detail |
| `--fb-text-sm` | 13px / 1.4 | secondary body, card rule summary, document captions |
| `--fb-text-md` | 14px / 1.5 | default UI/board body |
| `--fb-text-lg` | 16px / 1.6 | How to Play and Settings body |
| `--fb-text-xl` | 20px / 1.2 | player/enemy subheads, panel titles |
| `--fb-text-2xl` | 24px / 1.15 | screen titles |
| `--fb-text-3xl` | `clamp(28px, 4vw, 36px)` / 1.1 | enemy and field names |
| `--fb-text-display` | `clamp(36px, 6vw, 52px)` / 1.05 | wordmark, menu title |

Rules:

- **No body text below 12px.** 11px is for uppercase labels only, at 4.5:1 or
  better. The prototype's 7–9px log/card metadata is deliberately raised; the
  implementation must let the log scroll rather than shrink text.
- Display face is 700 only. UI weights are 400/600/700; 700 is for values and
  actions, not paragraphs.
- Uppercase is limited to labels, chips and section headings; tracking
  `--fb-tracking-label` (0.1em) or `--fb-tracking-wide` (0.16em).
- Body line length is capped at **68ch** on document panels; battle panels are
  narrow and use 1.4–1.5.
- Numbers are tabular (`font-variant-numeric: tabular-nums`), especially HP,
  defense, energy, damage and intent totals.
- Card names clamp to 2 lines; effect summaries clamp to 2 on table and hide on
  phone (the detail sheet carries the full text).

---

## 6. Space, shape and borders

### 6.1 Spacing

4px base: `--fb-space-1` 4, `-2` 8, `-3` 12, `-4` 16, `-5` 24, `-6` 32, `-7` 48,
`-8` 64. Gaps between targets are at least 8px; grouped controls use 4–6px.

| Layout token | Value | Use |
| --- | --- | --- |
| `--fb-gutter` | `clamp(10px, 2vw, 22px)` | board edge |
| `--fb-target` | 44px | every interactive box |
| `--fb-header-height` | 44px | phone/table header |
| `--fb-board-max` | 1080px | centred board cap |
| `--fb-rail-width` | 18rem | log rail at ≥1280px |
| `--fb-rail-width-compact` | 15rem | log rail at 1024–1279px |
| `--fb-document-max` | 42rem | reading documents |
| `--fb-card-w-phone` | 108px | phone rack |
| `--fb-card-w-table` | 138px | table fan |
| `--fb-card-w-compact` | 118px | 1024–1279px and short landscape |
| `--fb-card-aspect` | `300 / 420` | card face aspect |

### 6.2 Radii — no duplicate radius token

| Token | Value | Use |
| --- | --- | --- |
| `--fb-radius-xs` | 3px | badges, chips, small tags |
| `--fb-radius-sm` | 5px | cards, art frames, inputs |
| `--fb-radius-md` | 8px | panels, buttons, controls |
| `--fb-radius-lg` | 12px | sheets, dialogs, large panels |
| `--fb-radius-sheet` | 16px | bottom-sheet top corners |
| `--fb-radius-pill` | 999px | pills, End Turn, status chips |

`--fb-radius` (the old 16px duplicate) is deleted. Use `--fb-radius-md` for
panels and `--fb-radius-lg` for sheets.

### 6.3 Borders and rules

- Brass is the only rule colour. No grey hairlines.
- `--fb-rule` (1px brass 500) for panel edges and card borders on slate.
- `--fb-rule-subtle` (1px brass 800) for internal subdivisions and log entries.
- `--fb-rule-strong` (2px brass 300) for selected/current state.
- `--fb-rule-on-paper` (1px parchment 700) for card/document edges.
- A 2px inset rim (`--fb-rim`) sits inside raised surfaces; no outer grey border.
- Focus is never a border: use the focus recipe below.

---

## 7. Interaction states

| State | Trigger | Tokens | Rules |
| --- | --- | --- | --- |
| Default | — | surface, text, rule | No elevation beyond the panel's own; no hover-only affordance. |
| Hover | `@media (hover: hover)` | `--fb-surface-hover`, `--fb-rule-strong`, `--fb-elev-3` | Pointer only. Never move a target more than 2px; no layout shift. |
| Focus-visible | keyboard focus | `--fb-focus`, `--fb-focus-inner`, `--fb-focus-halo` | 2px gold outline + 2px offset + inner light/dark halo. Same ring on paper and slate. Never `outline: none` without a replacement. |
| Pressed | `:active` | `--fb-action-pressed`, `--fb-state-pressed`, `--fb-elev-1` | Translate 1px; no bounce. |
| Disabled | native `disabled` or `aria-disabled` (actions) | `--fb-state-disabled-surface`, `--fb-state-disabled-ink` | No opacity-only dimming; keep ≥4.5:1 text; `cursor: not-allowed`. |
| Selected | `aria-selected` / `aria-pressed` / `data-selected` | `--fb-surface-selected`, `--fb-rule-strong`, `--fb-state-selected` | Brass rim + tinted surface; keep text at 7:1. |
| Unaffordable | card `data-affordable="false"` | `--fb-state-unaffordable-surface`, `--fb-state-unaffordable-ink` | Still focusable and inspectable; visible “Unaffordable” text; no hover lift; play is rejected by the controller. |
| Current | `aria-current` on cycle/nav | `--fb-selected`, `--fb-selected-ink` | Brass fill + dark text; the element glyph and label remain visible. |

Focus recipe:

```css
outline: var(--fb-focus-ring-width) solid var(--fb-focus);
outline-offset: var(--fb-focus-offset);
box-shadow: var(--fb-focus-shadow);
```

The dark halo makes the ring legible on parchment; the gold makes it legible on
slate. Under `forced-colors`, `--fb-focus` maps to `Highlight`.

---

## 8. Component rules

### 8.1 Shell and board

| Rule | Value |
| --- | --- |
| Board cap | `min(100%, var(--fb-board-max))`, centred |
| Table columns | `minmax(0, 1fr) var(--fb-rail-width)` at ≥1280; compact rail at 1024–1279 |
| Table rows | chrome, arena, hand; hand spans both columns below the rail |
| Phone | single column: 44px header, enemy, field, hand, sticky control bar |
| Height | `100svh` on battle screens; only the log rail/rack/drawer scroll |
| Background | `--fb-surface-board` + `--fb-material-slate` + vignette |
| Page scroll | none on battle; vertical scroll on reading documents |

The hand fan spans the full board width below both table columns. The arena
absorbs slack; enemy/player bands keep their content height.

### 8.2 Panels (enemy, player, field, log)

- Surface: `--fb-surface-panel` + `--fb-material-panel`; 1px `--fb-rule`;
  `--fb-radius-md`; `--fb-rim` + `--fb-elev-2`.
- Padding: `--fb-space-3` phone, `--fb-space-4` table.
- Header row: name in display face `--fb-text-3xl`/`--fb-text-xl`; element chip;
  status chips.
- Stat rows: label `--fb-text-2xs` uppercase soft; value `--fb-text` bold
  tabular; track 8–9px with 1px rule.
- No nested card-in-card. A panel may contain a well (`--fb-surface-inset`) but
  not another elevated panel.

### 8.3 Card face

| Part | Table | Phone | Rules |
| --- | --- | --- | --- |
| Size | 138×194 | 108×152 | `--fb-card-w-table/phone`, aspect 300/420 |
| Padding | 10/9px | 8/7px | 4px gaps |
| Cost seal | 27px | 21px | wax material, `--fb-text` 13/10px |
| Art window | 66px tall | 48px tall | 6/5 crop, `--fb-art-filter`, stone frame, vignette |
| Name | 13px display / 1.05 | 11px | 2 lines max |
| Meta | 7px uppercase | 6px | element · type |
| Summary | 8.5px, 2 lines | hidden | detail sheet owns full text |
| Value | 20px display | 16px | tabular, label 7/6px |
| Delta/badge | 7px | 6px | `+2 field`, `Pierce` |
| Target | full card ≥108×152 | same | no overlapping hit boxes |

The table fan is an arc of ±4° with 10px gaps; rotation is visual only and the
hit boxes do not overlap. The phone rack is 108px cards, 8px gaps, horizontal
snap, about 3.2 visible, with the edge fade. Unaffordable cards use the
unaffordable tokens, keep the “Unaffordable” label and remain inspectable.

### 8.4 Detail sheet

- Table: centred `min(460px, 94vw)`, `--fb-radius-lg`, `--fb-elev-4`.
- Phone: bottom sheet, top corners `--fb-radius-sheet`, max 88svh, scrolls
  inside; backdrop is `rgb(7 5 4 / 78%)` + optional blur.
- Contents: eyebrow (element · cost · type), display name, art 126×176/96×134,
  value, full effect, field-bonus note, keyboard hints, Play + close.
- Focus: open focuses the Play button; Escape/close returns focus to the
  invoking card. The dialog traps focus and sets `aria-modal`.

### 8.5 Buttons

- **Primary (End Turn, Play):** ember-700 fill, parchment-50 ink, pill or 8px
  radius, 46–48px tall, strong inset highlight, pressed 1px. This is the only
  large ember fill.
- **Secondary (Run overview, Leave, Back):** transparent/slate surface, 1px
  brass rule, 44px tall, soft text; hover border brass-300.
- **Icon (close, log toggle):** 44×44 minimum, circular, 1px rule.
- **Destructive/abandon:** danger-700 text on transparent, not a red fill.
- Disabled: disabled tokens, no elevation, no opacity-only.

### 8.6 Chips, statuses and meters

- Chip radius `--fb-radius-xs` or pill; 11px uppercase; 1px rule; glyph + label
  where it carries element/status meaning.
- Status chips: `focus` brass, `weaken` blue, `regen` green; text always
  `--fb-text` or the status colour at ≥7:1 on the tinted surface.
- Meter: 9px track (7px phone), 1px rule, inset shadow; health gradient
  `#8d2d1b → #d05a35`; defense `#6c5c45 → #c8ac82`; energy pips use
  `--fb-stat-energy`.
- Values are always text, never only a filled bar.

### 8.7 Intent

- Header: “Intent · next turn” in brass 300 11px; total `6 dmg · 4 def` in
  `--fb-text` 12px bold.
- Steps: 4-column rows (dot, name, effect, cost), 28–32px; 1px left ember rule,
  subtle inset surface; cost is a 18px circle.
- Phone: 3 compact steps in a row, then “Show all 3 steps” (44px target); the
  expanded state uses a column list and the full recompute note.
- Intent state highlight: inset gold wash + brass 300 step borders; a
  “Recomputed” badge with a dot. No animation required for the reveal in
  reduced motion.
- Never render a number the engine did not compute; the plan is the source.

### 8.8 Log

- **Table rail:** 18rem at ≥1280, 15rem at 1024–1279; sticky within the content
  row; only this region scrolls. Entries use 12px body, 11px meta, 12px
  dialogue; 1px subtle divider; no cards or shadows per entry.
- **Phone strip:** one line, 12px, truncated, above the control bar; `aria-live`
  polite on the strip only.
- **Drawer:** bottom sheet max 82svh, 44px close, same entries; history region
  is `aria-live="off"`.
- Latest entry is visually marked with a brass 300 dot or left rule; the log is
  never used to announce hidden state.

### 8.9 Reading documents

How to Play and Settings use `--fb-surface-document` + `--fb-material-paper` in a
centred `--fb-document-max` sheet, 16px/1.6 `--fb-text-on-paper`, 24/32px
padding. Headings use the display face; body uses UI. Links are brass 700 with
an underline; focus uses the same two-tone ring. These screens do not use the
slate panels or heavy shadows.

### 8.10 Art and fallback

- Frame: 1px `--fb-rule`, `--fb-radius-sm`, inset `--fb-surface-inset`, inner
  vignette. Art sits behind `--fb-art-filter`.
- Card art is cropped to the 6/5 art window (object-position 50% 42%); enemy art
  is 1:1 at 50% 32%; field art is 1:1 centred.
- Drop shadow only on the frame, never on the image itself.
- Fallback: bordered inset with the manifest label and an “Art unavailable”
  note; same reserved aspect ratio so layout does not shift.
- Alt text comes from content, not the SVG title or file path. The placeholder's
  internal text is not authoritative; the HTML face owns the labels.

---

## 9. Motion

### 9.1 Tokens

| Token | Value | Event |
| --- | --- | --- |
| `--fb-dur-instant` | 1ms | reduced branches |
| `--fb-dur-lift` | 120ms | hover/focus lift |
| `--fb-dur-play` | 160ms | card leaves hand |
| `--fb-dur-draw` | 180ms | card enters hand |
| `--fb-dur-sheet` | 240ms | detail/log sheet |
| `--fb-dur-shift` | 300ms | field repaint |
| `--fb-dur-damage` | 400ms | damage number hold |
| `--fb-ease` | `cubic-bezier(.2,0,.2,1)` | default |
| `--fb-ease-out` | `cubic-bezier(.16,1,.3,1)` | entering elements |

Distances: `--fb-lift-y` -6px, `--fb-press-y` 1px, `--fb-draw-offset` 24px,
`--fb-damage-rise` -18px, `--fb-sheet-travel` 100%.

### 9.2 Reduced equivalents

| Event | Normal | Reduced |
| --- | --- | --- |
| Draw | 180ms translate/fade from deck | Card is present in the hand immediately; the DRAWN marker remains as the static outcome |
| Play | 160ms lift to target | Card is removed and placed in discard; no flight |
| Damage | 400ms number rise/fade | Static number for 400ms; no rise/fade |
| Field shift | 300ms palette/roundel crossfade | Banner and roundel swap instantly |
| Intent reveal | height/opacity reveal | Expands instantly |
| Detail/log sheet | 240ms slide | Appears instantly |
| Hover/focus lift | 120ms translate | No transform; focus ring still appears |

Implementation rules:

- Honor both `@media (prefers-reduced-motion: reduce)` and
  `[data-reduced-motion="true"]`; an explicit `data-reduced-motion="false"`
  overrides the OS query (the app's persisted choice wins in both directions).
- No choreographed multi-step turn. One effect per settled transition; latest
  wins; input is never blocked by animation.
- No animation of layout properties on the board except the hand rack scroll.
  Prefer transform/opacity; avoid animating height/width.
- Reduced branch also disables `scroll-behavior: smooth` and long `transition`s.

---

## 10. Art framing and safe areas

| Asset | Canvas | Safe area | UI window | Object position | Alt source |
| --- | --- | --- | --- | --- | --- |
| Card | 300×420 | 24px | 6/5 art window (`240×200` box) | 50% 42%, 150% height crop | content name + element + primary |
| Enemy | 512×512 | 32px | 1:1 portrait | 50% 32%, cover | enemy name + element |
| Field | 256×256 | 16px | 1:1 roundel | 50% 50%, cover | `<Element> field` |

Rules:

- Reserve the box with `aspect-ratio` from the manifest dimensions before the
  image decodes; never let art load shift the board.
- The safe area is the asset's guarantee. Critical HTML labels/badges sit
  outside the art window; do not overlay text on the image unless an opaque
  scrim gives ≥4.5:1.
- The warm scrim is `--fb-art-filter` plus `--fb-art-vignette`; no recolouring,
  no SVG filter, no replacement art.
- The manifest swap contract is unchanged: any replacement at the same path and
  canvas size must work without a code edit.
- Fallbacks use the manifest `name`; the reserved aspect ratio stays.

---

## 11. Accessibility contract

- **Targets:** every interactive element ≥44×44; fan hit boxes do not overlap;
  8px between adjacent targets where possible.
- **Focus:** two-tone ring on every surface; `:focus-visible` only; focus
  returns to the invoking card after a sheet closes; dialogs trap focus.
- **Colour:** no colour-only cue; glyph + word for every element/status; all
  text meets the contrast table; no text below 11px, body ≥12px.
- **Motion:** hard reduced branch for OS and in-app; static outcomes remain.
- **Forced colours:** system palette, 1–2px `CanvasText` rules, `Highlight`
  focus, materials/filters off.
- **Reading:** document panels use 16px/1.6, max 68ch; no justified text; no
  all-caps body.
- **Announcements:** one polite live region for turn/damage/field/outcome; the
  log history is non-live. The latest-line strip is the only live log surface.

---

## 12. Handoff to execution (#15)

1. Promote `docs/design-system/tokens.css` to `src/styles/tokens.css`; delete
   `--fb-radius`, `--fb-panel`, `--fb-border*`, `--fb-shadow*`,
   `--fb-font-body`, `--fb-text-body/small/tiny` and the old motion names.
2. Rewrite the shell, menu/setup/reward/results table surfaces, battle board,
   card face, detail sheet, log and reading documents against the semantic
   tokens. Do not change engine, controllers, persistence, content or the
   manifest contract.
3. Raise text floors: 11px uppercase labels, 12px body; let the log scroll
   rather than shrinking. Recheck the 375×667 intent-expanded frame.
4. Add a token contract test (unit) that:
   - parses `tokens.css` and asserts every required token exists;
   - asserts no `--fb-radius` alias and no raw hex in component CSS;
   - computes WCAG ratios for the pairs in §3.3 and fails below 4.5/3.0;
   - asserts `--fb-target: 2.75rem`.
5. Run the release checks at 390×844, 375×667, 768×1024, 1024×768 and 1280×800;
   verify no page scroll on battle, only log/rack scroll, 44px targets, focus
   return, reduced motion from both sources, forced-colors fallback, and the
   subpath build/origin audit.

### Resolved decisions

- **One warmed slate palette**, no light theme; parchment is the reading
  material. High contrast is `prefers-contrast` + `forced-colors`, not a toggle.
- **Brass is the only rule colour**; ember is the primary action fill.
- **Fraunces 700 subset** is the display face; system serif is the fallback and
  Bitter is a licensed swap-in, not a second default download.
- **No duplicate radius token**; 3/5/8/12/16/pill.
- **11px minimum for labels, 12px for body**; the prototype's smaller metadata
  is not carried forward.
- **One motion set**, 120–400ms, with static equivalents; no choreographed turns.
- **Placeholder art is framed, never recoloured**, and the manifest swap contract
  is unchanged.
