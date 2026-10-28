# Asset Manifest Schema and Swap Procedure

> Load when editing the generator, writing the manifest test, or walking an artist through replacing an SVG.

## Manifest file

`public/assets/assets.manifest.json` is versioned and is the only mapping from content ids to files.

```json
{
  "version": 1,
  "assets": [
    {
      "id": "card:ember-strike",
      "kind": "card",
      "element": "ember",
      "name": "Ember Strike",
      "path": "assets/cards/ember-strike.svg",
      "width": 300,
      "height": 420,
      "format": "svg",
      "safeArea": { "top": 24, "right": 18, "bottom": 24, "left": 18 }
    },
    {
      "id": "enemy:cinder-warden",
      "kind": "enemy",
      "element": "ember",
      "name": "Cinder Warden",
      "path": "assets/enemies/cinder-warden.svg",
      "width": 512,
      "height": 512,
      "format": "svg",
      "safeArea": { "top": 48, "right": 48, "bottom": 96, "left": 48 }
    },
    {
      "id": "field:neutral",
      "kind": "field",
      "element": "neutral",
      "name": "Neutral Field",
      "path": "assets/fields/neutral.svg",
      "width": 256,
      "height": 256,
      "format": "svg",
      "safeArea": { "top": 24, "right": 24, "bottom": 24, "left": 24 }
    }
  ]
}
```

## Coverage

| Kind | Count | Id pattern | Path pattern |
|------|-------|------------|--------------|
| Card | 32 | `card:<card-id>` | `assets/cards/<card-id>.svg` |
| Enemy | 4 | `enemy:<enemy-id>` | `assets/enemies/<enemy-id>.svg` |
| Field | 5 | `field:<element>` | `assets/fields/<element>.svg` |
| Total | 41 | - | - |

Fields are `ember`, `frost`, `gale`, `stone` and `neutral`.

## Dimensions and safe areas

| Kind | Canvas | Safe area | Notes |
|------|--------|-----------|-------|
| Card | 300x420 | 24 top, 18 right, 24 bottom, 18 left | Cost and primary number inside the safe area |
| Enemy | 512x512 | 48 all sides, 96 bottom | Name plate stays clear of the bottom 96px |
| Field | 256x256 | 24 all sides | Glyph centred, label below the glyph |

## Element palette

| Element | Base | Accent |
|---------|------|--------|
| Ember | warm red | amber |
| Frost | deep blue | pale cyan |
| Gale | teal green | light mint |
| Stone | brown | sand |
| Neutral | grey | off-white |

Palettes live in one shared constant used by the generator and the CSS tokens; do not duplicate hex values in components.

## Generator contract

`scripts/generate-placeholder-assets.mjs`:

- Reads the card and enemy catalogs and the field list; writes every SVG and the manifest.
- Sorts entries by id and writes stable JSON with two-space indentation and a trailing newline.
- Uses integer coordinates, fixed attribute order and LF endings.
- Emits no timestamp, random value, hash of the environment or absolute path.
- Is idempotent: two consecutive runs produce byte-identical files.

Failure modes the test must catch:

- a catalog card with no manifest entry
- a manifest entry with no file on disk
- a duplicate id or duplicate path
- a path that is absolute, uses backslashes or escapes `public/assets/`
- a wrong canvas size or missing safe area

## Loader contract

```ts
export function resolveAsset(id: string, baseUrl: string): string | undefined;
```

- Looks up the entry by id; returns `undefined` for an unknown id.
- Returns `normalizeBase(baseUrl) + entry.path` where `normalizeBase` strips trailing slashes and adds exactly one.
- Never throws and never reads `window`; the caller supplies the base (`import.meta.env.BASE_URL`).
- Components call it once per render and render a labelled fallback when it returns `undefined`.

## Replacement procedure

1. Open the manifest entry for the asset id and read `path`, `width`, `height` and `safeArea`.
2. Replace the file at that exact path with an SVG of the same canvas size.
3. Keep the filename unchanged; the manifest is the mapping, not a naming convention to reinterpret.
4. Do not run the generator for that asset afterwards, or the placeholder overwrites the replacement.
5. Run `npm test -- src/assets/asset-manifest.test.ts` and `node scripts/check-budget.mjs`.
6. Record the change in `docs/ASSET-SPEC.md` if dimensions or safe areas changed for a whole class.

Adding a new card still means: add it to the catalog, regenerate the whole set, commit catalog, manifest, SVGs and spec together.
