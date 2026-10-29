# UI overhaul review records

One record per route: `<route>.json`, validated by
[`route-review.schema.json`](./route-review.schema.json).

These records are the evidence the acceptance bar requires
([`docs/design-system/acceptance-bar.md`](../../design-system/acceptance-bar.md)
§8, §13.2). A record holds both columns:

- **mechanical** — owned by `qa-automation-engineer`, decided by test output. Each
  `AB-*` entry names the owning test (`path › title`) and carries its pass/fail.
- **human** — owned by a person (the project owner), never signed by an agent.
  `H-C1`, `H-C2`, `H-P1` and `H-T1`, reviewed at 390×844, 768×1024 and 1280×800
  while playing the route.

Rules enforced by `scripts/check-ui-review.mjs` (created by execution ticket 1,
run in gate G1 from that ticket onward):

1. Every key required by the schema is present and no others.
2. `viewports` lists the five mechanical targets; the human `viewports` include
   390×844, 768×1024 and 1280×800.
3. `mechanical.summary` matches the statuses, and `passed + failed` equals the
   number of mechanical checks.
4. `decision` is `rejected` when any mechanical or human check failed, and any
   failed check appears in `issues` with its measured and expected values.
5. `reviewer` and `human.owner` are not agent names (`opencode`, `copilot`,
   `agent`, or a `*‑engineer` role string).

Screenshot artifacts from `AB-E2` are named in `evidence[].path` (for example
`battle-390x844-<seed>-<sha>.png`) but are never committed and never compared
pixel-by-pixel (`AB-E3`).
