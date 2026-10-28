# Feature: Local Duel

## Traceability

| Canonical ID | Owner / Source Link | Relationship |
|--------------|---------------------|--------------|
| VIS-US-02 | [Vision](../PRD.md#4. Personas) | participates |
| VIS-NFR-03 | [Vision](../PRD.md#7. Non-Functional Requirements) | participates |
| DUEL-FR-01 – DUEL-FR-06 | This feature | owns |
| ENG-FR-11 | [Battle Engine & Rules](battle-engine.md#3. Functional Requirements) | participates |

**PRD:** [docs/PRD.md](../PRD.md)

---

## 1. Feature Overview

**Feature Name:** Local Duel
**ID Prefix:** DUEL
**Summary:** A best-of-three pass-and-play match between two people on one device. Both players choose and lock a starter deck, then alternate turns behind a full-screen privacy handoff. Only the active player's hand is rendered; the opponent sees a card count. Rounds reset all battle state. Nothing is persisted.
**Dependencies:** Game Shell & Presentation
**Priority:** Must

---

## 2. User Stories

| ID | As a... | I want to... | So that... | Priority |
|----|---------|-------------|-----------|----------|
| DUEL-US-01 | Player 1 | choose my deck without Player 2 seeing the board first | the match starts fairly | Must |
| DUEL-US-02 | Both players | hand the device over before a turn without exposing a hand | neither player gains hidden information | Must |
| DUEL-US-03 | Both players | see a clear series score after every round | the best-of-three format stays legible | Must |
| DUEL-US-04 | Both players | start a rematch with the same decks quickly | we can play again without re-picking | Should |

---

## 3. Functional Requirements

```forge-requirement
{"id":"DUEL-FR-01","kind":"requirement","text":"Set up a local duel by having Player 1 and then Player 2 choose a starter deck from the four available decks; lock both choices for the match and reveal both only after the second confirmation."}
```

```forge-requirement
{"id":"DUEL-FR-02","kind":"requirement","text":"Play best-of-three with full resets per round (health, defense, field, statuses, hands, decks and energy), first to two wins, and first-player order alternating Player 1, Player 2, Player 1."}
```

```forge-requirement
{"id":"DUEL-FR-03","kind":"requirement","text":"Show a full-screen opaque privacy interstitial before every turn and before the first turn of each round; it must name the player to take the device, hide the board and both hands, require an explicit tap or Enter, and never auto-dismiss."}
```

```forge-requirement
{"id":"DUEL-FR-04","kind":"requirement","text":"Render only the active player's hand during their turn; the opponent sees a card count instead of card faces, and the privacy screen contains no card name, cost, intent, health or field information."}
```

```forge-requirement
{"id":"DUEL-FR-05","kind":"requirement","text":"At match end show the winner and series score with Rematch (same locked decks and a new seed), Change decks (return to setup) and Menu actions; never persist or resume a duel."}
```

```forge-requirement
{"id":"DUEL-FR-06","kind":"requirement","text":"Accept input only from the active side after the privacy screen is dismissed, reject duplicate or out-of-turn actions, and ignore all actions once a round or match is complete."}
```

---

## 4. UI / Interaction Design

### 4.1 Match structure

| Round | First player | Requirement |
|-------|--------------|-------------|
| 1 | Player 1 | Player 1 wins? score 1–0; else 0–1 |
| 2 | Player 2 | First to 2 wins ends the match |
| 3 | Player 1 | Played only at 1–1 |

Both players start each round at 40 health with their locked 10-card deck. Every round starts on a Neutral field with 0 defense and no statuses, and both decks are reshuffled from the round seed.

### 4.2 Setup

The setup screen shows two steps. Step 1 asks Player 2 to look away and lets Player 1 choose one of four decks. Step 2 shows only the deck list and a "Player 1 has chosen" note, then lets Player 2 choose. A summary then reveals both decks and enables Start Match. Back at either step returns to the menu and discards the partial choice.

### 4.3 Privacy interstitial

The interstitial replaces the battle screen entirely; the battle DOM is unmounted, not merely covered. It shows:

- "Pass to Player 1" or "Pass to Player 2".
- "Other player, look away."
- A single full-width "I'm ready" button, focused on mount.
- No deck, hand, health, field or intent detail.

The screen dismisses only on the button, Enter or Space. Escape does nothing. A round start and every turn handoff use the same screen. Screen readers receive `role="dialog"` and `aria-modal="true"` with a labelled title.

### 4.4 Duel battle

The layout mirrors the solo board but uses two player panels, not an enemy intent list. The active player's panel is at the bottom with their hand; the opponent's panel at the top shows health, defense, statuses and a hand count. The field banner sits between them. End Turn hands off to the other player and immediately shows the interstitial. There is no AI, no intent and no timer.

Only the active hand is rendered. The opponent's card ids never enter the DOM during the active turn. Card detail opens for the active player only.

### 4.5 Round and match results

A round ends when either player reaches 0 health. The round result shows the round winner and the series score, with Next Round (or View Match Result at 1–1 going to a decider). The match result shows the series winner, the score and the three actions. Rematch keeps both decks, sets a new seed, resets the score and returns to Round 1 with Player 1 first; it then shows the privacy screen. Change decks clears the match and returns to setup. Menu clears the match.

### 4.6 No persistence

Duels exist only in memory. Reloading returns to the menu and never offers Continue Run for a duel. The duel controller writes no localStorage keys.

---

## 5. Implementation Tasks

| ID | Observable outcome | Owner | Depends | Outputs and tests | Check |
|----|--------------------|-------|---------|-------------------|-------|
| DUEL-01 | Best-of-three match model with locked decks and alternating first player | duel-mode-engineer | ENG-07, CNT-02 | `src/duel/match.ts`, `src/duel/match.test.ts` | `npm test -- src/duel/match.test.ts` |
| DUEL-02 | Privacy-gated duel round controller with hidden off-turn hand | duel-mode-engineer | DUEL-01 | `src/duel/round.ts`, `src/duel/round.test.ts` | `npm test -- src/duel/round.test.ts` |
| DUEL-03 | Full duel flow through App with interstitial and score screens | frontend-engineer | DUEL-02, SHL-07 | `src/ui/screens/DuelSetupScreen.tsx`, `src/ui/screens/PrivacyScreen.tsx`, `src/ui/screens/DuelBattleScreen.tsx`, `src/ui/screens/RoundResultScreen.tsx`, `src/ui/screens/MatchResultScreen.tsx`, `src/App.tsx`, `src/App.duel.test.tsx` | `npm test -- src/App.duel.test.tsx` |

### Phase 1: Match Model

```forge-task
{
  "id": "DUEL-01",
  "title": "Implement the best-of-three match model",
  "description": "Build the pure duel match model: create a match from two locked deck ids and a seed, derive a distinct round seed, alternate the first player P1/P2/P1, record round winners, end at two wins, advance rounds, and expose rematch with the same decks plus new seed and change-decks reset. Do not persist or render UI.",
  "ownerAgent": "duel-mode-engineer",
  "dependencies": ["ENG-07", "CNT-02"],
  "expectedOutputs": ["src/duel/match.ts", "src/duel/match.test.ts"],
  "validationCommands": ["npm test -- src/duel/match.test.ts"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["The match is first to two wins with alternating first player and locked decks", "Rematch keeps decks, resets the score and uses a new seed"],
    "requirementRefs": ["docs/features/local-duel.md#DUEL-FR-02", "docs/features/local-duel.md#DUEL-FR-05"],
    "acceptanceCriteria": ["A 2-0 series completes after round 2 and a 1-1 series advances to round 3", "Round 1 starts with Player 1, round 2 with Player 2 and round 3 with Player 1", "Each round seed differs from the match seed and from the other round seeds", "Recording a third win is rejected once the match is complete", "Rematch keeps both deck ids, sets wins to 0-0, returns to round 1 and changes the seed", "Change decks clears the match and returns to the setup phase"],
    "constraints": ["No localStorage, React or screen imports", "Deck ids must resolve against the content catalog"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-08"],
    "references": ["docs/PRD.md#10. System States / Lifecycle", "docs/features/local-duel.md#4. UI / Interaction Design"]
  }
}
```

### Phase 2: Round Controller

```forge-task
{
  "id": "DUEL-02",
  "title": "Gate duel turns behind privacy and hide the off-turn hand",
  "description": "Wrap the symmetric battle engine for a duel round: create both sides from locked decks and the round seed, begin with a pending privacy screen, reject actions until dismissed, expose only the active viewer's hand, hand off after end turn, detect the round winner and stop input at round end. Do not render screens or persist.",
  "ownerAgent": "duel-mode-engineer",
  "dependencies": ["DUEL-01"],
  "expectedOutputs": ["src/duel/round.ts", "src/duel/round.test.ts"],
  "validationCommands": ["npm test -- src/duel/round.test.ts"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["Every turn starts behind a pending privacy gate and accepts no action until dismissal", "Only the active side's hand is exposed and the opponent is represented by a count"],
    "requirementRefs": ["docs/features/local-duel.md#DUEL-FR-02", "docs/features/local-duel.md#DUEL-FR-04", "docs/features/local-duel.md#DUEL-FR-06"],
    "acceptanceCriteria": ["A new round reports privacyPending true and viewer set to the match first player", "Play and end-turn calls before dismissal return an error and leave state unchanged", "After dismissal the active hand returns five cards while the opponent hand returns only a count", "Ending a turn switches the viewer and sets privacyPending true again", "A lethal play ends the round, records the winner and rejects every later action", "Both sides use the same engine actions as solo with independent health, energy and decks", "No localStorage key is read or written by the round controller"],
    "constraints": ["Do not call the AI planner", "Do not copy damage or draw rules into the controller"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-08"],
    "references": ["docs/PRD.md#10. System States / Lifecycle", "docs/features/local-duel.md#4. UI / Interaction Design"]
  }
}
```

### Phase 3: Duel UI

```forge-task
{
  "id": "DUEL-03",
  "title": "Build the duel setup, privacy, battle and result screens",
  "description": "Create the two-step deck setup, full-screen privacy interstitial, duel battle screen with two player panels and only the active hand, round result and match result, all wired through App. Cover setup, privacy dismissal, hidden-hand assertions, score progression, rematch and change decks with interaction tests. Do not persist duel state.",
  "ownerAgent": "frontend-engineer",
  "dependencies": ["DUEL-02", "SHL-07"],
  "expectedOutputs": ["src/ui/screens/DuelSetupScreen.tsx", "src/ui/screens/PrivacyScreen.tsx", "src/ui/screens/DuelBattleScreen.tsx", "src/ui/screens/RoundResultScreen.tsx", "src/ui/screens/MatchResultScreen.tsx", "src/App.tsx", "src/App.duel.test.tsx"],
  "validationCommands": ["npm test -- src/App.duel.test.tsx", "npm run typecheck"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["The full duel flow is reachable from the menu and shows both decks only after both confirmations", "The privacy screen unmounts the battle and only the active hand is rendered during a turn"],
    "requirementRefs": ["docs/features/local-duel.md#DUEL-FR-01", "docs/features/local-duel.md#DUEL-FR-03", "docs/features/local-duel.md#DUEL-FR-04", "docs/features/local-duel.md#DUEL-FR-05", "docs/features/local-duel.md#DUEL-FR-06"],
    "acceptanceCriteria": ["Menu to Local Duel shows step 1 for Player 1 and step 2 for Player 2 without revealing the first choice during step 2", "The summary reveals both decks and Start Match opens a privacy screen naming Player 1", "While privacy is shown the battle DOM is absent and no card name is queryable", "Dismissing privacy renders only the active player's five cards and the opponent's count", "Ending a turn shows the other player's privacy screen before their hand appears", "A 2-0 series shows the match result with Rematch, Change decks and Menu", "Rematch keeps the decks, resets the score and starts at Player 1 privacy", "Reloading during a duel returns to the menu with no Continue Run entry"],
    "constraints": ["The privacy screen must be opaque and must not auto-dismiss", "Escape must not dismiss the privacy screen", "Do not add a duel save key"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-03"],
    "references": ["docs/PRD.md#10. System States / Lifecycle", "docs/features/local-duel.md#4. UI / Interaction Design"]
  }
}
```

---

## 6. Testing Strategy

| Level | Scope | Approach |
|-------|-------|----------|
| Unit | Series math, first-player alternation, round seeds, rematch | Pure Vitest suites |
| Integration | Privacy gate, hidden hand, turn handoff, round end | Controller tests over the real engine |
| UI | Setup, interstitial, battle, score, match result | Testing Library through `App` with seeded match state |
| E2E | Full best-of-three with privacy assertions | Playwright in Release Verification |

Key test scenarios:

1. A 1–1 series reaches round 3 with Player 1 first.
2. Play before privacy dismissal is rejected with no state change.
3. The privacy screen DOM contains no card name, cost or health value.
4. The off-turn hand is exposed as a count only.
5. A lethal play ends the round and ignores subsequent clicks.
6. Rematch resets the score but keeps both deck ids.
7. Reload has no persisted duel and no Continue Run.

---

## 7. Acceptance Criteria

1. All six DUEL requirements are covered by passing tests.
2. Two players can complete a best-of-three entirely through the UI.
3. Every turn is preceded by a full-screen, explicit privacy handoff.
4. No inactive hand is present in the DOM during a turn.
5. The score and first-player alternation match the documented structure.
6. No duel state is persisted or resumed.

---

## 8. Open Questions

| # | Question | Default Assumption |
|---|----------|--------------------|
| 1 | Is best-of-three too long for a shared device? | Ship best-of-three; the release review judges match length. |
| 2 | Should the same player go first every round? | No; alternate P1, P2, P1 for fairness. |
| 3 | Should deck choices stay hidden from the other player? | Yes; reveal both only after the second confirmation. |
| 4 | Should a duel survive a reload? | No; duels are intentionally ephemeral and never saved. |
