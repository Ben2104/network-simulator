# Light Theme + Team Kickoff — Design

**Date:** 2026-10-20 · **Status:** Approved · **Amends:** `2026-10-19-3d-packet-highway-design.md` §6,
`docs/design/stitch-prompt.md` (visual style)

## 1. Goal

1. Replace the dark navy look with a **white + green** base, defined once as tokens shared by Figma
   variables and CSS custom properties.
2. Fix the Stitch mockups in Figma so they match the spec (BFS pedagogy, locked failures during
   drive, one deterministic route) and drop invented metrics.
3. Rebalance the team (3 backend-leaning devs for a small stateless API) and file assigned user
   stories as GitHub Issues.

Figma file: https://www.figma.com/design/u4ACay8xnM4DS6dyovzf47/network-simulator
(Page 1 = dark Stitch originals, kept as archive. New page `v2 Light` = working mockups.)

## 2. Color tokens

| Token           | Hex       | Use                                      |
| --------------- | --------- | ---------------------------------------- |
| `bg`            | `#FFFFFF` | page background                          |
| `surface`       | `#F5FAF6` | cards, panels                            |
| `surface-2`     | `#EAF4EC` | insets, table rows, chips                |
| `border`        | `#D5E5D9` | card and input borders                   |
| `text`          | `#0F1F17` | body text                                |
| `text-muted`    | `#4A5D51` | secondary text                           |
| `primary`       | `#15803D` | brand, primary buttons, success (+ icon) |
| `primary-hover` | `#166534` | hover / pressed                          |
| `primary-soft`  | `#DCFCE7` | badges, selected toggles                 |
| `on-primary`    | `#FFFFFF` | text on `primary`                        |
| `explore`       | `#0369A1` | BFS frontier, visited stations           |
| `explore-soft`  | `#E0F2FE` | frontier chips, search rings fill        |
| `route`         | `#D97706` | chosen path line (≥ 4 px, with outline)  |
| `route-text`    | `#92400E` | route text, route badges                 |
| `route-soft`    | `#FEF3C7` | route chip background                    |
| `danger`        | `#DC2626` | broken station / road marks              |
| `danger-text`   | `#991B1B` | error text                               |
| `danger-soft`   | `#FEE2E2` | error banner background                  |
| `map-ground`    | `#EEF5EF` | 3D ground plane / 2D map background      |
| `focus`         | `#15803D` | 2 px focus ring, 2 px offset             |

Rules:

- Green is both brand and "delivered". Success states therefore always carry a check icon + text;
  color is never the only signal.
- Gold `#fbbf24` is retired: it fails contrast on white. Route uses `route` for lines and
  `route-text` for text.
- White text only on `primary` (green-700) or darker; never on green-600 or lighter.
- Contrast for every text/background pair above must be verified with a checker (≥ 4.5:1 body,
  ≥ 3:1 large text and UI marks) before tokens are frozen; adjust hex values if any pair fails.
- Typography: Inter (sans) for all UI text; monospace only for IDs, byte counts and the BFS trace.

## 3. Figma corrections (frames `1:2` Broken Station, `1:361` Driving)

| #   | Problem                                                                                                   | Fix                                                                    |
| --- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1   | Broken frame shows faults mid-drive ("6 cars halted")                                                     | Redraw as between-sends state: cars parked at CSULB, route recomputed  |
| 2   | "Inject Fault" enabled while driving                                                                      | Network controls disabled + "Locked while sending" hint during drive   |
| 3   | "Priority Queue" + Q1/Q2 badges                                                                           | FIFO "Queue" chips in visit order; no priorities                       |
| 4   | "9 Hops (Optimal Shortest Path)"                                                                          | "9 hops · BFS = fewest hops, not shortest distance"                    |
| 5   | "Redding [Destination]"                                                                                   | Destination is "US-West Data Center, Oregon" lot                       |
| 6   | Frames show different routes                                                                              | Use the real default route from `docs/architecture.md` in both frames  |
| 7   | Invented metrics (egress, integrity, latency, throughput, velocity, step N/82, auto-heal, diagnostic log) | Remove                                                                 |
| 8   | Map uses ~30 % of canvas; BFS card ~60 % empty                                                            | Map fills canvas; right column reflows so Network Status is above fold |
| 9   | Rotated iso labels, overlapping chips                                                                     | Screen-aligned labels with leader lines; no overlaps                   |
| 10  | Header, logo, legend, file card differ between frames                                                     | One shared header, legend, file card                                   |

Remaining states (Idle, Loaded, Searching, Delivered, No route, Error, 2D view, mobile) are a
follow-up issue, not this round.

## 4. Team ownership (replaces spec §6 owners)

| Person  | GitHub               | Area                                                      | Plan |
| ------- | -------------------- | --------------------------------------------------------- | ---- |
| Hao     | `haohnguyen94-droid` | Backend: topology v2, `/route` + `fromNodeId`, invariants | 1    |
| Double  | `doubleeyetwo`       | Backend: `/packetize` + API tests → then QA, Playwright   | 1, 5 |
| Blakes  | `BlakeJG`            | Simulation core: `sim/` reducer + timeline (pure TS)      | 2    |
| ple0309 | `ple0309`            | Frontend: UI panels, 2D view, implements Figma v2         | 3    |
| Coheen  | `CohenK`             | 3D scene, cars, camera (React Three Fiber)                | 4    |
| Khoi    | `Ben2104`            | DevOps: Render (Oregon), CI, env vars; repo owner / PM    | 6    |

No database: Firebase is out of scope (spec §8).

## 5. Execution (three parallel worker panes)

- **PM:** drafts labels, milestones W1–W4 and ~20 user stories with acceptance criteria and
  assignees into `docs/team/backlog-draft.md`; updates spec §6 and the plans README owners. GitHub
  writes happen only after the repo owner approves the draft.
- **UI/UX:** Figma page `v2 Light`, `Color` variable collection from §2, both frames duplicated and
  rebound to variables, fixes from §3; writes `docs/design/tokens.md` (tokens + node IDs + contrast
  results).
- **Frontend:** tokens as CSS custom properties in `apps/web/src/styles.css`, palette update in
  `stitch-prompt.md`, `docs/design/component-map.md` (Figma section → component → owner). Separate
  worktree and branch `feat/light-theme-tokens`; local commits only, no push.

## 6. Out of scope

Building panels or 3D components, drawing the remaining 8 states, any GitHub write before approval.
