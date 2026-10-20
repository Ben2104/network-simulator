# Packet Highway — 3D Route Simulator Design

**Date:** 2026-10-19 · **Status:** Approved · **Supersedes:** 2D-only foundation UI

> Educational simulation. Stations are nodes in an in-memory graph. The app does not inspect,
> control, or route real network traffic. The network is illustrative, not real ISP topology.

## 1. Goal

A user at **CSULB, Long Beach** submits a file (or short message). The app splits it into
packets, shown as 3D **cars** parked in the CSULB **parking lot**. On **Send**, BFS searches a
West Coast network of **stations** (routers) connected by **roads** (links), then the cars drive
the chosen route to the **US-West Data Center, Oregon** parking lot. Users break or restore
stations and roads between sends and watch the route change, or see "no route available".

## 2. Decisions

| #   | Question                | Decision                                                                                                                                                                             |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Q1  | How "real" is the graph | Real places (approximate city coordinates), hand-picked links, labeled illustrative. Final: 19 nodes, 24 links (see architecture.md).                                                |
| Q2  | BFS vs geography        | Keep BFS (fewest hops). Topology designed so fewest-hop routes look geographically sensible. UI states "BFS = fewest hops, not shortest distance". Dijkstra is a stretch goal.       |
| Q3  | File handling           | Simulated. Browser sends only file name + size; contents never leave the browser. 1,500 B packets, capped at 24 cars.                                                                |
| Q4  | 3D stack                | React Three Fiber + drei.                                                                                                                                                            |
| Q5  | Geography look          | Low-poly West Coast ground from Natural Earth (public domain) outlines, simplified once, committed as GeoJSON. Equirectangular lat/lon → x/z projection.                             |
| Q6  | Destination             | Unbranded "US-West Data Center, Oregon" (Columbia River area). Render API deployed in Oregon region.                                                                                 |
| Q7  | Send playback           | Two phases: **search** (stations light in BFS order, depth rings), then **drive** (cars depart staggered, follow route, park).                                                       |
| Q8  | Failures during drive   | Locked while routing/searching/driving. Change between sends. Live mid-drive reroute = stretch #1; API carries `fromNodeId` now so it needs no contract change.                      |
| —   | Submit vs Send          | Two buttons. **Submit** → `POST /api/packetize` → cars appear in CSULB lot. **Send** → `POST /api/route` → search + drive. BFS runs at Send time so failures set after Submit apply. |
| Q9  | 2D fallback             | Keep SVG view as toggle. Default when WebGL unavailable or `prefers-reduced-motion`. Keyboard/screen-reader path for toggling failures. Primary E2E target.                          |
| Q10 | 3D assets               | Primitives first (weeks 1–2), swap to Kenney Car Kit / City Kit (CC0) in week 3 behind same components. Cars rendered with drei `<Instances>`.                                       |

## 3. Data model and API

Source of truth: `packages/shared/src/schemas.ts` (TypeBox). Backend stays stateless.

### Network — `GET /api/network`

```ts
type NodeKind = 'client' | 'server' | 'router'; // UI: client/server = parking lot, router = station
interface NetworkNode {
  id: string;
  label: string;
  kind: NodeKind;
  lat: number;
  lon: number;
  place: string;
}
interface NetworkLink {
  id: string;
  source: string;
  target: string;
  distanceKm: number;
}
interface Network {
  nodes: NetworkNode[];
  links: NetworkLink[];
  clientId: string;
  serverId: string;
}
```

- `x, y` removed. `packages/shared` exports `project(lat, lon) → { x, y }` used by both views.
- `distanceKm` computed by haversine at module load. Display only; BFS ignores it.
- Topology invariants (unit-tested):
  1. Healthy network has ≥ 2 station-disjoint routes client → server.
  2. Default BFS route contains no link longer than 450 km (no cross-region shortcut).
  3. Every link endpoint exists; graph connected.

Node set (full table with coordinates in `docs/architecture.md`): CSULB lot, Long Beach ISP, LA One Wilshire,
El Segundo, Riverside, Bakersfield, San Luis Obispo, Fresno, San Jose, Oakland, Sacramento,
Reno, Redding, Klamath Falls, Medford, Eugene, Bend, Portland, US-West Data Center (Oregon) lot.

### Submit — `POST /api/packetize`

```jsonc
// request — exactly one variant
{ "source": "file", "fileName": "essay.pdf", "sizeBytes": 1048576 }
{ "source": "message", "message": "Hello Oregon" }
// 200
{
  "totalBytes": 1048576, "packetSizeBytes": 1500, "packetCount": 700,
  "cars": [{ "id": "car-0", "seq": 0, "firstPacket": 0, "lastPacket": 29, "bytes": 45000 }]
}
```

- `packetCount = ceil(totalBytes / 1500)`; message bytes = UTF-8 length.
- `carCount = min(packetCount, 24)`; packets distributed as evenly as possible (first
  `packetCount mod carCount` cars get one extra). Last packet may be partial; car `bytes` sum
  to `totalBytes`.
- Limits: `fileName` 1–255 chars; `sizeBytes` integer 1 … 1 GiB; `message` 1–140 chars.

### Send — `POST /api/route`

```jsonc
// request
{ "fromNodeId": "csulb", "disabledNodeIds": ["sacramento"], "disabledLinkIds": [] }
// 200
{ "status": "routed" | "unreachable", "visitOrder": [...], "path": [...], "linkPath": [...] }
```

