# Implementation plans

Spec: [`../specs/2026-10-19-3d-packet-highway-design.md`](../specs/2026-10-19-3d-packet-highway-design.md)

The spec spans several independent subsystems, so it is split into one plan per subsystem. Each
plan produces working, tested software on its own. Plans 2–6 are written by their owner at the
start of their week, against the contract frozen by Plan 1.

| #   | Plan                                                              | Owner (area)                                                  | Week  | Depends on | Status   |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------------- | ----- | ---------- | -------- |
| 1   | [Contract + backend v2](2026-10-19-plan-1-contract-backend-v2.md) | `haohnguyen94-droid` (Hao) + `doubleeyetwo` (Double), backend | W1    | —          | Ready    |
| 2   | Simulation core (`sim/` reducer + timeline)                       | `BlakeJG` (Blakes), simulation core                           | W1–W2 | 1          | To write |
| 3   | UI panels + 2D view upgrade                                       | `ple0309`, frontend                                           | W2    | 1, 2       | To write |
| 4   | 3D scene, cars, camera                                            | `CohenK` (Coheen), 3D                                         | W2–W3 | 1, 2       | To write |
| 5   | Component + E2E tests, a11y audit                                 | `doubleeyetwo` (Double), QA                                   | W2–W4 | 3          | To write |
| 6   | Deploy (Oregon), CI with Playwright, demo script                  | `Ben2104` (Khoi), DevOps                                      | W3–W4 | 1, 5       | To write |

Checkpoints: **end W1** Plan 1 merged (contract frozen) · **mid W2** Submit → delivered in 2D ·
**end W3** feature-complete in 3D · **W4** bug fixes only.
