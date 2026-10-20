# Backlog draft — awaiting owner approval

> **Status: DRAFT. Nothing has been created on GitHub.** Review, edit, then run
> `DRY_RUN=1 docs/team/create-issues.sh` and finally `docs/team/create-issues.sh` (repo owner only).
> Repo: `Ben2104/network-simulator`. Source specs: `docs/superpowers/specs/2026-10-20-light-theme-team-kickoff-design.md`, `docs/superpowers/specs/2026-10-19-3d-packet-highway-design.md`.
> This file and the script are generated from the same data; if you edit one, edit the other.

## Summary

| Assignee             | Issues | By milestone                  |
| -------------------- | ------ | ----------------------------- |
| `haohnguyen94-droid` | 5      | W1: 4 · W2: 1 · W3: 0 · W4: 0 |
| `doubleeyetwo`       | 6      | W1: 3 · W2: 1 · W3: 2 · W4: 0 |
| `BlakeJG`            | 5      | W1: 2 · W2: 2 · W3: 1 · W4: 0 |
| `ple0309`            | 4      | W1: 1 · W2: 2 · W3: 1 · W4: 0 |
| `CohenK`             | 5      | W1: 0 · W2: 2 · W3: 3 · W4: 0 |
| `Ben2104`            | 5      | W1: 1 · W2: 0 · W3: 3 · W4: 1 |
| **Total**            | **30** |                               |

## Labels

| Name            | Color     | Description                                              |
| --------------- | --------- | -------------------------------------------------------- |
| `plan-1`        | `#1D76DB` | Plan 1: contract + backend v2                            |
| `plan-2`        | `#1D76DB` | Plan 2: simulation core (sim/ reducer + timeline)        |
| `plan-3`        | `#1D76DB` | Plan 3: UI panels + 2D view                              |
| `plan-4`        | `#1D76DB` | Plan 4: 3D scene, cars, camera                           |
| `plan-5`        | `#1D76DB` | Plan 5: component + E2E tests, a11y audit                |
| `plan-6`        | `#1D76DB` | Plan 6: deploy (Oregon), CI with Playwright, demo script |
| `area:backend`  | `#0E8A16` | apps/server and packages/shared                          |
| `area:frontend` | `#FBCA04` | apps/web UI panels and 2D view                           |
| `area:3d`       | `#5319E7` | apps/web scene3d (React Three Fiber)                     |
| `area:sim`      | `#C2E0C6` | apps/web sim/ reducer and timeline (pure TS)             |
| `area:qa`       | `#D93F0B` | Testing Library, Playwright, accessibility audit         |
| `area:devops`   | `#006B75` | Render, CI, env vars, repo settings                      |
| `area:design`   | `#F9D0C4` | Figma and design tokens                                  |
| `user-story`    | `#BFD4F2` | Written as a user story with acceptance criteria         |
| `figma-v2`      | `#C5DEF5` | Tracks the Figma v2 Light mockups                        |
| `privacy`       | `#D93F0B` | Touches user data: file upload or geolocation            |

Existing default labels (`good first issue`, `bug`, `accessibility`) are reused, not recreated.

## Milestones

Due dates are proposed (W1 starts Mon 2026-10-19 per the plan dates); change them before running.

| Title | Due        | Checkpoint                                                                          |
| ----- | ---------- | ----------------------------------------------------------------------------------- |
| W1    | 2026-10-25 | End W1: Plan 1 merged, contract frozen, mock responses available.                   |
| W2    | 2026-11-01 | Mid W2: Submit → delivered works in the 2D view. End W2: panels and 3D scaffold in. |
| W3    | 2026-11-08 | End W3: feature-complete in 3D, E2E green in CI, deployed to Render (Oregon).       |
| W4    | 2026-11-15 | W4: bug fixes and demo rehearsal only. No new features.                             |

## Dependency order

_Added 2026-10-20: W2 upload endpoint (`haohnguyen94-droid`) and its tests (`doubleeyetwo`) come first; W3 client upload (`BlakeJG`), geolocation start (`ple0309`) and Render checks (`Ben2104`) consume it._

1. W1: contract first (Contract v2 → Topology → BFS → Route v2/freeze) with Packetize in parallel; the sim reducer (`BlakeJG`) runs alongside, then the web Submit → Send wiring (`BlakeJG`, needs the reducer, Route v2 and Packetize) and branch protection.
2. W2: sim timeline and hook, UI panels, 3D scaffold — all consume the frozen contract and mock responses.
3. W3: 3D cars/camera/assets, E2E, CI, deploy.
4. W4: bug fixes, demo script rehearsal.

## Issues

### Milestone W1

#### 1. Contract v2: shared schemas, limits and map projection

- **Assignee:** `haohnguyen94-droid`
- **Labels:** `plan-1`, `area:backend`, `user-story`
- **Milestone:** W1

**User story:** As a teammate building any part of the simulator, I want one frozen v2 contract and a shared `project(lat, lon)` function, so that backend, 2D view and 3D scene agree on data shapes and map positions.

**Acceptance criteria**

