# Component map — Figma → React

Source frames: Page 1 `1:2` (Broken Station) and `1:361` (Driving). Page `v2 Light` supersedes
colors and fixes (see `docs/superpowers/specs/2026-10-20-light-theme-team-kickoff-design.md` §3).
State names are from the `sim/useSimulation` state machine (`idle`, `packetizing`, `loaded`,
`routing`, `searching`, `driving`, `delivered`, `noRoute`, `error`). Contract = `packages/shared/src/schemas.ts`.

Owners: **ple0309** = `ui/` + `view2d/`, **CohenK** = `scene3d/`, **BlakeJG** = `sim/`.
All paths are under `apps/web/src/`.

| Figma section                                                                     | Component → file                                          | Reads from sim state / contract                                                                                        | Owner   |
| --------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------- |
| Header / top bar: logo, title, "Illustrative network" chip                        | `Header` → `ui/Header.tsx`                                | none (static)                                                                                                          | ple0309 |
| Header: 3D / 2D toggle                                                            | `ViewToggle` → `ui/ViewToggle.tsx`                        | `view: '3d' \| '2d'` (UI state, in `App`)                                                                              | ple0309 |
| Header: Guided demo button, help icon                                             | — (cut)                                                   | no data; stretch goal (spec §7)                                                                                        | —       |
| Alert banner (error toast, "No route available")                                  | `AlertBanner` → `ui/AlertBanner.tsx`                      | `state` ∈ {`noRoute`, `error`}, `RouteResponse.visitOrder.length`, `error.message`, `retry()`                          | ple0309 |
| Canvas viewport (3D)                                                              | `Scene` → `scene3d/Scene.tsx`                             | `Network` (nodes, links, clientId, serverId), `timeline`, `disabledNodeIds`, `disabledLinkIds`, `toggleNode/Link`      | CohenK  |
| Canvas viewport (2D)                                                              | `NetworkGraph` → `view2d/NetworkGraph.tsx`                | same as above (moved from `components/`)                                                                               | ple0309 |
| Canvas: legend (lot, station, road, car, broken)                                  | `Legend` → `ui/Legend.tsx`                                | none (static)                                                                                                          | ple0309 |
| Canvas: map controls (zoom +/−, recenter)                                         | `MapControls` → `scene3d/MapControls.tsx`                 | camera ref (`CameraRig`); 2D view ignores them                                                                         | CohenK  |
| Canvas: "Tilted 3D View · Bearing · Pitch" chip, "STATE 4: DRIVING" chip          | — (cut)                                                   | bearing/pitch are camera internals; state chip is debug, not in contract                                               | —       |
| Your File card (drop zone / message input, counter, Submit, summary)              | `FilePanel` → `ui/FilePanel.tsx`                          | `state`, `submit(message)`, `LIMITS.messageMaxLength`; summary: `packets.length`, car count (derived from packets)     | ple0309 |
| Your File: "Packetized" badge                                                     | part of `FilePanel`                                       | `state === 'loaded'` onward                                                                                            | ple0309 |
| Your File: file name, MB size, drag-and-drop                                      | `FilePanel`                                               | pending Plan 1: `/packetize` schema is not yet in `schemas.ts` (only `RouteRequest/Response`). Message-only until then | ple0309 |
| Send & Playback card: Send button, "Transmitting" state                           | `SendBar` → `ui/SendBar.tsx`                              | `state`, `send()`; enabled in `loaded`/`delivered`                                                                     | ple0309 |
| Send & Playback: pause/resume, skip search, speed 0.5×/1×/2×                      | `PlaybackControls` → `ui/PlaybackControls.tsx`            | `playback: { paused, speed }`, `pause()`, `resume()`, `setSpeed()`, `skipSearch()` (only in `searching`/`driving`)     | ple0309 |
| Send & Playback: "Streaming Active" badge                                         | part of `SendBar`                                         | `state === 'driving'`                                                                                                  | ple0309 |
| BFS card: final route breadcrumb                                                  | `BfsPanel` → `ui/BfsPanel.tsx`                            | `RouteResponse.path`, node labels from `Network`                                                                       | ple0309 |
| BFS card: hop count + "BFS = fewest hops, not shortest distance"                  | part of `BfsPanel`                                        | `path.length - 1`                                                                                                      | ple0309 |
| BFS card: frontier layers (Depth N, Resolved / Active / Queued), FIFO queue chips | part of `BfsPanel`                                        | `RouteResponse.visitOrder[].{nodeId,depth}` + timeline `searchEvents` cursor (which steps have played)                 | ple0309 |
| BFS timeline (search events, car schedules)                                       | `buildTimeline` → `sim/timeline.ts`                       | `visitOrder`, `linkPath`, packets, speed → `{ searchEvents, carSchedules, durationMs }`                                | BlakeJG |
| State machine / reducer                                                           | `useSimulation` → `sim/useSimulation.ts`                  | owns all state above; calls `api.packetize`, `api.route`                                                               | BlakeJG |
| Network Status card: broken list with Restore, Reset network                      | `NetworkStatus` → `ui/NetworkStatus.tsx`                  | `disabledNodeIds`, `disabledLinkIds`, `restore(id)`, `reset()`; controls locked in `searching`/`driving`/`routing`     | ple0309 |
| Network Status: "Inject Fault" button                                             | — (cut)                                                   | faults are injected by clicking a station/road on the map (spec §4); no separate action                                | —       |
| Network Status: "All active route nodes healthy"                                  | — (cut)                                                   | invented health metric; no backing data                                                                                | —       |
| Footer status banner: "N / M cars arrived" + progress bar                         | `StatusBanner` → `ui/StatusBanner.tsx`                    | timeline progress: arrived cars / `packets`-derived car count, `state`; "Delivered via N hops" on `delivered`          | ple0309 |
| Footer: Transit velocity (km/h), Est. completion, Throughput (pkts/s)             | — (cut)                                                   | invented metrics (spec §3 row 7); not in contract                                                                      | —       |
| Map objects: parking lots, stations, roads, cars, route highlight                 | `ParkingLot`, `Station`, `Road`, `Cars` → `scene3d/*.tsx` | `Network`, `timeline.carSchedules`, `path`/`linkPath`, `visitedNodeIds`, disabled sets                                 | CohenK  |
| Car labels (#07 …) and rotated iso labels                                         | `Cars` labels (screen-aligned, optional)                  | `Packet.seq` (grouped into cars)                                                                                       | CohenK  |

## Cut — Figma elements with no backing data

1. Guided demo button, help icon (stretch goal, no contract).
2. "Tilted 3D View · Bearing · Pitch" chip and "STATE 4: DRIVING" chip.
3. "Inject Fault" button (faults come from clicking the map).
4. "All active route nodes healthy" status.
5. Transit velocity (km/h), Est. completion time, Throughput (pkts/s).
6. "Priority Queue" / Q1, Q2 priority badges (BFS queue is FIFO; no priority field).
7. File name and MB size in Your File: blocked until `/packetize` lands in `schemas.ts` (Plan 1).
