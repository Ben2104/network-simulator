# Packet Highway — 3D Route Simulator Design

**Date:** 2026-10-19 · **Status:** Approved · **Supersedes:** 2D-only foundation UI

**Changelog 2026-10-20:** opt-in real upload to Oregon (`POST /api/upload`, hashed then discarded) and
"Start from my location" geolocation start added (Q3, Q11, Q12, §3, §4); §8 out-of-scope updated.

> Educational simulation. Stations are nodes in an in-memory graph. The app does not inspect,
> control, or route real network traffic. The network is illustrative, not real ISP topology.
> File contents leave the browser only if the user opts in to the real upload; the server hashes
> the bytes and discards them. Real bytes take whatever internet path ISPs choose; the cars show an
> illustrative BFS route.

## 1. Goal

A user at **CSULB, Long Beach** submits a file (or short message). The app splits it into
packets, shown as 3D **cars** parked in the CSULB **parking lot**. On **Send**, BFS searches a
West Coast network of **stations** (routers) connected by **roads** (links), then the cars drive
the chosen route to the **US-West Data Center, Oregon** parking lot. Users break or restore
stations and roads between sends and watch the route change, or see "no route available".

## 2. Decisions

| #   | Question                | Decision                                                                                                                                                                                                                                                              |
| --- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | How "real" is the graph | Real places (approximate city coordinates), hand-picked links, labeled illustrative. Final: 19 nodes, 24 links (see architecture.md).                                                                                                                                 |
| Q2  | BFS vs geography        | Keep BFS (fewest hops). Topology designed so fewest-hop routes look geographically sensible. UI states "BFS = fewest hops, not shortest distance". Dijkstra is a stretch goal.                                                                                        |
| Q3  | File handling           | Simulated by default: the browser sends only file name + size to `/api/packetize`. Optional real upload (checkbox, **default off**, ≤ 10 MB) streams the bytes to `/api/upload` in Oregon, which hashes and discards them. 1,500 B packets, capped at 24 cars.        |
| Q4  | 3D stack                | React Three Fiber + drei.                                                                                                                                                                                                                                             |
| Q5  | Geography look          | Low-poly West Coast ground from Natural Earth (public domain) outlines, simplified once, committed as GeoJSON. Equirectangular lat/lon → x/z projection.                                                                                                              |
| Q6  | Destination             | Unbranded "US-West Data Center, Oregon" (Columbia River area). Render API deployed in Oregon region.                                                                                                                                                                  |
| Q7  | Send playback           | Two phases: **search** (stations light in BFS order, depth rings), then **drive** (cars depart staggered, follow route, park).                                                                                                                                        |
| Q8  | Failures during drive   | Locked while routing/searching/driving. Change between sends. Live mid-drive reroute = stretch #1; API carries `fromNodeId` now so it needs no contract change.                                                                                                       |
| —   | Submit vs Send          | Two buttons. **Submit** → `POST /api/packetize` → cars appear in CSULB lot. **Send** → `POST /api/route` → search + drive. BFS runs at Send time so failures set after Submit apply.                                                                                  |
| Q9  | 2D fallback             | Keep SVG view as toggle. Default when WebGL unavailable or `prefers-reduced-motion`. Keyboard/screen-reader path for toggling failures. Primary E2E target.                                                                                                           |
| Q10 | 3D assets               | Primitives first (weeks 1–2), swap to Kenney Car Kit / City Kit (CC0) in week 3 behind same components. Cars rendered with drei `<Instances>`.                                                                                                                        |
| Q11 | Real upload             | Option A: opt-in, nothing stored. Server computes SHA-256 while streaming, returns `{ bytesReceived, sha256, receivedAt, region }`, discards bytes. Browser compares with its own `crypto.subtle` hash and shows "Verified in Oregon ✓". Never blocks the simulation. |
| Q12 | Start location          | "Start from my location" (user gesture only) snaps to the nearest station client-side; > 300 km away falls back to CSULB. Coordinates never leave the browser; only `fromNodeId` is sent. No IP geolocation. Station `<select>` is the accessible fallback.           |

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

### Upload — `POST /api/upload` (opt-in)

```jsonc
// request: Content-Type: application/octet-stream, raw bytes (streamed, never buffered)
// optional header: X-File-Name (display only, never logged or stored)
// 200
{
  "bytesReceived": 1048576,
  "sha256": "<64 hex chars>",
  "receivedAt": "2026-10-20T12:00:00.000Z",
  "region": "oregon",
}
```

- The server pipes the body into an incremental SHA-256 (`node:crypto`) and a byte counter, then
  discards it. No disk, no database, no logging of contents or file name.
- Limits: body ≤ 10 MiB (10,485,760 B) → `413 PAYLOAD_TOO_LARGE`, enforced by counting bytes (not only
  `Content-Length`); ~10 uploads/min/IP (`@fastify/rate-limit`) → `429 RATE_LIMITED`; empty body →
  `400 VALIDATION_ERROR`. Errors use `{ error: { code, message } }`; CORS same as other routes.
- Independent of `/api/packetize` (still declared-size, up to 1 GiB) and `/api/route`.

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

### Real upload (client)

- Checkbox on the Your File card, **default off**: "Really upload to our Oregon server (hashed,
  then deleted — never stored)". Disabled above 10 MB with "Too large for real upload (10 MB max);
  simulated only". Message source uploads its UTF-8 bytes.
- Browser hashes with `crypto.subtle.digest('SHA-256')`. On Send, `/api/route` and `/api/upload`
  run in parallel; the simulation never waits on or fails because of the upload.
- Upload status is independent of the main state machine: `off | pending | verified | mismatch |
failed`. Delivered shows "Verified in Oregon ✓ — hash match (sha256 abc123…)", "Hash mismatch" or
  "Upload failed — simulation only".

### Start from my location

- Button "Start from my location", only on user gesture (never on page load).
  `getCurrentPosition` with `enableHighAccuracy: false`, `maximumAge: 600000`, `timeout: 10000`;
  `navigator.permissions.query({ name: 'geolocation' })` (when available) drives a recovery hint if
  already denied.
- Snap to the nearest station with the shared haversine helper (`packages/shared`). Nearest > 300 km
  away → start at CSULB with the notice "You're outside the West Coast network — starting at CSULB".
- Coordinates never leave the browser; only `fromNodeId` is sent. No IP-geolocation fallback.
- Accessible fallback: a "Start from…" station `<select>` (keyboard + screen reader). Cars appear
  at the chosen start station; the default is the CSULB lot.

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
| API        | Vitest + `inject()`        | `/packetize` variants and limits, `/route` validation, `/upload` (hash vector, 413, 429, 400, memory), error codes     |
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

Storing uploaded files (bytes are hashed and discarded), database, auth, websockets, real traceroute
data, real-world routing, IP geolocation, basemap tiles (Mapbox, MapLibre, deck.gl).