- [ ] `packages/shared` exports v2 TypeBox schemas for Network, packetize request/response and route request/response (`fromNodeId` optional)
- [ ] `limits.ts` holds 1,500 B packets, 24 car cap, message 1–140, file name 1–255, size 1 B – 1 GiB
- [ ] `project()`, `MAP_BOUNDS`, `MAP_WIDTH`, `MAP_HEIGHT` exported and unit-tested
- [ ] `npm run check` passes

**Depends on**

- None

**References**

- `docs/superpowers/plans/2026-10-19-plan-1-contract-backend-v2.md` (Task 1, schema part of Task 3)
- `docs/superpowers/specs/2026-10-19-3d-packet-highway-design.md` §3

#### 2. West Coast topology (19 stations, 24 roads) and invariant tests

- **Assignee:** `haohnguyen94-droid`
- **Labels:** `plan-1`, `area:backend`, `user-story`
- **Milestone:** W1

**User story:** As a student presenting the simulator, I want a fixed, realistic West Coast network, so that routes look geographically sensible and the demo is repeatable.

**Acceptance criteria**

- [ ] `topology.ts` matches the node and road tables in `docs/architecture.md` exactly
- [ ] `distanceKm` computed with `haversineKm` at module load
- [ ] Invariant tests: ≥ 2 station-disjoint routes; default route has no link > 450 km; every endpoint exists and graph is connected
- [ ] `GET /api/network` returns the v2 shape

**Depends on**

- Contract v2: shared schemas, limits and map projection
- Haversine distance helper

**References**

- `docs/superpowers/plans/2026-10-19-plan-1-contract-backend-v2.md` (Task 3)
- `docs/architecture.md` (Network topology)
- `docs/superpowers/specs/2026-10-19-3d-packet-highway-design.md` §3

#### 3. BFS: locale-independent ordering and demo-route tests

- **Assignee:** `haohnguyen94-droid`
- **Labels:** `plan-1`, `area:backend`, `user-story`
- **Milestone:** W1

**User story:** As a student presenting, I want the same route on every machine, so that what I rehearsed is what the audience sees.

**Acceptance criteria**

- [ ] Neighbors sorted by code-unit comparison, not `localeCompare`
- [ ] Tests assert all five demo routes in `docs/architecture.md` (none, station `oakland`, road `oakland--redding`, `sacramento`+`redding` unreachable with 10 stations explored, start at `sacramento`)
- [ ] `visitOrder` is deterministic across runs

**Depends on**

- West Coast topology (19 stations, 24 roads) and invariant tests

**References**

- `docs/superpowers/plans/2026-10-19-plan-1-contract-backend-v2.md` (Task 3)
- `docs/architecture.md` (Demo routes)

#### 4. POST /api/route v2 (fromNodeId) and contract freeze with mock responses

- **Assignee:** `haohnguyen94-droid`
- **Labels:** `plan-1`, `area:backend`, `user-story`
- **Milestone:** W1

**User story:** As a frontend or 3D developer, I want `/api/route` on the v2 contract plus ready-made mock responses, so that I can build against it without waiting on each other.

**Acceptance criteria**

- [ ] `/api/route` accepts optional `fromNodeId` (default `clientId`); `message` and `packets` removed
- [ ] `UNKNOWN_ID` returned for unknown `fromNodeId`, node or link IDs
- [ ] API tests cover validation, strict no-extra-fields and the demo routes
- [ ] Mock JSON responses for network, packetize, routed and unreachable committed (location agreed in the PR)
- [ ] Plan 1 Task 6 done: contract marked frozen in `docs/architecture.md`; announce in the team channel

**Depends on**

- BFS: locale-independent ordering and demo-route tests
- POST /api/packetize route and API tests

**References**

- `docs/superpowers/plans/2026-10-19-plan-1-contract-backend-v2.md` (Tasks 5–6)
- `docs/superpowers/specs/2026-10-19-3d-packet-highway-design.md` §3 (Send)

#### 5. Haversine distance helper

- **Assignee:** `doubleeyetwo`
- **Labels:** `plan-1`, `area:backend`, `user-story`, `good first issue`
- **Milestone:** W1

**User story:** As a student reading link distances in the UI, I want kilometre distances computed from real coordinates, so that the map labels are believable.

**Acceptance criteria**

- [ ] `haversineKm(a, b)` in `apps/server/src/graph/geo.ts` is a pure function
- [ ] Tests: identical points → 0; CSULB → Oregon data center within ±1% of a hand-checked value; symmetry `d(a,b) = d(b,a)`
- [ ] No new dependencies; follow the step-by-step code in the plan
- [ ] Good first issue: pair with Hao on the first PR if stuck on TypeScript types

**Depends on**

- None

**References**

- `docs/superpowers/plans/2026-10-19-plan-1-contract-backend-v2.md` (Task 2)
- `docs/superpowers/specs/2026-10-19-3d-packet-highway-design.md` §3 and §5

### Update 2026-10-20

The geolocation start snaps to the nearest station in the browser, so `haversineKm` must be importable by the web app. Plan 1 currently puts it in `apps/server/src/graph/geo.ts`.

- [ ] Implement it in `packages/shared` (pure, no Node APIs) and re-export; the server imports it from there
- [ ] Tests move with it

#### 6. Packetization math: toCarPlan()

