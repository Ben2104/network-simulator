# Architecture

> Educational simulation. Stations are nodes in an in-memory graph. Nothing here inspects,
> controls, or routes real network traffic. The West Coast network is illustrative, not real ISP
> topology.

Full design rationale: [`superpowers/specs/2026-10-19-3d-packet-highway-design.md`](superpowers/specs/2026-10-19-3d-packet-highway-design.md).

## Concept

| Simulation         | Networking term | Shown as                             |
| ------------------ | --------------- | ------------------------------------ |
| CSULB parking lot  | client          | lot at Long Beach                    |
| Oregon parking lot | server          | lot at "US-West Data Center, Oregon" |
| Station            | router          | station at a real West Coast city    |
| Road               | link            | curved road between stations         |
| Car                | packet bundle   | 3D car; ≤ 24 per transfer            |

Flow: **Submit** a file → server splits it into packets → cars appear in the CSULB lot.
**Send** → BFS searches the network (stations light up in visit order) → chosen route highlights
→ cars drive it and park in the Oregon lot. Break/restore stations and roads between sends.

## System overview

```
┌─────────────────────────────── Browser ───────────────────────────────┐
│ apps/web (React + Vite)                                               │
│                                                                       │
│  ui/  FilePanel ─Submit─┐   SendBar ─Send─┐   BfsPanel  NetworkStatus │
│                         ▼                 ▼                           │
│  sim/ useSimulation reducer ◄──── api/client.ts ───────► fetch /api/* │
│        │  state: phase, cars, failures, route, playback               │
│        ▼                                                              │
│       timeline.ts (pure) ──► scene3d/ (React Three Fiber)             │
│                         └──► view2d/  (SVG fallback)                  │
└──────────────────────────────────┬────────────────────────────────────┘
                                   │ JSON over HTTPS
┌──────────────────────────────────▼────────────────────────────────────┐
│ apps/server (Fastify) — stateless                                     │
│  GET  /api/health                                                     │
│  GET  /api/network     ──► graph/topology.ts (lat/lon, distanceKm)    │
│  POST /api/packetize   ──► graph/packets.ts  (pure)                   │
│  POST /api/route       ──► graph/bfs.ts      (pure)                   │
│  errors.ts  uniform { error: { code, message } }                      │
└───────────────────────────────────────────────────────────────────────┘
            ▲                                         ▲
            └──── packages/shared: TypeBox schemas, types, LIMITS, project()
```

## Repository layout (target)

```
apps/
  server/src/
    app.ts, index.ts, config.ts, errors.ts
    graph/      topology.ts, bfs.ts, packets.ts, geo.ts (haversine) — no Fastify imports
    routes/     health.ts, network.ts, packetize.ts
  web/src/
    api/        typed fetch client
    sim/        useSimulation reducer, timeline.ts (pure)
    scene3d/    Scene, Ground, ParkingLot, Station, Road, Cars, CameraRig, westcoast.json
    view2d/     SVG graph, cars as dots, keyboard toggles
    ui/         FilePanel, SendBar, BfsPanel, NetworkStatus, StatusBanner, ViewToggle, Legend
packages/shared/src/
  schemas.ts, limits.ts, projection.ts
docs/
  architecture.md, design/stitch-prompt.md, superpowers/specs/, superpowers/plans/
```

## Key decisions

### 1. Stateless backend

The server holds one fixed topology and stores nothing between requests. The browser owns the
packet plan (from Submit), the failure sets, and playback state.

- Render free instances restart and sleep; server state would vanish mid-demo.
- Concurrent users never affect each other.
- Reset is a client-side state clear.

### 2. Submit and Send are separate

- **Submit** (`/packetize`) only splits bytes into packets and cars.
- **Send** (`/route`) runs BFS against the failure set _at send time_. Submit once, break things,
  send, and the route reflects the current network.

### 3. Files are simulated

Only `fileName` and `sizeBytes` leave the browser. File contents are never uploaded. Real packets
are ~1,500 bytes, so 1 MB ≈ 700 packets; cars are capped at 24 and each carries a range of
packets. No upload handling, no privacy exposure, deterministic output.

### 4. BFS on a geographic map

BFS minimizes **hop count**, not distance. Real routers weigh links (OSPF/IS-IS costs, BGP
policy). We keep BFS and design the topology so fewest-hop routes look sensible on the map:

