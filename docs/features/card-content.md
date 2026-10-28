# Feature: Card & Enemy Content

## Traceability

| Canonical ID | Owner / Source Link | Relationship |
|--------------|---------------------|--------------|
| VIS-US-03 | [Vision](../PRD.md#4. Personas) | participates |
| VIS-CON-06 | [Vision](../PRD.md#1. Overview) | constrained by |
| VIS-CON-07 | [Vision](../PRD.md#3. Goals and Non-Goals) | constrained by |
| CNT-FR-01 – CNT-FR-06 | This feature | owns |
| ENG-FR-05 | [Battle Engine & Rules](battle-engine.md#3. Functional Requirements) | participates |

**PRD:** [docs/PRD.md](../PRD.md)

---

## 1. Feature Overview

**Feature Name:** Card & Enemy Content
**ID Prefix:** CNT
**Summary:** The complete v1 content set as data: 32 cards, four starter decks, four enemies and the placeholder asset manifest. Content files contain ids and effect descriptors only; the engine executes them. This feature also owns the manifest loader and the deterministic SVG placeholder generator so art can be replaced without touching code.
**Dependencies:** Battle Engine & Rules
**Priority:** Must

---

## 2. User Stories

| ID | As a... | I want to... | So that... | Priority |
|----|---------|-------------|-----------|----------|
| CNT-US-01 | Solo player | have four distinct elemental starters with clear strengths | my deck choice changes how I approach the field | Must |
| CNT-US-02 | Player | face enemies whose decks and intents reflect their element | each encounter feels different and readable | Must |
| CNT-US-03 | Artist | replace one SVG by editing the manifest target file | real art ships without code changes | Should |

---

## 3. Functional Requirements

```forge-requirement
{"id":"CNT-FR-01","kind":"requirement","text":"Ship exactly 32 unique cards: five per element for Ember, Frost, Gale and Stone, eight Neutral cards and four one-cost Shift cards, with costs from 0 to 3 and data-only effects the engine already supports."}
```

```forge-requirement
{"id":"CNT-FR-02","kind":"requirement","text":"Include in every element at least one attack, one Ward, one piercing attack and one card that gains a bonus only while its own element is active; enforce ids, names, costs, counts and role coverage in an automated catalog test."}
```

```forge-requirement
{"id":"CNT-FR-03","kind":"requirement","text":"Provide four 10-card starter decks, each containing five distinct element cards, three Neutral cards and two Shift cards (its own element and the element it beats), with no card appearing more than once."}
```

```forge-requirement
{"id":"CNT-FR-04","kind":"requirement","text":"Define four enemies: Cinder Warden (Ember, 30 HP), Rime Sentinel (Frost, 35 HP), Storm Herald (Gale, 40 HP) and The Hollow Field (Neutral boss, 60 HP), each with an explicit legal deck; the boss uses a 12-card shift-heavy deck."}
```

```forge-requirement
{"id":"CNT-FR-05","kind":"requirement","text":"Publish a versioned assets manifest keyed by card, enemy and field id with dimensions, SVG format and safe-area metadata, and generate exactly one deterministic SVG placeholder per asset at its documented path."}
```

```forge-requirement
{"id":"CNT-FR-06","kind":"requirement","text":"Resolve asset URLs through a pure loader that takes the app base URL and rejects unknown ids, and require every asset reference to come from the manifest so replacing SVG files needs no engine or UI code change."}
```

---

## 4. UI / Interaction Design

This feature has no screens. It supplies the data and asset contract consumed by the engine and the shell.

### 4.1 Card catalog

| ID | Name | Element | Type | Cost | Effect |
|----|------|---------|------|------|--------|
| ember-cinder-jab | Cinder Jab | Ember | Attack | 1 | Deal 3 damage. |
| ember-ember-lance | Ember Lance | Ember | Attack | 2 | Deal 4 damage; piercing. |
| ember-ash-guard | Ash Guard | Ember | Ward | 1 | Gain 2 defense. |
| ember-kindled-fury | Kindled Fury | Ember | Attack | 2 | Deal 3 damage; +2 if the field is Ember. |
| ember-inferno | Inferno | Ember | Attack | 3 | Deal 7 damage. |
| frost-frost-shard | Frost Shard | Frost | Attack | 1 | Deal 3 damage. |
| frost-ice-needle | Ice Needle | Frost | Attack | 2 | Deal 4 damage; piercing. |
| frost-rime-ward | Rime Ward | Frost | Ward | 1 | Gain 2 defense. |
| frost-shatter | Shatter | Frost | Attack | 2 | Deal 2 damage; +4 if the field is Frost. |
| frost-deep-freeze | Deep Freeze | Frost | Utility | 2 | Apply Weaken 1 to the enemy; draw 1. |
| gale-gust | Gust | Gale | Attack | 1 | Deal 3 damage. |
| gale-wind-needle | Wind Needle | Gale | Attack | 1 | Deal 2 damage; piercing. |
| gale-tailwind | Tailwind | Gale | Ward | 1 | Gain 2 defense; draw 1. |
| gale-cyclone | Cyclone | Gale | Attack | 2 | Deal 4 damage; +2 if the field is Gale. |
| gale-updraft | Updraft | Gale | Utility | 0 | Draw 1. |
| stone-stone-fist | Stone Fist | Stone | Attack | 1 | Deal 4 damage. |
| stone-stone-spike | Stone Spike | Stone | Attack | 2 | Deal 4 damage; piercing. |
| stone-bulwark | Bulwark | Stone | Ward | 2 | Gain 3 defense. |
| stone-avalanche | Avalanche | Stone | Attack | 3 | Deal 6 damage; +2 if the field is Stone. |
| stone-resonance | Resonance | Stone | Ward | 1 | Gain 1 defense; +2 if the field is Stone. |
| neutral-plain-strike | Plain Strike | Neutral | Attack | 1 | Deal 3 damage. |
| neutral-elemental-blow | Elemental Blow | Neutral | Attack | 2 | Deal 5 damage. |
| neutral-probe | Probe | Neutral | Utility | 0 | Draw 1. |
| neutral-sift | Sift | Neutral | Utility | 1 | Draw 2. |
| neutral-channel | Channel | Neutral | Utility | 0 | Gain 1 energy. |
| neutral-surge | Surge | Neutral | Utility | 1 | Gain 2 energy. |
| neutral-expose | Expose | Neutral | Utility | 1 | Apply Weaken 1 to the enemy. |
| neutral-second-wind | Second Wind | Neutral | Utility | 2 | Apply Regen 2 to yourself. |
| shift-ember | Ember Shift | Neutral | Shift | 1 | Set the field to Ember. |
| shift-frost | Frost Shift | Neutral | Shift | 1 | Set the field to Frost. |
| shift-gale | Gale Shift | Neutral | Shift | 1 | Set the field to Gale. |
| shift-stone | Stone Shift | Neutral | Shift | 1 | Set the field to Stone. |

Counts: Ember 5, Frost 5, Gale 5, Stone 5, Neutral 8, Shift 4. Every element has an attack, a Ward, a piercing attack and a field-payoff card: Kindled Fury, Shatter, Cyclone and Avalanche/Resonance respectively.

### 4.2 Data shape

Cards live in `src/content/cards.json` and are typed by `CardDefinition` from the engine. Optional effect fields are omitted when unused.

```json
{
  "id": "ember-kindled-fury",
  "name": "Kindled Fury",
  "element": "ember",
  "type": "attack",
  "cost": 2,
  "damage": 3,
  "fieldBonus": { "damage": 2 }
}
```

Supported effect fields: `damage`, `defense`, `piercing`, `fieldBonus` (`damage` or `defense`), `draw`, `energy`, `status` (`kind`, `stacks`, `target`), `shiftTo` and `heal`.

### 4.3 Starter decks

| Deck | Cards | Count |
|------|-------|-------|
| Ember | Cinder Jab, Ember Lance, Ash Guard, Kindled Fury, Inferno, Plain Strike, Probe, Channel, Ember Shift, Frost Shift | 10 |
| Frost | Frost Shard, Ice Needle, Rime Ward, Shatter, Deep Freeze, Plain Strike, Probe, Channel, Frost Shift, Gale Shift | 10 |
| Gale | Gust, Wind Needle, Tailwind, Cyclone, Updraft, Plain Strike, Probe, Channel, Gale Shift, Stone Shift | 10 |
| Stone | Stone Fist, Stone Spike, Bulwark, Avalanche, Resonance, Plain Strike, Probe, Channel, Stone Shift, Ember Shift | 10 |

Each deck includes its own Shift and the Shift of the element it beats, so both fields empower its cards. Deck choice is cosmetic in rules terms; the engine receives a card-id list.

### 4.4 Enemies

| ID | Name | Element | Health | Deck size | Role |
|----|------|---------|--------|-----------|------|
| enemy-cinder-warden | Cinder Warden | Ember | 30 | 10 | First normal encounter |
| enemy-rime-sentinel | Rime Sentinel | Frost | 35 | 10 | Second normal encounter |
| enemy-storm-herald | Storm Herald | Gale | 40 | 10 | Third normal encounter |
| enemy-hollow-field | The Hollow Field | Neutral | 60 | 12 | Boss, Shift-heavy |

Enemy deck lists:

- **Cinder Warden:** Cinder Jab ×2, Ember Lance, Ash Guard, Kindled Fury, Inferno, Plain Strike, Channel, Ember Shift, Frost Shift.
- **Rime Sentinel:** Frost Shard ×2, Ice Needle, Rime Ward, Shatter, Deep Freeze, Plain Strike, Channel, Frost Shift, Gale Shift.
- **Storm Herald:** Gust ×2, Wind Needle, Tailwind, Cyclone, Updraft, Plain Strike, Channel, Gale Shift, Stone Shift.
- **The Hollow Field:** Plain Strike ×2, Elemental Blow ×2, Expose ×2, Second Wind, Sift, Ember Shift, Frost Shift, Gale Shift, Stone Shift.

The boss has no element of its own; its bias is to Shift toward the element that counters the player's chosen starter element.

### 4.5 Asset contract

`public/assets/assets.manifest.json` is the only mapping from content ids to files.

```json
{
  "version": 1,
  "spec": {
    "card": { "width": 300, "height": 420, "format": "svg", "safeArea": 24, "titleBand": 72, "artBox": [240, 200], "textBand": 96 },
    "enemy": { "width": 512, "height": 512, "format": "svg", "safeArea": 32 },
    "field": { "width": 256, "height": 256, "format": "svg", "safeArea": 16 }
  },
  "assets": [
    { "id": "card:ember-cinder-jab", "kind": "card", "element": "ember", "path": "cards/ember-cinder-jab.svg" },
    { "id": "field:ember", "kind": "field", "element": "ember", "path": "fields/field-ember.svg" }
  ]
}
```

The manifest must contain exactly 32 card entries, 4 enemy entries and 5 field entries (`field:ember`, `field:frost`, `field:gale`, `field:stone`, `field:neutral`). The loader prefixes `assets/` and the supplied base URL; it returns `undefined` for an unknown id and the UI renders a labelled fallback.

### 4.6 Placeholder generator

`scripts/generate-placeholder-assets.mjs` reads the JSON catalogs, writes one deterministic SVG per asset, and writes the manifest. Each SVG uses the element palette, the asset name, the cost or health where relevant, a geometric glyph and a plain card frame. Running it twice produces byte-identical output. `docs/ASSET-SPEC.md` documents dimensions, safe areas, naming, palettes and the swap procedure.

---

## 5. Implementation Tasks

| ID | Observable outcome | Owner | Depends | Outputs and tests | Check |
|----|--------------------|-------|---------|-------------------|-------|
| CNT-01 | Valid 32-card catalog with enforced roles | content-designer | ENG-01 | `src/content/cards.json`, `src/content/cards.ts`, `src/content/cards.test.ts` | `npm test -- src/content/cards.test.ts` |
| CNT-02 | Four legal starter decks and four enemy definitions | content-designer | CNT-01 | `src/content/decks.json`, `src/content/enemies.json`, `src/content/decks.ts`, `src/content/enemies.ts`, `src/content/content.test.ts` | `npm test -- src/content/content.test.ts` |
| CNT-03 | Manifest, 41 SVG placeholders, loader and asset spec | content-designer | CNT-02 | `scripts/generate-placeholder-assets.mjs`, `public/assets/assets.manifest.json`, `src/assets/asset-manifest.ts`, `src/assets/asset-manifest.test.ts`, `docs/ASSET-SPEC.md` | `node scripts/generate-placeholder-assets.mjs`, `npm test -- src/assets/asset-manifest.test.ts` |

### Phase 1: Card Catalog

```forge-task
{
  "id": "CNT-01",
  "title": "Author and validate the 32-card catalog",
  "description": "Create cards.json with the exact 32-card table, typed exports in cards.ts, and a catalog test that enforces unique ids and names, element and type counts, cost bounds, supported effect fields and per-element role coverage. Use the card ids and effect values in this document verbatim. Do not implement deck lists, enemies or artwork.",
  "ownerAgent": "content-designer",
  "dependencies": ["ENG-01"],
  "expectedOutputs": ["src/content/cards.json", "src/content/cards.ts", "src/content/cards.test.ts"],
  "validationCommands": ["npm test -- src/content/cards.test.ts", "npm run typecheck"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["The catalog contains exactly 32 cards with the documented element, type and cost distribution", "Each element has an attack, a Ward, a piercing attack and a field-payoff card"],
    "requirementRefs": ["docs/features/card-content.md#CNT-FR-01", "docs/features/card-content.md#CNT-FR-02"],
    "acceptanceCriteria": ["Counts are 20 element cards (5 per element), 8 Neutral cards and 4 Shift cards", "No id or name is duplicated and every cost is between 0 and 3", "Every effect key is in the supported set and every status kind is focus, weaken or regen", "Each element satisfies attack, ward, piercing and fieldBonus role checks", "The typed export exposes a byId lookup returning undefined for unknown ids"],
    "constraints": ["Keep numbers exactly as specified; do not tune balance in this task", "Content files must not contain gameplay formulas or UI text branching"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-07", "docs/PRD.md#VIS-CON-08"],
    "references": ["docs/PRD.md#6. Technical Architecture", "docs/features/card-content.md#4. UI / Interaction Design"]
  }
}
```

### Phase 2: Decks and Enemies

```forge-task
{
  "id": "CNT-02",
  "title": "Build starter decks and enemy definitions",
  "description": "Create the four 10-card starter decks and four enemies with the exact lists and health values in this document. Export typed deck and enemy lookups and add a content test that resolves every card id, checks deck composition (5 element, 3 Neutral, 2 Shift), checks the 12-card boss deck, unique enemy ids and the health ladder. Do not create assets or UI.",
  "ownerAgent": "content-designer",
  "dependencies": ["CNT-01"],
  "expectedOutputs": ["src/content/decks.json", "src/content/enemies.json", "src/content/decks.ts", "src/content/enemies.ts", "src/content/content.test.ts"],
  "validationCommands": ["npm test -- src/content/content.test.ts"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["Four legal 10-card decks and four enemies with the documented decks and health", "Every referenced card id resolves against the catalog"],
    "requirementRefs": ["docs/features/card-content.md#CNT-FR-03", "docs/features/card-content.md#CNT-FR-04"],
    "acceptanceCriteria": ["Each starter deck has exactly 10 cards with 5 distinct element cards, 3 Neutral cards and 2 Shift cards, and no duplicates", "Each deck includes its own Shift and the Shift of the element it beats", "Enemy health values are 30, 35, 40 and 60 in ladder order", "The boss deck has 12 cards with all four Shift cards and no illegal card id", "Deck and enemy ids are unique and lookups return undefined for unknown ids"],
    "constraints": ["Do not add enemies or cards beyond the documented set", "Do not encode AI behavior in content files beyond the boss counter-element bias"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-07", "docs/PRD.md#VIS-CON-08"],
    "references": ["docs/PRD.md#6. Technical Architecture", "docs/features/card-content.md#4. UI / Interaction Design"]
  }
}
```

### Phase 3: Assets

```forge-task
{
  "id": "CNT-03",
  "title": "Generate placeholder SVG assets and the manifest loader",
  "description": "Write a deterministic Node script that reads the card and enemy catalogs, emits one SVG per card, enemy and field, and writes public/assets/assets.manifest.json with the documented spec. Add a pure base-URL-aware loader in src/assets/asset-manifest.ts, a manifest test that checks exact coverage and file existence, and docs/ASSET-SPEC.md covering dimensions, safe areas, palettes, naming and replacement. Do not render assets in the UI.",
  "ownerAgent": "content-designer",
  "dependencies": ["CNT-02"],
  "expectedOutputs": ["scripts/generate-placeholder-assets.mjs", "public/assets/assets.manifest.json", "src/assets/asset-manifest.ts", "src/assets/asset-manifest.test.ts", "docs/ASSET-SPEC.md"],
  "validationCommands": ["node scripts/generate-placeholder-assets.mjs", "npm test -- src/assets/asset-manifest.test.ts", "npm run typecheck"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["Exactly one SVG exists for each of the 32 cards, 4 enemies and 5 fields, with manifest coverage and spec metadata", "The loader resolves only known ids and prefixes the supplied base URL"],
    "requirementRefs": ["docs/features/card-content.md#CNT-FR-05", "docs/features/card-content.md#CNT-FR-06"],
    "acceptanceCriteria": ["The generator creates 41 SVG files and a manifest with 32 card, 4 enemy and 5 field entries", "Running the generator twice produces byte-identical files and manifest", "Every manifest path is relative, uses forward slashes and exists under public/assets", "The test fails when an asset file or manifest entry is missing or duplicated", "The loader returns base + assets/cards/<id>.svg for a known card and undefined for an unknown id", "ASSET-SPEC.md documents card 300x420, enemy 512x512, field 256x256, safe areas and the replacement procedure"],
    "constraints": ["No network access and no external fonts or images", "Do not edit the generated SVG files by hand in later tasks"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-06", "docs/PRD.md#VIS-CON-02"],
    "references": ["docs/PRD.md#6. Technical Architecture", "docs/features/card-content.md#4. UI / Interaction Design"]
  }
}
```

---

## 6. Testing Strategy

| Level | Scope | Approach |
|-------|-------|----------|
| Unit | Catalog shape, role coverage, effect keys | Table-driven Vitest assertions over imported JSON |
| Integration | Deck and enemy resolution | Resolve every id against the catalog; assert composition counts |
| Filesystem | Manifest and SVG coverage | Generator run plus existence and byte-stability checks |
| Type | Typed exports and loader | Strict TypeScript plus loader unit tests |

Key test scenarios:

1. The catalog test reports the exact counts when a card is removed or duplicated in a fixture.
2. Each element role check fails if its only Ward is deleted.
3. The Ember deck fails validation if it swaps Frost Shift for a second Ember Shift.
4. The boss fails validation if its deck drops one Shift.
5. The manifest test fails if a card is added to the catalog without a regenerated manifest.
6. Loading `card:unknown` returns `undefined` while `field:frost` resolves under a non-root base.

---

## 7. Acceptance Criteria

1. All six CNT requirements are covered by passing tests.
2. The 32 cards, four decks and four enemies match the tables in this document exactly.
3. The generator is idempotent and the manifest covers every content id with no extras.
4. Replacing an SVG at its manifest path changes the rendered asset with no code edit.
5. Content contains no damage formula, React import or browser storage access.

---

## 8. Open Questions

| # | Question | Default Assumption |
|---|----------|--------------------|
| 1 | Are these numbers balanced enough to play? | Freeze them for v1; self-play and the human review supply evidence for a later tuning pass. |
| 2 | Should starter decks contain duplicates? | No; each deck is ten distinct cards so rewards visibly change it. |
| 3 | Should Shift cards be reward-eligible? | Yes; they are Neutral cards and the reward pool includes all Neutral cards. |
| 4 | Do enemies need unique art beyond a portrait? | No; one 512x512 portrait per enemy and one field icon per element are enough for v1. |
