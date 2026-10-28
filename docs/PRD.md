# PRD: Fieldbound

## 1. Overview

**Product Name:** Fieldbound
**Summary:** A turn-based card battler built around one shared elemental field. The field empowers attacks that match it, lets them pierce defense, and halves attacks it beats. Players spend three energy per turn from a five-card hand, shift the field with dedicated cards, and exploit the resulting matchup. Two modes share one deterministic rules engine: a four-fight solo run with between-battle rewards, and a local best-of-three duel with a privacy interstitial between turns.
**Target Platform:** Responsive static web app. Portrait-first at 375–430px, centered desktop layout up to 1080px. Deployed to GitHub Pages and served locally from the production build.
**Key Constraints:** No backend, accounts, telemetry, cloud saves or runtime network calls. All state is local to the browser. Content and art are data-driven. v1 freezes balance numbers and ships procedural SVG placeholders behind a swap contract.
**Historical Sources:** [docs/IDEA.md](IDEA.md) is the sharpened concept from the 2026-10-28 grilling session. It is preserved as source material and is not an execution input.

---

## 2. Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-28 | Forge PRD authoring | Initial PRD and six canonical features derived from docs/IDEA.md |

---

## 3. Goals and Non-Goals

### 3.1 Goals

- Make the shared field the decisive tactical object: shifting it and then dumping matching cards is the signature play.
- Deliver a complete solo run — three escalating elemental encounters plus a boss — in roughly 10–15 minutes on a phone.
- Deliver a local best-of-three duel on one device where hands stay genuinely hidden between turns.
- Keep every rule deterministic and testable outside the UI, with a seeded random source for shuffles and rewards.
- Ship a readable portrait-first interface at 375px that also uses desktop space sensibly.
- Ship all art and audio as local, replaceable placeholders so real assets need no code change.
- Prove the product with automated unit, integration and browser end-to-end checks plus one human release review.

### 3.2 Non-Goals

- Online multiplayer, matchmaking, accounts, cloud saves or cross-device sync.
- Native mobile apps, desktop wrappers or an installable PWA in v1.
- Open-information hotseat play; local hands are always hidden behind an interstitial.
- Deck editing, pre-fight deck construction, card upgrades, rarity tiers, meta-progression or unlockables.
- Music, voice acting or particle-heavy visual effects.
- A balance-tuning pass; the numbers in this PRD are the frozen v1 baseline and tuning is a follow-up.
- Localization; v1 ships English only.

### 3.3 Shared constraints

```forge-requirement
{"id":"VIS-CON-01","kind":"constraint","text":"Use React 19.3.1, Vite 8.3.5, TypeScript 7.0.2, Vitest 5.0.5, Testing Library 16.3.3 and Playwright 1.64.1; add no runtime state, routing or CSS framework, and do not introduce an unverified package."}
```

```forge-requirement
{"id":"VIS-CON-02","kind":"constraint","text":"Produce a static dist build that works from a GitHub Pages project subpath and from the local preview server; resolve every asset through the Vite base URL and write no host-specific runtime behavior."}
```

```forge-requirement
{"id":"VIS-CON-03","kind":"constraint","text":"Ship no backend, accounts, cloud save, telemetry or remote API; persist only the run, settings and stats keys in localStorage, and never transmit them."}
```

```forge-requirement
{"id":"VIS-CON-04","kind":"constraint","text":"Keep v1 free of online multiplayer, deckbuilding, card upgrades, rarity, meta-progression, native packaging, PWA installation, music, voice and particle-heavy effects."}
```

```forge-requirement
{"id":"VIS-CON-05","kind":"constraint","text":"Ship English-only strings and no localization framework; all user-facing copy is bundled, not fetched."}
```

```forge-requirement
{"id":"VIS-CON-06","kind":"constraint","text":"Load art only from committed same-origin SVG placeholders mapped by the manifest, and generate audio only with WebAudio; do not fetch remote fonts, images or audio files."}
```

```forge-requirement
{"id":"VIS-CON-07","kind":"constraint","text":"Freeze the card, health, heal and enemy numbers in this PRD for v1; do not run a balance-tuning pass or change values without a documented follow-up."}
```

```forge-requirement
{"id":"VIS-CON-08","kind":"constraint","text":"Keep gameplay rules in the pure engine and content values in data files; UI, controllers and content must not duplicate damage, draw, status or affordability logic."}
```

