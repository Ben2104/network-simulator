---
name: network-simulator
description: Use when working in this repo on anything — features, bugs, refactors, tests, UI, API, docs, or topology changes — before reading or editing code. Packet Highway network route simulator (BFS, packets, 3D cars, Fastify API, shared TypeBox contract).
---

# network-simulator

Packet Highway: educational BFS route simulator. Submit file → packets (cars) → Send → BFS over fixed West Coast graph → cars drive route to Oregon. Stateless backend, simulation only.

## Read first (required)

1. `docs/architecture.md` — decisions, topology, API contract, state machine. Source of truth.
2. `README.md` — scripts, layout, quick start.
3. Task-specific:

| Task touches            | Also read                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------ |
| UI / look / components  | `docs/design/tokens.md`, `docs/design/component-map.md`                              |
| 3D scene / timeline     | `docs/superpowers/specs/2026-10-19-3d-packet-highway-design.md`                      |
| Backend plan / contract | `docs/superpowers/plans/`                                                            |
| Team / issues / theme   | `docs/superpowers/specs/2026-10-20-light-theme-team-kickoff-design.md`, `docs/team/` |

If code and docs disagree, say so; do not silently pick one. Update docs in the same change when behavior changes.

## Layout

- `packages/shared` — TypeBox schemas, types, `LIMITS`; used by both apps. Contract changes start here.
- `apps/server` — Fastify; algorithms (`graph/`: BFS, packetize) isolated from HTTP (`routes/`).
- `apps/web` — React + R3F: `scene3d/`, `view2d/` fallback, `sim/` state + timeline.

## Rules

- Backend stays stateless; BFS deterministic (same input → same route).
- Submit and Send are separate steps.
- File bytes stay in browser unless user opts in; upload ≤ 10,000,000 bytes, hashed, deleted, never stored.
- Do not present the sim as real ISP topology or real traffic control.
- Demo routes in architecture.md are asserted in tests; keep them passing.

## Verify before claiming done

`npm run check` (lint + format:check + typecheck + test). Shared must build first (scripts already do this).
