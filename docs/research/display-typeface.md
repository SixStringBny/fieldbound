# Display typeface shortlist within the offline budget

Research ticket: [#3 Display typeface shortlist within the offline budget](https://github.com/SixStringBny/fieldbound/issues/3).
Measured 2026-10-29 against `origin/main` at `590ad46`.

Every number below was produced here, in this repository, from the font binaries
downloaded from `google/fonts` and from the actual production build. Nothing is
quoted from a font marketplace page. The measurement scripts are throwaway and
live outside the repo (see [Reproducing the numbers](#reproducing-the-numbers)).

---

## 1. Verdict up front

Ship **Fraunces** as a single fully-pinned static subset (`wght=700, opsz=14,
SOFT=0, WONK=0`), renamed to `Fieldbound Display`, **11,288 bytes** of WOFF2, for
the wordmark, card names and screen titles. It is the only candidate that measured
both the sturdiest at 11 px and the most characterful at 72 px, and its 0.482 em
x-height sits within 4 % of Segoe UI's 0.500 em, so it lines up with the existing
sans instead of shrinking next to it.

**Bitter** is the fallback if Fraunces' softness reads as too playful: 9,340 bytes,
highest x-height of the set, and the cheapest sturdy option. **Cinzel** is a
worthwhile optional second face for uppercase eyebrows and section plates only —
its lowercase is drawn as capitals, so it cannot carry card names.

The face does **not** consume the 300 KiB budget: `scripts/check-budget.mjs` sums
only `.js/.mjs/.cjs/.css` ([lines 33–36](https://github.com/SixStringBny/fieldbound/blob/main/scripts/check-budget.mjs#L33-L36)),
and a CSS-referenced WOFF2 is emitted as its own hashed file. Measured with a
probe build: **+85 bytes of gzip CSS, 11,288 bytes of separate font file.**

---

## 2. What the repository already constrains

| Constraint | Source | Effect on this decision |
| --- | --- | --- |
| "do not fetch remote fonts, images or audio files" | `VIS-CON-06`, `docs/PRD.md:67` | The face must be committed and same-origin. Rules out the Google Fonts CDN. |
| "no third-party scripts, remote fonts or remote images; zero cross-origin requests" | `VIS-SEC-02`, `docs/PRD.md:262` | Same. The release audit fails on any cross-origin request. |
| `font-src 'self'` | `vite.config.ts:15` | Already correct. **No CSP change is needed** to add a self-hosted face. |
| 300 KB gzip for JS + CSS | `VIS-NFR-02`, `docs/PRD.md:222`; `scripts/check-budget.mjs:33` | Font files are outside the summed extensions. See §3. |
| "avoid layout shift when SVGs load" | `VIS-NFR-02` | The face needs `font-display` and a metric-compatible fallback, or first paint will reflow titles. |
| Installable PWA with offline caching (future, `docs/PRD.md:343`) | `docs/PRD.md:341` | Not implemented yet — there is no service worker in `public/`. A committed same-origin WOFF2 will be covered by whatever cache strategy lands; until then it relies on ordinary HTTP caching. |

The current stack (`src/styles/tokens.css:58-66`) is three families, all local:

```css
--fb-font-body: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, ui-serif, serif;
--fb-font-ui:   system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
--fb-font-glyph:"Segoe UI Symbol", "Apple Symbols", "Noto Sans Symbols 2", ui-sans-serif, sans-serif;
```

`--fb-font-body` is already doing display duty: the `<h1>` wordmark
(`.shell__title`, `clamp(2.75rem, 12vw, 4.5rem)`), card names at 15 px/700
(`.card-view__name`, `board.css:625-633`), card-detail titles, hand and enemy
titles. That is the slot a display face fills — not the body copy.

---

## 3. The budget question, measured

Baseline, this worktree, `node scripts/check-budget.mjs`:

| file | raw | gzip |
| --- | --- | --- |
| `assets/index-*.css` | 42,121 | 7,490 |
| `assets/index-*.js` | 376,685 | 107,767 |
| **total** | **418,806** | **115,257** |

Headroom: **191,943 bytes** of the 307,200 ceiling.

Probe: I added a `@font-face` in a copy of the repo pointing at a Fraunces subset
under `src/assets/fonts/`, then ran the same audit.

```
dist/assets/fraunces-700-vcI97dGf.woff2   11.02 kB          <- separate file, not summed
dist/assets/index-*.css                   42.27 kB │ gzip:   7.58 kB
dist/assets/index-*.js                   376.69 kB │ gzip: 109.05 kB
total (2 files)                          418,960   gzip: 115,342
```

So a shipped face costs **~85 gzip bytes inside the budget** (the `@font-face`
text) and **~11 KB of transfer outside it** — leaving 191,858 bytes of headroom.
With `VITE_BASE=/Card-Game-Project/`
the emitted CSS rewrites to `url(/Card-Game-Project/assets/fraunces-700-<hash>.woff2)`,
so subpath deployment needs no manual path handling. This also means the audit's
"no cross-origin request" check keeps passing — the font is same-origin.

Caveat worth recording: because the font is *outside* the audited total, there is
no automatic guard against someone later inlining a font as base64 in CSS. If a
future face were inlined, its bytes would land in the CSS total. Keep fonts as
separate `url()` assets and the budget stays honest.

---

## 4. Subsetting strategy

### 4.1 What the copy actually contains

I scanned the 49 files that reach the DOM (`src/content`, `src/ui`, `src/battle-log`;
tests excluded): 113 distinct code points, 20 of them non-ASCII.

**Non-ASCII characters in visible copy — these must be in the subset:**

| Code point | Character | Uses | Where |
| --- | --- | --- | --- |
| U+00B7 | `·` | 14 | eyebrow/status separators, e.g. `RunResultScreen.tsx:35`, `BattleBoard.tsx`, `SoloSetupScreen.tsx` |
| U+2013 | `–` | 1 | `duelScoreText()` in `duel-copy.ts:21`, emitted as a `\u2013` escape in the score string |
| U+2014 | `—` | 2 | placeholder for "no effect" (`card-presentation.ts:94`) and "no value" (`RunResultScreen.tsx:87`) |
| U+201C, U+201D | `“ ”` | 1 each | `Hand.tsx:51` (unknown-card copy) |

Note that two of these reach the DOM through `\uXXXX` escapes rather than literal
characters, so a grep for the glyph undercounts. The rendered output is what
matters, and it does contain all five.

**The other 15 non-ASCII code points are geometric cue glyphs** — `▲ ◆ ◇ ◈ ○ ☰ ✕ ✚ ✦ ✧ ⇄ ≋ ⊘ ▭ ❄` —
and they are rendered inside `.element-cue__glyph` / fallback-art spans that
already declare `--fb-font-glyph` (`board.css:124-130`, `335`, `730`). They are
**not** the display face's job and must not be added to its subset; if they were,
they would render in the display style and lose the glyph stack's guaranteed
coverage.

**Accents: there are none.** Zero Latin-1 or Latin Extended characters appear in
shipped copy, and there is no free-text input anywhere in `src/ui` (no player-name
field), so users cannot inject accented names today. 93 of the 95 printable ASCII
characters are used — `#` and `~` are the only unused ones.

### 4.2 The three profiles I measured

| Profile | Contents | When to use |
| --- | --- | --- |
| `used` | U+0020–U+007E + U+00B7, U+2013, U+2014, U+201C, U+201D | **Recommended.** Exactly what the app renders. |
| `used+symbols` | `used` + `× • … ← ↑ → ↓ ▲ ◆ ✕` | Only if a future screen puts symbols inside display-styled text. |
| `used+latin1` | `used` + U+00C0–00FF + Œ œ Š š Ÿ Ž ž | Only if copy gains accents or a locale is added. |

Layout features kept: `ccmp, kern, liga, calt`. Dropping the rest costs nothing
visually and saves a few hundred bytes; `tnum`, `smcp`, `onum` are not used by the
display slot.

### 4.3 Measured WOFF2 sizes

Single static instance at the weight shown, `used` profile, `--flavor=woff2`:

| Face | Instance | `used` | `used+symbols` | `used+latin1` |
| --- | --- | ---: | ---: | ---: |
| **Fraunces** | 700 / opsz 14 / SOFT 0 / WONK 0 | **11,288** | 11,400 | 14,072 |
| Alegreya | 700 | 13,328 | 13,716 | 16,068 |
| Bitter | 600 | 9,340 | 9,652 | 12,136 |
| Cinzel | 700 | 9,856 | 10,020 | 12,292 |
| Zilla Slab | Bold | 13,140 | 13,456 | 18,108 |
| Grenze | 600 | 7,376 | 7,552 | 9,304 |
| Petrona | 600 | 14,744 | 15,080 | 17,860 |
| IM FELL English | Regular (no bold exists) | 41,124 | 41,524 | 50,380 |

Run-to-run variance is tens of bytes (brotli emits slightly different streams);
treat these as ±0.1 KB.

For comparison, the prebuilt `latin` files Google's own API serves (variable where
the family is variable): Fraunces 67,304 · Alegreya 43,476 · Bitter 34,072 ·
Zilla Slab 26,468 per weight · Cinzel 25,904 · IM FELL English 59,880. A custom
subset is **2–4× smaller** than the general-purpose latin file in every case,
which is the whole argument for doing it ourselves.

### 4.4 Variable or static?

Measured, same `used` profile; "statics" are fully pinned instances (every axis).

| Face | Variable (all axes) | Static 400 | Static 600 | Static 700 | Static 900 | Statics per variable |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Fraunces (opsz 14) | 78,764 | 11,168 | 11,212 | 11,288 | 11,124 | ~7 |
| Alegreya | 24,820 | 13,156 | — | 13,328 | — | ~1.9 |
| Bitter | 17,884 | 9,568 | 9,340 | 9,676 | — | ~1.9 |
| Cinzel | 17,284 | 9,276 | — | 9,856 | — | ~1.8 |

The answer depends on how many axes the family has:

- **Single-axis families (Alegreya, Bitter, Cinzel):** one variable file costs about
  two statics, so the variable file is cheaper as soon as two weights are needed.
- **Fraunces has four axes (opsz, wght, SOFT, WONK):** its deltas are expensive, so
  the variable file costs roughly seven statics. The display slot needs exactly one
  weight at one optical size, so a static instance is **7× cheaper** — 11,288 B
  instead of 78,764 B. If both text and wordmark optical sizes are wanted, two
  statics (opsz 14 + opsz 144) cost 11,288 + 11,052 = 22,340 B, still 3.5× cheaper
  than the variable file.

**Pinning everything matters.** `instantiateVariableFont` only drops an axis when
that axis is pinned. Subsetting a Fraunces instance that still has `SOFT` and
`WONK` live leaves all the variation deltas in `gvar` and measured **19,548 B**
instead of 11,288 B — a 73 % overshoot that looks like a normal subset size and is
easy to ship by accident. Pin `opsz`, `wght`, `SOFT` and `WONK` explicitly.

A second pinning gotcha: with `updateFontNames=False` the default-instance names
survive — Bitter's 600 instance still calls itself "Bitter Thin", because Thin is
the variable font's default. A shipping pipeline must set the name table
explicitly. This matters for the licensing point in §6.

Reproduce with:

```
pyftsubset Fraunces.ttf \
  --unicodes=U+0020-007E,U+00B7,U+2013,U+2014,U+201C,U+201D \
  --layout-features=ccmp,kern,liga,calt \
  --flavor=woff2 --output-file=fieldbound-display-700.woff2
```

(Instance the variable font to `wght=700, opsz=14, SOFT=0, WONK=0` first, and give
the result a new family name.)

---

## 5. Legibility and contrast at small sizes

The face will be read at **15 px/700** on card names and **11–13 px** on eyebrows
and meta labels (`--fb-text-small: 0.8125rem`, `--fb-text-tiny: 0.6875rem`,
`tokens.css:68-71`). Two things decide whether a display serif survives at that
size: x-height relative to the em, and whether its thinnest strokes still reach
solid ink after antialiasing.

### 5.1 Font-file metrics

Read from the binaries (`OS/2.sxHeight`, `OS/2.sCapHeight`, `head.unitsPerEm`,
`glyf` bounds, `AreaPen`), all from the 700 instance (Bold for Zilla Slab, the only
weight for IM FELL). Stem width is the bounding-box width of `l` at that weight.

| Face | units/em | x-height | cap | x/em | x/cap | stem `l` @700 | ink of `o` (em²) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Fraunces | 2000 | 964 | 1400 | **0.482** | 0.689 | 561 | 0.164 |
| Bitter | 1000 | 534 | 704 | **0.534** | 0.759 | 273 | 0.168 |
| Cinzel | 1000 | 500 | 700 | 0.500 | 0.714 | 510 | 0.181 |
| IM FELL English | 2048 | 962 | 1417 | 0.470 | 0.679 | 547 | 0.089 |
| Alegreya | 1000 | 452 | 637 | 0.452 | 0.710 | 250 | 0.125 |
| Grenze | 1000 | 456 | 608 | 0.456 | 0.750 | 220 | 0.129 |
| Zilla Slab | 1000 | 445 | 650 | 0.445 | 0.685 | 227 | 0.083 |
| Petrona | 1000 | 443 | 641 | 0.443 | 0.691 | 269 | 0.117 |
| *Segoe UI (reference sans)* | 2048 | 1024 | 1434 | *0.500* | *0.714* | — | — |

### 5.2 Rendered ink coverage at 11 / 15 / 20 px

Proxy, not a standard: I rendered `Cinder Jab Wyrm` in the 700 instance on
`#f3ead7` (parchment) and `#2f241b` (the stone shade, the darkest surface in the
app) with FreeType, then measured per-pixel ink coverage against the intended ink
colour. `mean` is the average coverage of ink pixels; `≥90%` is the share of ink
pixels that reach near-solid ink. Higher is sturdier at small sizes.

| Face | 11 px mean | 11 px ≥90% | 15 px mean | 15 px ≥90% | 20 px mean |
| --- | ---: | ---: | ---: | ---: | ---: |
| **Fraunces** | **0.71** | **0.45** | 0.75 | 0.48 | 0.79 |
| Bitter | 0.69 | 0.38 | 0.73 | 0.51 | 0.82 |
| Grenze | 0.68 | 0.30 | 0.71 | 0.47 | 0.80 |
| Zilla Slab | 0.65 | 0.33 | 0.70 | 0.40 | 0.76 |
| Cinzel | 0.62 | 0.27 | 0.67 | 0.42 | 0.73 |
| Petrona | 0.60 | 0.19 | 0.66 | 0.35 | 0.72 |
| Alegreya | 0.59 | 0.28 | 0.73 | 0.49 | 0.76 |
| IM FELL English | 0.55 | 0.20 | 0.59 | 0.27 | 0.67 |

Parchment and dark values were identical to two decimals for every face: the
renderer produces the same coverage either way. What differs on a dark surface is
**perception**, not pixels — light-on-dark text gains apparent weight (irradiation)
and high-contrast hairlines bloom, closing up counters. WCAG's contrast formula is
polarity-blind ([SC 1.4.3](https://www.w3.org/TR/WCAG22/#contrast-minimum)), while
APCA explicitly models polarity as a separate term
([SAPC-APCA](https://github.com/Myndex/SAPC-APCA)). Practical consequence: treat
the dark-surface numbers below as a floor, and prefer the sturdier face on dark,
because it is the one whose counters survive the bloom.

Two more findings from the same measurements:

- **IM FELL English is disqualified for card text.** Its antique contour texture
  is exactly what brotli cannot compress — 41 KB after subsetting, four times
  Bitter — it has no bold at all (browsers synthesise a smeared faux bold), and it
  produced the weakest 11 px coverage in the set.
- **Fraunces has no `tnum`.** Its GSUB features are `case liga rvrn ss01`.
  `board.css` sets `font-variant-numeric: tabular-nums` at lines 282, 340, 651 and
  827, so **numbers must stay in the sans or body stack**. This is a real
  constraint on the integration, not a style preference: proportional figures in a
  display face make stat rows jitter when values change.

### 5.3 Contrast on the two surfaces

Computed from the token values in `tokens.css` with the WCAG 2.2 relative
luminance formula. WCAG thresholds: **4.5:1** normal text, **3:1** large text
(≥24 px, or ≥18.66 px bold) — [SC 1.4.3](https://www.w3.org/TR/WCAG22/#contrast-minimum).

| Pair | Ratio | Verdict |
| --- | ---: | --- |
| ink `#2b2419` on parchment `#f3ead7` | 12.83:1 | passes everything |
| ink on paper `#fffdf7` | 15.08:1 | passes everything |
| ink-soft `#5b4f3d` on parchment | 6.68:1 | passes AA normal text |
| ink-soft on parchment-deep `#e6d7bb` | 5.63:1 | passes AA normal text |
| accent `#7a3f1d` on parchment | 6.87:1 | passes AA |
| paper text on accent button | 7.90:1 | passes AA |
| stone-ink `#fdf6e3` on stone-shade `#2f241b` | 14.02:1 | passes everything |
| stone-ink on stone-bg `#5b4636` | 8.20:1 | passes AA |
| neutral-ink on neutral-shade `#111827` | 16.98:1 | passes everything |
| ember-ink on ember-bg `#7f1d1d` | 9.44:1 | passes AA |
| frost-ink on frost-bg `#1e3a8a` | 9.52:1 | passes AA |
| gale-ink on gale-bg `#115e59` | 7.20:1 | passes AA |

Colour is not the risk here — the palette is comfortable. The risks are stroke
weight and the existing `-webkit-font-smoothing: antialiased` at `base.css:21`,
which thins strokes further on macOS. A delicate display serif (Petrona, IM FELL,
Alegreya at 11 px) plus that declaration is the combination that fails, not the
palette. Fraunces and Bitter at 700 are the two that hold.

---

## 6. Licensing and attribution

All of these families are SIL Open Font License 1.1, and the license
travels with the file. The requirements that actually bite:

**1. A webfont subset is a *Modified Version*.** The OFL defines a Modified
Version as a derivative "made by adding to, deleting, or substituting – in part or
in whole – any of the components of the Original Version, **by changing formats**
or by porting the Font Software to a new environment"
([OFL 1.1 definitions](https://openfontlicense.org/open-font-license-official-text/)).
The FAQ is explicit: "Removing any parts of the font when delivering a webfont to
a browser, including unused glyphs and smart font code, is considered modification.
This is permitted by the OFL but would not normally allow the use of RFNs"
([OFL-FAQ 2.6](https://openfontlicense.org/ofl-faq/)). The web-font guidance page
reaches the same conclusion for pre-subsetting specifically: it "needs to be
considered a Modified Version for which RFN restrictions apply"
([Webfonts and Reserved Font Names](https://openfontlicense.org/webfonts-and-reserved-font-names)).

**2. Therefore: rename the subset.** `No Modified Version of the Font Software may
use the Reserved Font Name(s)` (OFL conditions, §3). Of the shortlist, only
**Bitter** carries an RFN — "`Copyright 2011 The Bitter Project Authors … with
Reserved Font Name "Bitter Pro"`". The others declare no RFN, so a subset may
legally keep its name; renaming anyway is simpler, keeps the CSS family stable
across upstream swaps, and sidesteps the argument entirely. Use
`Fieldbound Display`.

**3. The copyright notice and the license must ship with the file.** "Original or
Modified Versions … may be bundled, redistributed and/or sold with any software,
provided that each copy contains the above copyright notice and this license"
(OFL conditions, §2). Machine-readable metadata satisfies it — and I verified it
survives subsetting: with `--name-IDs=*` the produced WOFF2 still carries
name ID 0 (copyright) and 13 (license description) plus ID 14 (license URL), e.g.
`Copyright 2018 The Fraunces Project Authors (https://github.com/undercasetype/Fraunces)`.
But the FAQ only accepts a bare URL "reluctantly": a link alone is "legally
sufficient … but we strongly recommend against this"
([OFL-FAQ 1.10](https://openfontlicense.org/ofl-faq/)). Commit the full `OFL.txt`.

**4. Crediting in the app is not required.** "Is any kind of acknowledgement
required? No. Font authors may appreciate being mentioned … but that is not
required" ([OFL-FAQ 1.1.2](https://openfontlicense.org/ofl-faq/)). So the privacy
screen does not need a type credit; a repository-level credit is still good
manners and cheap.

**5. The license is sticky.** The Modified Version "must be distributed entirely
under this license, and must not be distributed under any other license", and
"Neither the Font Software nor any of its individual components … may be sold by
itself" (OFL conditions, §5 and §1; the termination clause applies if any
condition is missed).

**Commit checklist for the chosen face:**

- [ ] `src/assets/fonts/fieldbound-display-700.woff2` — renamed subset.
- [ ] `src/assets/fonts/OFL.txt` — verbatim upstream licence (Fraunces: 4,391 B).
- [ ] A line in the README or `docs/CREDITS.md`: family, upstream repo, copyright
      holder, licence, and the subset command so the derivation is reproducible.
- [ ] Name IDs 0 / 13 / 14 untouched; do not strip metadata.
- [ ] No third-party sale, no relicense, no CDN.

Per-family copyright lines as committed upstream:

| Face | Copyright line | RFN? |
| --- | --- | --- |
| Fraunces | Copyright 2018 The Fraunces Project Authors (https://github.com/undercasetype/Fraunces) | no |
| Alegreya | Copyright 2011 The Alegreya Project Authors (https://github.com/huertatipografica/Alegreya) | no |
| Bitter | Copyright 2011 The Bitter Project Authors (https://github.com/solmatas/BitterPro) | **"Bitter Pro"** |
| Cinzel | Copyright 2020 The Cinzel Project Authors (https://github.com/NDISCOVER/Cinzel) | no |
| Zilla Slab | Copyright 2017, The Mozilla Foundation | no |
| IM FELL English | Copyright (c) 2010, Igino Marini (mail@iginomarini.com) | no |

---

## 7. The shortlist

### 1. Fraunces — recommended

- Specimen: <https://fonts.google.com/specimen/Fraunces> · Source: <https://github.com/undercasetype/Fraunces>
- Variable: `opsz 9–144`, `wght 100–900`, plus `SOFT 0–100` and `WONK 0–1`.
  The two extra axes are the point: `SOFT` rounds the corners toward a printed-on-rag
  feel, `WONK` gives the asymmetric old-style details that read as a hand-set field
  manual rather than a corporate serif. The **default instance has `WONK=1`** — pin
  `WONK=0` for card names at 15 px and keep `WONK=1` only if the wordmark wants the quirk.
- Measured: **11,288 B** at 700/opsz14/SOFT0/WONK0; 11,052 B at 700/opsz144 for the wordmark;
  78,764 B for the whole variable file. x/em 0.482; strongest 11 px coverage in the set.
- Cost: no `tnum`, no `smcp`; only `case`, `liga`, `rvrn`, `ss01`.
- Fallback stack:

```css
--fb-font-display:
  "Fieldbound Display", "Fraunces", "Iowan Old Style", "Palatino Linotype",
  "Book Antiqua", Georgia, ui-serif, serif;
```

### 2. Bitter — the legibility and budget fallback

- Specimen: <https://fonts.google.com/specimen/Bitter> · Source: <https://github.com/solmatas/BitterPro>
- `wght 100–900`, slab serifs, the largest x-height measured (0.534 em), `tnum`,
  `smcp`, `zero`. Cheapest sturdy option at **9,340 B**.
- Trade-off: the slab is more "engineering manual" than "old field journal", and it
  carries the RFN `"Bitter Pro"`, so the subset must be renamed — which is the plan anyway.
- Fallback stack:

```css
--fb-font-display:
  "Fieldbound Display", "Bitter", "Rockwell", "Iowan Old Style", Georgia,
  ui-serif, serif;
```

### 3. Cinzel — optional second face for caps-only plates

- Specimen: <https://fonts.google.com/specimen/Cinzel> · Source: <https://github.com/NDISCOVER/Cinzel>
- Inscriptional Roman capitals; **lowercase is drawn as capitals**, so it can only
  style uppercase text. Perfect for `.shell__eyebrow` (`text-transform: uppercase`,
  `base.css:82-88`) and section plates, wrong for card names.
- Measured: **9,856 B** at 700. Wide — 0.639 em average lowercase advance against
  Fraunces' 0.575 em, so budget about 11 % more line length.
- Fallback stack:

```css
--fb-font-caps:
  "Fieldbound Caps", "Cinzel", "Trajan Pro", "Iowan Old Style", Georgia,
  ui-serif, serif;
```

### 4. Zilla Slab — the neutral alternative

- Specimen: <https://fonts.google.com/specimen/Zilla+Slab> · Source: <https://github.com/mozilla/zilla-slab>
- Static family, five weights, from Mozilla; no RFN; `tnum`, `smcp`, `ornm`.
  **13,140 B** at Bold. Clean and unremarkable — good if the art style changes to
  something more modern, but it does not create the "field manual" feeling by itself.
- Fallback stack:

```css
--fb-font-display:
  "Fieldbound Display", "Zilla Slab", "Rockwell", Georgia, ui-serif, serif;
```

### Considered and not shortlisted

- **IM FELL English** (<https://fonts.google.com/specimen/IM+Fell+English>) — the most
  authentic antique texture and the worst fit: 41,124 B subset (brotli cannot compress
  the texture), no bold, weakest 11 px coverage.
- **Petrona** — thin strokes at 11 px, 14,744 B, no distinct voice.
- **Grenze** — cheapest of all (7,376 B) and genuinely distinctive (angular, woodcut),
  but its narrow, high-contrast forms are the riskiest at 11 px and it is less legible
  than Fraunces at equal size.

### Recommendation

**Fraunces, one static subset at 700/opsz 14/SOFT 0/WONK 0 (11,288 B), renamed
`Fieldbound Display`.** Apply it to the wordmark, `.shell__title`, `.shell__page-title`,
`.card-view__name`, `.card-detail__title`, `.hand__title`, `.enemy-panel__title` and
`.solo-deck__name` — i.e. the places that already ask for `--fb-font-body` at large
size or 700 weight. Leave prose on the existing Iowan/Palatino/Georgia stack (a
second weight would add ~11 KB and the display face is tiring at 16 px for
paragraphs), and leave every numeric readout in the sans with `tabular-nums`.

If the wordmark still looks under-scaled at 375 px, add the opsz 144 file
(11,052 B) as a second `@font-face` with a distinct family name —
total 22,340 B, still trivial against 191 KB of headroom.

---

## 8. Pairing with the existing system sans

`--fb-font-ui` is a neutral grotesque (`system-ui` → Segoe UI on Windows, SF on
Apple, Roboto on Android). Pairing rules that follow from the measurements:

1. **Category contrast, not weight contrast.** A serif display next to a neutral
   sans reads as "title vs interface" immediately. Two sans faces would need size
   and weight gymnastics to separate.
2. **x-height parity.** Fraunces 0.482 em vs Segoe UI 0.500 em — **−3.6 %**, so a
   15 px card name and a 15 px sans label sit on nearly the same optical line.
   Bitter is +6.8 %, still fine. Zilla Slab (−11 %), Petrona (−11.4 %) and Grenze
   (−8.8 %) all look smaller than their declared size and need a 1 px bump to match.
3. **One weight step apart.** UI labels use 600 (`.shell__eyebrow`, `.menu__entry`);
   a 700 display face gives the hierarchy without a size jump, which matters inside
   the 128 px card width.
4. **Numbers stay sans.** Fraunces has no `tnum`; every stat readout in the app asks
   for `font-variant-numeric: tabular-nums`. Mixing proportional display figures into
   stat rows would jitter values as they change.
5. **Fallback must be metric-adjacent.** On first paint before the WOFF2 lands, the
   fallback is Georgia/Palatino. Adding `size-adjust`/`ascent-override` to the
   `@font-face` (or `font-display: optional` for the wordmark only) keeps
   `VIS-NFR-02`'s "no layout shift" promise.

---

## 9. Integration notes (not implemented here)

```css
@font-face {
  font-family: "Fieldbound Display";
  src: url("../assets/fonts/fieldbound-display-700.woff2") format("woff2");
  font-style: normal;
  font-weight: 700;
  font-display: swap;
}
```

- Put the file under `src/assets/fonts/`, not `public/`: Vite then hashes it and
  rewrites the URL with the configured base — verified, the subpath build emitted
  `url(/Card-Game-Project/assets/fraunces-700-<hash>.woff2)`. A file under `public/`
  would need the base prepended by hand and would not be hashed.
- CSP needs no change (`font-src 'self'` already present).
- `scripts/check-build.mjs` scans every emitted text file, CSS included, and fails
  on any external `http(s)` subresource URL, so a CDN font cannot slip through. It
  does **not** enumerate CSS `url()` targets for on-disk existence (the HTML
  reference audit at `check-build.mjs:161-186` only reads `script`/`link`/`img`), but
  its Playwright pass fails on any non-OK response — so a wrong local font path
  shows up as a failed request during the audit journey instead of silently
  404-ing in production.
- A `<link rel="preload" as="font" type="font/woff2" crossorigin>` in `index.html`
  is optional. It must carry `crossorigin` even same-origin, and it must resolve
  under the deployment base — verify against the built HTML before adding it.
- Do not add the font to `public/assets/assets.manifest.json`: that manifest is the
  art swap contract, and the budget audit requires every entry to resolve.

---

## 10. What I did not verify

- Rendering was FreeType via Pillow on Windows. macOS Core Text and Android
  FreeType apply different stem darkening; the 11 px ordering could shift by one
  place, though not enough to change the recommendation.
- No real-device or zoom (200 %) test with the face installed. `SC 1.4.4` still
  applies regardless of typeface.
- The E2E suite was not run with the face wired in; no product code was touched.
- APCA contrast numbers were not computed — the WCAG table above is the standard
  the repo's accessibility tests are written against.

---

## Reproducing the numbers

Throwaway scripts, kept outside the repository (scratch directory, not committed):

| Script | Purpose |
| --- | --- |
| `inventory.py` | character inventory of shipped copy |
| `authoritative.py` | the quoted static/variable WOFF2 sizes, all axes pinned |
| `metrics.py` | font-file metrics + FreeType ink-coverage probe + specimen sheet |
| `report.py` | tabulates the probe output |

Inputs: TTF binaries from `https://raw.githubusercontent.com/google/fonts/main/ofl/<family>/`,
fontTools 4.68.0, Pillow 13.0.0, Python 3.13.1, brotli. Budget numbers came from
`node scripts/check-budget.mjs` in this worktree (Vite 8.3.5, Node 22.13.0).

## Sources

- SIL Open Font License 1.1, official text — <https://openfontlicense.org/open-font-license-official-text/>
- OFL FAQ 1.1-update7 — <https://openfontlicense.org/ofl-faq/>
- Webfonts and Reserved Font Names (pre-subsetting is modification) — <https://openfontlicense.org/webfonts-and-reserved-font-names>
- google/fonts repository, `ofl/` families and their `OFL.txt` — <https://github.com/google/fonts/tree/main/ofl>
- Fraunces — <https://github.com/undercasetype/Fraunces> · <https://fonts.google.com/specimen/Fraunces>
- Alegreya — <https://github.com/huertatipografica/Alegreya> · <https://fonts.google.com/specimen/Alegreya>
- Bitter — <https://github.com/solmatas/BitterPro> · <https://fonts.google.com/specimen/Bitter>
- Cinzel — <https://github.com/NDISCOVER/Cinzel> · <https://fonts.google.com/specimen/Cinzel>
- Zilla Slab — <https://github.com/mozilla/zilla-slab> · <https://fonts.google.com/specimen/Zilla+Slab>
- IM FELL English — <https://fonts.google.com/specimen/IM+Fell+English>
- WOFF2 specification — <https://www.w3.org/TR/WOFF2/>
- WCAG 2.2 SC 1.4.3 Contrast (Minimum) — <https://www.w3.org/TR/WCAG22/#contrast-minimum>
- WCAG 2.2 SC 1.4.4 Resize Text — <https://www.w3.org/TR/WCAG22/#resize-text>
- APCA (polarity-aware contrast) — <https://github.com/Myndex/SAPC-APCA>
- CSS Fonts 5, `font-display` — <https://drafts.csswg.org/css-fonts-5/#font-display-desc>
- Repository constraints: `docs/PRD.md` (VIS-CON-06, VIS-SEC-02, VIS-NFR-02), `vite.config.ts`, `scripts/check-budget.mjs`, `src/styles/tokens.css`, `src/styles/board.css`, `src/styles/base.css`