---

## 4. Personas

| Persona | Description | Key Needs |
|---------|-------------|-----------|
| Solo commuter | Plays one run on a phone in a short break, often one-handed. | Fast load, resume after interruption, legible cards at 375px, a run that ends in 10–15 minutes. |
| Shared-device duo | Two people pass one phone or laptop back and forth. | A clear privacy screen, an obvious turn handoff, a score that persists across rounds. |
| First-time player | Has not seen an elemental cycle before. | A concise rules reference, visible field identity, previews that explain why damage changed. |
| Maintainer or artist | Replaces placeholder art or tunes card data later. | A documented manifest and data files with no gameplay logic duplicated in the UI. |

### 4.1 Cross-feature stories

```forge-requirement
{"id":"VIS-US-01","kind":"story","text":"As a solo player, I want to start a run with one elemental deck, win three encounters and a boss, and pick rewards between fights, so that a short session has progression and a clear ending."}
```

```forge-requirement
{"id":"VIS-US-02","kind":"story","text":"As one of two players sharing a device, I want a full-screen handoff before every turn, so that neither player sees the other's hand or next intent."}
```

```forge-requirement
{"id":"VIS-US-03","kind":"story","text":"As a first-time player, I want the active field, the element it beats and the resulting damage preview visible in one place, so that I can learn the cycle by playing."}
```

```forge-requirement
{"id":"VIS-US-04","kind":"story","text":"As a player who was interrupted, I want to reload the page and continue the exact solo battle I left, so that closing a tab does not discard the run."}
```

---

## 5. Research Findings

- **Source of truth.** The repository contains no application code, tests, prior PRD or requirements source. The only product input is the sharpened `docs/IDEA.md` from the 2026-10-28 grilling session.
- **Interaction hypothesis.** A single shared field that both sides can shift creates a readable, shared tactical state without requiring hidden information beyond the hand. Persistent defense plus three fixed energy keeps turns short.
- **Content hypothesis.** Thirty-two cards are enough for four ten-card starters and four distinct enemies while keeping the first build reviewable and the reward pool legible.
- **Art hypothesis.** Placeholder art must be legible enough to judge card readability at 375px; final art direction is deliberately unresolved and belongs to the human release review.
- **Technology verification.** Package versions were read from the npm registry on 2026-10-28 and are recorded in section 6.1. No runtime service, API version or remote contract is involved, so there is no external API detail to verify.
- **No user research.** No playtest data exists. The balance figures and the 10–15 minute session target are starting assumptions, not measured outcomes.

---

## 6. Technical Architecture

### 6.1 Technology Stack

| Layer | Choice | Version | Notes |
|-------|--------|---------|-------|
| Runtime | Node.js | 22.13.0 local; 22.12+ required | Vite 8 and Playwright 1.64 require a current Node 22 release. |
| UI | React + React DOM | 19.3.1 | Function components and hooks only; no class components. |
| Build | Vite | 8.3.5 | Static `dist/` output; `VITE_BASE` controls the deployment subpath. |
| React plugin | @vitejs/plugin-react | 6.1.2 | Fast Refresh in development, React transform in build. |
| Language | TypeScript | 7.0.2 | Strict mode, `noUncheckedIndexedAccess`, no `any` in engine code. |
| Unit/integration tests | Vitest | 5.0.5 | Runs in Node with jsdom 30.1.3 for UI tests. |
| UI testing | @testing-library/react | 16.3.3 | Interaction tests through the real `App.tsx` composition root. |
| Browser E2E | @playwright/test | 1.64.1 | Chromium, Firefox and WebKit projects; drives the built static app. |
| Type packages | @types/react 19.3.0, @types/react-dom 19.3.0, @types/node 22.x | — | Types track the React 19 and Node 22 runtimes. |

**No other runtime dependencies.** State management uses React context plus `useReducer`; routing uses an explicit screen union; styling uses plain CSS with custom properties; sound uses WebAudio. This keeps the initial bundle inside the performance budget and avoids unverified packages.

### 6.2 Project Structure

