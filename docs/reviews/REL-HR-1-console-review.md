# Human Review: Human release review of both journeys

Reviewer: SixStringBunny
Reviewed at: 2026-10-29T16:55:22.793Z
Decision: Approved

## Review notes

I conform: The reviewer completed both primary journeys against the running system
The review records readability, privacy and runtime observations
REL-FR-01: Provide a Playwright suite against the built static app that drives a seeded full solo run from deck selection to the boss and verifies that a mid-battle page reload resumes the saved battle.
REL-FR-02: Drive a seeded local duel to a best-of-three result while asserting that every turn is preceded by the privacy interstitial, the battle DOM is absent during it and only the active hand is visible.
REL-FR-03: Verify at 375x667, 768x1024 and 1280x800 that the page has no horizontal scroll, all five hand cards are reachable, keyboard-only play works, reduced motion removes transforms and no console error occurs.
REL-FR-04: Commit CI and GitHub Pages workflows that run typecheck, unit and integration tests, build and Playwright, then deploy dist from main under the repository base path; document local static serving.
REL-FR-05: Enforce a production budget of at most 300 KB gzip for initial JavaScript plus CSS, zero cross-origin requests after load and complete manifest coverage with no missing asset file.
REL-FR-06: Document run, test, build and deploy commands plus the SVG asset-swap contract and manifest schema in README.md and docs/ASSET-SPEC.md.
