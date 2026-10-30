# Battle route review — ticket 3, re-issued at the polish release

**Route:** `battle` (solo and duel share the shell)
**Ticket:** [#20 Battle screen: phone and game table](https://github.com/SixStringBny/fieldbound/issues/20), polished by [#30](https://github.com/SixStringBny/fieldbound/issues/30)
**Commit reviewed:** `ebae15c`
**Decision:** approved

## Human review

| Field | Value |
| --- | --- |
| Reviewer | Ben McCusker (@SixStringBny), project owner |
| Date | 2026-10-30 |
| Viewports | 390×844, 768×1024, 1280×800 (plus 375×667 and 1024×768 in the sweep) |
| Evidence | the `AB-E2` five-viewport frames and the local production build |
| Result | **Approved**, no issues |

## What was reviewed

The `100svh` battle board after the density pass: one brass outline per zone and
at most one solid internal divider; the field cap and 2:1 phone arena split; the
single intent heading with its totals; the value-only meters; the number-plus-pips
energy; the cost + name + value + one-badge card face; the quiet 12px log; and the
empty, no-plan, unaffordable, lethal and end states.

## Density decisions recorded

- **Field:** the phone field is capped at 300px and 40% of the board — 284.5px /
  36.1% at 390×844. The arena splits its spare height 2:1 with the enemy panel,
  so the intent grows to 108px and tall phones take the 168px card. The roundel
  shows the manifest field art at 128px on tall phones, a 92–140px clamp on
  tablet, and 68px at 375×667. The inset second ring, glyph overlay and name tag
  are gone.
- **Labels:** visible `Health`/`Defense` words are gone where the meter value
  states the fact; the accessible meter names and `aria-valuetext` keep them. The
  intent is one `<h3>` with `Incoming: …`; the second title, lethal sentence and
  "Recomputed" note are gone. Energy is the number plus pips, with the word kept
  for the accessibility tree only.
- **Card face:** cost, art, name, value and at most one badge. Element and type,
  the printed summary and further badges remain in the detail sheet and the
  frozen `cardAccessibleName`.
- **Log:** muted header, 12px latest line and history, 11px turn meta, no bright
  latest fill, no selected last entry, one solid divider, ghost toggle.
- **Borders:** one outline per panel plus at most one internal divider; the
  element left accents, dashed sub-rules, inset step wells and pill expand/toggle
  are gone. `AB-G2` gained the 40% field ceiling and a separate source check
  forbids dashed or dotted board rules.

## Feedback column

`AB-F1`–`F5` are green via `tests/e2e/feedback.spec.ts`: one beat per settled
transition, the net signed impact number (inside the panel, clamped, no layout
change, aria-hidden), handoff/intent-reveal/draw gating, the two-channel floor,
and the CSS-only newest-wins allowlist. After the field resize the number still
anchors over the enemy portrait and the player meter gap without covering a meter
value, intent, control or roundel.

## Deliberately deferred

None for this route. A battle-end screenshot is not reachable (a settled solo
battle goes to reward, a duel round to its result); the end state is
unit-covered and announced. The real 375px one-handed note for `H-P1` was
attested at the polish release.