```text
.
├── docs/
│   ├── PRD.md
│   ├── IDEA.md
│   ├── ASSET-SPEC.md
│   ├── reviews/v1-release-review.json
│   └── features/*.md
├── public/assets/
│   ├── assets.manifest.json
│   ├── cards/*.svg
│   ├── enemies/*.svg
│   └── fields/*.svg
├── scripts/
│   ├── generate-placeholder-assets.mjs
│   ├── check-build.mjs
│   └── check-budget.mjs
├── src/
│   ├── main.tsx                 # mounts App; composition root
│   ├── App.tsx                  # screen router; composition root
│   ├── engine/                  # pure rules, AI, intent, snapshot
│   ├── content/                 # cards, decks, enemies
│   ├── state/                   # battle, run and duel controllers
│   ├── persistence/             # settings, run save, stats
│   ├── assets/                  # manifest loader
│   ├── audio/                   # synthesized sound effects
│   ├── ui/screens/              # one component per screen
│   ├── ui/components/           # board, cards, dialogs, live region
│   ├── ui/motion/               # reduced-motion hooks
│   ├── styles/                  # tokens and layout CSS
│   └── test/setup.ts
├── tests/e2e/                   # Playwright specs and helpers
├── .github/workflows/           # ci.yml and pages.yml
├── index.html
├── playwright.config.ts
├── vite.config.ts
├── tsconfig.json
└── package.json
```

### 6.3 Key APIs and Interfaces

| Interface | Owner | Contract |
|-----------|-------|----------|
| `CardDefinition` | Card & Enemy Content | Immutable card data: id, name, element, type, cost, damage, defense, piercing, conditional field bonus, draw, energy, status, heal and shift target. No UI text branching. |
| `EnemyDefinition` | Card & Enemy Content | Enemy id, display name, element, max health, deck list and optional counter-element bias for the boss. |
| `BattleState` | Battle Engine & Rules | Full state for two symmetric sides: decks, hands, discard, energy, health, defense, statuses, field, turn owner, phase, seed and PRNG state. Mutated only through exported action functions. |
| `BattleSnapshot` | Battle Engine & Rules | Versioned serializable form of `BattleState`, validated on restore. |
| `EnemyPlan` | Battle Engine & Rules | Ordered card ids plus a recomputed preview of damage, defense, status and field changes. |
| `RunState` | Solo Run | Encounter index, player element, health, deck, turn totals, seed, pending reward and run phase. |
| `DuelMatch` | Local Duel | Best-of-three score, current round, first player, locked deck ids and round seeds. |
| `RunSaveV1` | Solo Run | `schemaVersion: 1` plus seed, PRNG state, run state, optional battle snapshot and optional reward offer. |
| `AssetManifest` | Card & Enemy Content | Versioned list of assets keyed by `card:<id>`, `enemy:<id>` and `field:<element>` with kind, element, relative path and spec metadata. |
| `Screen` | Game Shell & Presentation | Discriminated union covering menu, rules, settings, solo setup/overview/battle/reward/result, duel setup/privacy/battle/round result/match result. |

**State flow.** The pure engine exposes setup, play-card, end-turn and snapshot functions. Controllers wrap it in reducers for the two modes. Persistence reads and writes versioned snapshots. React screens render controller state and dispatch intents; no screen computes damage, draws cards or mutates battle state directly.

**Composition root.** `src/main.tsx` mounts `src/App.tsx`. `App.tsx` owns the screen union and wires every screen, including solo and duel flows. Every feature that adds a reachable screen exports it and adds it to `App.tsx` with an interaction test that renders `App` and navigates to it.

### 6.4 Determinism and Randomness

The engine never calls `Math.random`. A 32-bit seed initializes a small serializable PRNG. Shuffles, reward offers and AI tie-breaks consume that PRNG in a fixed order. `?seed=` overrides the seed for both modes and is the hook Playwright uses; the parameter is harmless in normal play. Seed and PRNG state travel with saves so a resume continues the same sequence.

---

## 7. Non-Functional Requirements

| ID | Priority | Area |
|----|----------|------|
| VIS-NFR-01 | Must | Responsive layout |
| VIS-NFR-02 | Must | Performance and bundle budget |
| VIS-NFR-03 | Must | Baseline accessibility |
| VIS-NFR-04 | Must | Deterministic behavior |
| VIS-NFR-05 | Must | Local-only privacy |
| VIS-NFR-06 | Must | Save integrity |
| VIS-NFR-07 | Must | Browser support |

