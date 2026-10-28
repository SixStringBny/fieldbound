# Project Skill Stage Evidence

**Stage:** `forge-build-project-skills`
**Mode:** headless (authorized defaults, no prompts)
**Date:** 2026-10-28
**Handoff:** `docs/SKILL-CANDIDATES.json` (version 1, unchanged)
**Handoff input fingerprint:** `28158bd2155c2c6e4944d82d403c2af3723f54660ba04826f416555a27e1dd1d`
**Audit artifact:** `docs/SKILL-AUDIT.md` (`forge-skill-review`)

---

## Candidate decisions

| Candidate | Action | Outcome |
|-----------|--------|---------|
| `seeded-determinism-and-replay` | create | `.opencode/skills/seeded-determinism-and-replay/` + `references/rng-contract.md` |
| `versioned-local-persistence` | create | `.opencode/skills/versioned-local-persistence/` + `references/persistence-contract.md` |
| `portrait-first-board-and-accessibility` | create | `.opencode/skills/portrait-first-board-and-accessibility/` + `references/board-a11y-checklist.md` |
| `placeholder-asset-manifest` | create | `.opencode/skills/placeholder-asset-manifest/` + `references/manifest-schema.md` |
| `static-build-origin-audit` | create | `.opencode/skills/static-build-origin-audit/` + `references/release-audit-checklist.md` |
| `balance-tuning` | omit | No package created; VL-CON-07 freezes v1 numbers |
| `human-release-review` | omit | No package created; REL-HR-1 stays a human task |

No candidate requested `reuse` or `extend`, so no global package was vendored and no existing package was rewritten. Two omitted names are asserted to resolve nowhere locally by design; their absence under `.opencode/skills/` is verified, not treated as a failure.

## Review gate

Command (run from `.opencode/skills/forge-skill-review`):

```bash
npx tsx scripts/skill-review.ts \
  --files .opencode/skills/seeded-determinism-and-replay/SKILL.md \
          .opencode/skills/versioned-local-persistence/SKILL.md \
          .opencode/skills/portrait-first-board-and-accessibility/SKILL.md \
          .opencode/skills/placeholder-asset-manifest/SKILL.md \
          .opencode/skills/static-build-origin-audit/SKILL.md \
  --provider stdout --min-score 2 --fail-below \
  --min-axis 2 --fail-axis-below --fail-structural
```

**Result:** exit code 0. No axis below 2, no skill below 2, zero structural issues.

### Per-axis scores (heuristic)

| Skill | Context | Gotchas | Procedure | Progressive | Calibration | Validation | Overall |
|-------|---------|---------|-----------|-------------|-------------|------------|---------|
| `seeded-determinism-and-replay` | 3 | 3 | 3 | 3 | 3 | 3 | 3.0 |
| `versioned-local-persistence` | 3 | 3 | 3 | 3 | 3 | 3 | 3.0 |
| `portrait-first-board-and-accessibility` | 3 | 3 | 3 | 3 | 3 | 3 | 3.0 |
| `placeholder-asset-manifest` | 3 | 3 | 3 | 3 | 3 | 3 | 3.0 |
| `static-build-origin-audit` | 3 | 3 | 3 | 3 | 3 | 3 | 3.0 |

The rubric is a deterministic heuristic proxy. It is reported separately from the behavioral evidence below.

### Behavioral evidence

| Check | Result |
|-------|--------|
| Frontmatter `name` equals parent directory for all five packages | pass |
| Frontmatter `description` equals the handoff description byte-for-byte | pass |
| No JSON quote characters inside any parsed `name` value | pass |
| Every `references/` load trigger resolves to an existing file | pass (5/5) |
| Markdown `.md` links use `./` and resolve | pass (no unresolved links) |
| `## Process` has numbered steps with decision criteria | pass (5-6 steps each) |
| `## Gotchas` present with concrete entries | pass (8-11 entries each) |
| `## Validation` present with runnable checks | pass (6-7 checkboxes each) |
| `SKILL.md` under 500 lines | pass (86-108 lines) |
| Generic filler phrases absent | pass |
| Omitted candidates have no local package | pass (2/2) |

## Boundary checks

- `docs/SKILL-CANDIDATES.json` unchanged (`git diff` empty).
- `.opencode/agents/` unchanged; no ownership, association or handoff edit.
- `docs/EXECUTION-MANIFEST.json` absent; no manifest compiled and no build started.
- Only the five planned package directories and the two evidence artifacts were written.
- Consumers' `skillsRecommended` names remain resolvable: all five planned names match their directories exactly.

## Diagnostics

- No `reuse` candidates were present, so there is no globally resolved skill to flag as unavailable to local discovery.
- `forge-skill-review` dependencies were installed locally with `npm install` in its package directory; that directory is git-ignored and no dependency was added to the product.
- A first CLI attempt through `npm run` dropped the `--files` scope and scanned every bootstrapped skill. That run was discarded; the recorded gate above scopes exactly the five affected files.
- Retry path for any failed candidate: re-run the gate with that skill's `SKILL.md` only. No team regeneration is required.