- **Assignee:** `doubleeyetwo`
- **Labels:** `plan-1`, `area:backend`, `user-story`
- **Milestone:** W1

**User story:** As a student submitting a file, I want its size split into at most 24 cars of 1,500 B packets, so that the car count is easy to understand on screen.

**Acceptance criteria**

- [ ] `toCarPlan(totalBytes)` returns `packetCount = ceil(bytes / 1500)` and `carCount = min(packetCount, 24)`
- [ ] Packets spread evenly; first `packetCount mod carCount` cars get one extra; car `bytes` sum to `totalBytes`
- [ ] Tests: 1 B → 1 car; 36,000 B → 24 cars; 1 MiB → 700 packets, cars 0–3 carry 30; 1 GiB → 715,828 packets
- [ ] Message bytes use UTF-8 length

**Depends on**

- Contract v2: shared schemas, limits and map projection

**References**

- `docs/superpowers/plans/2026-10-19-plan-1-contract-backend-v2.md` (Task 4)
- `docs/architecture.md` (Packetization examples)
- `docs/superpowers/specs/2026-10-19-3d-packet-highway-design.md` §3 (Submit)

#### 7. POST /api/packetize route and API tests

- **Assignee:** `doubleeyetwo`
- **Labels:** `plan-1`, `area:backend`, `user-story`
- **Milestone:** W1

**User story:** As a student, I want Submit to return my cars immediately, so that I see them parked in the CSULB lot before I press Send.

**Acceptance criteria**

- [ ] Route validates exactly one variant (`file` or `message`) with strict schemas
- [ ] Limits enforced: `fileName` 1–255, `sizeBytes` integer 1…1 GiB, `message` 1–140; violations return `VALIDATION_ERROR`
- [ ] Registered in `app.ts`; `inject()` tests cover both variants, each limit edge and an extra-field rejection
- [ ] No state kept on the server

**Depends on**

- Packetization math: toCarPlan()

**References**

- `docs/superpowers/plans/2026-10-19-plan-1-contract-backend-v2.md` (Task 4)
- `docs/superpowers/specs/2026-10-19-3d-packet-highway-design.md` §3 (Submit)

#### 8. sim: state types and useSimulation reducer

- **Assignee:** `BlakeJG`
- **Labels:** `plan-2`, `area:sim`, `user-story`
- **Milestone:** W1

**User story:** As a student, I want the app to move predictably through Submit, Send and Reset, so that buttons are only active when they make sense.

**Acceptance criteria**

- [ ] Pure reducer in `apps/web/src/sim/` implements the state machine: idle, packetizing, loaded, routing, searching, driving, delivered, noRoute, error
- [ ] Failure toggles allowed only in idle, loaded, delivered, noRoute; ignored otherwise
- [ ] Error keeps previous cars and supports Retry; Reset from any state returns to idle
- [ ] Vitest covers every transition including locked toggles; no React or DOM in the module

**Depends on**

- Contract v2: shared schemas, limits and map projection

**References**

- `docs/superpowers/specs/2026-10-19-3d-packet-highway-design.md` §4 (State machine)
- `docs/architecture.md` (Simulation state machine)

#### 9. Design remaining states in Figma v2

- **Assignee:** `ple0309`
- **Labels:** `figma-v2`, `area:design`, `plan-3`, `user-story`
- **Milestone:** W1

**User story:** As a student presenting or using the simulator, I want every screen state designed before it is built, so that the interface looks complete and consistent in each situation.

**Acceptance criteria**

- [ ] Frames on page `v2 Light` for: Idle, Loaded, Searching, Delivered, No route, Error, 2D view, mobile
- [ ] Reuse the shared header, legend and file card; bind every color to the `Color` variables (no raw hex)
- [ ] Success states show a check icon plus text; "BFS = fewest hops, not shortest distance" and "Illustrative network — not real internet routing" visible
- [ ] Network controls shown disabled with "Locked while sending" during searching and driving
- [ ] Node IDs of new frames appended to `docs/design/tokens.md`; owner of the other frontend issues reviews the frames

**Depends on**

- None

**References**

- `docs/superpowers/specs/2026-10-20-light-theme-team-kickoff-design.md` §2–§3
- `docs/superpowers/specs/2026-10-19-3d-packet-highway-design.md` §4 (Layout)

### Update 2026-10-20

Decisions: opt-in real upload to Oregon and geolocation start (see spec Q11, Q12). Add to the remaining states:

- [ ] Your File card: opt-in upload checkbox (default off) with the label "Really upload to our Oregon server (hashed, then deleted — never stored)"; disabled state "Too large for real upload (10 MB max); simulated only"
- [ ] Delivered badges: "Verified in Oregon ✓ — hash match (sha256 abc123…)", "Hash mismatch", "Upload failed — simulation only" (icon + text, never color only)
- [ ] "Start from my location" button, "Start from…" station picker, permission-denied recovery hint, and "You're outside the West Coast network — starting at CSULB" notice
- [ ] Cars shown parked at a non-CSULB start station

#### 10. Web: Submit → Send flow against the v2 API

- **Assignee:** `BlakeJG`
- **Labels:** `plan-1`, `area:frontend`, `user-story`
- **Milestone:** W1

