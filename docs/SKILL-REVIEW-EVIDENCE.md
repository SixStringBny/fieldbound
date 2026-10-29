# Project Skill Stage Evidence

**Stage:** `forge-build-project-skills`
**Mode:** headless, reconciliation scope (authorized defaults, no prompts)
**Date:** 2026-10-29
**Reconciliation:** the four planned packages already existed and were byte-for-byte valid against the handoff, so they were adopted rather than regenerated; the gate below was re-run against them in this session.
**Handoff:** `docs/SKILL-CANDIDATES.json` (version 1, unchanged)
**Handoff input fingerprint:** `dfa6dc82423d7e2b27b568596e17a84b2e4193b5ae799f186f113e8e149248eb`
**Audit artifact:** `docs/SKILL-AUDIT.md` (`forge-skill-review`)

---

## Candidate decisions

| Candidate | Action | Outcome |
|-----------|--------|---------|
| `seeded-determinism-and-replay` | extend | Added Step 6 and three gotchas on presentation hashing; `references/rng-contract.md` gained the dialogue-hash contract and frozen picker shape |
| `versioned-local-persistence` | extend | Added Step 7 on additive optional fields; `references/persistence-contract.md` gained the `battleLog` example, drop-only-the-field matrix and tests |
| `portrait-first-board-and-accessibility` | extend | Added Step 7 on the labelled non-live log surface; `references/board-a11y-checklist.md` gained the history-region, focus, 1024px and reduced-motion contract |
| `placeholder-asset-manifest` | reuse | No file authored or modified; existing package is byte-for-byte unchanged |
| `static-build-origin-audit` | reuse | No file authored or modified; existing package is byte-for-byte unchanged |
| `battle-log-and-deterministic-dialogue` | create | `.opencode/skills/battle-log-and-deterministic-dialogue/` + `references/battle-log-contract.md` |
| `balance-tuning` | omit | No package created; v1 numbers remain frozen |
| `human-release-review` | omit | No package created; REL-HR-1 and LOG-HR-1 stay human tasks |

The three `extend` packages kept their names and the updated handoff descriptions exactly, so existing agent `skills.recommended` associations remain resolvable. The two `reuse` packages were treated as team assertions: no project-local copy was vendored and no file was rewritten. The two omitted names resolve nowhere under `.opencode/skills/` by design; that absence is verified, not treated as a failure.

## Review gate

Command (run from the repository root):

```bash
npx tsx .opencode/skills/forge-skill-review/scripts/skill-review.ts \
  --files .opencode/skills/seeded-determinism-and-replay/SKILL.md \
          .opencode/skills/versioned-local-persistence/SKILL.md \
          .opencode/skills/portrait-first-board-and-accessibility/SKILL.md \
          .opencode/skills/battle-log-and-deterministic-dialogue/SKILL.md \
  --provider stdout --min-score 2 --fail-below \
  --min-axis 2 --fail-axis-below --fail-structural
```

**Result:** exit code 0. No axis below 2, no skill below 2, zero structural issues. The command was run with `npx tsx .opencode/skills/forge-skill-review/scripts/skill-review.ts` from the repository root so the `--fail-*` flags reached the CLI; the npm-script form dropped the flags on this Windows shell and audited all 17 bootstrapped skills instead of the four candidates, which is why it is not recorded as the gate.

### Per-axis scores (heuristic)

| Skill | Context | Gotchas | Procedure | Progressive | Calibration | Validation | Overall |
|-------|---------|---------|-----------|-------------|-------------|------------|---------|
| `seeded-determinism-and-replay` | 3 | 3 | 3 | 3 | 3 | 3 | 3.0 |
| `versioned-local-persistence` | 3 | 3 | 3 | 3 | 3 | 3 | 3.0 |
| `portrait-first-board-and-accessibility` | 3 | 3 | 3 | 3 | 3 | 3 | 3.0 |
| `battle-log-and-deterministic-dialogue` | 3 | 3 | 3 | 3 | 3 | 3 | 3.0 |

The rubric is a deterministic heuristic proxy. It is reported separately from the behavioral evidence below; no heuristic score substitutes for the structural checks.

### Behavioral evidence

| Check | Result |
|-------|--------|
| Frontmatter parses for all four changed packages | pass (4/4) |
| Frontmatter `name` equals parent directory | pass (4/4) |
| Parsed `name` contains no JSON wrapping quotes | pass (4/4) |
| Frontmatter `description` equals the handoff description byte-for-byte | pass (4/4) |
| `description` is a single-line YAML value | pass (4/4) |
| Every `references/` load trigger resolves to an existing file | pass (4/4) |
| No unresolved Markdown links or circular reference chains | pass |
| `## Process` has numbered steps with decision criteria | pass (8 steps in the new package) |
| `## Gotchas` present with concrete entries | pass (11 entries in the new package) |
| `## Validation` present with runnable commands and checkboxes | pass (8 checks in the new package) |
| `SKILL.md` under 500 lines | pass (103, 118, 123, 145 lines) |
| Generic filler phrases absent | pass |
| Omitted candidates have no local package | pass (2/2) |
| `reuse` packages and all agent files byte-for-byte unchanged | pass (`git diff` empty) |

## Boundary checks

- `docs/SKILL-CANDIDATES.json` unchanged (`git diff` empty).
- `.opencode/agents/` unchanged; no ownership, association or handoff edit.
- `docs/EXECUTION-MANIFEST.json` not created or modified (`git diff` empty).
- No team regeneration, model assignment or build step was run.
- Only the four planned package directories and the two evidence artifacts were written.
- `reuse` candidates were not rewritten; `omit` candidates were not created.

## Diagnostics

- Both `reuse` names (`placeholder-asset-manifest`, `static-build-origin-audit`) already resolve under `.opencode/skills/` and remain unchanged, so there is no unavailable-to-local-discovery warning to report.
- `forge-skill-review` dependencies were already installed in its package directory; no product dependency changed.
- A first gate run scored the new package's procedural clarity at 2 because the heuristic requires an explicit `if ... then ...` decision phrase. One decision sentence was added; the recorded gate above is the passing rerun.
- Retry path for any failed candidate: re-run the gate with that skill's `SKILL.md` only. No team regeneration is required.