- No long cross-region shortcut links in the default network (unit-tested invariant).
- ≥ 2 station-disjoint routes CSULB → Oregon so a single failure always has a detour.
- UI note: "BFS picks fewest hops, not shortest distance."
- Links carry `distanceKm` for display and the Dijkstra stretch goal.

### 5. Shared contract via TypeBox

`packages/shared` defines every request/response once. Fastify validates and serializes with the
JSON Schema; both apps import the derived TS types. `project(lat, lon)` also lives here so 2D
and 3D place nodes identically.

### 6. Algorithms isolated from HTTP

`graph/` exports pure functions (`findRoute`, `toCarPlan`, `haversineKm`). Routes only validate,
call, and shape. All algorithm tests run without HTTP.

### 7. Determinism

Fixed topology, BFS neighbors sorted by ID, deterministic packet distribution. Same inputs →
same route and same cars, every presentation.

### 8. One timeline, two renderers

`sim/timeline.ts` turns `(visitOrder, linkPath, cars, speed)` into timed events. Both
`scene3d/` and `view2d/` render from it, so the views can never disagree, and timing is
unit-testable without WebGL.

### 9. 3D rendering rules

- React Three Fiber + drei. Scene state comes from React; **per-frame motion does not.**
  `<Cars>` uses `useFrame` + refs to update instanced matrices. Never `setState` per frame.
- Ground: Natural Earth (public domain) CA/OR/WA outlines, simplified with mapshaper, committed
  as `westcoast.json`, extruded flat. Equirectangular projection; distortion is negligible at
  this scale.
- Models: primitives first; Kenney Car/City kits (CC0) swapped in behind the same components.
  Sources recorded in `apps/web/ASSETS.md`.

### 10. 2D fallback

SVG view stays. It is the default when WebGL is unavailable or `prefers-reduced-motion` is set,
the keyboard/screen-reader path for toggling failures, and the Playwright E2E target.

## Network topology (fixed)

19 nodes, 24 roads. Real places at approximate city coordinates; links are hand-picked and
illustrative. Source of truth will be `apps/server/src/graph/topology.ts`. Link ID =
`${source}--${target}`.

| ID              | Label               | Kind   | Place               | Lat     | Lon       |
| --------------- | ------------------- | ------ | ------------------- | ------- | --------- |
| `csulb`         | CSULB Parking Lot   | client | Long Beach, CA      | 33.7838 | -118.1141 |
| `lb-isp`        | Long Beach ISP      | router | Long Beach, CA      | 33.7701 | -118.1937 |
| `el-segundo`    | El Segundo          | router | El Segundo, CA      | 33.9192 | -118.4165 |
| `la-wilshire`   | One Wilshire        | router | Los Angeles, CA     | 34.0488 | -118.2558 |
| `riverside`     | Riverside           | router | Riverside, CA       | 33.9806 | -117.3755 |
| `bakersfield`   | Bakersfield         | router | Bakersfield, CA     | 35.3733 | -119.0187 |
| `slo`           | San Luis Obispo     | router | San Luis Obispo, CA | 35.2828 | -120.6596 |
| `fresno`        | Fresno              | router | Fresno, CA          | 36.7378 | -119.7871 |
| `san-jose`      | San Jose            | router | San Jose, CA        | 37.3382 | -121.8863 |
| `oakland`       | Oakland             | router | Oakland, CA         | 37.8044 | -122.2712 |
| `sacramento`    | Sacramento          | router | Sacramento, CA      | 38.5816 | -121.4944 |
| `reno`          | Reno                | router | Reno, NV            | 39.5296 | -119.8138 |
| `redding`       | Redding             | router | Redding, CA         | 40.5865 | -122.3917 |
| `klamath-falls` | Klamath Falls       | router | Klamath Falls, OR   | 42.2249 | -121.7817 |
| `medford`       | Medford             | router | Medford, OR         | 42.3265 | -122.8756 |
| `eugene`        | Eugene              | router | Eugene, OR          | 44.0521 | -123.0868 |
| `bend`          | Bend                | router | Bend, OR            | 44.0582 | -121.3153 |
| `portland`      | Portland            | router | Portland, OR        | 45.5152 | -122.6784 |
| `oregon-dc`     | US-West Data Center | server | Boardman, OR        | 45.8399 | -119.7006 |