**User story:** As a student, I want Submit to park my cars and Send to run the route, so that the existing 2D view keeps working on the new backend.

**Acceptance criteria**

- [ ] Typed `packetize()` added to `apps/web/src/api/client.ts`; `NetworkGraph` positions nodes via `project()`
- [ ] App has separate Submit and Send buttons; Send is disabled until Submit succeeds
- [ ] `message` no longer sent to `/api/route`
- [ ] Existing 2D view renders the 19-node network; `npm run check` passes

**Depends on**

- POST /api/route v2 (fromNodeId) and contract freeze with mock responses
- POST /api/packetize route and API tests
- sim: state types and useSimulation reducer

**References**

- `docs/superpowers/plans/2026-10-19-plan-1-contract-backend-v2.md` (Task 5, web files)
- `docs/superpowers/specs/2026-10-19-3d-packet-highway-design.md` §2 (Submit vs Send)

#### 11. Enable branch protection and required CI check on main

- **Assignee:** `Ben2104`
- **Labels:** `plan-6`, `area:devops`, `user-story`
- **Milestone:** W1

**User story:** As a team member, I want `main` protected by a required CI check and a review, so that a broken change cannot be merged by accident.

**Acceptance criteria**

- [ ] Branch protection on `main`: pull request required, 1 approving review, required status check `check` (job in `.github/workflows/ci.yml`), no force pushes
- [ ] Verified with a throwaway PR that fails CI and cannot be merged
- [ ] Settings summarized in the Contributing section of the README

**Depends on**

- None

**References**

- `README.md` (Contributing)
- `.github/workflows/ci.yml`

### Milestone W2

#### 12. sim: buildTimeline (search events and car schedules)

- **Assignee:** `BlakeJG`
- **Labels:** `plan-2`, `area:sim`, `user-story`
- **Milestone:** W2

**User story:** As a student watching a send, I want the 2D and 3D views to show the same search and drive, so that the two views never disagree.

**Acceptance criteria**

- [ ] `buildTimeline(visitOrder, linkPath, cars, speed)` returns `{ searchEvents, carSchedules, durationMs }`
- [ ] Search events follow BFS visit order with depth; cars depart staggered and follow `linkPath`; speed 0.5×/1×/2× scales durations
- [ ] Pure function; Vitest covers ordering, stagger, durations and the unreachable case (search only, no cars)
- [ ] Fixtures use the mock responses from the contract-freeze issue

**Depends on**

- POST /api/route v2 (fromNodeId) and contract freeze with mock responses
- sim: state types and useSimulation reducer

**References**

- `docs/superpowers/specs/2026-10-19-3d-packet-highway-design.md` §4 (Timeline)
- `docs/architecture.md` (One timeline, two renderers)

#### 13. sim: useSimulation hook with playback controls

- **Assignee:** `BlakeJG`
- **Labels:** `plan-2`, `area:sim`, `user-story`
- **Milestone:** W2

**User story:** As a student presenting, I want to pause, resume, change speed and skip the search, so that I can explain each step at my own pace.

**Acceptance criteria**

- [ ] `useSimulation` wires reducer, API client and timeline clock; exposes state, cars, route, progress and actions
- [ ] Pause, resume, speed 0.5×/1×/2×, skip search implemented and tested with fake timers
- [ ] Send after delivered resets cars to the lot and re-routes
- [ ] No per-frame React state updates (clock exposed via ref/subscription for views)

**Depends on**

- sim: buildTimeline (search events and car schedules)
- Web: Submit → Send flow against the v2 API

**References**

- `docs/superpowers/specs/2026-10-19-3d-packet-highway-design.md` §4
- `docs/architecture.md` (3D rendering rules)

### Update 2026-10-20

Geolocation start (spec Q12): the hook accepts a `startNodeId` (default `clientId`) and passes it as `fromNodeId` to `/api/route`.

- [ ] `startNodeId` supported and tested; resetting cars on re-send uses the same start

#### 14. UI: FilePanel, SendBar, StatusBanner and ViewToggle

- **Assignee:** `ple0309`
- **Labels:** `plan-3`, `area:frontend`, `figma-v2`, `user-story`
- **Milestone:** W2

**User story:** As a student, I want to pick a file or type a message, press Submit then Send, and always know what the app is doing, so that I never wonder if it is stuck.

**Acceptance criteria**

- [ ] Components in `apps/web/src/ui/` match Figma v2 Light for idle, loaded, searching, delivered, no route and error
- [ ] File input sends only name and size; message limited to 140 characters with counter
- [ ] StatusBanner shows an icon plus text for success and error; Retry shown on API error
- [ ] ViewToggle switches 2D/3D; defaults to 2D when WebGL is unavailable or `prefers-reduced-motion` is set
- [ ] Styles use the CSS custom properties from `apps/web/src/styles.css`

**Depends on**

- Design remaining states in Figma v2
- sim: state types and useSimulation reducer
- Web: Submit → Send flow against the v2 API

**References**

- `docs/superpowers/specs/2026-10-19-3d-packet-highway-design.md` §4 (Layout)
- `docs/superpowers/specs/2026-10-20-light-theme-team-kickoff-design.md` §2

### Update 2026-10-20

