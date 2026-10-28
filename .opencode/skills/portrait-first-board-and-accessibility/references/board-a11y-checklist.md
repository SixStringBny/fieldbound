# Board and Accessibility Checklist

> Load when laying out the board, implementing focus or live-region behavior, or running the viewport matrix.

## Viewport matrix

| Viewport | Must hold |
|----------|-----------|
| 375x667 | No document horizontal scroll; five cards reachable; End Turn visible; 44px targets |
| 390x844 | Same as 375x667 with the taller safe area |
| 768x1024 | Centered container; cards about 120px; no horizontal scroll |
| 1280x800 | Container capped at 1080px; event log in a right column at 1024px and above |

Layout order at every width: enemy panel, field banner, player panel, hand, control bar. At 1024px and wider the event log joins as a right column.

## Overflow rules

- Every flex or grid child that can shrink carries `min-width: 0`.
- The hand row is `overflow-x: auto`, `scroll-snap-type: x mandatory`, `overscroll-behavior-x: contain`.
- Each card keeps at least 64px visible; card width grows to about 120px at 640px and above.
- The control bar is sticky, uses `dvh` with a `vh` fallback, and holds End Turn plus energy text.
- Document-level check: `document.documentElement.scrollWidth <= document.documentElement.clientWidth`.
- Vertical page scroll is allowed when the viewport is shorter than the board.

## Keyboard map

| Key | Action |
|-----|--------|
| Tab / Shift+Tab | Move focus in visual order |
| Enter / Space | Activate the focused control or play the focused card |
| E | End turn when focus is outside a text field |
| Escape | Close card detail, rules overlay or dialog |

Rules: no positive `tabindex`; skip link targets the main board region; focus ring is 2px and always visible; dialogs set `aria-modal="true"`, trap focus and restore it to the invoker.

## Announcement contract

One polite live region, mounted once in `App.tsx`.

| Event | Message shape |
|-------|---------------|
| Player turn starts | "Your turn" |
| Enemy turn starts | "Enemy turn" |
| Damage resolves | "Ember Strike deals 6 damage. Cinder Warden at 24 health" |
| Field shifts | "Field shifts to Frost. Frost empowers; Gale is countered" |
| Battle ends | "Victory" or "Defeat" |

Announce from a state transition. Do not announce on every render, and do not duplicate a message already emitted by a screen.

## Target and text sizes

- Interactive controls: at least 44x44 CSS pixels measured on the control itself.
- Body text: at least 16px.
- Element cues: glyph plus text label, always.
- HP and defense: `role="meter"` with a text value.
- Enemy plan: list semantics, no image-only intent.
- 200% zoom at 375px must not clip controls.

## Motion contract

| Event | Normal | Reduced |
|-------|--------|---------|
| Card draw | 220ms translate + fade | No transform, 1ms opacity |
| Card play | 180ms scale | No transform, 1ms opacity |
| Damage number | 320ms rise + fade | No transform, 1ms opacity |
| Field repaint | 400ms background fade | 1ms opacity |
| Hover/focus lift | 120ms transform | No transform |

- Normal durations stay between 120ms and 400ms.
- `useReducedMotion` returns true when `matchMedia("(prefers-reduced-motion: reduce)")` matches or the override is true.
- The app root carries `data-reduced-motion="true|false"`; CSS keys off that attribute, never off a component class.
- The hook subscribes to media-query changes and removes its listener on unmount.
- First paint uses the OS preference; an explicit override wins in both directions.

## Manual release pass

1. Load the built app at 375x667 and confirm no sideways page scroll with the hand at five cards.
2. Play a turn with the keyboard only, including opening and closing the card detail with Enter and Escape.
3. Toggle Reduce motion, replay a card, and confirm no transform animation runs.
4. Open a dialog and Tab repeatedly; focus must stay inside and return to the invoker on close.
5. Trigger a turn change and a field shift; each announcement appears once in the live region.
