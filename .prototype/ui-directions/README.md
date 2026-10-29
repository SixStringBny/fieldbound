# Throwaway prototype — Fieldbound UI directions

Answers the wayfinder ticket **Rough visual directions for the battle screen**.

## Run it

Open `index.html` in a browser. It is a single self-contained file: the seven
placeholder SVGs are inlined as data URIs, so it works by double-clicking with no
server.

Switch directions with `?variant=A|B|C`, the arrow keys, or the floating
prototype bar. Add `?chrome=0` to hide the bar for screenshots.

Rebuild after editing `index.template.html`:

```bash
node build.mjs
```

## The three directions

- **A — Field journal on a table.** Warm dark play surface, parchment sheets,
  wax seals, brass rules, an arced hand.
- **B — Illuminated bestiary.** An open codex spread: adversary on the left page,
  field in the gutter, hand as illuminated miniatures on the right page.
- **C — Carved elemental table.** Dark slate arena, etched circle, rune intent,
  stone-tablet hand.

All three use the same hardcoded opening state: Ember starter vs Cinder Warden,
30/30 enemy health, Neutral field, 3 energy, five cards.

## Not production

No React, no app imports, no tests, no persistence. The prototype is evidence for
a design decision; the winning direction is rewritten properly before it ships.