Scope added (spec Q11, §4 Real upload): the Your File card gets the opt-in checkbox (default OFF) "Really upload to our Oregon server (hashed, then deleted — never stored)", disabled above 10 MB with "Too large for real upload (10 MB max); simulated only". StatusBanner/delivered view shows the verified / mismatch / failed badge from the upload sub-state (logic in the new client-upload issue). Checkbox + badges follow Figma v2 (#9).

- [ ] Opt-in checkbox, disabled state and hint text implemented
- [ ] Verified / mismatch / failed badges implemented with icon + text

#### 15. UI: BfsPanel, NetworkStatus, Legend and 2D view upgrade

- **Assignee:** `ple0309`
- **Labels:** `plan-3`, `area:frontend`, `figma-v2`, `user-story`
- **Milestone:** W2

**User story:** As a student explaining BFS, I want to see the search order, the chosen route and which stations are broken, so that the audience understands why that path was taken.

**Acceptance criteria**

- [ ] BfsPanel lists FIFO queue chips in visit order (no priorities) with the note "BFS picks fewest hops, not shortest distance"
- [ ] NetworkStatus toggles stations and roads, disabled with a hint while sending; keyboard operable
- [ ] 2D view draws search rings, route line (≥ 4 px with outline) and cars as dots from `buildTimeline`, labels screen-aligned
- [ ] Legend and "Illustrative network — not real internet routing" label always visible
- [ ] No invented metrics (latency, throughput, step N/total, etc.)

**Depends on**

- Design remaining states in Figma v2
- sim: buildTimeline (search events and car schedules)

**References**

- `docs/superpowers/specs/2026-10-19-3d-packet-highway-design.md` §4
- `docs/superpowers/specs/2026-10-20-light-theme-team-kickoff-design.md` §3 (items 3, 4, 7)

#### 16. 3D: Canvas scene and West Coast ground from Natural Earth

- **Assignee:** `CohenK`
- **Labels:** `plan-4`, `area:3d`, `user-story`
- **Milestone:** W2

**User story:** As a student, I want to see a simple 3D West Coast map, so that the route has a recognizable place to happen.

**Acceptance criteria**

- [ ] `scene3d/Scene.tsx` mounts an R3F `<Canvas>` with lighting and OrbitControls; non-blank on load
- [ ] One-off script (mapshaper, dev dependency) simplifies Natural Earth outlines into committed `westcoast.json`; sources in `apps/web/ASSETS.md`
- [ ] `Ground.tsx` extrudes the outline with `map-ground` color; coordinates use `project()` from `packages/shared`
- [ ] Dependencies added: three, @types/three, @react-three/fiber, @react-three/drei

**Depends on**

- Contract v2: shared schemas, limits and map projection

**References**

- `docs/superpowers/specs/2026-10-19-3d-packet-highway-design.md` §2 (Q4, Q5) and §4
- `docs/architecture.md` (3D rendering rules)

#### 17. 3D: stations, roads and parking lots (primitives)

- **Assignee:** `CohenK`
- **Labels:** `plan-4`, `area:3d`, `user-story`
- **Milestone:** W2

**User story:** As a student, I want stations, roads and two parking lots on the map, so that I can see where the file starts and ends.

**Acceptance criteria**

- [ ] `Station`, `Road`, `ParkingLot` render from `GET /api/network` using primitives; roads are slightly arched curves
- [ ] CSULB and the US-West Data Center, Oregon lots are visually distinct; labels are screen-aligned
- [ ] Broken stations/roads shown with `danger` color plus a non-color mark
- [ ] Station highlight and depth rings driven by a prop so Searching can reuse them

**Depends on**

- 3D: Canvas scene and West Coast ground from Natural Earth
- West Coast topology (19 stations, 24 roads) and invariant tests

**References**

- `docs/superpowers/specs/2026-10-19-3d-packet-highway-design.md` §4 (Layout)
- `docs/architecture.md` (Network topology)

### Milestone W3

#### 18. Playwright E2E on the 2D view

- **Assignee:** `doubleeyetwo`
- **Labels:** `plan-5`, `area:qa`, `user-story`
- **Milestone:** W3

**User story:** As a team member merging a change, I want automated end-to-end checks of the main flows, so that regressions are caught before the demo.

**Acceptance criteria**

- [ ] `@playwright/test` configured to run against the 2D view with the API started locally
- [ ] Specs: Submit → Send → delivered; break a station → new route; cut all routes → "No route available"; Reset returns to idle
- [ ] Specs run headless in under 2 minutes and are not flaky across 5 consecutive runs
- [ ] Run command documented in README

**Depends on**

- UI: FilePanel, SendBar, StatusBanner and ViewToggle
- UI: BfsPanel, NetworkStatus, Legend and 2D view upgrade
- sim: useSimulation hook with playback controls

**References**

- `docs/superpowers/specs/2026-10-19-3d-packet-highway-design.md` §5 (E2E row)
- `docs/superpowers/specs/2026-10-19-3d-packet-highway-design.md` §6

#### 19. Component tests and accessibility audit

- **Assignee:** `doubleeyetwo`
- **Labels:** `plan-5`, `area:qa`, `user-story`
- **Milestone:** W3

**User story:** As a student who uses a keyboard or screen reader, I want to toggle failures and send a file without a mouse, so that I can use the simulator.

**Acceptance criteria**

- [ ] Testing Library tests for FilePanel, SendBar, StatusBanner and 2D keyboard toggles
- [ ] Audit checklist covering focus order, visible focus ring, labels, color-not-only signals (check icon + text for success) and `prefers-reduced-motion`
- [ ] Findings filed as separate issues labeled `bug` + `area:qa`

**Depends on**

- UI: FilePanel, SendBar, StatusBanner and ViewToggle
- UI: BfsPanel, NetworkStatus, Legend and 2D view upgrade

**References**

- `docs/superpowers/specs/2026-10-19-3d-packet-highway-design.md` §2 (Q9) and §5
- `docs/superpowers/specs/2026-10-20-light-theme-team-kickoff-design.md` §2 (rules)

#### 20. 3D: cars with instancing driven by the timeline

- **Assignee:** `CohenK`
- **Labels:** `plan-4`, `area:3d`, `user-story`
- **Milestone:** W3

**User story:** As a student, I want cars to park in the CSULB lot after Submit and drive the chosen route on Send, so that packets feel like real traffic.

**Acceptance criteria**

- [ ] `Cars.tsx` uses drei `<Instances>`; up to 24 cars park in the CSULB lot after Submit
- [ ] `useFrame` reads `carSchedules` from `buildTimeline` and mutates instance matrices via refs; no React state updates per frame
- [ ] Cars follow road curves by progress `t ∈ [0,1]`, depart staggered and park in the Oregon lot
- [ ] Search phase lights stations in BFS order with depth rings; stays in sync with the 2D view
- [ ] Pause, resume and speed from `useSimulation` respected

**Depends on**

- 3D: stations, roads and parking lots (primitives)
- sim: buildTimeline (search events and car schedules)
- sim: useSimulation hook with playback controls

**References**

- `docs/superpowers/specs/2026-10-19-3d-packet-highway-design.md` §4
- `docs/architecture.md` (3D rendering rules)

### Update 2026-10-20

Geolocation start (spec Q12): cars park at the chosen start station, not always the CSULB lot. Parking position for the start must come from `startNodeId` in simulation state; the CSULB lot stays the default.

- [ ] Cars spawn at the selected start station and the search begins there

#### 21. 3D: camera rig, follow-lead-car and WebGL fallback

- **Assignee:** `CohenK`
- **Labels:** `plan-4`, `area:3d`, `user-story`
- **Milestone:** W3

**User story:** As a student presenting, I want the camera to frame the whole route and optionally follow the lead car, so that the audience can follow the action.

**Acceptance criteria**

- [ ] `CameraRig` preset frames the full route; OrbitControls remain usable
- [ ] Optional "follow lead car" toggle that releases on user drag
- [ ] If WebGL is unavailable the app shows the 2D view with an explanatory message; no crash
- [ ] One smoke test: canvas mounts and is non-blank; manual 3D checklist added to `docs/`

**Depends on**

- 3D: cars with instancing driven by the timeline

**References**

- `docs/superpowers/specs/2026-10-19-3d-packet-highway-design.md` §2 (Q9) and §5 (3D row)

#### 22. 3D: swap primitives for Kenney CC0 models

- **Assignee:** `CohenK`
- **Labels:** `plan-4`, `area:3d`, `user-story`
- **Milestone:** W3

**User story:** As a student, I want the scene to look polished with proper cars and buildings, so that the demo is memorable.

**Acceptance criteria**

- [ ] Kenney Car Kit / City Kit (CC0) models replace primitives behind the same component props
- [ ] Cars still render through `<Instances>`; frame rate stays smooth with 24 cars on a laptop
- [ ] Licenses and sources recorded in `apps/web/ASSETS.md`
- [ ] Fallback to primitives if a model fails to load

**Depends on**

- 3D: cars with instancing driven by the timeline

**References**

- `docs/superpowers/specs/2026-10-19-3d-packet-highway-design.md` §2 (Q10)

#### 23. Deploy to Render (Oregon) and set environment variables

- **Assignee:** `Ben2104`
- **Labels:** `plan-6`, `area:devops`, `user-story`
- **Milestone:** W3

**User story:** As a student presenting, I want the app online with the API in Oregon, so that the demo works from any laptop and the data center is geographically honest.

**Acceptance criteria**

- [ ] Render Blueprint applied; `netsim-api` in region `oregon`
- [ ] `VITE_API_URL` set on `netsim-web`; `CORS_ORIGIN` set on `netsim-api`; no secrets committed
- [ ] Health check `GET /api/health` returns 200 from the deployed web app
- [ ] Free-instance cold start documented with a warm-up step for presenters

**Depends on**

- POST /api/route v2 (fromNodeId) and contract freeze with mock responses

**References**

- `README.md` (Deployment)
- `render.yaml`

#### 24. CI: run Playwright E2E on pull requests

- **Assignee:** `Ben2104`
- **Labels:** `plan-6`, `area:devops`, `user-story`
- **Milestone:** W3

**User story:** As a team member opening a PR, I want end-to-end tests to run automatically, so that regressions block the merge.

**Acceptance criteria**

- [ ] New CI job installs browsers (cached), starts API and web, runs Playwright headless
- [ ] Test report/trace uploaded as an artifact on failure
- [ ] Job added to required checks; total CI time under 8 minutes

**Depends on**

- Playwright E2E on the 2D view
- Enable branch protection and required CI check on main

**References**

- `docs/superpowers/specs/2026-10-19-3d-packet-highway-design.md` §5
- `.github/workflows/ci.yml`

### Milestone W4

#### 25. Demo script and presenter runbook

- **Assignee:** `Ben2104`
- **Labels:** `plan-6`, `area:devops`, `user-story`
- **Milestone:** W4

**User story:** As a student presenting, I want a short scripted walkthrough, so that the demo shows every feature in five minutes without surprises.

**Acceptance criteria**

- [ ] `docs/demo-script.md` walks through the five demo routes from `docs/architecture.md` with expected on-screen results
- [ ] Pre-flight checklist: warm up the API, check WebGL, fallback to 2D
- [ ] Rehearsed once end-to-end on the deployed site; issues filed as `bug`

**Depends on**

- Deploy to Render (Oregon) and set environment variables
- 3D: swap primitives for Kenney CC0 models

**References**

- `docs/architecture.md` (Demo routes)
- `docs/superpowers/specs/2026-10-19-3d-packet-highway-design.md` §7

### Update 2026-10-20

The demo script and runbook must include the upload privacy note: uploads are opt-in (default off), bytes are hashed in Oregon and deleted, never stored; real bytes take whatever internet path ISPs choose and the cars show an illustrative BFS route. Add:

- [ ] Demo step with the upload checkbox ticked: "Verified in Oregon ✓" shown at delivery
- [ ] Demo step for "Start from my location" and the "outside network → CSULB" fallback
- [ ] Pre-flight: use a small file; mention the 10 MB limit and the 10/min rate limit

## Added 2026-10-20: real upload to Oregon and geolocation start

Spec: Q11 (opt-in real upload, nothing stored) and Q12 (geolocation start). Issue numbers are assigned by GitHub when `create-issues.sh` runs; dependencies below cite titles (numbers added on the GitHub issues). Existing issues #5, #9, #13, #14, #20 and #25 gained an "Update 2026-10-20" section above; #18, #19 and #23 get a comment (see `create-issues.sh` footer notes).

#### POST /api/upload: streaming SHA-256, limits and rate limit

- **Assignee:** `haohnguyen94-droid`
- **Labels:** `plan-1`, `area:backend`, `user-story`, `privacy`
- **Milestone:** W2

**User story:** As a student who chooses to upload, I want the server to prove it received my exact bytes without keeping them, so that I can trust the "Verified in Oregon" result.

**Acceptance criteria**

- [ ] `POST /api/upload` accepts `application/octet-stream` as a stream (custom content-type parser returning the raw stream); the body is never buffered in memory
- [ ] Bytes feed an incremental SHA-256 (`node:crypto`) and a byte counter, then are discarded: no disk, no database, no logging of contents or of `X-File-Name`
- [ ] 200 returns `{ bytesReceived, sha256, receivedAt (ISO), region: "oregon" }`; schema and `MAX_UPLOAD_BYTES` (10 MiB = 10,485,760) added to `packages/shared`
- [ ] Over 10 MiB returns 413 `PAYLOAD_TOO_LARGE`, enforced by counting streamed bytes and aborting (not only by `Content-Length`/`bodyLimit`, which a stream parser may bypass)
- [ ] `@fastify/rate-limit` ~10 uploads/min/IP returns 429 `RATE_LIMITED`; empty body returns 400 `VALIDATION_ERROR`; all errors use `{ error: { code, message } }`
- [ ] CORS config same as other routes and allows the `X-File-Name` request header; `npm run check` passes

**Depends on**

- Contract v2: shared schemas, limits and map projection (#1)
- POST /api/route v2 (fromNodeId) and contract freeze with mock responses (#4)

**References**

- `docs/superpowers/specs/2026-10-19-3d-packet-highway-design.md` §3 (Upload) and Q11
- `docs/architecture.md` (POST /api/upload, Errors, Limits)

#### Upload API tests: hash vector, limits, rate limit and memory

- **Assignee:** `doubleeyetwo`
- **Labels:** `plan-5`, `area:qa`, `area:backend`, `user-story`, `privacy`
- **Milestone:** W2

**User story:** As a team member, I want automated proof that the upload endpoint hashes correctly, enforces its limits and never buffers the body, so that a 512 MB Render instance stays safe.

**Acceptance criteria**

- [ ] Hash correctness on a known vector: SHA-256 of `abc` is `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`; also a multi-chunk upload equals the same digest
- [ ] 413 `PAYLOAD_TOO_LARGE` for 10 MiB + 1 byte, both with a `Content-Length` and chunked (no length); exactly 10 MiB succeeds
- [ ] 429 `RATE_LIMITED` on the 11th upload within a minute from one IP; empty body gives 400; error shape asserted
- [ ] Memory check: stream a 10 MB body in small chunks and assert heap/RSS growth stays far below the body size (threshold agreed in the PR)
- [ ] Test confirms no log line contains the file name or body (capture the logger output)

**Depends on**

- POST /api/upload: streaming SHA-256, limits and rate limit
- Haversine distance helper (#5) as a first-PR warm-up if new to `inject()` tests

**References**

- `docs/superpowers/specs/2026-10-19-3d-packet-highway-design.md` §5 (API row)
- `docs/architecture.md` (Limits)

#### Client upload: opt-in, SHA-256 compare and verified states

- **Assignee:** `BlakeJG`
- **Labels:** `plan-2`, `area:sim`, `user-story`, `privacy`
- **Milestone:** W3

**User story:** As a student, I want an optional real upload that proves my file reached Oregon intact without ever slowing or breaking the simulation, so that the demo can be both a game and a real round trip.

**Acceptance criteria**

- [ ] Typed `upload()` in `apps/web/src/api/client.ts` sends raw bytes (`File`/`Blob` body, UTF-8 bytes for message source) with optional `X-File-Name`
- [ ] Browser hash via `crypto.subtle.digest("SHA-256")`; hex compared with the server `sha256`
- [ ] Opt-in flag in simulation state, default off; `canUpload(sizeBytes)` false above 10 MiB
- [ ] On Send, `/api/route` and `/api/upload` start in parallel; upload outcome never blocks, delays or fails the main state machine
- [ ] Upload sub-state `off | pending | verified | mismatch | failed` covered by reducer tests (incl. server 413/429/network error, and the upload finishing after `delivered`)
- [ ] No upload happens unless the checkbox is ticked; coordinates and file name are never logged client-side

**Depends on**

- POST /api/upload: streaming SHA-256, limits and rate limit
- sim: state types and useSimulation reducer (#8)
- sim: useSimulation hook with playback controls (#13)

**References**

- `docs/superpowers/specs/2026-10-19-3d-packet-highway-design.md` §4 (Real upload)
- `docs/architecture.md` (decision 3)

#### Start from my location: geolocation, station picker and snapping

- **Assignee:** `ple0309`
- **Labels:** `plan-3`, `area:frontend`, `figma-v2`, `user-story`, `privacy`
- **Milestone:** W3

**User story:** As a student presenting from anywhere, I want to start the route at the station nearest me, so that the demo feels personal, without my location ever leaving my browser.

**Acceptance criteria**

- [ ] "Start from my location" button; geolocation requested only on click (never on page load) with `enableHighAccuracy: false`, `maximumAge: 600000`, `timeout: 10000`
- [ ] When `navigator.permissions` is available and the state is `denied`, show a recovery hint instead of silently failing; handle timeout and unavailable
- [ ] Snap to the nearest station with the shared `haversineKm` (it must be importable from `packages/shared`; see Update on #5); nearest > 300 km shows "You're outside the West Coast network — starting at CSULB" and uses CSULB
- [ ] Accessible "Start from…" `<select>` listing all stations; keyboard and screen-reader usable; no IP-geolocation fallback
- [ ] Only `fromNodeId` is sent to `/api/route`; coordinates are never sent, stored or logged
- [ ] Selected start is passed to `useSimulation` (`startNodeId`) so cars park at that station; default remains the CSULB lot
- [ ] Matches Figma v2 (button, picker, denied and outside-network states; see Update on #9)

**Depends on**

- Haversine distance helper (#5)
- POST /api/route v2 (fromNodeId) and contract freeze with mock responses (#4)
- sim: useSimulation hook with playback controls (#13)
- UI: FilePanel, SendBar, StatusBanner and ViewToggle (#14)
- Design remaining states in Figma v2 (#9)

**References**

- `docs/superpowers/specs/2026-10-19-3d-packet-highway-design.md` §4 (Start from my location) and Q12

#### DevOps: Render limits for 10 MB uploads, trustProxy and CORS

- **Assignee:** `Ben2104`
- **Labels:** `plan-6`, `area:devops`, `user-story`, `privacy`
- **Milestone:** W3

**User story:** As a student presenting, I want uploads to work on the deployed site and rate limits to apply per visitor, so that one noisy user cannot lock out the room.

**Acceptance criteria**

- [ ] Verify a 10 MiB upload succeeds end-to-end through the Render proxy on the deployed API, and an 11 MiB upload returns 413 `PAYLOAD_TOO_LARGE` (not a proxy error page); record findings in `docs/architecture.md`
- [ ] Fastify `trustProxy` configured so `@fastify/rate-limit` keys on the real client IP from `X-Forwarded-For`, not the Render proxy IP; verify two different clients do not share one bucket
- [ ] CORS: `CORS_ORIGIN` includes the static site; preflight for `Content-Type: application/octet-stream` and `X-File-Name` succeeds
- [ ] Memory watched on the free instance during a 10 MiB upload (Render metrics); note result and any need to change plan
- [ ] Server logs on Render confirmed to contain no file names or contents

**Depends on**

- POST /api/upload: streaming SHA-256, limits and rate limit
- Deploy to Render (Oregon) and set environment variables (#23)

**References**

- `render.yaml`
- `docs/architecture.md` (Deployment)
- `docs/superpowers/specs/2026-10-19-3d-packet-highway-design.md` §3 (Upload)
