# CSS capability and performance envelope

**Ticket:** [#2 CSS capability and performance envelope](https://github.com/SixStringBny/fieldbound/issues/2)
**Date:** 2026-10-29
**Branch:** `research/css-capability-envelope`
**Scope:** which modern CSS and rendering capabilities the UI overhaul can rely on across current
and previous Chrome, Edge, Firefox and Safari (including iOS 16+), at 375 px and on low-end
mobile, without breaking the same-origin, no-remote-asset and 300 KiB gzip contracts.

This is a research note. It changes no product code.

---

## 1. Answer in one screen

| Ticket question | Verdict |
| --- | --- |
| Can the overhaul rely on `dvh`/`svh`, container queries, `clamp()`, `subgrid`, scroll snap, `filter`, SVG noise, gradients, masks, `@layer`, `:has()`, `prefers-reduced-*`? | **Yes**, with the per-feature guards in §3.3. The floor is Safari/iOS 16.0 and every one of these is supported there. |
| Can it rely on `color-mix()` and view transitions? | **`color-mix()` yes, but guarded** — iOS 16.0/16.1 do not have it (Safari 16.2+). **View transitions no** — Safari 18+, Firefox 144+; treat as pure enhancement. |
| Tactile surfaces with CSS/SVG only? | **Yes.** Paper, wood, brass and wax are cheap (gradients + pre-tiled noise). **Leather via live SVG `feTurbulence`/`feDisplacementMap`/`feDiffuseLighting` is the one cliff** — measured ~9 fps in WebKit versus 60 fps for every other recipe. Tile the noise instead. |
| Fixed `100dvh` table, no page scroll, no clipping at 375x667, 768x1024, 1280x800? | **Yes, with one correction:** size the shell with **`100svh`**, not `100dvh` (§6). Measured zero document overflow and zero clipping at all three sizes plus the "browser chrome visible" heights in Chromium 156, WebKit 27.2 and Firefox 157. |
| Self-hosted fonts under `font-src 'self'`? | **Yes.** One display face, pinned to a single weight and subset to Latin, is **13.5–17.8 KB WOFF2** (measured, §7.3). Preload with `crossorigin`; never inline as `data:`. |

---

## 2. Method and evidence

Two kinds of evidence are used, and they are labelled separately throughout:

* **Cited** — release notes, specs, MDN/browser-compat-data (BCD) and vendor blogs. BCD is the
  machine-readable table behind MDN's compatibility sections, so it is the precise source for
  "which version shipped it".
* **Measured** — run in this repository's Playwright 1.64.1 install on 2026-10-29 with
  **Chromium 156.0.8078.4**, **WebKit 27.2** and **Firefox 157.0** on Windows, 2x device scale
  factor for the rendering probes. Probes are described inline; they were throwaway files, not
  committed.

Two caveats that matter when reading the measured numbers:

1. These are desktop-class engines on a desktop CPU. A low-end phone is several times slower, so
   treat the numbers as **relative** signals (recipe A versus recipe B, engine X versus engine Y),
   not as predictions of absolute frame time on a phone.
2. Playwright's WebKit is the WebKit port built for Windows, not Safari. It is close for
   rendering, but it is not a Safari substitute for every feature: in this build
   `overscroll-behavior` reports unsupported even though Safari 16.0 shipped it (WebKit blog
   [WebKit Features in Safari 16.0](https://webkit.org/blog/13152/webkit-features-in-safari-16-0/)).
   Where the port and the release notes disagree, the release notes win and the port result is
   called out as an artefact.

Baseline for "current": **Chrome/Edge 157**, **Firefox 159**, **Safari 27.2** on 2026-10-29 —
from [Chromium Dash stable releases](https://chromiumdash.appspot.com/fetch_releases?channel=Stable&platform=Windows&num=1),
[Mozilla product-details](https://product-details.mozilla.org/1.0/firefox_versions.json) and
caniuse's Safari 27.2 column. "Previous" means the previous major of each.

---

## 3. Support matrix

### 3.1 Feature status

`Y` = supported in every version the overhaul must support. `G` = supported but needs a guard,
prefix or fallback. `N` = unsupported on part of the floor; enhancement only.

| Feature | Chrome / Edge | Firefox | Safari (macOS) | iOS | Floor status | Verdict | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `dvh` / `svh` / `lvh` | 108 | 101 | 15.4 | 15.4 | iOS 16 = Y | **Y** | [WebKit 15.4](https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/), [Firefox 101](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/101), [BCD](https://github.com/mdn/browser-compat-data) / [caniuse](https://caniuse.com/viewport-unit-variants) |
| Container **size** queries + `cq*` units | 105 (106 complete) | 110 | 16.0 | 16.0 | Y | **Y** | [WebKit 16.0](https://webkit.org/blog/13152/webkit-features-in-safari-16-0/), [Firefox 110](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/110), [BCD `@container`](https://github.com/mdn/browser-compat-data/blob/main/css/at-rules/container.json) |
| Container **style** queries | 111+ (partial) | 151 | 18.0 (partial) | 18.0 | N | **N** | BCD `@container.style_queries_for_custom_properties` |
| `color-mix()` | 111 | 113 | **16.2** | **16.2** | iOS 16.0/16.1 = N | **G** | BCD [`css.types.color.color-mix`](https://github.com/mdn/browser-compat-data/blob/main/css/types/color.json) |
| `clamp()` / `min()` / `max()` | 79 | 75 | 13.1 | 13.4 | Y | **Y** | [caniuse math functions](https://caniuse.com/css-math-functions) |
| `subgrid` | 117 | 71 | 16.0 | 16.0 | Y | **Y** | [WebKit 16.0](https://webkit.org/blog/13152/webkit-features-in-safari-16-0/), BCD `css-subgrid` |
| Scroll snap | 69 | 68 (full 99) | 11 | 11 | Y | **Y** | [BCD `scroll-snap-type`](https://github.com/mdn/browser-compat-data/blob/main/css/properties/scroll-snap-type.json) |
| `backdrop-filter` | 76 | 103 | 9 prefixed, **18 unprefixed** | 9 prefixed, 18 unprefixed | Y (prefixed) | **G** | [WebKit 18.0](https://webkit.org/blog/15865/webkit-features-in-safari-18-0/), BCD |
| `filter` (CSS functions) | 53 (18 with `-webkit-`) | 35 | 9.1 | 6 | Y | **Y** | BCD [`filter`](https://github.com/mdn/browser-compat-data/blob/main/css/properties/filter.json) |
| `filter: url(#svg)` + `feTurbulence` | 18 | 35 | 9.1 | 6 | Y (functional), expensive | **G** | [SVG Filter Effects spec](https://www.w3.org/TR/filter-effects/), §5 |
| Gradients (`linear`, `radial`) | 10–13 | 3.6–16 | 5.1–6.1 | 5.1–6.1 | Y | **Y** | [caniuse gradients](https://caniuse.com/css-gradients) (`conic` needs Chrome 69 / Firefox 83 / Safari 12.1 — also fine) |
| Masks (`mask-image`) | 120 unprefixed (`-webkit-` earlier) | 53 | 15.4 unprefixed (`-webkit-` from 4) | 15.4 / 4 | Y | **G** | BCD [`mask-image`](https://github.com/mdn/browser-compat-data/blob/main/css/properties/mask-image.json) |
| `@layer` | 99 | 97 | 15.4 | 15.4 | Y | **Y** | [WebKit 15.4](https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/), BCD `css-cascade-layers` |
| `:has()` | 105 | 121 | 15.4 | 15.4 | Y | **Y** | [WebKit 15.4](https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/), [Firefox 121](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/121) |
| View transitions (same-document) | 111 | **144** | **18.0** | **18.0** | N | **N** | [WebKit 18.0](https://webkit.org/blog/15865/webkit-features-in-safari-18-0/), [Firefox 144](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/144), BCD |
| `prefers-reduced-motion` | 74 | 63 | 10.1 | 10.3 | Y | **Y** | BCD [`@media`](https://github.com/mdn/browser-compat-data/blob/main/css/at-rules/media.json) |
| `prefers-contrast` | 96 | 101 | 14.1 | 14.1 | Y | **Y** | BCD `@media.prefers-contrast` |
| `prefers-color-scheme` | 76 | 67 | 12.1 | 12.1 | Y | **Y** | BCD `@media.prefers-color-scheme` |
| `forced-colors` | 89 | 89 | 16.0 | 16.0 | Y | **Y** | BCD `@media.forced-colors` |
| `prefers-reduced-transparency` | 118 | 113 | **no** | **no** | N | **N** | BCD `@media.prefers-reduced-transparency` |
| `color: oklch()` / `lab()` | 111 | 113 | 15 | 15 | Y | **Y** | BCD `css.types.color.oklch` |
| `light-dark()` | 123 | 120 | 17.5 | 17.5 | N | **G** | BCD `css.types.color.light-dark` |
| `env(safe-area-inset-*)` | 69 | 65 | 11.1 (`constant()` 11.0) | 11.2 | Y | **Y** | [WebKit: Designing Websites for iPhone X](https://webkit.org/blog/7929/designing-websites-for-iphone-x/), [caniuse env()](https://caniuse.com/css-env-function) |
| `aspect-ratio` | 88 | 89 | 15 | 15 | Y | **Y** | BCD `aspect-ratio`; also verified via `CSS.supports` in all three engines |
| `scrollbar-gutter` | 94 | 97 | 18.2 | 18.2 | N (16) | **N** | BCD `scrollbar-gutter`; verified unsupported-relevant behaviour in WebKit 27.2, absent on the iOS 16 floor |
| `overscroll-behavior` | 63 | 59 | 16.0 | 16.0 | Y | **Y** | [WebKit 16.0](https://webkit.org/blog/13152/webkit-features-in-safari-16-0/); BCD `overscroll-behavior` (Playwright's Windows WebKit build reports it unsupported — port artefact) |
| `text-wrap: balance` | 114 | 121 | 17.5 | 17.5 | N (16) | **G** | BCD `text-wrap.balance`; enhancement only |

### 3.2 What "current and previous" means in practice

The overhaul's real constraint is **iOS 16.0**, not current desktop. iOS 16.0 shipped in
September 2022 and is still inside common device-update windows, so it sets the floor for
`color-mix()`, view transitions, container style queries, `light-dark()` and
`prefers-reduced-transparency`. Everything else in the ticket's list is available on that floor.

iOS 16.0/16.1 versus 16.2 is the only sub-version split that changes an architecture decision,
and it is only about `color-mix()`.

The "current and previous" requirement is satisfied by construction: the previous majors in
October 2026 (Chrome/Edge 156, Firefox 158, Safari 27.1 / iOS 26.x) are all newer than every
"shipped in" version in the table above, so a green cell is green for current **and** previous.
The only columns that are not trivially green are the iOS 16.x ones, which is why the floor is
called out separately.

### 3.3 Per-feature notes and required guards

**`dvh` / `svh` / `lvh`.** Shipped in Safari 15.4, Chrome 108, Firefox 101. The spec is explicit
that dynamic units can resize *while the user scrolls* and that this "can be disturbing to the
user and/or costly in terms of performance"
([CSS Values 4 §5.1.1](https://www.w3.org/TR/css-values-4/#viewport-variants)). Guard: never use
`dvh` as the height of the non-scrolling game shell (§6); use it only as an upper bound inside
the shell, always inside `min()` with a `rem` cap. One historical Safari bug — `dvh` larger than
the viewport in 15.6 — was fixed in WebKit
([bug 242758](https://bugs.webkit.org/show_bug.cgi?id=242758), RESOLVED FIXED).

**Container queries.** Size queries and `cq*` units are safe on the floor. Style queries are not:
Chromium has them partial from 111, Safari only from 18.0 (and partial), Firefox only from 151.
Do not build a layout tier on `@container style(...)`.

**`color-mix()`.** Chrome 111, Firefox 113, **Safari/iOS 16.2**. On 16.0 and 16.1 an invalid
`color-mix()` declaration is dropped silently, which is exactly the failure mode that produces a
transparent or default-coloured surface. Guard: always author a plain fallback declaration
immediately before the mixed one, and keep the mix for tokens/derived shades rather than for
anything load-bearing:

```css
--fb-surface: #e2d2b3;                      /* iOS 16.0/16.1 */
--fb-surface: color-mix(in oklab, #e2d2b3 88%, #6b3f1f);
```

**`clamp()`.** Universal on the floor and already used by the current tokens
(`--fb-card-width: clamp(6rem, 26vw, 8rem)`). Preferred over media-query staircases.

**`subgrid`.** Safari 16.0 and Firefox 71 have it; Chromium only from 117. That is old enough to
use, but it buys little in a layout that is a single fixed three-row grid. Use it for the hand
strip only if the card internals genuinely need to align to the hand's rows.

**Scroll snap.** Universal. This is the correct tool for the 375 px hand: `overflow-x: auto` plus
`scroll-snap-type: x mandatory` keeps the page still while the hand scrolls (§6.4).

**`backdrop-filter`.** Two traps. First, Safari only dropped the prefix in 18.0
([WebKit 18.0](https://webkit.org/blog/15865/webkit-features-in-safari-18-0/)), so a unprefixed
`backdrop-filter` on the iOS 16 floor is *ignored* — the current `src/styles/board.css` uses only
the unprefixed property on `.battle-controls`, so that blur does not render in Safari before 18.
Always write both properties. Second, the blur samples everything behind it, so it must not sit
over an animated region on a low-end phone.

```css
-webkit-backdrop-filter: blur(6px);
backdrop-filter: blur(6px);
```

**`filter` and SVG filters.** CSS filter functions are universal. `filter: url(#id)` referencing
an inline SVG filter is also supported, but see §5: the cost is not in the syntax, it is in the
filter graph area × the number of times the browser must re-run it.

**Gradients and masks.** Both safe. `mask-image` needs `-webkit-mask-image` for Blink before 120
and for Safari before 15.4; ship both. Masks are cheap per paint but they are *paint*, so never
animate `mask-position` on a large element.

**`@layer`.** Safe; useful for keeping the surface recipes from fighting the layout rules. A
plain `@layer base, components, utilities;` statement is enough.

**`:has()`.** Safe. Note it is a *selector* cost, not a paint cost: keep it to shallow,
non-descendant-wildcard forms inside lists, and never inside a scroll handler's hot path.

**View transitions.** Chrome 111, Safari 18.0, Firefox 144. Below the floor. If used at all, wrap
it in feature detection and make the un-animated path the real one.

**`prefers-reduced-*`.** `prefers-reduced-motion` is universal and already honoured by
`src/ui/motion/motion.css` and `src/styles/base.css`. `prefers-contrast` and `forced-colors` are
available on the floor. **`prefers-reduced-transparency` is not available in any Safari** — do not
use it as the only fallback for translucent surfaces; use an explicit settings toggle or a
solid-background default.

---

## 4. Allowed and avoid

### 4.1 Allowed techniques

| Technique | Why it is allowed | Guard |
| --- | --- | --- |
| `clamp()` / `min()` / `max()` for type, gaps, card width | Universal, replaces breakpoints, no paint cost | none |
| CSS custom properties + `@layer` for tokens and surface recipes | Universal, zero runtime cost | keep one token file |
| Container size queries for card density | Floor-available, avoids resize listeners | size queries only |
| `:has()` for state-driven styling (e.g. `.hand:has(.card:focus-visible)`) | Floor-available | shallow selectors |
| Scroll snap for the hand strip | Universal, keeps the page still | snap on the strip, not the page |
| Gradients (linear/radial/conic/repeating) | Universal, rasterised once per paint | cap stacked layers |
| Pre-tiled SVG `feTurbulence` noise as a `background-image` data URI | Rasterised once, then blitted like an image | tile ≤ 64x64 CSS px, low `numOctaves` |
| `mix-blend-mode` / `background-blend-mode` | Universal, GPU-composited in both engines here | one blended layer per surface |
| `box-shadow` / `inset` shadows for bevels and depth | Universal | static only; never animate |
| `backdrop-filter` with both prefixes on one static overlay | Supported everywhere with the prefix | ≤ ~320x320 px, static content behind |
| `filter: blur()` / `brightness()` on small elements | Universal | ≤ 64x64 px or behind a static layer |
| `mask-image` (+ `-webkit-`) for torn edges and vignettes | Universal on the floor | no animation |
| `aspect-ratio`, `env(safe-area-inset-*)`, `overflow: clip` | Universal | `viewport-fit=cover` for insets |
| `prefers-reduced-motion`, `prefers-contrast`, `forced-colors` | Universal | honour all three |
| Transform/opacity animations on one composited layer | Compositor-only, the only reliably 60 fps properties ([web.dev animation guide](https://web.dev/articles/animations-guide)) | one `will-change` per moving layer |
| `100svh` shell + internal scrollers | See §6 | `min-height: 0` on every track |

### 4.2 Avoid

| Avoid | Reason |
| --- | --- |
| `100dvh` as the game-shell height | Resizes while chrome collapses; the shell should be stable. Use `100svh` and let `dvh` cap inner panels. ([CSS Values 4](https://www.w3.org/TR/css-values-4/#viewport-variants)) |
| `100vh` alone | On iOS it is the *large* viewport; the bottom action bar hides behind Safari's toolbar. |
| View transitions as the mechanism for screen changes | Safari 16/17 and Firefox <144 have no support. |
| `@container style(...)` | Partial in Chromium, Safari 18+, Firefox 151+. |
| `color-mix()` without a preceding fallback declaration | iOS 16.0/16.1 drops the declaration entirely. |
| `filter: url(#...)` with `feTurbulence` + `feDisplacementMap` + `feDiffuseLighting` over a card-sized area | Measured 106 ms/frame in WebKit (§5.2). Use tiled noise instead. |
| Any animation on or inside an SVG-filtered element | Re-runs the filter graph; the same 106 ms applied even to a transform-only child. |
| Animating `background-position`, `filter`, `box-shadow`, `mask-position` | Layout/paint properties; cannot hold 60 fps ([web.dev](https://web.dev/articles/animations-guide)). |
| `background-attachment: fixed` | Forces repaint on scroll on mobile; no benefit for an art-directed surface. |
| Many overlapping translucent layers with `backdrop-filter` | Each one samples what is behind it; cost multiplies with area and count. |
| `will-change` on more than a couple of elements | Allocates compositor memory permanently on a memory-constrained phone. |
| `position: fixed` for the bottom action bar | Fights the iOS visual viewport and the on-screen keyboard; use the grid's last row instead. |
| `prefers-reduced-transparency` as the only fallback | No Safari support at all. |
| `overscroll-behavior` as the *only* scroll containment | It is supported on the floor (Safari 16) but is not a substitute for `overflow: hidden` on the shell; the Windows WebKit port also disagrees, which is a reminder that this needs a device check. |
| Web fonts from a CDN | Violates the same-origin/no-remote-asset contract and `font-src 'self'`. |
| Inlining a font as a `data:` URI | `font-src 'self'` does not match `data:` (CSP3 §6.1.4 + source-expression matching), and base64 inflates bytes by 33 %. |
| `scroll-behavior: smooth` unconditionally | Conflicts with `prefers-reduced-motion` and with keyboard focus jumps. |

---

## 5. Tactile material surfaces with CSS and SVG only

### 5.1 Cost model

A surface recipe is a stack of *background layers* (rasterised once, then blitted) plus, at most,
one *filter*. The measured difference between "cheap" and "cliff" is not the number of gradients —
it is whether the browser has to re-run an SVG filter graph over a large area.

Browsers paint a layer once and reuse it as a texture, so stacking five gradients costs roughly the
same as one. A live SVG filter is different: the filter graph runs per paint, and animating
anything inside a filtered subtree forces it to run again. `feTurbulence` is the expensive node
(Perlin noise evaluated per pixel), `feDisplacementMap` and `feDiffuseLighting` add full-area passes.

### 5.2 Measured cost (335x420 CSS px panel, 2x DPR, 1.2 s sample, median of 3 runs)

Frame interval while animating; 16.6 ms = 60 fps, 33 ms = 30 fps.

| Recipe | Chromium 156 | WebKit 27.2 | Notes |
| --- | --- | --- | --- |
| Flat colour (reference) | 16.6 ms | 15.4 ms | baseline |
| Compositor transform (reference) | 16.5 ms | 15.5 ms | baseline |
| **Paper** — 3 gradient layers + tiled `feTurbulence` noise tile (64x64, 3 octaves) | 16.6 ms | 15.5 ms | free in practice |
| **Wood** — 2 repeating gradients + linear gradient | 16.5 ms | 15.5 ms | free in practice |
| **Brass** — stacked gradients (3 layers in the recipe) | 16.6 ms | 15.4 ms | free in practice |
| **Wax** — turbulence tile + 2 radial gradients | 16.6 ms | 15.5 ms | free in practice |
| **Leather (bad)** — `filter: url(#leather)` with `feTurbulence` 4 octaves + `feDisplacementMap` + `feDiffuseLighting` | 16.6 ms | **106.6 ms** (12 frames in 1.2 s) | cliff |

The same leather filter with only a *composited transform* child moving inside it measured
**108.3 ms** in WebKit: the filter re-runs even though the filtered content did not change. So the
rule is absolute — **an SVG-filtered element must be static and must not contain moving children**.

`backdrop-filter` was measured separately (295x320 overlay over moving stripes): 16.6 ms Chromium
and 15.4 ms WebKit, i.e. cheap at overlay size. It is not a cliff like SVG filters, but it is still
worth keeping to one static overlay.

### 5.3 Recipes

All of these are same-origin, inline-only (no network request), and use colour tokens. Each recipe
was rendered at 375 px in Chromium 156 and WebKit 27.2 and checked visually: paper, leather, wood
and brass read as intended in both. One detail worth knowing: the baked `feDiffuseLighting` tile in
the leather recipe comes out with **lower highlight contrast in WebKit** than in Chromium. Tune the
tile opacity to the WebKit value and accept a slightly brighter Chromium surface; per-engine
branching is not worth it for a 48 px tile.

#### Paper (grain + fibre + warm falloff)

```css
.surface-paper {
  background-color: #ecdfc4;
  background-image:
    repeating-linear-gradient(94deg, rgb(120 96 62 / 10%) 0 1px, transparent 1px 4px),
    url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='64' height='64' filter='url(%23n)' opacity='0.28'/></svg>"),
    radial-gradient(120% 90% at 30% 10%, #f6ecd7, #e2d2b3);
  background-size: auto, 64px 64px, auto;
}
```

Cost: one 64x64 texture, computed once, plus two gradient layers. Measured 60 fps. `stitchTiles`
matters — without it the tile edges show as seams.

#### Leather (tiled noise + lighting gradients, no live filter)

```css
.surface-leather {
  background-color: #4a2a18;
  background-image:
    url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48'><filter id='l'><feTurbulence type='fractalNoise' baseFrequency='0.72' numOctaves='2' stitchTiles='stitch'/><feDiffuseLighting surfaceScale='2.2' diffuseConstant='1.05' lighting-color='%23f3d9b0'><feDistantLight azimuth='235' elevation='55'/></feDiffuseLighting></filter><rect width='48' height='48' filter='url(%23l)' opacity='0.5'/></svg>"),
    radial-gradient(80% 60% at 30% 20%, rgb(140 90 55 / 55%), transparent 70%),
    radial-gradient(90% 80% at 70% 80%, rgb(30 15 8 / 60%), transparent 70%),
    linear-gradient(150deg, #5b3620, #3a2011);
  background-size: 48px 48px, auto, auto, auto;
}
```

The lighting is baked into the tile once, then tiled — the expensive node runs over 48x48 px
instead of the card. Add the pebbled sheen with one `inset` `box-shadow` and a 1 px
`rgb(255 240 210 / 12%)` top border. Expect the same 60 fps as paper; the visual difference from
the live filter is small at phone scale.

#### Wood (ring bands, no filter)

```css
.surface-wood {
  background-color: #6b3f1f;
  background-image:
    repeating-radial-gradient(ellipse 140% 55% at 12% 45%,
      rgb(52 28 12 / 38%) 0 2px, transparent 2px 11px),
    repeating-radial-gradient(ellipse 90% 180% at 78% 30%,
      rgb(40 20 8 / 28%) 0 2px, transparent 2px 13px),
    repeating-linear-gradient(88deg,
      rgb(52 28 12 / 30%) 0 1px, rgb(120 74 38 / 12%) 1px 5px,
      rgb(52 28 12 / 20%) 5px 8px),
    linear-gradient(100deg, #7a4a24, #5c3418);
}
```

Two offset *ellipse* ring layers give the growth rings and their figure; a third linear layer is
the grain. Circular rings read as a bullseye — keep the radii elliptical and the two centres apart.
No blur, no filter, so it stays crisp at any size.

#### Brass (banded metal + sharp highlight)

```css
.surface-brass {
  background-color: #a9782f;
  background-image:
    linear-gradient(115deg,
      transparent 0 18%, rgb(255 244 205 / 55%) 20%, transparent 23%,
      transparent 46%, rgb(120 78 20 / 28%) 49%, transparent 52%,
      transparent 74%, rgb(255 236 170 / 40%) 77%, transparent 80%),
    repeating-linear-gradient(115deg,
      rgb(255 236 170 / 16%) 0 1px, rgb(90 58 14 / 12%) 1px 4px),
    linear-gradient(160deg, #f0d489, #9a6a22 40%, #d9b45f 62%, #7d5116);
  box-shadow: inset 0 1px 0 rgb(255 248 220 / 65%), inset 0 -1px 0 rgb(60 36 8 / 60%);
}
```

Metal reads through *broad* specular bands, not evenly spaced stripes: the sparse 3-stop
`linear-gradient` carries the sheen, and the 4 px repeating layer is only the brushing. Uniform
high-contrast stripes look like corrugated card, not brass.

#### Wax (soft blob + worn edge)

```css
.surface-wax {
  background-color: #7c1f1a;
  background-image:
    radial-gradient(60% 50% at 40% 30%, rgb(255 160 140 / 55%), transparent 70%),
    radial-gradient(120% 100% at 50% 50%, #a8302a, #61100d);
  box-shadow:
    inset 0 2px 6px rgb(255 200 180 / 25%),
    inset 0 -3px 8px rgb(40 4 2 / 55%);
  border-radius: 42% 46% 44% 40% / 46% 42% 48% 44%;
}
```

An irregular `border-radius` is what makes wax read as wax; the translation is cheap. Add a
`::after` with a 1 px translucent highlight along the top edge.

### 5.4 Rules that keep surfaces cheap

1. **Bake noise into tiles, never into a live filter.** Tile ≤ 64x64 CSS px, `numOctaves` ≤ 3.
2. **One filtered element per screen, and it must be static.** No animated descendants.
3. **Prefer stacking gradients over stacking filters.** Gradients rasterise once.
4. **Animate only `transform` and `opacity`**, and only on a layer that is not inside a filter.
5. **Keep the number of full-screen translucent layers at one.** A second one doubles the sampling
   area for `backdrop-filter`.
6. **Do not blur text** to fake print texture; blur the background layer only.

---

## 6. Verdict: can a fixed `100dvh` table avoid page scroll without clipping?

**Yes — with one correction: use `100svh` for the shell, and `dvh` only as an inner cap.**

### 6.1 The arithmetic

The shell has to fit the *smallest* viewport it will ever see, because the game table never
scrolls the page, and browser chrome only retracts in response to page scrolling. If the page
cannot scroll, the toolbars stay expanded and `dvh` never grows beyond the small viewport. The
floor is therefore the small viewport, not the dynamic one.

| Device / window | Layout size | With browser chrome (budget) | What the shell must fit |
| --- | --- | --- | --- |
| iPhone SE 2/3 | 375x667 | ≈ 375x553 (Safari top+bottom bars) | 375x553 |
| iPad portrait | 768x1024 | ≈ 768x980 (Safari toolbar) | 768x980 |
| Desktop | 1280x800 | ≈ 1280x713 (tab strip + URL bar + bookmarks) | 1280x713 |

"With browser chrome" values are the budget heights used in the test matrix, not a promise about a
specific OS build. Add ~8 px of slack on each edge for rounding.

### 6.2 Measured result

A representative shell — `grid-template-rows: auto minmax(0, 1fr) auto`, `min-height: 0` on the
middle track, `env(safe-area-inset-*)` padding, a `clamp()` HUD, an `aspect-ratio: 3/4` hand with
`max-height: 30dvh` cards, and a 44 px action row — was measured in three engines at seven sizes:

| Viewport | Chromium 156 | WebKit 27.2 | Firefox 157 |
| --- | --- | --- | --- |
| 375x667 | 0 px doc overflow, 0 clipping | 0 / 0 | 0 / 0 |
| 375x553 | 0 / 0 | 0 / 0 | 0 / 0 |
| 375x490 | 0 / 0 | 0 / 0 | 0 / 0 |
| 768x1024 | 0 / 0 | 0 / 0 | 0 / 0 |
| 768x980 | 0 / 0 | 0 / 0 | 0 / 0 |
| 1280x800 | 0 / 0 | 0 / 0 | 0 / 0 |
| 1280x713 | 0 / 0 | 0 / 0 | 0 / 0 |

"0 / 0" = `document.scrollingElement.scrollHeight - clientHeight === 0` and the action row's
bottom edge inside the viewport with 8 px to spare (safe-area padding). The 375x490 row is the
worst case with the URL bar and a partially-shrunk visual viewport; the field row still absorbed
the loss (298 px tall) without clipping the hand or the buttons.

The probe used `height: 100vh; height: 100dvh;`. At a fixed layout viewport all three units resolve
to the same value, so this measurement validates the **track structure** (`minmax(0, 1fr)` +
`min-height: 0`, `aspect-ratio` cards capped in `dvh`), not the choice between `svh` and `dvh` for
the shell. That choice is made on the reasoning in §6.1, not on a pixel measurement: `svh` cannot
grow when chrome retracts, so it cannot move the action row.

### 6.3 Required pattern

```css
:root {
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left: env(safe-area-inset-left, 0px);
  --safe-right: env(safe-area-inset-right, 0px);
}

html,
body { height: 100%; overflow: hidden; overscroll-behavior: none; }

.table {
  height: 100vh;                 /* engines without svh */
  height: 100svh;                /* stable: fits the smallest viewport */
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  padding: calc(var(--safe-top) + 0.5rem) calc(var(--safe-right) + 0.5rem)
           calc(var(--safe-bottom) + 0.5rem) calc(var(--safe-left) + 0.5rem);
  overflow: hidden;
}

.board { min-height: 0; }        /* the critical line: lets 1fr shrink */
.hand  { min-height: 0; overflow-x: auto; overflow-y: hidden;
         scroll-snap-type: x mandatory; }
.card  { scroll-snap-align: start; }
```

And the viewport meta needs `viewport-fit=cover` for `env()` to report non-zero insets:

```html
<meta name="viewport"
      content="width=device-width, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content" />
```

`viewport-fit=cover` is what makes the page lay out under the notch/home indicator so that
`env(safe-area-inset-*)` has a job
([WebKit: Designing Websites for iPhone X](https://webkit.org/blog/7929/designing-websites-for-iphone-x/)).
`interactive-widget=resizes-content` (Chrome 108+) asks the layout viewport to shrink when the
keyboard opens instead of the keyboard covering the table
([Chrome: viewport resize behavior](https://developer.chrome.com/blog/viewport-resize-behavior));
Safari ignores it, which is one more reason to keep text inputs out of the battle screen.

### 6.4 Failure modes to design against

* **Text at 200 %.** Measured at 375x553 with a 32 px root size and non-shrinking 84 px cards: the
  page still had zero overflow, but the hand's content became wider than the strip (5 x 84 px +
  4 x 8 px = 452 px in a 335 px column) and `overflow: hidden` would have clipped two cards. The
  fix is the one already in the pattern: the hand is a **horizontal scroll-snap strip**, so the
  overflow is contained and reachable, never silently lost. The action row and HUD stayed visible
  and unclipped at 200 % in all three engines.
* **On-screen keyboard.** Fixed shells do not reflow around the iOS keyboard; the visual viewport
  shrinks and the focused field can sit under it. Keep editing off the battle screen (there is
  none today) or scroll the field into view with `scrollIntoView({ block: 'center' })`.
* **Landscape phones (667x375).** Not in the ticket's matrix, but the same shell survives it only
  if the HUD collapses to one line and the hand drops to a 2-row grid. Test it before shipping.
* **`min-height: 0` missing anywhere in the chain.** This is the single line that decides between
  "fits" and "clipped". Without it the `1fr` track keeps its content's minimum height, the grid
  overflows, and because `overflow: hidden` is on the shell the overflow is invisible rather than
  scrollable — the worst possible failure.

---

## 7. Self-hosted fonts under `font-src 'self'`

### 7.1 What the policy allows

The current policy is `font-src 'self'` ([`vite.config.ts`](../../vite.config.ts)). In CSP3,
`font-src` governs the sources of web fonts
([CSP3 §6.1.4](https://www.w3.org/TR/CSP3/#directive-font-src)), and `'self'` matches URLs on the
page's own origin ([CSP3 §6.7.2](https://www.w3.org/TR/CSP3/#match-url-to-source-expression)).
Consequences:

* A WOFF2 emitted by Vite and referenced through a **relative** `url()` is allowed, and Vite
  rebases and hashes it under the configured base — which is what keeps the GitHub Pages subpath
  working.
* `data:font/woff2;base64,...` is **not** `'self'` and will be blocked. This matters because Vite
  inlines assets under `build.assetsInlineLimit` (default **4096 bytes**) as base64 data URLs
  ([Vite build options](https://vite.dev/config/build-options)). A small subset font can fall under
  that threshold and silently become a blocked inline font. Set an explicit policy:

```ts
build: {
  assetsInlineLimit: (filePath) => (filePath.endsWith('.woff2') ? false : undefined),
}
```

* No `@import url(https://fonts.googleapis.com/...)`, no `preconnect` to a font CDN, no
  `local()` dependency for correctness — `local()` is fine as a nicety but the shipped file must
  carry the design on its own.

### 7.2 Loading recipe

Put the font in `src/assets/fonts/` (not `public/`) and reference it **relatively** from CSS so
Vite hashes it and rebases it under `VITE_BASE`:

```css
@font-face {
  font-family: "Fieldbound Display";
  /* Vite rewrites this to <base>/assets/display-700-<hash>.woff2 */
  src: url("../assets/fonts/display-700.woff2") format("woff2");
  font-weight: 700;
  font-style: normal;
  font-display: swap;
  /* optional second cut, if the file is split:
     unicode-range: U+0000-00FF, U+2013-2014, U+2018-2019, U+201C-201D, U+2026; */
}
```

A hardcoded `/fonts/...` path is wrong for the GitHub Pages subpath: it resolves to the origin root,
not `/<repository>/`. If a preload is wanted, inject it from the existing build-only HTML plugin
(`vite.config.ts` already has `transformIndexHtml`) with the emitted, base-prefixed asset URL
rather than a literal path:

```html
<link rel="preload" href="<emitted woff2 URL>" as="font" type="font/woff2" crossorigin />
```

Preload is optional here — the face is 13–18 KB on the same origin and `font-display: swap` covers
the cold cache. `crossorigin` is required even same-origin: font preloads are CORS-mode fetches, and
without the attribute the preload is discarded and the font is fetched twice
([MDN `rel="preload"`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel/preload)).

`font-display: swap` shows the fallback immediately and swaps when the face arrives. Pick a
fallback with similar metrics (a Georgia/`ui-serif` stack for a high-contrast serif) so the swap is
a small shift, not a reflow.

### 7.3 Measured WOFF2 cost (one display face)

Measured with `fonttools` 4.68.0 (`python -m fontTools.subset`, `--flavor=woff2`) on three OFL
display faces from the [google/fonts](https://github.com/google/fonts) repository:

| Face | Source TTF | All-glyph WOFF2 | Latin-1 subset* | ASCII subset** | Variable instanced at wght=700 + Latin-1 subset |
| --- | --- | --- | --- | --- | --- |
| Cinzel (variable) | 125,468 B | 31,848 B | **23,060 B** | 16,332 B | **13,508 B** |
| Alegreya (variable) | 425,288 B | 104,276 B | **32,140 B** | 23,336 B | **17,752 B** |
| Cormorant Garamond (variable) | 1,195,560 B | 96,396 B | **25,524 B** | 16,828 B | n/a |

\* `U+0020-007E, U+00A0-00FF, U+2013-2014, U+2018-201D, U+2026, U+00D7, U+2212`
\*\* `U+0020-007E`

Realistic budget for this project: **14–18 KB** for one display face, pinned to one weight, Latin
subset, WOFF2 only. That is:

* ~5 % of the 307,200-byte gzip budget if it were counted — but the budget script
  ([`scripts/check-budget.mjs`](../../scripts/check-budget.mjs)) counts **only `.js`/`.css`**, so a
  font is outside the enforced ceiling and must be tracked separately. Recommended explicit cap:
  **≤ 24 KB of fonts total**.
* **Not worth gzipping**: WOFF2 is already Brotli-compressed inside the container
  ([WOFF2 spec](https://www.w3.org/TR/WOFF2/)); measured gzip adds 23–28 bytes (<0.2 %) and the
  server should serve it with `Content-Encoding: identity` / `Cache-Control: immutable`.
* **Never base64-inline**: a 13,508-byte font becomes 18,012 base64 bytes (+33 %), and CSP blocks
  it anyway.

Subsetting command that produced the numbers above:

```bash
# pin the variable axis, then subset
python -m fontTools.varLib.instancer display.ttf wght=700 --output=display-700.ttf
python -m fontTools.subset display-700.ttf \
  --output-file=display-700.woff2 \
  --flavor=woff2 \
  --unicodes="U+0020-007E,U+00A0-00FF,U+2013-2014,U+2018-201D,U+2026" \
  --layout-features="kern,liga"
```

Keep the OFL text next to the shipped app as a stable file (for example `public/fonts/OFL.txt`, so
it is copied verbatim and served from the same origin) — the licence requires the notice to travel
with the font, even though the font file itself lives in `src/assets/fonts/`.

### 7.4 Font verdict

Self-hosting under `font-src 'self'` is straightforward and cheap, provided:

1. the font lives at a stable same-origin path resolved through the Vite base URL;
2. it is a single pinned weight, Latin-subset, WOFF2;
3. it is preloaded with `crossorigin`;
4. `assetsInlineLimit` is patched so it can never become a `data:` URI;
5. `font-display: swap` plus a metric-similar fallback covers the cold cache;
6. the byte cost is tracked outside the JS/CSS gzip budget, with a ≤ 24 KB cap.

---

## 8. What answers each ticket bullet

| Bullet | Where |
| --- | --- |
| Safe support status for the listed features | §3.1, §3.3 |
| Safe support across current + previous Chrome/Edge/Firefox/Safari, iOS 16+ | §3.1, §3.2 |
| Tactile surfaces with CSS/SVG and their cost | §5.1–§5.4 |
| Fixed `100dvh` table at 375x667 / 768x1024 / 1280x800, chrome + safe areas | §6.1–§6.4 |
| Self-hosted fonts + subsetting under `font-src 'self'` + WOFF2 bytes | §7.1–§7.4 |
| Allowed / avoid list with reasons | §4.1, §4.2 |

---

## 9. Residual risk and device checks worth doing

1. **Real iOS 16 device.** Playwright has no iOS 16 WebKit. The floor claims for `color-mix()` and
   prefixed `backdrop-filter` come from BCD plus Safari release notes, not from an iOS 16 run.
2. **`dvh` versus `svh` behaviour with the Safari toolbar mid-collapse.** The shell is `svh` so it
   should not move, but confirm on hardware that a simulated tap/scroll does not shift the action
   row.
3. **Low-end Android.** All perf numbers here are desktop engines. Re-run the §5.2 probe on a
   mid-range Android phone before choosing a surface recipe for a full-screen background.
4. **Playwright WebKit port quirks.** `overscroll-behavior` is a known disagreement; do not treat
   a green WebKit run as proof for Safari on every property.
5. **Text at 200 % with the real copy**, not the probe's placeholder strings — card names are the
   longest strings in the app and they set the 375 px hand's minimum width.

---

## References

**Specs**

* CSS Values and Units 4 — viewport-percentage units, `dvh` caveat: <https://www.w3.org/TR/css-values-4/#viewport-variants>
* CSS Color 5 — `color-mix()`: <https://www.w3.org/TR/css-color-5/#color-mix>
* CSS Containment 3 — container queries: <https://www.w3.org/TR/css-contain-3/>
* Selectors 4 — `:has()`: <https://www.w3.org/TR/selectors-4/#relational>
* Filter Effects — `feTurbulence`, `feDisplacementMap`, `feDiffuseLighting`: <https://www.w3.org/TR/filter-effects/>
* WOFF 2.0 — Brotli-compressed container: <https://www.w3.org/TR/WOFF2/>
* CSP Level 3 — `font-src`, `'self'` matching: <https://www.w3.org/TR/CSP3/#directive-font-src>

**Vendor release notes**

* WebKit — New WebKit Features in Safari 15.4 (`svh`/`lvh`/`dvh`, `:has()`, `@layer`): <https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/>
* WebKit — WebKit Features in Safari 16.0 (container queries, subgrid, overscroll-behavior): <https://webkit.org/blog/13152/webkit-features-in-safari-16-0/>
* WebKit — WebKit Features in Safari 18.0 (view transitions, unprefixed `backdrop-filter`): <https://webkit.org/blog/15865/webkit-features-in-safari-18-0/>
* WebKit — Designing Websites for iPhone X (`env()`, `viewport-fit`): <https://webkit.org/blog/7929/designing-websites-for-iphone-x/>
* Firefox 101 — viewport units: <https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/101>
* Firefox 110 — container queries: <https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/110>
* Firefox 121 — `:has()`: <https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/121>
* Firefox 144 — view transitions: <https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/144>
* Chrome — viewport resize / `interactive-widget`: <https://developer.chrome.com/blog/viewport-resize-behavior>

**MDN / compatibility data**

* MDN `color-mix()`: <https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/color_value/color-mix>
* MDN `env()` (safe-area insets): <https://developer.mozilla.org/en-US/docs/Web/CSS/env>
* MDN viewport meta (`viewport-fit`, `interactive-widget`): <https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport>
* MDN `rel="preload"` (font `crossorigin`): <https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel/preload>
* MDN `@font-face`: <https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face>
* BCD: <https://github.com/mdn/browser-compat-data> (files cited inline: `css/at-rules/container.json`, `css/types/color.json`, `css/properties/backdrop-filter.json`, `css/properties/filter.json`, `css/properties/mask-image.json`, `css/properties/scroll-snap-type.json`, `css/at-rules/media.json`, `css/properties/overscroll-behavior.json`)

**Support-data aids**

* caniuse — viewport unit variants: <https://caniuse.com/viewport-unit-variants>
* caniuse — CSS math functions: <https://caniuse.com/css-math-functions>
* caniuse — `env()`: <https://caniuse.com/css-env-function>

**Performance guidance**

* web.dev — animation guide (compositor-only properties): <https://web.dev/articles/animations-guide>
* Chromium Dash — current stable Chrome: <https://chromiumdash.appspot.com/fetch_releases?channel=Stable&platform=Windows&num=1>
* Mozilla product-details — current Firefox: <https://product-details.mozilla.org/1.0/firefox_versions.json>