```forge-requirement
{"id":"VIS-NFR-01","kind":"requirement","text":"Render without horizontal page scroll from 375px through 1440px, keep all five hand cards reachable at 375px, and center the board at a maximum width of 1080px on wider screens."}
```

```forge-requirement
{"id":"VIS-NFR-02","kind":"requirement","text":"Keep initial JavaScript plus CSS at or below 300 KB gzip in the production build, make card actions visible within 100ms of input, and avoid layout shift when SVGs load."}
```

```forge-requirement
{"id":"VIS-NFR-03","kind":"requirement","text":"Support keyboard-only play, visible focus, 44px minimum interactive targets, text labels beside element colors, dialog focus trapping and reduced-motion behavior; no formal WCAG audit is required in v1."}
```

```forge-requirement
{"id":"VIS-NFR-04","kind":"requirement","text":"Use one seeded PRNG for every random decision so a fixed seed and action sequence reproduce identical shuffles, rewards, enemy plans and battle outcomes."}
```

```forge-requirement
{"id":"VIS-NFR-05","kind":"requirement","text":"After the initial same-origin asset load, make no network requests and transmit no data; all saves, settings and statistics stay in localStorage under Fieldbound keys."}
```

```forge-requirement
{"id":"VIS-NFR-06","kind":"requirement","text":"Validate every persisted payload against its schema version before use; on corrupt, foreign or unknown-version data, discard only the affected key and continue with defaults."}
```

```forge-requirement
{"id":"VIS-NFR-07","kind":"requirement","text":"Support the current and previous major versions of Chrome, Edge, Firefox and Safari, including iOS 16 or newer Safari on a 375px viewport."}
```

---

## 8. Security and Privacy

**Data collected:** None. No names, emails, accounts, identifiers, analytics, crash reporting or advertising. The product has no server component.

**Data stored:** Three versioned localStorage keys: `fieldbound.run.v1` (solo run and battle snapshot), `fieldbound.settings.v1` (audio mute and reduced-motion override) and `fieldbound.stats.v1` (best-run record). Values contain only game state.

**Threat model:** The relevant risks are a malicious or corrupted local payload, script injection through rendered text, and subresource requests leaking usage. Card names, enemy names and all rendered strings come from bundled data or fixed UI text; React escapes them by default.

**Controls:** No `dangerouslySetInnerHTML`, `eval` or `new Function`. A Content-Security-Policy meta tag injected into the production HTML restricts scripts, styles, images and connections to the same origin. Assets are local files resolved through the manifest. The production audit fails if any request leaves the origin.

```forge-requirement
{"id":"VIS-SEC-01","kind":"requirement","text":"Ship a same-origin Content-Security-Policy meta tag in the production build only, and forbid dangerouslySetInnerHTML, eval and new Function anywhere in application code."}
```

```forge-requirement
{"id":"VIS-SEC-02","kind":"requirement","text":"Include no analytics, telemetry, third-party scripts, remote fonts or remote images; the production audit must observe zero cross-origin requests."}
```

**localStorage caveat:** Storage can be unavailable in private browsing or full. The app falls back to in-memory state for the session, shows a non-blocking notice, and never blocks play.

---

## 9. Accessibility

The v1 bar is pragmatic, not certified: keyboard-complete play, visible focus, 44px targets, non-color element cues, readable contrast and a real reduced-motion mode. There is no formal WCAG conformance audit, and no automated tool is treated as a substitute for the human release review.

- **Keyboard map:** Tab/Shift+Tab move focus; Enter or Space activates the focused control; `E` ends the turn when focus is not in a text field; Escape closes dialogs, the card detail view and the rules overlay.
- **Semantics:** Hand cards are buttons with accessible names containing cost, name and element. Energy is text plus pips. HP and defense use `role="meter"` with value text. The enemy plan is a list, not an image.
- **Live updates:** One polite live region announces turn changes, damage totals, field shifts and battle results.
- **Color independence:** Every element has a distinct glyph and a text label. Field matchup is stated as words ("Ember empowers; Frost is countered"), not color alone.
- **Motion:** The OS `prefers-reduced-motion` setting is the initial value; the settings toggle overrides it and persists. Reduced mode removes transforms and uses at most a 1ms opacity change.
- **Targets and zoom:** Interactive controls are at least 44×44 CSS pixels, body text is at least 16px, and layout survives 200% zoom at 375px without clipping controls.

