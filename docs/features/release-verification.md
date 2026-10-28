# Feature: Release Verification

## Traceability

| Canonical ID | Owner / Source Link | Relationship |
|--------------|---------------------|--------------|
| VIS-US-01 | [Vision](../PRD.md#4. Personas) | participates |
| VIS-US-02 | [Vision](../PRD.md#4. Personas) | participates |
| VIS-NFR-01 | [Vision](../PRD.md#7. Non-Functional Requirements) | participates |
| VIS-NFR-02 | [Vision](../PRD.md#7. Non-Functional Requirements) | participates |
| VIS-NFR-03 | [Vision](../PRD.md#7. Non-Functional Requirements) | participates |
| VIS-NFR-05 | [Vision](../PRD.md#7. Non-Functional Requirements) | participates |
| VIS-NFR-07 | [Vision](../PRD.md#7. Non-Functional Requirements) | participates |
| VIS-SEC-02 | [Vision](../PRD.md#8. Security and Privacy) | participates |
| REL-FR-01 – REL-FR-06 | This feature | owns |

**PRD:** [docs/PRD.md](../PRD.md)

---

## 1. Feature Overview

**Feature Name:** Release Verification
**ID Prefix:** REL
**Summary:** Proof that the assembled product works: Playwright journeys for a full solo run and a full duel, responsive and accessibility checks at three viewports, a static subpath build audit, a bundle budget, committed CI and GitHub Pages workflows, and one human release review.
**Dependencies:** Solo Run, Local Duel
**Priority:** Must

---

## 2. User Stories

| ID | As a... | I want to... | So that... | Priority |
|----|---------|-------------|-----------|----------|
| REL-US-01 | Maintainer | see one seeded run reach the boss in a browser | I know the whole loop is connected | Must |
| REL-US-02 | Maintainer | see the duel privacy checks fail if a hand leaks | hidden information stays trustworthy | Must |
| REL-US-03 | Maintainer | deploy the static build to GitHub Pages from main | the game is playable without a local setup | Must |
| REL-US-04 | Reviewer | sign off after playing on a phone-sized and desktop viewport | polish claims are backed by a real journey | Must |

---

## 3. Functional Requirements

```forge-requirement
{"id":"REL-FR-01","kind":"requirement","text":"Provide a Playwright suite against the built static app that drives a seeded full solo run from deck selection to the boss and verifies that a mid-battle page reload resumes the saved battle."}
```

```forge-requirement
{"id":"REL-FR-02","kind":"requirement","text":"Drive a seeded local duel to a best-of-three result while asserting that every turn is preceded by the privacy interstitial, the battle DOM is absent during it and only the active hand is visible."}
```

```forge-requirement
{"id":"REL-FR-03","kind":"requirement","text":"Verify at 375x667, 768x1024 and 1280x800 that the page has no horizontal scroll, all five hand cards are reachable, keyboard-only play works, reduced motion removes transforms and no console error occurs."}
```

```forge-requirement
{"id":"REL-FR-04","kind":"requirement","text":"Commit CI and GitHub Pages workflows that run typecheck, unit and integration tests, build and Playwright, then deploy dist from main under the repository base path; document local static serving."}
```

```forge-requirement
{"id":"REL-FR-05","kind":"requirement","text":"Enforce a production budget of at most 300 KB gzip for initial JavaScript plus CSS, zero cross-origin requests after load and complete manifest coverage with no missing asset file."}
```

```forge-requirement
{"id":"REL-FR-06","kind":"requirement","text":"Document run, test, build and deploy commands plus the SVG asset-swap contract and manifest schema in README.md and docs/ASSET-SPEC.md."}
```

---

## 4. UI / Interaction Design

This feature has no product UI. It exercises the existing screens and produces evidence.

### 4.1 E2E harness

`playwright.config.ts` runs against the production build using a `webServer` that builds and serves `dist` on port 4173. Three projects are defined: Chromium, Firefox and WebKit. Long solo and duel journeys run on Chromium; smoke and responsive checks run on all three.

`tests/e2e/helpers.ts` provides:

- `openApp(page, seed)` → navigates to `/?seed=<n>`.
- `startSolo(page, element)` → menu → solo setup → deck → battle.
- `playGreedyTurn(page)` → plays affordable cards in a fixed order (attacks before wards, matching field first) and ends the turn.
- `dismissPrivacy(page, player)` → waits for the named interstitial and activates "I'm ready".
- `expectNoHorizontalScroll(page)` → compares `scrollWidth` with `innerWidth`.
- `collectConsoleErrors(page)` → records `console.error` and page errors.

### 4.2 Solo journey

The spec opens a seeded run, chooses Ember, and applies the greedy policy until the run ends. If the run ends in defeat before the boss, it retries the next seed, up to five seeds, and fails only if no attempt reaches the boss. On the first battle after the opening turn, it reloads, asserts Continue Run is offered, resumes, and compares health, energy and hand size with the pre-reload snapshot. At the boss victory it asserts the result screen reports four encounters cleared and the stats record updated.

### 4.3 Duel journey

The spec selects Ember for Player 1 and Frost for Player 2, starts the match and loops: assert the privacy screen names the expected player and no battle content or card name is present; dismiss; assert exactly one hand is visible; play affordable cards; end the turn. It records round winners until the match result appears, asserts a 2–0 or 2–1 score, then exercises Rematch once and confirms the score resets.

### 4.4 Responsive and accessibility checks

For each viewport, the spec opens the menu, starts a seeded battle, asserts no horizontal scroll, tabs to each of the five cards and to End Turn, plays one card with Enter and ends the turn with `E`. It opens and closes the card detail with Escape and asserts focus returns to the card. It toggles Reduce motion in settings, reloads, and asserts the computed transition duration is at most 1ms and the root attribute is true. It fails on any collected console error.

### 4.5 Static build audit

`scripts/check-build.mjs` builds with `VITE_BASE=/Card-Game-Project/`, serves `dist` under that prefix, fetches the HTML, every referenced script/style and the asset manifest, and fails on a non-200 response. It scans the output for `http://` or `https://` URLs other than the document namespace and fails on any external subresource. It prints the served paths and byte sizes.

The same script then launches Chromium through the installed Playwright browser, loads `http://127.0.0.1:<port>/Card-Game-Project/`, records console errors and every request, plays one affordable card from the hand and asserts the energy text changed. It fails on any console error, any failed request, any cross-origin request after the document load, or a card that cannot be played. Finally it scans `src/` for `dangerouslySetInnerHTML`, `eval(` and `new Function` and fails on a match. This keeps the subpath contract in one command instead of a separate spec.

### 4.6 Budget audit

`scripts/check-budget.mjs` builds, gzip-compresses every emitted JS and CSS file, sums the result, prints a table and fails above 300 KB. It also fails if a manifest entry has no file.

### 4.7 CI and Pages

`.github/workflows/ci.yml` runs on push and pull request: install with `npm ci`, typecheck, unit/integration tests, build, install Playwright browsers, E2E. `.github/workflows/pages.yml` runs on main: build with `VITE_BASE=/<repository>/`, upload `dist` as the Pages artifact and deploy with the official Pages actions. No secrets are required.

### 4.8 Human review

One reviewer plays the running static build on a 390×844 phone viewport and a 1280×800 desktop viewport, completes a solo run, reloads mid-battle, and plays a duel to a match result. The review records:

- What was exercised, with viewport sizes.
- Whether five cards were readable at 375px without zoom and whether the detail view was needed.
- Whether any hand appeared during a privacy screen.
- Console and network observations.
- Pass or fail with concrete issues.

---

## 5. Implementation Tasks

| ID | Observable outcome | Owner | Depends | Outputs and tests | Check |
|----|--------------------|-------|---------|-------------------|-------|
| REL-01 | Playwright harness with built-app server and shared helpers | qa-automation-engineer | SHL-01 | `playwright.config.ts`, `tests/e2e/helpers.ts`, `tests/e2e/smoke.spec.ts` | `npm run test:e2e -- tests/e2e/smoke.spec.ts` |
| REL-02 | Seeded full solo journey with reload resume | qa-automation-engineer | REL-01, RUN-05 | `tests/e2e/solo-run.spec.ts` | `npm run test:e2e -- tests/e2e/solo-run.spec.ts` |
| REL-03 | Seeded best-of-three duel with privacy assertions | qa-automation-engineer | REL-01, DUEL-03 | `tests/e2e/duel.spec.ts` | `npm run test:e2e -- tests/e2e/duel.spec.ts` |
| REL-04 | Viewport, keyboard, motion and console checks | qa-automation-engineer | REL-01, SHL-07 | `tests/e2e/responsive-a11y.spec.ts` | `npm run test:e2e -- tests/e2e/responsive-a11y.spec.ts` |
| REL-05 | Subpath build audit, CI and Pages workflows, README | qa-automation-engineer | REL-01, REL-02, REL-03, REL-04 | `scripts/check-build.mjs`, `.github/workflows/ci.yml`, `.github/workflows/pages.yml`, `README.md` | `node scripts/check-build.mjs` |
| REL-06 | 300 KB gzip budget audit | qa-automation-engineer | REL-05 | `scripts/check-budget.mjs` | `node scripts/check-budget.mjs` |
| REL-HR-1 | Human release review of both journeys | — | REL-02, REL-03, REL-04, REL-05, REL-06 | `docs/reviews/v1-release-review.json` | Human sign-off |

### Phase 1: Browser Harness

```forge-task
{
  "id": "REL-01",
  "title": "Set up the Playwright harness and smoke journey",
  "description": "Add a Playwright configuration that builds and serves the static app on port 4173 with Chromium, Firefox and WebKit projects, shared helpers for seeding, navigation, privacy dismissal, greedy turns, horizontal-scroll checks and console collection, and a smoke spec that loads the menu on all three projects. Do not implement the long journeys.",
  "ownerAgent": "qa-automation-engineer",
  "dependencies": ["SHL-01"],
  "expectedOutputs": ["playwright.config.ts", "tests/e2e/helpers.ts", "tests/e2e/smoke.spec.ts"],
  "validationCommands": ["npm run test:e2e -- tests/e2e/smoke.spec.ts"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["The harness runs against the production build and provides deterministic seed navigation", "Smoke coverage runs on Chromium, Firefox and WebKit"],
    "requirementRefs": ["docs/features/release-verification.md#REL-FR-01", "docs/PRD.md#VIS-NFR-04"],
    "acceptanceCriteria": ["The webServer command builds and serves dist on 127.0.0.1:4173 and fails if the port is taken by another app", "The config defines chromium, firefox and webkit projects", "openApp appends a numeric seed parameter and lands on the menu", "The smoke spec passes on all three projects with no console error", "Helpers fail the test rather than silently skipping when an element is missing"],
    "constraints": ["Do not mock the app or inject game state", "Use only Playwright and the committed app"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-01"],
    "references": ["docs/PRD.md#11. Analytics / Success Metrics", "docs/features/release-verification.md#4. UI / Interaction Design"]
  }
}
```

```forge-task
{
  "id": "REL-02",
  "title": "Drive a full seeded solo run with reload resume",
  "description": "Write the Chromium solo journey: start an Ember run, play the greedy policy to the boss, retry up to five seeds only when a run ends before the boss, reload mid-battle and assert Continue Run restores health, energy and hand size, then assert the victory result and updated record. Do not alter game code to make the test pass.",
  "ownerAgent": "qa-automation-engineer",
  "dependencies": ["REL-01", "RUN-05"],
  "expectedOutputs": ["tests/e2e/solo-run.spec.ts"],
  "validationCommands": ["npm run test:e2e -- tests/e2e/solo-run.spec.ts --project=chromium", "npm run typecheck"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["At least one seeded run reaches the boss through the real UI", "A mid-battle reload resumes the exact saved battle"],
    "requirementRefs": ["docs/features/release-verification.md#REL-FR-01"],
    "acceptanceCriteria": ["The spec completes a run from deck selection to the boss without writing localStorage directly", "A page reload mid-battle shows Continue Run and restores the same health, energy and hand size", "The run reaches the boss within five deterministic seeds or the test fails with the attempted seeds listed", "The victory result reports four encounters cleared and the stats key is updated", "No console error is recorded during the journey"],
    "constraints": ["Do not use a debug menu or bypass the UI", "Keep the Chromium run under 180 seconds"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-01"],
    "references": ["docs/PRD.md#11. Analytics / Success Metrics", "docs/features/release-verification.md#4. UI / Interaction Design"]
  }
}
```

```forge-task
{
  "id": "REL-03",
  "title": "Drive a best-of-three duel with privacy assertions",
  "description": "Write the Chromium duel journey: choose Ember and Frost, start the match, and for every turn assert the privacy interstitial names the expected player, the battle DOM and all card names are absent, dismiss it, assert exactly one hand is rendered, play greedy cards and end the turn. Continue to a 2-0 or 2-1 result, then exercise Rematch. Do not weaken privacy checks to make the test pass.",
  "ownerAgent": "qa-automation-engineer",
  "dependencies": ["REL-01", "DUEL-03"],
  "expectedOutputs": ["tests/e2e/duel.spec.ts"],
  "validationCommands": ["npm run test:e2e -- tests/e2e/duel.spec.ts --project=chromium"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["A full best-of-three completes through the UI with a privacy interstitial before every turn", "No inactive hand or card name is visible during privacy or an active turn"],
    "requirementRefs": ["docs/features/release-verification.md#REL-FR-02", "docs/features/local-duel.md#DUEL-FR-03"],
    "acceptanceCriteria": ["Every zero-health result follows exactly one visible RoundResult with the correct score", "At every privacy screen the battle container is absent and no known card name is queryable", "After dismissal exactly one hand of five card buttons is visible and the opponent shows a count", "The match ends at two wins and the result screen shows the series score", "Rematch resets the score to 0-0 and shows the Player 1 privacy screen", "No console error is recorded"],
    "constraints": ["Do not inspect or modify localStorage", "Do not skip rounds; reach the result through real play"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-03"],
    "references": ["docs/PRD.md#11. Analytics / Success Metrics", "docs/features/release-verification.md#4. UI / Interaction Design"]
  }
}
```

```forge-task
{
  "id": "REL-04",
  "title": "Verify responsive layout, keyboard play and reduced motion",
  "description": "Write the responsive and accessibility spec for all three browser projects at 375x667, 768x1024 and 1280x800. Assert no horizontal scroll, five reachable cards and a 44px target, keyboard-only card play and end turn, Escape focus restore, reduced-motion persistence after reload, and zero console errors. Do not change product code.",
  "ownerAgent": "qa-automation-engineer",
  "dependencies": ["REL-01", "SHL-07"],
  "expectedOutputs": ["tests/e2e/responsive-a11y.spec.ts"],
  "validationCommands": ["npm run test:e2e -- tests/e2e/responsive-a11y.spec.ts"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["All three viewports have no horizontal scroll and keep every hand card reachable", "A turn is playable with the keyboard and reduced motion persists"],
    "requirementRefs": ["docs/features/release-verification.md#REL-FR-03", "docs/PRD.md#VIS-NFR-01", "docs/PRD.md#VIS-NFR-03", "docs/PRD.md#VIS-NFR-07"],
    "acceptanceCriteria": ["document.scrollWidth never exceeds the viewport width at any of the three sizes", "Tab reaches five card buttons and End Turn, Enter plays a card and E ends the turn", "Every interactive target measures at least 44 by 44 CSS pixels at 375px", "Escape closes the card detail and focus returns to the invoking card", "After enabling Reduce motion and reloading, the root attribute is true and computed transition duration is at most 1ms", "The spec passes on Chromium, Firefox and WebKit with no console error"],
    "constraints": ["Use real viewport emulation rather than CSS overrides", "Do not assert screenshots or pixel colors"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-01"],
    "references": ["docs/PRD.md#9. Accessibility", "docs/features/release-verification.md#4. UI / Interaction Design"]
  }
}
```

### Phase 2: Build, Deploy and Budget

```forge-task
{
  "id": "REL-05",
  "title": "Audit the subpath static build and commit CI and Pages workflows",
  "description": "Add a Node audit that builds with the GitHub Pages base path, serves dist under that prefix, fetches the HTML, scripts, styles and manifest, and fails on missing files or external subresources. The same script then launches Chromium, loads the subpath build, plays one card, and fails on any console error or cross-origin request. It also scans application source for dangerouslySetInnerHTML, eval( and new Function. Commit CI and Pages workflows and replace the README with run, test, build, deploy and asset-swap instructions. Do not change application behavior.",
  "ownerAgent": "qa-automation-engineer",
  "dependencies": ["REL-01", "REL-02", "REL-03", "REL-04"],
  "expectedOutputs": ["scripts/check-build.mjs", ".github/workflows/ci.yml", ".github/workflows/pages.yml", "README.md"],
  "validationCommands": ["node scripts/check-build.mjs"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["The production build serves correctly from a project subpath with no cross-origin requests", "CI runs typecheck, tests, build and E2E, and Pages deploys main"],
    "requirementRefs": ["docs/features/release-verification.md#REL-FR-04", "docs/features/release-verification.md#REL-FR-06", "docs/PRD.md#VIS-NFR-05", "docs/PRD.md#VIS-SEC-02"],
    "acceptanceCriteria": ["The audit build uses VITE_BASE=/Card-Game-Project/ and every referenced script, style and manifest file returns 200", "The built output contains no external http or https subresource URL", "Chromium loads the subpath build, plays one card from the hand, and reports no console error and no cross-origin request", "The source scan fails the audit on dangerouslySetInnerHTML, eval( or new Function anywhere under src", "ci.yml runs npm ci, typecheck, tests, build and Playwright on push and pull request", "pages.yml builds with the repository base path, uploads dist and deploys on main", "README documents dev, test, build, preview, E2E, deploy and the manifest swap procedure"],
    "constraints": ["No deployment secrets or vendor-specific runtime code", "The audit must fail on a missing asset rather than warn"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-02", "docs/PRD.md#VIS-CON-03"],
    "references": ["docs/PRD.md#6. Technical Architecture", "docs/features/release-verification.md#4. UI / Interaction Design"]
  }
}
```

```forge-task
{
  "id": "REL-06",
  "title": "Enforce the production bundle budget",
  "description": "Add a Node budget audit that builds the app, gzip-compresses emitted JavaScript and CSS, prints per-file sizes and fails above 300 KB total. Also fail when a manifest entry has no file. Do not minify away functionality or change the build config.",
  "ownerAgent": "qa-automation-engineer",
  "dependencies": ["REL-05"],
  "expectedOutputs": ["scripts/check-budget.mjs"],
  "validationCommands": ["node scripts/check-budget.mjs"],
  "contract": {
    "version": 2,
    "kind": "implementation",
    "requirements": ["Initial JavaScript plus CSS stays at or below 300 KB gzip", "Every manifest entry resolves to an existing file"],
    "requirementRefs": ["docs/features/release-verification.md#REL-FR-05", "docs/PRD.md#VIS-NFR-02"],
    "acceptanceCriteria": ["The script prints each emitted JS and CSS file with raw and gzip bytes and a total", "A total above 307200 bytes exits non-zero with the overage shown", "The check fails when an asset manifest entry points to a missing file", "A clean build exits zero and reports the remaining headroom"],
    "constraints": ["Measure the production build, not the dev server", "Do not exclude a file from the total to pass"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-01"],
    "references": ["docs/PRD.md#7. Non-Functional Requirements", "docs/features/release-verification.md#4. UI / Interaction Design"]
  }
}
```

### Phase 3: Human Review

```forge-task
{
  "id": "REL-HR-1",
  "title": "Human release review of both journeys",
  "description": "A human reviewer plays the running production build on a 390x844 phone viewport and a 1280x800 desktop viewport: completes a solo run, reloads mid-battle and resumes, and plays a local duel to a match result with the privacy screen before every turn. The reviewer records what was exercised, card readability at 375px, any hand leak, console and network observations, and a pass or fail with concrete issues in docs/reviews/v1-release-review.json.",
  "dependencies": ["REL-02", "REL-03", "REL-04", "REL-05", "REL-06"],
  "expectedOutputs": [],
  "validationCommands": [],
  "contract": {
    "version": 2,
    "kind": "human-review",
    "requirements": ["The reviewer completed both primary journeys against the running system", "The review records readability, privacy and runtime observations"],
    "requirementRefs": ["docs/features/release-verification.md#REL-FR-01", "docs/features/release-verification.md#REL-FR-02", "docs/features/release-verification.md#REL-FR-03", "docs/features/release-verification.md#REL-FR-04", "docs/features/release-verification.md#REL-FR-05", "docs/features/release-verification.md#REL-FR-06"],
    "acceptanceCriteria": ["The record states the viewports used and confirms a full solo run, a mid-battle reload resume and a full duel were exercised", "The reviewer confirms five cards were readable at 375px without zoom or lists the exact unreadable cards", "The reviewer confirms no hand appeared during any privacy screen", "The record lists console errors and cross-origin requests, or states that none were observed", "The result is pass or fail with concrete issues; subjective polish alone cannot pass a journey that did not complete"],
    "constraints": ["Do not approve a rehearsal or a component-only check", "Do not record automated test output as a human journey"],
    "constraintRefs": ["docs/PRD.md#VIS-CON-04"],
    "references": ["docs/PRD.md#11. Analytics / Success Metrics", "docs/features/release-verification.md#4. UI / Interaction Design", "docs/features/solo-run.md#4. UI / Interaction Design", "docs/features/local-duel.md#4. UI / Interaction Design"],
    "reviewFile": "docs/reviews/v1-release-review.json"
  }
}
```

---

## 6. Testing Strategy

| Level | Scope | Approach |
|-------|-------|----------|
| Harness | Built app, three browsers, shared helpers | Playwright `webServer` and project matrix |
| Journey | Solo run, reload, duel series | Seeded deterministic UI scripts with bounded retries |
| Layout | Three viewports, keyboard, motion | Real viewport emulation and computed-style assertions |
| Build | Subpath, external requests, manifest, source scan | Node HTTP audit plus a Chromium check inside `check-build.mjs` |
| Budget | JS and CSS gzip | Node build inspection |
| Human | Both journeys and readability | One reviewer on phone-sized and desktop viewports |

Key scenarios:

1. A seeded run reaches the boss and the reload restores the same battle.
2. A privacy screen has no card name in the DOM, then exactly one hand appears.
3. At 375px `scrollWidth` equals the viewport width and every target is at least 44px.
4. `VITE_BASE=/Card-Game-Project/` serves every asset with a 200 and no external URL.
5. A deliberately added 400 KB file makes the budget audit fail in a fixture run.

---

## 7. Acceptance Criteria

1. All six REL requirements are covered by passing commands or the human record.
2. A seeded solo run reaches the boss; a mid-battle reload resumes it.
3. A full duel completes with privacy asserted before every turn.
4. All three viewports pass layout, keyboard and reduced-motion checks.
5. The subpath build serves with no missing asset and no cross-origin request.
6. Initial JS plus CSS is at or below 300 KB gzip.
7. CI and Pages workflows are committed and documented.
8. The human review record exists and states what was actually exercised.

---

## 8. Open Questions

| # | Question | Default Assumption |
|---|----------|--------------------|
| 1 | Are five seeds enough to find a winnable solo run? | Yes for the frozen content; if none wins, the failure lists seeds and a tuning follow-up is raised rather than hiding the retry. |
| 2 | Should long journeys run on all three browsers? | No; Chromium only for long runs, all three for smoke and responsive checks. |
| 3 | Is the GitHub Pages project subpath the final host? | Yes for v1; `VITE_BASE` keeps another static host possible. |
| 4 | Does the human review need a second reviewer? | No; one reviewer signs the v1 record. |
