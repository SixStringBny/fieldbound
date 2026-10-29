# Display face credits

**Family:** `Fraunces Fieldbound` — a renamed subset of
[Fraunces](https://github.com/undercasetype/Fraunces).

- **Upstream:** Google Fonts `ofl/fraunces`,
  `Fraunces[SOFT,WONK,opsz,wght].ttf`.
- **Copyright:** Copyright 2018 The Fraunces Project Authors
  (https://github.com/undercasetype/Fraunces).
- **Licence:** SIL Open Font License, Version 1.1 — the verbatim licence text
  ships beside the binary as [`OFL.txt`](./OFL.txt).
- **Derivation:** a Modified Version under the OFL (a subset is a modification),
  so the family is renamed. Name IDs 0 (copyright), 13 (licence description) and
  14 (licence URL) are kept intact.
- **Committed file:** `fraunces-fieldbound-700.woff2`, 11,320 bytes — one static
  instance, every axis pinned (`wght=700`, `opsz=14`, `SOFT=0`, `WONK=0`), 110
  glyphs.

## Reproduce

`pyftsubset` with fontTools 4.68.0 and brotli:

```sh
python - <<'PY'
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

font = TTFont("Fraunces[SOFT,WONK,opsz,wght].ttf")
instantiateVariableFont(
    font, {"opsz": 14, "wght": 700, "SOFT": 0, "WONK": 0}, inplace=True,
    updateFontNames=False,
)
font.save("Fraunces-700.ttf")
PY

python -m fontTools.subset Fraunces-700.ttf \
  --unicodes=U+0020-007E,U+00B7,U+2013,U+2014,U+201C,U+201D \
  --layout-features=ccmp,kern,liga,calt \
  --name-IDs='*' --name-languages='*' \
  --flavor=woff2 --output-file=fraunces-fieldbound-700.woff2
```

Then rename family records 1, 4, 6, 16 and 17 to `Fraunces Fieldbound`.

## Why this subset

The code points are the ones the shipped copy renders: printable ASCII plus
`·` (U+00B7), `–` (U+2013), `—` (U+2014) and `“ ”` (U+201C, U+201D). The
geometric cue glyphs (`▲ ◆ ◇ ◈ ○ ☰ ✕ ✚ ✦ ✧ ⇄ ≋ ⊘ ▭ ❄`) stay in
`--fb-font-glyph`, not the display face.

Pinning every axis matters: subsetting an instance that still has live `SOFT`
and `WONK` axes leaves the deltas in `gvar` and measures ~19.5 KB instead of
~11.3 KB.

Evidence and measurements: `docs/research/display-typeface.md` on the
`research/display-typeface` branch (ticket #3).