- `fromNodeId` optional, defaults to `clientId`.
- `message` and `packets` removed from this endpoint (moved to `/packetize`).

### Unchanged

`GET /api/health`; error shape `{ error: { code, message } }`; strict validation (no
coercion, no extra fields); `UNKNOWN_ID` for unknown node/link IDs, including `fromNodeId`.

## 4. Frontend

### State machine (`sim/useSimulation`)

```
idle ──Submit──► packetizing ──ok──► loaded
loaded ──Send──► routing ──routed──► searching ──► driving ──► delivered
                    └──unreachable──► noRoute
delivered | noRoute ──Submit──► packetizing     any ──Reset──► idle
packetizing | routing ──API error──► error (keeps previous cars; Retry)
```

- Failure toggles allowed only in `idle`, `loaded`, `delivered`, `noRoute`.
- After `delivered`, Send again re-routes the same cars from CSULB (they reset to the lot).
- Playback: pause / resume, speed 0.5× / 1× / 2×, skip search.

### Timeline (`sim/timeline.ts`, pure)

`buildTimeline(visitOrder, linkPath, cars, speed) → { searchEvents, carSchedules, durationMs }`.
Both 2D and 3D views consume it, so they stay in sync. Unit-tested without rendering.

### Layout

```
apps/web/src/
  sim/       useSimulation reducer, timeline
  scene3d/   Scene, Ground (westcoast.json), ParkingLot, Station, Road, Cars, CameraRig
  view2d/    SVG graph on projected lat/lon, cars as dots, keyboard toggles
  ui/        FilePanel, SendBar, BfsPanel, NetworkStatus, StatusBanner, ViewToggle, Legend
  api/       typed client
```

- Car motion: `useFrame` reads timeline and mutates instance matrices via refs. **No React state
  updates per frame.**
- Roads: slightly arched curves between projected station positions; cars sample position by
  progress `t ∈ [0,1]`.
- Camera: preset framing the full route, OrbitControls, optional "follow lead car".
- Persistent label: "Illustrative network — not real internet routing". BFS panel note: "BFS
  picks fewest hops, not shortest distance."

### Dependencies

| Package                                                     | Why                                     |
| ----------------------------------------------------------- | --------------------------------------- |
| `three`, `@types/three`                                     | 3D engine                               |
| `@react-three/fiber`                                        | Declarative Three.js in React           |
| `@react-three/drei`                                         | Controls, text, lines, instancing, glTF |
| `mapshaper` (dev, one-off script)                           | Simplify Natural Earth outlines         |
| `@testing-library/react`, `jsdom`, `@playwright/test` (dev) | Component and E2E tests                 |

Assets: Natural Earth (public domain); Kenney kits (CC0). Record sources in `apps/web/ASSETS.md`.

## 5. Testing

| Layer      | Tool                       | Covers                                                                                                                 |
| ---------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Algorithms | Vitest                     | BFS on new topology, topology invariants, `fromNodeId`, packetization math (700 → 24, sums, 1 B, 1 GiB), haversine ±1% |
| API        | Vitest + `inject()`        | `/packetize` variants and limits, `/route` validation, error codes                                                     |
| Sim        | Vitest                     | Reducer transitions incl. locked toggles; timeline ordering and durations                                              |
| UI         | Vitest + Testing Library   | FilePanel, SendBar, StatusBanner, 2D keyboard toggles                                                                  |
| E2E        | Playwright (2D view)       | Submit → Send → delivered; break station → new route; cut all routes → no route; reset                                 |
| 3D         | Manual checklist + 1 smoke | Canvas mounts and is non-blank; no pixel-diff tests (flaky on WebGL in CI)                                             |

## 6. Team ownership

Owners per `2026-10-20-light-theme-team-kickoff-design.md` §4 (rebalanced: the API is small and stateless).

| #   | Area                 | Owner                                                                                                  | Deliverables                                                             |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| 1   | Frontend / UI        | `ple0309`                                                                                              | `ui/` panels, layout, responsive, Figma v2 → components, 2D view upgrade |
| 2   | Backend / algorithms | `haohnguyen94-droid` (Hao), `doubleeyetwo` (Double)                                                    | topology, `/packetize`, `/route` + `fromNodeId`, haversine, invariants   |
| 3   | 3D scene + animation | `CohenK`                                                                                               | `scene3d/`, ground, models, car motion, camera                           |
| 4   | Testing / QA         | `doubleeyetwo` (after Plan 1)                                                                          | Testing Library + Playwright, a11y audit                                 |
| 5   | DevOps               | `Ben2104` (Khoi)                                                                                       | Render (Oregon), CI with Playwright, env vars, branch protection         |
| 6   | Integration / docs   | `BlakeJG` (Blakes) for `sim/`; `haohnguyen94-droid` for contract; `Ben2104` for README and demo script | shared contract, `sim/` reducer + timeline, README, demo script          |

Checkpoints: **end W1** contract frozen + mock responses; **mid W2** Submit → delivered in 2D;
**end W3** feature-complete in 3D; **W4** bug fixes only.

## 7. Stretch goals (not dependencies for the demo)

1. Live mid-drive reroute + packet loss (uses `fromNodeId`).
2. Dijkstra by `distanceKm`, BFS vs Dijkstra comparison.
3. Guided demo mode (scripted failures + narration).
4. Follow-car camera polish, day/night lighting.

## 8. Out of scope

Real file upload, real traceroute data, database, auth, websockets, real-world routing.