---

## 10. System States / Lifecycle

**Boot:** Load settings and stats. Validate any run save. A valid save exposes Continue Run on the menu; an invalid save is removed and the menu appears without an error dialog.

**Solo run:** Deck select → encounter 1 battle → victory reward (auto-heal) → encounter 2 → reward → encounter 3 → reward → boss → run result. Defeat at any battle → run result with defeat. Reward selection is mandatory; the next battle cannot start until one option is chosen.

**Duel:** Setup Player 1 deck → setup Player 2 deck → privacy screen → round 1 battle → round result → privacy screen → round 2 → optional round 3 → match result. Rounds reset field, health, defense, statuses and decks while keeping the locked deck lists. The match ends at two round wins.

**Battle turn:** Start of turn (energy to 3, Regen tick, draw to 5) → player acts until energy or hand is exhausted or they end the turn → discard hand → opposing turn executes the telegraphed plan → discard, draw and plan the next turn → privacy screen in duel mode → next turn. Victory or defeat ends the sequence immediately and rejects further actions.

**Interruption:** Every settled action in a solo run writes a save. A reload restores the exact battle, pending reward or result. Duels are never saved.

**Failure modes:** Missing SVG renders a text fallback; unavailable audio silently degrades and keeps the mute state; unavailable storage keeps the session in memory; an impossible asset manifest entry fails the content test rather than the runtime.

---

## 11. Analytics / Success Metrics

No analytics are collected. Success is demonstrated by repository evidence and one human review.

| Metric | Target | Measurement Method |
|--------|--------|--------------------|
| Solo completion | A seeded run reaches the boss and wins | Playwright `tests/e2e/solo-run.spec.ts` |
| Save resume | Reload mid-battle restores identical state | Playwright reload assertion in the same spec |
| Duel privacy | Interstitial hides hands before every turn | Playwright `tests/e2e/duel.spec.ts` |
| Rules coverage | Damage, defense cap, matchup, piercing, rounding, statuses, shuffle, snapshot and AI covered | Vitest engine suites |
| Build budget | Initial JS + CSS at or below 300 KB gzip | `node scripts/check-budget.mjs` |
| Static deploy | Production build serves from a subpath with no console errors | `node scripts/check-build.mjs` plus Pages workflow |
| Session length | 10–15 minutes for a full run | Human stopwatch observation during release review |
| Card readability | Five cards usable at 375px without zoom | Human review at 390×844 and 375×667 |

---

## 12. Dependencies and Risks

### 12.1 Dependencies

- Node.js 22.12+ and npm 10+ for local development, tests and builds.
- GitHub repository with Actions and Pages enabled for deployment; no other hosting dependency.
- Playwright browser binaries downloaded in CI and locally.
- No external API, database, identity provider or SaaS dependency exists.
- The four starter decks, four enemies and 32 cards defined in the content feature are prerequisites for the shell and both modes.

### 12.2 Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Persistent defense plus fixed energy stalls battles | Runs feel grindy or unwinnable | Self-play termination guard at 100 turns, lethal-first AI, and a later tuning pass outside v1 |
| Card text is unreadable at 375px | Core loop fails on the primary device | Tap-to-inspect detail view, glyph-first card faces, human readability gate |
| TypeScript 7 toolchain is new | Typecheck or plugin incompatibility blocks the build | Verify at scaffold time; fall back to the latest stable 5.x line and record the change in the version history |
| Audio autoplay is blocked | Sounds missing on first interaction | Create/resume the audio context on the first pointer or key gesture; mute is always available |
| localStorage is unavailable or full | Save/resume silently fails | In-memory fallback plus a visible non-blocking notice; save failures never crash play |
| GitHub Pages subpath breaks assets | Blank board after deploy | Resolve every asset through `import.meta.env.BASE_URL`; the `check-build.mjs` audit serves the real subpath build and plays a card |
| Scope creep into deckbuilding or online play | v1 never ships | Non-goals are explicit and no feature owns those tasks |
| Procedural placeholders become the product | Art direction never decided | Manifest swap contract plus a human review that judges readability, not polish |

---

## 13. Future Considerations

