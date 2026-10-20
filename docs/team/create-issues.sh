#!/usr/bin/env bash
# Creates labels, milestones and issues for Ben2104/network-simulator from docs/team/backlog-draft.md.
# Generated alongside the draft. Run ONLY after the repo owner approves the draft.
#
#   DRY_RUN=1 docs/team/create-issues.sh   # print commands, make no calls to GitHub
#   docs/team/create-issues.sh             # create for real (needs: gh auth login)
#
# Idempotent: labels use --force; milestones and issues are skipped if they already exist.
set -euo pipefail

REPO="${REPO:-Ben2104/network-simulator}"
DRY_RUN="${DRY_RUN:-0}"

run() {
  if [ "$DRY_RUN" = "1" ]; then
    printf 'DRY_RUN:'
    printf ' %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

if [ "$DRY_RUN" != "1" ]; then
  command -v gh >/dev/null || { echo "gh CLI not found" >&2; exit 1; }
  gh auth status >/dev/null
  EXISTING_MILESTONES="$(gh api "repos/$REPO/milestones?state=all&per_page=100" --jq '.[].title')"
  EXISTING_ISSUES="$(gh issue list --repo "$REPO" --state all --limit 500 --json title --jq '.[].title')"
else
  EXISTING_MILESTONES=""
  EXISTING_ISSUES=""
fi

label() { # name color description
  run gh label create "$1" --repo "$REPO" --color "$2" --description "$3" --force
}

milestone() { # title due(YYYY-MM-DD) description
  if printf '%s\n' "$EXISTING_MILESTONES" | grep -Fxq -- "$1"; then
    echo "skip milestone (exists): $1"
  else
    run gh api "repos/$REPO/milestones" -f title="$1" -f due_on="$2T23:59:59Z" -f description="$3"
  fi
}

issue() { # title assignee labels(comma-separated) milestone ; body on stdin
  local title="$1" assignee="$2" labels="$3" ms="$4" body
  body="$(cat)"
  if printf '%s\n' "$EXISTING_ISSUES" | grep -Fxq -- "$title"; then
    echo "skip issue (exists): $title"
    return 0
  fi
  if [ "$DRY_RUN" = "1" ]; then
    printf 'DRY_RUN: gh issue create --repo %s --title %q --assignee %q --label %q --milestone %q --body-file - (%s lines)\n' \
      "$REPO" "$title" "$assignee" "$labels" "$ms" "$(printf '%s\n' "$body" | wc -l | tr -d ' ')"
  else
    printf '%s\n' "$body" | gh issue create --repo "$REPO" --title "$title" \
      --assignee "$assignee" --label "$labels" --milestone "$ms" --body-file -
  fi
}

echo "== labels =="
label 'plan-1' '1D76DB' 'Plan 1: contract + backend v2'
label 'plan-2' '1D76DB' 'Plan 2: simulation core (sim/ reducer + timeline)'
label 'plan-3' '1D76DB' 'Plan 3: UI panels + 2D view'
label 'plan-4' '1D76DB' 'Plan 4: 3D scene, cars, camera'
label 'plan-5' '1D76DB' 'Plan 5: component + E2E tests, a11y audit'
label 'plan-6' '1D76DB' 'Plan 6: deploy (Oregon), CI with Playwright, demo script'
label 'area:backend' '0E8A16' 'apps/server and packages/shared'
label 'area:frontend' 'FBCA04' 'apps/web UI panels and 2D view'
label 'area:3d' '5319E7' 'apps/web scene3d (React Three Fiber)'
label 'area:sim' 'C2E0C6' 'apps/web sim/ reducer and timeline (pure TS)'
label 'area:qa' 'D93F0B' 'Testing Library, Playwright, accessibility audit'
label 'area:devops' '006B75' 'Render, CI, env vars, repo settings'
label 'area:design' 'F9D0C4' 'Figma and design tokens'
label 'user-story' 'BFD4F2' 'Written as a user story with acceptance criteria'
label 'figma-v2' 'C5DEF5' 'Tracks the Figma v2 Light mockups'

echo "== milestones =="
milestone 'W1' '2026-10-25' 'End W1: Plan 1 merged, contract frozen, mock responses available.'
milestone 'W2' '2026-11-01' 'Mid W2: Submit → delivered works in the 2D view. End W2: panels and 3D scaffold in.'
milestone 'W3' '2026-11-08' 'End W3: feature-complete in 3D, E2E green in CI, deployed to Render (Oregon).'
milestone 'W4' '2026-11-15' 'W4: bug fixes and demo rehearsal only. No new features.'

echo "== issues (dependency order) =="

issue 'Contract v2: shared schemas, limits and map projection' 'haohnguyen94-droid' 'plan-1,area:backend,user-story' 'W1' <<'ISSUE_BODY'
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
ISSUE_BODY

issue 'West Coast topology (19 stations, 24 roads) and invariant tests' 'haohnguyen94-droid' 'plan-1,area:backend,user-story' 'W1' <<'ISSUE_BODY'
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
ISSUE_BODY

issue 'BFS: locale-independent ordering and demo-route tests' 'haohnguyen94-droid' 'plan-1,area:backend,user-story' 'W1' <<'ISSUE_BODY'
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
ISSUE_BODY

issue 'POST /api/route v2 (fromNodeId) and contract freeze with mock responses' 'haohnguyen94-droid' 'plan-1,area:backend,user-story' 'W1' <<'ISSUE_BODY'
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
ISSUE_BODY

issue 'Haversine distance helper' 'doubleeyetwo' 'plan-1,area:backend,user-story,good first issue' 'W1' <<'ISSUE_BODY'
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
ISSUE_BODY

issue 'Packetization math: toCarPlan()' 'doubleeyetwo' 'plan-1,area:backend,user-story' 'W1' <<'ISSUE_BODY'
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
ISSUE_BODY

issue 'POST /api/packetize route and API tests' 'doubleeyetwo' 'plan-1,area:backend,user-story' 'W1' <<'ISSUE_BODY'
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
ISSUE_BODY

issue 'sim: state types and useSimulation reducer' 'BlakeJG' 'plan-2,area:sim,user-story' 'W1' <<'ISSUE_BODY'
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
ISSUE_BODY

issue 'Design remaining states in Figma v2' 'ple0309' 'figma-v2,area:design,plan-3,user-story' 'W1' <<'ISSUE_BODY'
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
ISSUE_BODY

issue 'Web: Submit → Send flow against the v2 API' 'ple0309' 'plan-1,area:frontend,user-story' 'W1' <<'ISSUE_BODY'
**User story:** As a student, I want Submit to park my cars and Send to run the route, so that the existing 2D view keeps working on the new backend.

**Acceptance criteria**
- [ ] Typed `packetize()` added to `apps/web/src/api/client.ts`; `NetworkGraph` positions nodes via `project()`
- [ ] App has separate Submit and Send buttons; Send is disabled until Submit succeeds
- [ ] `message` no longer sent to `/api/route`
- [ ] Existing 2D view renders the 19-node network; `npm run check` passes

**Depends on**
- POST /api/route v2 (fromNodeId) and contract freeze with mock responses
- POST /api/packetize route and API tests

**References**
- `docs/superpowers/plans/2026-10-19-plan-1-contract-backend-v2.md` (Task 5, web files)
- `docs/superpowers/specs/2026-10-19-3d-packet-highway-design.md` §2 (Submit vs Send)
ISSUE_BODY

issue 'Enable branch protection and required CI check on main' 'Ben2104' 'plan-6,area:devops,user-story' 'W1' <<'ISSUE_BODY'
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
ISSUE_BODY

issue 'sim: buildTimeline (search events and car schedules)' 'BlakeJG' 'plan-2,area:sim,user-story' 'W2' <<'ISSUE_BODY'
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
ISSUE_BODY

issue 'sim: useSimulation hook with playback controls' 'BlakeJG' 'plan-2,area:sim,user-story' 'W2' <<'ISSUE_BODY'
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
ISSUE_BODY

issue 'UI: FilePanel, SendBar, StatusBanner and ViewToggle' 'ple0309' 'plan-3,area:frontend,figma-v2,user-story' 'W2' <<'ISSUE_BODY'
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
ISSUE_BODY

issue 'UI: BfsPanel, NetworkStatus, Legend and 2D view upgrade' 'ple0309' 'plan-3,area:frontend,figma-v2,user-story' 'W2' <<'ISSUE_BODY'
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
ISSUE_BODY

issue '3D: Canvas scene and West Coast ground from Natural Earth' 'CohenK' 'plan-4,area:3d,user-story' 'W2' <<'ISSUE_BODY'
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
ISSUE_BODY

issue '3D: stations, roads and parking lots (primitives)' 'CohenK' 'plan-4,area:3d,user-story' 'W2' <<'ISSUE_BODY'
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
ISSUE_BODY

issue 'Playwright E2E on the 2D view' 'doubleeyetwo' 'plan-5,area:qa,user-story' 'W3' <<'ISSUE_BODY'
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
ISSUE_BODY

issue 'Component tests and accessibility audit' 'doubleeyetwo' 'plan-5,area:qa,user-story' 'W3' <<'ISSUE_BODY'
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
ISSUE_BODY

issue '3D: cars with instancing driven by the timeline' 'CohenK' 'plan-4,area:3d,user-story' 'W3' <<'ISSUE_BODY'
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
ISSUE_BODY

issue '3D: camera rig, follow-lead-car and WebGL fallback' 'CohenK' 'plan-4,area:3d,user-story' 'W3' <<'ISSUE_BODY'
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
ISSUE_BODY

issue '3D: swap primitives for Kenney CC0 models' 'CohenK' 'plan-4,area:3d,user-story' 'W3' <<'ISSUE_BODY'
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
ISSUE_BODY

issue 'Deploy to Render (Oregon) and set environment variables' 'Ben2104' 'plan-6,area:devops,user-story' 'W3' <<'ISSUE_BODY'
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
ISSUE_BODY

issue 'CI: run Playwright E2E on pull requests' 'Ben2104' 'plan-6,area:devops,user-story' 'W3' <<'ISSUE_BODY'
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
ISSUE_BODY

issue 'Demo script and presenter runbook' 'Ben2104' 'plan-6,area:devops,user-story' 'W4' <<'ISSUE_BODY'
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
ISSUE_BODY

echo "done"
