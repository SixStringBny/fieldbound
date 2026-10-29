# Feature: Game Shell & Presentation

## Traceability

| Canonical ID | Owner / Source Link | Relationship |
|--------------|---------------------|--------------|
| VIS-US-03 | [Vision](../PRD.md#4. Personas) | participates |
| VIS-NFR-01 | [Vision](../PRD.md#7. Non-Functional Requirements) | participates |
| VIS-NFR-03 | [Vision](../PRD.md#7. Non-Functional Requirements) | participates |
| VIS-CON-02 | [Vision](../PRD.md#1. Overview) | constrained by |
| VIS-CON-06 | [Vision](../PRD.md#1. Overview) | constrained by |
| SHL-FR-01 – SHL-FR-08 | This feature | owns |
| ENG-FR-10 | [Battle Engine & Rules](battle-engine.md#3. Functional Requirements) | participates |

**PRD:** [docs/PRD.md](../PRD.md)

---

## 1. Feature Overview

**Feature Name:** Game Shell & Presentation
**ID Prefix:** SHL
**Summary:** The React application shell and the battle presentation layer: screen routing, the responsive board, card faces and detail view, field repaint, motion, synthesized audio, settings and baseline accessibility. It renders engine state and dispatches intents; it never computes rules.
**Dependencies:** Battle Engine & Rules, Card & Enemy Content
**Priority:** Must

---

## 2. User Stories

| ID | As a... | I want to... | So that... | Priority |
|----|---------|-------------|-----------|----------|
| SHL-US-01 | Solo commuter | see my hand, energy, health and the enemy plan without scrolling sideways | I can take a turn one-handed at 375px | Must |
| SHL-US-02 | First-time player | tap a card and read its full effect before playing it | I do not misplay because the face was small | Must |
| SHL-US-03 | Motion-sensitive player | turn off movement and sound independently | the game stays comfortable | Must |
| SHL-US-04 | Keyboard player | play a whole turn without a pointer | I am not locked out of the game | Must |

---

## 3. Functional Requirements

```forge-requirement
{"id":"SHL-FR-01","kind":"requirement","text":"Route every screen through App.tsx using one discriminated Screen union: menu, how-to-play, settings, solo setup, run overview, battle, reward, run result, duel setup, privacy, round result and match result."}
```

```forge-requirement
{"id":"SHL-FR-02","kind":"requirement","text":"Render a portrait-first battle board with enemy, field, player, hand and controls that fits 375–430px without horizontal page scroll and centers at a 1080px maximum on desktop, showing enemy intent, energy, defense, statuses and the field matchup."}
```

```forge-requirement
{"id":"SHL-FR-03","kind":"requirement","text":"Make every hand card a button showing cost, name, element glyph and primary number, disable unaffordable cards, open a full-effect detail view on tap or Enter, and keep the detail dismissible by tap, Escape or a close button."}
```

```forge-requirement
{"id":"SHL-FR-04","kind":"requirement","text":"Animate card draw, play, damage numbers and field repaint with 120–400ms transitions, and remove transforms and long animations when either the operating-system reduced-motion preference or the in-app toggle is active."}
```

```forge-requirement
{"id":"SHL-FR-05","kind":"requirement","text":"Synthesize all sound effects with WebAudio oscillators or noise, never audio files; unlock the context on the first pointer or key gesture, play only when unmuted, and stop all sound immediately when muted."}
```

```forge-requirement
{"id":"SHL-FR-06","kind":"requirement","text":"Provide baseline accessibility: full keyboard operation (Tab, Shift+Tab, Enter, Space, E to end turn, Escape to close overlays), visible 2px focus, 44px minimum targets, element glyph plus text, dialog focus trapping and polite live announcements for turn, damage and field changes."}
```

```forge-requirement
{"id":"SHL-FR-07","kind":"requirement","text":"Persist audio-muted and reduced-motion settings in a versioned localStorage key, initialize reduced motion from the operating-system preference, and fall back to defaults when storage is unavailable or invalid."}
```

```forge-requirement
{"id":"SHL-FR-08","kind":"requirement","text":"Resolve every card, enemy and field image through the asset manifest with the app base URL, set meaningful alt text, and render a labelled text fallback when an image fails to load."}
```

---

## 4. UI / Interaction Design

### 4.1 Screen flow

| Screen | Purpose | Primary actions |
|--------|---------|-----------------|
| Menu | Entry point | Play Solo, Local Duel, Continue Run, How to Play, Settings |
| How to Play | Rules reference | Back |
| Settings | Audio and motion | Toggle sound, toggle reduced motion, Back |
| Solo setup | Deck choice | Select one of four decks, Start Run, Back |
| Run overview | Between encounters | Next Battle, abandon to Menu |
| Battle | Core loop | Play card, inspect card, End Turn |
| Reward | Between-battle choice | Pick one of three options |
| Run result | Victory or defeat | New Run, Menu |
| Duel setup | Two deck choices | Confirm Player 1, confirm Player 2, Start Match |
| Privacy | Handoff | Tap or Enter when ready |
| Round result | Series score | Next Round, view match result |
| Match result | Series winner | Rematch, Change decks, Menu |

Solo and duel screens are added by their own features; this feature owns the router, menu, rules, settings and battle screen.

### 4.2 Battle board layout

**Portrait (375–639px):** single column. Enemy panel at the top with portrait, name, health, defense, statuses and the intent list. Field banner below it with glyph, name, "Empowers / Counters" text and the cycle strip. Player panel under the field with health, defense, statuses and energy pips. The hand sits in a horizontally scrollable snap row with at least 64px visible per card and a tap-to-inspect detail sheet. A sticky bottom bar holds the End Turn button and energy text. The event log collapses behind a "Log" toggle; the log surface is owned by `LOG-FR-04` in [Battle Log & Dynamic Dialogue](battle-log.md).

**Tablet and desktop (640px+):** the same vertical order inside a centered 1080px container. Cards grow to about 120px wide; the event log becomes a right-hand column on widths of 1024px or more. No hover-only action exists.

The page must not scroll horizontally at 375px. Vertical scrolling inside the hand is allowed; the page itself may scroll if the viewport is shorter than the board.

### 4.3 Card face and detail

The face shows a cost circle, element glyph and label, name, primary number (damage or defense), a `Pierce` badge, a `+2 on field` badge and a dimmed unaffordable state. The detail view repeats the full effect text, the current field interaction ("Empowered: 6 damage and pierces" or "Countered: 4 damage"), and a Play button. Playing from the detail view closes it.

### 4.4 Field presentation

The field banner always states the active element, the element it beats and the element that beats it in words. A four-step cycle strip marks the active element. Repainting the board palette is decorative; the text and glyph carry the meaning.

### 4.5 Motion

| Event | Duration | Reduced motion |
|-------|----------|----------------|
| Card draw | 180ms translate + fade | Instant |
| Card play | 160ms lift and fade | Instant |
| Damage number | 400ms float and fade | Static number for 400ms |
| Field shift | 300ms palette crossfade | Instant |
| Hover/focus lift | 120ms transform | No transform |

### 4.6 Audio

Cues are generated in `src/audio/sfx.ts`: `card-play`, `damage`, `ward`, `shift`, `victory`, `defeat` and `ui`. Each cue is a short oscillator or noise burst under 300ms with a low master gain. No music, samples or external files. The context is created only after a user gesture; muted state short-circuits playback.

### 4.7 Settings and accessibility

Settings offers two switches: Sound and Reduce motion. Both persist immediately. Reduce motion initializes from `matchMedia("(prefers-reduced-motion: reduce)")`; an explicit toggle overrides it. The app root carries `data-reduced-motion="true|false"` for CSS.

Dialogs trap focus, restore focus to the invoking control on close, and use `aria-modal`. A single polite live region announces "Your turn", "Enemy turn", damage totals, field changes and the battle result. Element colors are always paired with a glyph and label.

### 4.8 Asset rendering

`AssetImage` looks up `card:<id>`, `enemy:<id>` or `field:<element>` in the manifest, builds the URL from the supplied base URL, and renders an `<img>` with descriptive alt text. On error it renders a bordered fallback containing the asset label so the board stays usable.

---

## 5. Implementation Tasks

| ID | Observable outcome | Owner | Depends | Outputs and tests | Check |
|----|--------------------|-------|---------|-------------------|-------|
| SHL-01 | App router with menu, rules and a testable screen union | frontend-engineer | ENG-00 | `src/App.tsx`, `src/App.navigation.test.tsx`, `src/ui/screens/MenuScreen.tsx`, `src/ui/screens/HowToPlayScreen.tsx`, `src/ui/events.ts` | `npm test -- src/App.navigation.test.tsx` |
| SHL-02 | Responsive board, card faces, detail view and manifest images | ux-engineer | SHL-01, CNT-03, ENG-01 | `src/styles/tokens.css`, `src/styles/board.css`, `src/ui/components/BattleBoard.tsx`, `src/ui/components/EnemyPanel.tsx`, `src/ui/components/FieldBanner.tsx`, `src/ui/components/PlayerPanel.tsx`, `src/ui/components/Hand.tsx`, `src/ui/components/CardView.tsx`, `src/ui/components/CardDetail.tsx`, `src/ui/components/AssetImage.tsx`, `src/ui/components/BattleBoard.test.tsx`, `src/ui/components/CardView.test.tsx` | `npm test -- src/ui/components/BattleBoard.test.tsx src/ui/components/CardView.test.tsx` |
| SHL-03 | Battle controller and playable battle screen wired to App | frontend-engineer | SHL-02, ENG-07, CNT-02 | `src/state/battle-controller.ts`, `src/state/battle-controller.test.ts`, `src/ui/screens/BattleScreen.tsx`, `src/App.tsx`, `src/App.battle.test.tsx` | `npm test -- src/App.battle.test.tsx src/state/battle-controller.test.ts` |
| SHL-04 | Reduced-motion hook and motion styles | ux-engineer | SHL-02 | `src/ui/motion/useReducedMotion.ts`, `src/ui/motion/motion.css`, `src/ui/motion/useReducedMotion.test.tsx` | `npm test -- src/ui/motion/useReducedMotion.test.tsx` |
| SHL-05 | Synthesized, mutable WebAudio cue engine | ux-engineer | SHL-01 | `src/audio/sfx.ts`, `src/audio/sfx.test.ts` | `npm test -- src/audio/sfx.test.ts` |
| SHL-06 | Settings screen, persistence and audio/motion wiring | frontend-engineer | SHL-04, SHL-05 | `src/ui/screens/SettingsScreen.tsx`, `src/persistence/settings.ts`, `src/persistence/settings.test.ts`, `src/App.tsx`, `src/App.settings.test.tsx` | `npm test -- src/App.settings.test.tsx src/persistence/settings.test.ts` |
| SHL-07 | Keyboard controls, live announcements and focus handling | frontend-engineer | SHL-03, SHL-06 | `src/ui/a11y/useKeyboardControls.ts`, `src/ui/components/LiveRegion.tsx`, `src/ui/a11y/useKeyboardControls.test.tsx`, `src/App.tsx`, `src/App.a11y.test.tsx` | `npm test -- src/App.a11y.test.tsx` |

### Phase 1: Navigation Shell

```forge-task
{
  "id": "SHL-01",
  "title": "Build the App router, menu and rules reference",
  "description": "Create the Screen union and App router with menu, how-to-play and a test-only initialScreen prop. Add a typed UI event bus for sound cues. Build the menu with Play Solo, Local Duel, How to Play and Settings, plus a Continue Run entry gated by a hasSave prop that defaults to false. Add the rules reference covering energy, field cycle, defense, statuses and modes. Do not build the board, settings persistence, solo or duel screens.",
  "ownerAgent": "frontend-engineer",
  "dependencies": ["ENG-00"],
  "expectedOutputs": ["src/App.tsx", "src/App.navigation.test.tsx", "src/ui/screens/MenuScreen.tsx", "src/ui/screens/HowToPlayScreen.tsx", "src/ui/events.ts"],
  "validationCommands": ["npm test -- src/App.navigation.test.tsx", "npm run typecheck"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["Every current screen is selected through the App Screen union", "Menu and rules content cover the field cycle, energy, defense and both modes"],
    "requirementRefs": ["docs/features/game-shell.md#SHL-FR-01"],
    "acceptanceCriteria": ["Rendering App shows the menu with the five entry points", "Activating How to Play opens the rules and Back returns to the menu", "The rules text names Ember, Frost, Gale, Stone, the cycle and the three-energy rule", "The Screen union is exhaustive and adding an unknown screen fails typecheck", "The event bus delivers a typed cue to a subscriber and unsubscribes cleanly"],
    "constraints": ["Do not add a routing library", "Do not implement gameplay in screens", "Do not create empty screens for unimplemented features"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-01"],
    "references": ["docs/PRD.md#6. Technical Architecture", "docs/features/game-shell.md#4. UI / Interaction Design"]
  }
}
```

### Phase 2: Battle Presentation

```forge-task
{
  "id": "SHL-02",
  "title": "Build the responsive board, card faces and asset rendering",
  "description": "Implement design tokens, board CSS and presentational components for the enemy panel, field banner, player panel, hand, card face, card detail and manifest-backed image. Ensure 375px layout without horizontal page scroll, 44px targets, glyph plus label for every element, and a labelled fallback for failed images. Keep components props-only with no engine mutation.",
  "ownerAgent": "ux-engineer",
  "dependencies": ["SHL-01", "CNT-03", "ENG-01"],
  "expectedOutputs": ["src/styles/tokens.css", "src/styles/board.css", "src/ui/components/BattleBoard.tsx", "src/ui/components/EnemyPanel.tsx", "src/ui/components/FieldBanner.tsx", "src/ui/components/PlayerPanel.tsx", "src/ui/components/Hand.tsx", "src/ui/components/CardView.tsx", "src/ui/components/CardDetail.tsx", "src/ui/components/AssetImage.tsx", "src/ui/components/BattleBoard.test.tsx", "src/ui/components/CardView.test.tsx"],
  "validationCommands": ["npm test -- src/ui/components/BattleBoard.test.tsx src/ui/components/CardView.test.tsx", "npm run typecheck"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["The board exposes enemy, field, player, hand and controls with all five cards reachable at 375px", "Card faces show cost, name, element and primary number, and the detail view shows the full effect"],
    "requirementRefs": ["docs/features/game-shell.md#SHL-FR-02", "docs/features/game-shell.md#SHL-FR-03", "docs/features/game-shell.md#SHL-FR-08"],
    "acceptanceCriteria": ["At a 375px viewport the board renders without document-level horizontal overflow and every hand card has a 44px target", "Every element renders a glyph and a text label, never color alone", "An unaffordable card is disabled and an affordable card is focusable", "Card detail opens on click and Enter and closes on Escape and the close button", "AssetImage uses the manifest and base URL, and a missing file shows a labelled fallback", "Field banner text names the empowered and countered elements"],
    "constraints": ["No hover-only interaction", "No engine or storage imports in presentational components", "Use plain CSS with custom properties; no UI framework"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-01", "docs/PRD.md#VIS-CON-06"],
    "references": ["docs/PRD.md#7. Non-Functional Requirements", "docs/features/game-shell.md#4. UI / Interaction Design"]
  }
}
```

```forge-task
{
  "id": "SHL-03",
  "title": "Wire the battle controller and playable battle screen",
  "description": "Create a reducer-backed battle controller over the engine and a BattleScreen that renders board components, dispatches play-card and end-turn intents, shows the intent preview, emits sound cues, and is reachable through App via initialScreen. Add interaction tests through App that play a card, end a turn and surface the enemy plan. Do not implement solo or duel setup screens.",
  "ownerAgent": "frontend-engineer",
  "dependencies": ["SHL-02", "ENG-07", "CNT-02"],
  "expectedOutputs": ["src/state/battle-controller.ts", "src/state/battle-controller.test.ts", "src/ui/screens/BattleScreen.tsx", "src/App.tsx", "src/App.battle.test.tsx"],
  "validationCommands": ["npm test -- src/App.battle.test.tsx src/state/battle-controller.test.ts", "npm run typecheck"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["The battle screen can complete a turn through the UI and reflects engine state exactly", "The screen shows the enemy plan and the field matchup without duplicating damage rules"],
    "requirementRefs": ["docs/features/game-shell.md#SHL-FR-03", "docs/features/battle-engine.md#ENG-FR-01", "docs/features/battle-engine.md#ENG-FR-04", "docs/features/battle-engine.md#ENG-FR-07"],
    "acceptanceCriteria": ["Rendering App with a battle initial screen shows the hand, energy, both health values and the enemy plan", "Playing an affordable card reduces energy and applies the engine result to health or defense", "An unaffordable card cannot be played through the UI", "End Turn executes the enemy plan and returns control to the player", "The controller rejects actions after battle end and exposes victory or defeat", "The screen emits card-play, damage, ward and shift cues for the matching actions"],
    "constraints": ["Screens may not import damage or status functions directly", "The controller is the only layer that touches engine mutators"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-08"],
    "references": ["docs/PRD.md#6. Technical Architecture", "docs/features/game-shell.md#4. UI / Interaction Design"]
  }
}
```

### Phase 3: Motion, Audio and Settings

```forge-task
{
  "id": "SHL-04",
  "title": "Implement reduced-motion preference and motion styles",
  "description": "Create a useReducedMotion hook that combines the matchMedia system preference with an explicit override, plus CSS for draw, play, damage and field-shift transitions with a reduced branch. Expose the resolved value for the app root data attribute. Do not persist settings in this task.",
  "ownerAgent": "ux-engineer",
  "dependencies": ["SHL-02"],
  "expectedOutputs": ["src/ui/motion/useReducedMotion.ts", "src/ui/motion/motion.css", "src/ui/motion/useReducedMotion.test.tsx"],
  "validationCommands": ["npm test -- src/ui/motion/useReducedMotion.test.tsx"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["The hook resolves true when either the system preference or an explicit override is active", "Reduced motion removes transforms and long animations"],
    "requirementRefs": ["docs/features/game-shell.md#SHL-FR-04"],
    "acceptanceCriteria": ["A matching system media query returns true and a non-matching one returns false", "An explicit true override wins over a non-matching system preference and false wins over a matching one", "The hook reacts to a media-query change event and cleans up its listener", "The reduced CSS branch sets transition duration to at most 1ms and removes transforms", "Motion CSS defines all five documented durations for the normal branch"],
    "constraints": ["Do not read or write localStorage in this task", "Respect prefers-reduced-motion without forcing the override on first render"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-01"],
    "references": ["docs/PRD.md#9. Accessibility", "docs/features/game-shell.md#4. UI / Interaction Design"]
  }
}
```

```forge-task
{
  "id": "SHL-05",
  "title": "Implement synthesized WebAudio sound cues",
  "description": "Create a small WebAudio cue engine with unlock, play, mute and dispose. Generate card-play, damage, ward, shift, victory, defeat and ui cues from oscillators or noise under 300ms, with a low master gain. Create no audio files, fetch no audio and do nothing before unlock. Do not wire settings or the battle screen.",
  "ownerAgent": "ux-engineer",
  "dependencies": ["SHL-01"],
  "expectedOutputs": ["src/audio/sfx.ts", "src/audio/sfx.test.ts"],
  "validationCommands": ["npm test -- src/audio/sfx.test.ts"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["All cues are synthesized at runtime and no audio asset is loaded", "Muting stops playback and skips future cue scheduling"],
    "requirementRefs": ["docs/features/game-shell.md#SHL-FR-05"],
    "acceptanceCriteria": ["No AudioContext is constructed before unlock is called", "Each cue schedules at least one oscillator or noise source and stops within 300ms", "Playing while muted schedules nothing", "Muting during a cue stops the connected nodes and unmuting allows later cues", "The module never fetches a file or references an audio URL"],
    "constraints": ["Use the platform AudioContext only behind a factory that can be mocked", "No music or looping beds"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-06"],
    "references": ["docs/PRD.md#6. Technical Architecture", "docs/features/game-shell.md#4. UI / Interaction Design"]
  }
}
```

```forge-task
{
  "id": "SHL-06",
  "title": "Add settings persistence and wire audio and motion",
  "description": "Persist Sound and Reduce motion under fieldbound.settings.v1 with a versioned schema, defaults and safe fallback. Build the settings screen, set data-reduced-motion on the app root, subscribe App to the cue bus, unlock audio on the first gesture and pass the motion override. Add tests through App for toggling, persistence and reload. Do not change gameplay.",
  "ownerAgent": "frontend-engineer",
  "dependencies": ["SHL-04", "SHL-05"],
  "expectedOutputs": ["src/ui/screens/SettingsScreen.tsx", "src/persistence/settings.ts", "src/persistence/settings.test.ts", "src/App.tsx", "src/App.settings.test.tsx"],
  "validationCommands": ["npm test -- src/App.settings.test.tsx src/persistence/settings.test.ts", "npm run typecheck"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["Settings persist immediately under a versioned key and apply on the next load", "Audio unlocks on the first gesture and plays only when unmuted"],
    "requirementRefs": ["docs/features/game-shell.md#SHL-FR-07", "docs/features/game-shell.md#SHL-FR-05", "docs/features/game-shell.md#SHL-FR-04"],
    "acceptanceCriteria": ["Toggling Sound writes muted true or false and survives a remount", "Toggling Reduce motion writes the override and sets data-reduced-motion on the app root", "First paint uses the system motion preference when no stored override exists", "Invalid or unknown-version settings fall back to defaults without throwing", "Storage being unavailable keeps the toggles working in memory", "A cue emitted after unlock is played when unmuted and skipped when muted"],
    "constraints": ["Only the settings module may touch the settings key", "Do not store game state in settings"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-03"],
    "references": ["docs/PRD.md#8. Security and Privacy", "docs/features/game-shell.md#4. UI / Interaction Design"]
  }
}
```

```forge-task
{
  "id": "SHL-07",
  "title": "Add keyboard controls, live announcements and focus handling",
  "description": "Add global keyboard controls for ending a turn and closing overlays, a polite live region for turn, damage and field changes, dialog focus trapping with focus restore, and a skip link. Wire them through App and add tests through App for keyboard and announcements. Do not change visual design or game rules.",
  "ownerAgent": "frontend-engineer",
  "dependencies": ["SHL-03", "SHL-06"],
  "expectedOutputs": ["src/ui/a11y/useKeyboardControls.ts", "src/ui/components/LiveRegion.tsx", "src/ui/a11y/useKeyboardControls.test.tsx", "src/App.tsx", "src/App.a11y.test.tsx"],
  "validationCommands": ["npm test -- src/App.a11y.test.tsx src/ui/a11y/useKeyboardControls.test.tsx"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["A turn can be played with the keyboard alone", "Changes to turn, damage and field are announced politely"],
    "requirementRefs": ["docs/features/game-shell.md#SHL-FR-06"],
    "acceptanceCriteria": ["Tab and Shift+Tab reach every hand card and End Turn in order", "Enter plays a focused card and E ends the turn outside a text field", "Escape closes the card detail and any open dialog and restores focus to the invoker", "The live region announces turn changes and damage totals without duplicate messages", "A skip link moves focus to the main board region"],
    "constraints": ["Do not use positive tabindex values", "Dialogs must set aria-modal and trap focus"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-01"],
    "references": ["docs/PRD.md#9. Accessibility", "docs/features/game-shell.md#4. UI / Interaction Design"]
  }
}
```

---

## 6. Testing Strategy

| Level | Scope | Approach |
|-------|-------|----------|
| Unit | Motion hook, settings schema, audio engine | Vitest with matchMedia, localStorage and AudioContext fakes |
| Component | Board, card face, detail, field banner, fallbacks | Testing Library render and interaction assertions |
| Integration | App routing, battle play, settings reload, keyboard | Render `App`, drive real DOM events, assert state and ARIA |
| Layout | 375px and desktop | jsdom class assertions plus Playwright viewport checks in Release Verification |

Key test scenarios:

1. At 375px the board has no document-level horizontal overflow and all five cards are reachable.
2. Clicking an unaffordable card does nothing; clicking an affordable one updates energy and health.
3. Pressing Escape in the card detail returns focus to the card button.
4. Toggling Reduce motion sets the root attribute and survives a remount.
5. Muting before the first gesture prevents any AudioContext creation.
6. A missing SVG renders the labelled fallback and the board remains playable.
7. The live region announces "Your turn" once after End Turn resolves.

---

## 7. Acceptance Criteria

1. All eight SHL requirements are covered by passing tests.
2. Menu, rules, settings and battle are reachable through `App.tsx`.
3. The board works at 375px without page-level horizontal scroll and keeps 44px targets.
4. No damage, draw or status rule is implemented in a component.
5. Sound is synthesized, mutable and gesture-unlocked; no audio file exists.
6. Reduced motion is honored from both the OS and the persisted toggle.
7. Keyboard-only play can complete a turn and close every overlay.

---

## 8. Open Questions

| # | Question | Default Assumption |
|---|----------|--------------------|
| 1 | Are card faces legible enough at 375px without the detail view? | Cards show cost, name and primary number; the detail sheet carries full text and is validated in the human review. |
| 2 | Should the event log be visible on mobile by default? | No; it collapses behind a Log toggle to protect vertical space. |
| 3 | Does sound start on or off? | On, but silent until the first gesture; an explicit mute choice persists. |
| 4 | Should the menu warn before leaving a run? | No; the run autosaves and Continue Run restores it, so leaving is safe. |
