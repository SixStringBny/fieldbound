---
name: portrait-first-board-and-accessibility
description: "Build and verify the 375px-to-1080px board layout, 44px targets, glyph-plus-label element cues, focus trapping, polite live announcements and the reduced-motion contract shared by the shell and the release checks."
---

# Skill: Portrait-First Board and Accessibility

Use this skill when building or changing the Fieldbound battle board, hand row, dialogs, motion or keyboard controls, and when writing the viewport and accessibility release checks. It encodes the layout breakpoints, target sizes, announcement rules and reduced-motion behavior that must match between the UI and the Playwright audit.

Load `references/board-a11y-checklist.md` when laying out the board, implementing focus or live-region behavior, or running the viewport matrix.

---

## Process

### Step 1: Fix the viewport contract before writing CSS

| Range | Layout |
|-------|--------|
| 375-639px | Single column: enemy panel, field banner, player panel, hand row, sticky control bar |
| 640-1023px | Same vertical order inside a centered container, cards about 120px wide |
| 1024px+ | Same order plus a right-hand event-log column, container capped at 1080px |

Verify at 375x667, 768x1024 and 1280x800. The page must never scroll horizontally; the hand row may scroll inside itself.

**Output:** breakpoint blocks in `src/styles/board.css` using the token file, no fixed pixel widths on panels.

### Step 2: Build the board so overflow cannot escape

- Use grid or flex columns with `min-width: 0` on every scrolling or shrinking child.
- Put the hand in a horizontal snap row; keep at least 64px of each card visible and make all five reachable.
- Put End Turn and the energy text in a sticky bottom bar that stays reachable on short viewports.
- Never set `overflow-x: hidden` on `body` as a fix; it hides the symptom and clips content.
- Assert `document.documentElement.scrollWidth <= document.documentElement.clientWidth` at 375px. If the assertion fails, then find the child whose width exceeds the viewport and shrink it; do not hide the overflow.

**Output:** board components plus a test that fails on document-level horizontal overflow.

### Step 3: Pair every element cue with a glyph and a word

- Each element renders a glyph and its text label, never color alone.
- The field banner states the matchup in words, for example "Ember empowers; Frost is countered".
- HP and defense use `role="meter"` with value text; the enemy plan is a list, not an image.
- Hand cards are buttons whose accessible name includes cost, name and element.

**Output:** a component test asserting the glyph and label for all five elements and the banner wording.

### Step 4: Implement keyboard and focus behavior

- Tab and Shift+Tab reach every card and End Turn in visual order; no positive `tabindex`.
- Enter or Space plays the focused card; `E` ends the turn when focus is not in a text field.
- Escape closes the card detail, rules overlay and dialogs.
- Dialogs set `aria-modal`, trap focus, and restore focus to the invoking control on close.
- Focus is visible at 2px and all targets are at least 44x44 CSS pixels.

**Output:** `src/ui/a11y/useKeyboardControls.ts` plus an App-level keyboard test.

### Step 5: Announce state changes once

Keep a single polite live region mounted in `App.tsx`. Announce turn changes, damage totals, field shifts and battle results from state transitions, not from render passes. The same event must not be announced by both a screen and the controller.

**Output:** one live region, one announcement per transition, tested through `App`.

### Step 6: Resolve reduced motion from system plus override

`useReducedMotion` returns true when the OS media query matches or the persisted override is true, and the resolved value lands on the app root as `data-reduced-motion`. In the reduced branch, remove transforms and cap transitions at 1ms. Keep normal durations between 120ms and 400ms.

**Output:** hook, motion CSS and the app-root attribute.

---

## Gotchas

- **`overflow-x: hidden` on the body.** The scrollbar disappears while the 380px child still overflows and clips. Fix the child with `min-width: 0`, `flex-wrap` or a smaller card width.
- **Scroll chaining from the hand row.** A horizontal swipe in the hand drags the page on some browsers; set `overscroll-behavior-x: contain` on the row.
- **`100vh` sticky bar on iOS Safari.** `100vh` includes the collapsing toolbar and pushes End Turn off screen; use `dvh` with a `vh` fallback and keep the bar inside the viewport.
- **Disabled unaffordable cards are not focusable.** Keyboard users then cannot open the detail view to learn why a card is unplayable. Keep the button focusable, set `aria-disabled="true"`, and reject activation in the handler.
- **Duplicate live announcements.** StrictMode double effects and a region rendered by both the screen and `App` produce the message twice; mount one region and announce from a state diff.
- **Focus restored to a node the hand already replaced.** After playing a card the invoking element is gone; restore to the nearest surviving card or End Turn instead of a captured node reference.
- **Reduced mode that only shortens durations.** `transform: translateY(...)` still animates; the reduced branch must set `transform: none` as well as the 1ms duration.
- **44px measured on the wrong box.** Padding and margins around a 32px control do not count; the interactive element itself must be at least 44x44.
- **A focus trap that leaves the page scrollable behind the dialog.** Lock background scrolling while the dialog is open and release it on close.

---

## Validation

Run this self-check after any layout, motion or accessibility change:

- [ ] `npm test -- src/ui/components/BattleBoard.test.tsx src/App.a11y.test.tsx src/ui/motion/useReducedMotion.test.tsx` passes.
- [ ] At 375x667, `document.documentElement.scrollWidth` equals `clientWidth` and all five hand cards are reachable.
- [ ] Tab order reaches every card and End Turn; Enter plays; `E` ends the turn; Escape closes detail and restores focus.
- [ ] Every element shows a glyph and a text label; the field banner names both empowered and countered elements.
- [ ] The live region announces each turn, damage total and field shift exactly once.
- [ ] With reduced motion on from the OS or the toggle, no transform animates and transitions are at most 1ms.
- [ ] All interactive targets measure at least 44x44 at 375px and layout survives 200% zoom without clipped controls.

If a check fails, load `references/board-a11y-checklist.md` and compare the failing item against the viewport matrix and focus rules before changing components.