Roads: csulb–lb-isp, csulb–el-segundo, lb-isp–la-wilshire, lb-isp–riverside,
la-wilshire–bakersfield, riverside–bakersfield, el-segundo–slo, bakersfield–fresno,
slo–san-jose, fresno–sacramento, san-jose–oakland, oakland–sacramento, oakland–redding,
sacramento–redding, sacramento–reno, reno–klamath-falls, redding–medford,
medford–klamath-falls, medford–eugene, klamath-falls–bend, eugene–bend, eugene–portland,
bend–oregon-dc, portland–oregon-dc. Longest: reno–klamath-falls, 342 km.

Two station-disjoint corridors: **coast** (El Segundo → SLO → San Jose → Oakland → Redding →
Medford → Eugene) and **inland** (LB ISP → LA/Riverside → Bakersfield → Fresno → Sacramento →
Reno → Klamath Falls). No single station failure disconnects CSULB from Oregon.

### Demo routes (asserted in tests)

BFS neighbors are sorted by code-unit string order (not `localeCompare`), so routes never depend
on server locale.

| Failures                 | Route                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| none                     | csulb → el-segundo → slo → san-jose → oakland → redding → medford → eugene → bend → oregon-dc (9 hops)     |
| station `oakland`        | csulb → lb-isp → la-wilshire → bakersfield → fresno → sacramento → reno → klamath-falls → bend → oregon-dc |
| road `oakland--redding`  | csulb → el-segundo → slo → san-jose → oakland → sacramento → reno → klamath-falls → bend → oregon-dc       |
| `sacramento` + `redding` | none — BFS explores 10 stations, "No route available"                                                      |
| start at `sacramento`    | sacramento → reno → klamath-falls → bend → oregon-dc                                                       |

### Packetization examples

| Input    | Packets | Cars | Notes                              |
| -------- | ------- | ---- | ---------------------------------- |
| 1 B      | 1       | 1    |                                    |
| 36,000 B | 24      | 24   | one packet per car                 |
| 1 MiB    | 700     | 24   | cars 0–3 carry 30 packets, rest 29 |
| 1 GiB    | 715,828 | 24   | max declared size                  |

### Map projection

`project(lat, lon)` in `packages/shared`: equirectangular over lat 32.5–46.5, lon −125 to −116,
scaled by cos(39.5°). Output width 600 units, height ≈ 1210; x grows east, y grows south (SVG).
3D uses x → x, y → z.

## Simulation state machine

```
idle ──Submit──► packetizing ──ok──► loaded
loaded ──Send──► routing ──routed──► searching ──► driving ──► delivered
                    └──unreachable──► noRoute
delivered | noRoute ──Submit──► packetizing      any ──Reset──► idle
packetizing | routing ──API error──► error (keeps cars, Retry)
```

Failure toggles are enabled only in `idle`, `loaded`, `delivered`, `noRoute`. Mid-drive
rerouting is stretch goal #1; `/route` already accepts `fromNodeId` for it.

## API contract

Base path `/api`. JSON bodies. Source of truth: `packages/shared/src/schemas.ts`.

### `GET /api/health`

```json
{ "status": "ok", "uptimeSeconds": 42, "version": "0.1.0" }
```

### `GET /api/network`

```ts
{ nodes: { id, label, kind: 'client'|'server'|'router', lat, lon, place }[],
  links: { id, source, target, distanceKm }[],
  clientId, serverId }
```

### `POST /api/packetize` — Submit

```jsonc
{ "source": "file", "fileName": "essay.pdf", "sizeBytes": 1048576 }
// or
{ "source": "message", "message": "Hello Oregon" }
```

```json
{
  "totalBytes": 1048576,
  "packetSizeBytes": 1500,
  "packetCount": 700,
  "cars": [{ "id": "car-0", "seq": 0, "firstPacket": 0, "lastPacket": 29, "bytes": 45000 }]
}
```

`carCount = min(packetCount, 24)`; packets spread evenly; car `bytes` sum to `totalBytes`.

### `POST /api/route` — Send

```json
{ "fromNodeId": "csulb", "disabledNodeIds": ["sacramento"], "disabledLinkIds": [] }
```

```json
{
  "status": "routed",
  "visitOrder": [{ "nodeId": "csulb", "parentId": null, "viaLinkId": null, "depth": 0 }],
  "path": ["csulb", "..."],
  "linkPath": ["..."]
}
```