- Balance tuning pass driven by recorded self-play and human sessions.
- Installable PWA with offline caching and an app icon.
- Additional cards, enemies and a second boss with a distinct field rule.
- Deck construction and pre-fight sideboards.
- Online asynchronous duels, which would require an authoritative rules host and a privacy model.
- Optional generated art replacement using the existing manifest contract.

---

## 14. Features

| # | Feature | File | Dependencies | Priority |
|---|---------|------|-------------|----------|
| 1 | Battle Engine & Rules | [docs/features/battle-engine.md](features/battle-engine.md) | None | Must |
| 2 | Card & Enemy Content | [docs/features/card-content.md](features/card-content.md) | Battle Engine & Rules | Must |
| 3 | Game Shell & Presentation | [docs/features/game-shell.md](features/game-shell.md) | Battle Engine & Rules, Card & Enemy Content | Must |
| 4 | Solo Run | [docs/features/solo-run.md](features/solo-run.md) | Game Shell & Presentation | Must |
| 5 | Local Duel | [docs/features/local-duel.md](features/local-duel.md) | Game Shell & Presentation | Must |
| 6 | Release Verification | [docs/features/release-verification.md](features/release-verification.md) | Solo Run, Local Duel | Must |

### Feature Dependency Graph

```text
Battle Engine & Rules (foundation)
└── Card & Enemy Content
    └── Game Shell & Presentation
        ├── Solo Run
        └── Local Duel
            └── Release Verification (requires Solo Run + Local Duel)
```

---

## 15. Glossary

| Term | Definition |
|------|------------|
| Field | The single shared active element for a battle: Ember, Frost, Gale, Stone or Neutral. |
| Cycle | Ember beats Frost, Frost beats Gale, Gale beats Stone, Stone beats Ember. Neutral sits outside it. |
| Empowered | An attack or Ward whose element matches the field: attacks gain +2 and pierce; Wards gain +2 defense. |
| Countered | An attack whose element is beaten by the field: damage is halved with ceiling rounding and cannot pierce. |
| Pierce | Ignore the target's defense for that attack. A countered attack cannot pierce, even if the card has the keyword. |
| Defense | Persistent flat damage reduction for the battle, capped at 8, reset between encounters and duel rounds. |
| Energy | Per-turn resource, reset to 3, spent to play cards. Card-granted energy can exceed 3 for the current turn. |
| Stack | A counted status application. Focus and Weaken cap at 3; Regen caps at 2. |
| Intent | The enemy's complete telegraphed next-turn plan, with recomputed numbers. |
| Run | The solo ladder of three encounters and a boss, with carried health and an evolving deck. |
| Duel | A local best-of-three match between two players on one device. |
| Interstitial | The full-screen privacy handoff shown before each duel turn. |
| Manifest | `assets.manifest.json`, the only mapping from card, enemy and field IDs to asset files. |
| Snapshot | A versioned serializable battle state used by save/resume and round resets. |
| Seed | A 32-bit integer that deterministically drives shuffles, rewards and AI tie-breaks. |

---

## 16. Open Questions

| # | Question | Default Assumption |
|---|----------|--------------------|
| 1 | What is the final art direction and are cards readable at 390px? | Ship light-parchment geometric placeholders; judge during the human release review and swap files later through the manifest. |
| 2 | Are the health, damage, heal and enemy numbers balanced? | Treat them as the frozen v1 baseline; tune only after playtesting, outside v1 scope. |
| 3 | Which static host and URL will be used? | GitHub Pages project site at `/<repository>/`, with a local `vite preview` path; `VITE_BASE` makes the choice reversible. |
| 4 | Does the duel feel better as best-of-three? | Ship best-of-three with locked decks and alternating first player; revisit after the release review. |
| 5 | Is TypeScript 7.0.2 stable enough for this toolchain? | Pin it, verify scaffold, typecheck and build before feature work; fall back to the latest 5.x release if incompatible. |
| 6 | Should sound start enabled or muted? | Start enabled but create the WebAudio context only after the first gesture; persist an explicit mute choice. |
| 7 | What happens when localStorage is unavailable? | Keep the session in memory, show a dismissible notice, and offer no Continue Run. |
| 8 | Is English-only acceptable for v1? | Yes; no localization framework or translated strings are included. |
