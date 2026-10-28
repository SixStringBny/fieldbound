---
name: placeholder-asset-manifest
description: "Generate deterministic SVG placeholders, publish the 41-entry asset manifest with spec metadata, resolve files through a base-URL-aware loader and keep the documented swap contract intact."
---

# Skill: Placeholder Asset Manifest

Use this skill when adding or renaming a card, enemy or field, regenerating placeholder art, changing the asset loader, or documenting the SVG swap contract. It keeps `public/assets/assets.manifest.json` as the only id-to-file mapping and guarantees the generator produces byte-identical output on repeat runs.

Load `references/manifest-schema.md` when editing the generator, writing the manifest test, or walking an artist through replacing an SVG.

---

## Process

### Step 1: Regenerate from the catalogs, never by hand

```bash
node scripts/generate-placeholder-assets.mjs
```

The generator reads the card catalog, the enemy catalog and the five field ids, writes one SVG per asset and rewrites the manifest. Hand edits to the manifest or to generated SVGs are lost on the next run.

**Output:** 41 SVG files plus `public/assets/assets.manifest.json`.

### Step 2: Enforce exact coverage

Coverage is fixed: 32 cards, 4 enemies, 5 fields (`field:ember`, `field:frost`, `field:gale`, `field:stone`, `field:neutral`).

- Keys use the prefixes `card:`, `enemy:` and `field:`.
- Paths are relative, use forward slashes and sit under `public/assets/` (`assets/cards/<id>.svg`, `assets/enemies/<id>.svg`, `assets/fields/<element>.svg`).
- Every entry carries `kind`, `element`, `path`, `width`, `height`, `format: "svg"` and safe-area metadata.

If a catalog entry exists without a manifest entry, then regenerate from the catalog rather than hand-editing the manifest, and let the content test fail until it passes. If a manifest entry exists without a file, then the build audit fails.

**Output:** manifest test asserting counts, uniqueness and file existence.

### Step 3: Make regeneration deterministic

- Sort entries by key; never rely on export order or object key insertion order.
- Use integer coordinates and fixed attribute order in the SVG output.
- Emit LF line endings and no trailing whitespace.
- Never embed a timestamp, random value, build counter or absolute path.

Verify by running the generator twice and comparing hashes:

```bash
node scripts/generate-placeholder-assets.mjs
git status --porcelain public/assets
```

The second run must leave the worktree clean.

**Output:** byte-stable generator plus a test or CI step that detects churn.

### Step 4: Resolve through one pure loader

`src/assets/asset-manifest.ts` exposes `resolveAsset(id, baseUrl)`. It looks up the manifest entry, normalizes the base URL so exactly one slash separates base and path, and returns the URL. An unknown id returns `undefined` rather than throwing.

- Normalize the base once at the loader boundary; do not pre-concatenate in components.
- Components render a labelled text fallback when the loader returns `undefined` or the image fails to load.
- Alt text comes from the manifest display name or the content definition, never from the file path.

**Output:** loader plus tests for a known card, each asset kind and an unknown id.

### Step 5: Keep the swap contract true

`docs/ASSET-SPEC.md` records dimensions, safe areas, palettes, naming and the replacement procedure. A replacement is a file at the manifest path with the same name and size class, with no engine or UI edit.

**Output:** spec document that matches the generator output exactly.

---

## Gotchas

- **A stale manifest after a content change.** The catalog test can pass while the build serves an old mapping; always regenerate and commit the manifest and SVGs in the same change as the catalog edit.
- **Double or missing slash at the base.** `BASE_URL` already ends with `/`; prefixing `"/assets/..."` yields `//assets` or escapes the subpath. Normalize to `base.replace(/\/+$/, "") + "/"` once in the loader.
- **`new URL("/assets/card.svg", base)` escaping the subpath.** A leading slash resolves against the origin, not the Pages path; pass a relative path or concatenate after normalization.
- **Importing an SVG through Vite.** `import art from "../assets/x.svg"` bypasses the manifest and breaks the swap contract; every image goes through the loader.
- **Hand-edited generated SVGs.** The next generator run overwrites them. Real art replaces the file at the manifest path and the generator is not re-run for that asset afterwards.
- **Unstable output from catalog order.** Two runs that differ only in iteration order produce a dirty diff and break the byte-identical claim; sort by key before writing.
- **Missing `field:neutral`.** The neutral field is a real asset; omitting it breaks the opening board, which always starts on Neutral.
- **Alt text built from the path.** Reading `assets/cards/ember-strike.svg` aloud is noise; use the display name and the element label.
- **Treating a missing file as a runtime error.** Fail the manifest test or budget audit instead; the runtime only renders a labelled fallback.

---

## Validation

Run this self-check after any content, generator or loader change:

- [ ] `node scripts/generate-placeholder-assets.mjs` writes exactly 41 SVGs and a manifest with 32 card, 4 enemy and 5 field entries.
- [ ] A second run leaves `git status --porcelain public/assets` empty.
- [ ] `npm test -- src/assets/asset-manifest.test.ts` fails when an entry, file or duplicate key is removed.
- [ ] `resolveAsset("card:ember-strike", "/Card-Game-Project/")` returns `<base>assets/cards/ember-strike.svg`; an unknown id returns `undefined`.
- [ ] Every rendered image has meaningful alt text and a labelled fallback when the file is absent.
- [ ] `docs/ASSET-SPEC.md` states 300x420 cards, 512x512 enemies, 256x256 fields, safe areas and the replacement steps.
- [ ] `node scripts/check-budget.mjs` reports no manifest entry without a file.

If a check fails, load `references/manifest-schema.md` and compare the entry against the schema before changing the loader or components.