`fromNodeId` optional (defaults to client). `status: "unreachable"` is a `200` with empty
`path`/`linkPath` and the full `visitOrder`.

### Errors

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "body/sizeBytes must be <= 1073741824" } }
```

| Status | Code               | When                                          |
| ------ | ------------------ | --------------------------------------------- |
| 400    | `VALIDATION_ERROR` | Schema violation (type, length, extra fields) |
| 400    | `UNKNOWN_ID`       | Node/link ID not in topology                  |
| 404    | `NOT_FOUND`        | Unknown route                                 |
| 500    | `INTERNAL_ERROR`   | Unhandled error (logged, not returned)        |

### Limits

| Limit                 | Value       |
| --------------------- | ----------- |
| Message               | 1–140 chars |
| File name             | 1–255 chars |
| File size (declared)  | 1 B – 1 GiB |
| Packet size           | 1,500 B     |
| Max cars per transfer | 24          |
| Disabled IDs per list | 64          |
| Request body          | 16 KiB      |

## Configuration

| Var            | App    | Default                 | Notes                                  |
| -------------- | ------ | ----------------------- | -------------------------------------- |
| `PORT`         | server | `3001`                  | Render sets it                         |
| `HOST`         | server | `0.0.0.0`               |                                        |
| `CORS_ORIGIN`  | server | `http://localhost:5173` | Comma-separated allowed origins        |
| `LOG_LEVEL`    | server | `info`                  | Pino level                             |
| `VITE_API_URL` | web    | empty                   | Empty in dev (Vite proxy). Build-time. |

No secrets.

## Deployment (Render)

`render.yaml` defines `netsim-api` (Node, region **oregon**, health check `/api/health`) and
`netsim-web` (static site, SPA rewrite). After creating the Blueprint:

1. `netsim-web` → `VITE_API_URL` = API URL, redeploy (build-time variable).
2. `netsim-api` → `CORS_ORIGIN` = static site URL.

Free API instances sleep when idle; first request can take ~30–60 s. Warm up before presenting.

## Testing

| Layer      | Tool                       | Covers                                                                |
| ---------- | -------------------------- | --------------------------------------------------------------------- |
| Algorithms | Vitest                     | BFS, topology invariants, `fromNodeId`, packetization math, haversine |
| API        | Vitest + `inject()`        | Endpoints, validation, error codes                                    |
| Sim        | Vitest                     | Reducer transitions, locked toggles, timeline ordering                |
| UI         | Vitest + Testing Library   | Panels, 2D keyboard toggles                                           |
| E2E        | Playwright (2D view)       | Submit → Send → delivered; break → reroute; cut all → no route; reset |
| 3D         | Manual checklist + 1 smoke | Canvas mounts and is non-blank (no WebGL pixel diffs)                 |

## Implementation status

| Area                                   | Status                                   |
| -------------------------------------- | ---------------------------------------- |
| Monorepo, CI, Render blueprint         | Done                                     |
| Shared contract, error handling        | Done (v1: x/y nodes, `message` on route) |
| BFS + tests                            | Done on 9-node demo graph                |
| 2D SVG view, send/reset, toggles       | Done (foundation)                        |
| West Coast topology, lat/lon, distance | To do                                    |
| `/packetize`, `fromNodeId`             | To do                                    |
| `sim/` reducer + timeline              | To do                                    |
| 3D scene, cars, camera                 | To do                                    |
| Component + E2E tests                  | To do                                    |

## Roadmap

Implementation plans: [`superpowers/plans/`](superpowers/plans/README.md). Plan 1 (contract +
backend v2) is written task-by-task; Plans 2–6 are written by their owners at the start of their
week.

| Week | Milestone                                                                       |
| ---- | ------------------------------------------------------------------------------- |
| W1   | Plan 1 merged: West Coast topology, `/packetize`, `fromNodeId`; contract frozen |
| W2   | `sim/` reducer + timeline; Submit → delivered in 2D                             |
| W3   | 3D scene, cars, camera; feature-complete                                        |
| W4   | E2E, a11y, deploy to Oregon, demo rehearsal; bug fixes only                     |

## Stretch goals

1. Live mid-drive reroute + packet loss.
2. Dijkstra by `distanceKm`; BFS vs Dijkstra comparison.
3. Guided demo mode.
4. Follow-car camera polish, day/night lighting.
