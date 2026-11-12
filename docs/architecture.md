# Architecture

> Educational simulation. Stations are nodes in an in-memory graph. Nothing here inspects,
> controls, or routes real network traffic. The West Coast network is illustrative, not real ISP
> topology. File contents leave the browser only if you opt in to the real upload; the server
> hashes the bytes and discards them.

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
**Send** → the selected algorithm searches the network (stations light up in visit order) → the
chosen route highlights. BFS minimizes hops; Dijkstra minimizes configured link cost. Every group follows the route
chosen by the selected algorithm.
Each car lights up stations it passes and parks in the Oregon lot.

## System overview

```
┌─────────────────────────────── Browser ───────────────────────────────┐
│ apps/web (React + Vite)                                               │
│                                                                       │
│  ui/  FilePanel ─Submit─┐   SendBar ─Send─┐   BfsPanel                │
│                         ▼                 ▼                           │
│  sim/ useSimulation reducer ◄──── api/client.ts ───────► fetch /api/* │
│        │  state: phase, cars, route, playback                         │
│        ▼                                                              │
│       timeline.ts (pure) ──► scene3d/ (React Three Fiber)             │
│                                                                       │
└──────────────────────────────────┬────────────────────────────────────┘
                                   │ JSON over HTTPS
┌──────────────────────────────────▼────────────────────────────────────┐
│ apps/server (Fastify) — stateless                                     │
│  GET  /api/health                                                     │
│  GET  /api/network     ──► graph/topology.ts (lat/lon, distanceKm)    │
│  POST /api/packetize   ──► graph/packets.ts  (pure)                   │
│  POST /api/route       ──► graph/bfs.ts, dijkstra.ts (pure)                   │
│  errors.ts  uniform { error: { code, message } }                      │
└───────────────────────────────────────────────────────────────────────┘
            ▲                                         ▲
            └──── packages/shared: TypeBox schemas, types, LIMITS, project(), haversineKm()
```

## Repository layout (target)

```
apps/
  server/src/
    app.ts, index.ts, config.ts, errors.ts
    graph/      topology.ts, bfs.ts, dijkstra.ts, packets.ts — no Fastify imports
    routes/     health.ts, network.ts, packetize.ts
  web/src/
    api/        typed fetch client
    sim/        useSimulation reducer, timeline.ts (pure)
    scene3d/    Scene, Ground, ParkingLot, Station, Road, Cars, CameraRig, Labels,
                world.ts (pure layout), westcoast.json
    ui/         FilePanel, SendBar, BfsPanel, NetworkStatus, StatusBanner, ViewToggle, Legend
packages/shared/src/
  schemas.ts, limits.ts, projection.ts, geo.ts (haversine, shared with web for #31)
docs/
  architecture.md, design/stitch-prompt.md, superpowers/specs/, superpowers/plans/
```

## Key decisions

### 1. Stateless backend

The server holds one fixed topology and stores nothing between requests. The browser owns the
packet plan (from Submit) and playback state.

- Render free instances restart and sleep; server state would vanish mid-demo.
- Concurrent users never affect each other.
- Reset is a client-side state clear.

### 2. Submit and Send are separate

- **Submit** (`/packetize`) only splits bytes into packets and cars.
- **Send** (`/route`) runs BFS. The API still accepts failure sets (`disabledNodeIds`,
  `disabledLinkIds`, frozen contract, demo routes below); the browser sends its current failure sets. Routers and roads can also be toggled during playback; see Live rerouting below.

### 3. Car count scales with file size; real files go to `POST /api/upload`

Files are capped at **10,000,000 bytes (10 MB)**. Packets are 1,500 bytes; the number of cars is
`ceil(size / (10 MB / 24))` clamped to 1–24, about one car per 416.7 KB. A file at the limit
fills all 24 cars, a 5 MB file 12, a 1 MiB file 3, anything under ~417 KB one. `toCarPlan()` in
`packages/shared` is the single implementation, used by the server and the browser.

Dropping (or browsing for) a file in the upload zone streams its bytes to `POST /api/upload`. The
zone says so before anything is sent: "sent to our Oregon server, hashed, then deleted (never
stored)". The server feeds the bytes to an incremental SHA-256 and a byte counter, then discards
them: no disk, no database, no logging of contents or file name. It replies with the measured
size and the car plan; the browser compares the hash with its own (`crypto.subtle`). Presets and
messages are simulated locally with the same plan and never leave the browser. Real bytes take
whatever internet path ISPs choose; the cars show an illustrative BFS route.

### 4. BFS on a geographic map

BFS minimizes **hop count**, not distance. Real routers weigh links (OSPF/IS-IS costs, BGP
policy). We keep BFS and design the topology so fewest-hop routes look sensible on the map:

- No long cross-region shortcut links in the default network (unit-tested invariant).
- ≥ 2 station-disjoint routes CSULB → Oregon so a single failure always has a detour.
- UI note: "BFS picks fewest hops, not shortest distance."
- Links carry `distanceKm` for display and the Dijkstra stretch goal.

### 5. Shared contract via TypeBox

`packages/shared` defines every request/response once. Fastify validates and serializes with the
JSON Schema; both apps import the derived TS types. `project(lat, lon)` also lives here so the
scene and the timeline place nodes identically.

### 6. Algorithms isolated from HTTP

`graph/` exports pure functions (`findRoute`, `toCarPlan`; `haversineKm` lives in shared). Routes only validate,
call, and shape. All algorithm tests run without HTTP.

### 7. Determinism

Fixed topology, BFS neighbors sorted by ID, deterministic packet distribution. Same inputs →
same route and same cars for the same algorithm/settings, every presentation. Departure gaps
and cruising speeds vary between sends; every group still follows the chosen route.

### 8. One pure timeline

`sim/timeline.ts` turns `(visitOrder, linkPath, cars, speed)` into timed events. Both
`scene3d/` renders from it, and timing is unit-testable without WebGL.

### 9. 3D rendering rules

- React Three Fiber + drei. Scene state comes from React; **per-frame motion does not.**
  `<Cars>` uses `useFrame` + refs to update instanced matrices. Never `setState` per frame.
- Ground: Natural Earth (public domain) outlines of the West Coast and interior states (CA, OR,
  WA, NV, ID plus AZ, UT, MT, WY, CO, NM and northern Mexico for context), simplified with
  mapshaper, committed as `westcoast.json`, extruded flat. The land reaches lon −104 so the east
  (desert) corridor sits well inside the map. Equirectangular projection; distortion is
  negligible at this scale.
- Scenery (`scene3d/scenery.ts`, pure and unit-tested): a biome map paints the land texture
  (forest, coast, chaparral, Central Valley fields, Mojave, Great Basin, high desert, red rock);
  hand-placed ranges and volcanoes, lakes, instanced pines, broadleaf trees, shrubs, cacti and
  rocks per biome. Nothing is placed on a road,
  station or lot. Decorative only: BFS ignores terrain.
- Models: Kenney Car Kit sedan for the packet cars and Kenney City Kit (Suburban) houses for the
  station towns (CC0, `apps/web/public/models/`), loaded once per file by `scene3d/models.tsx`.
  Component props are unchanged. Each component keeps its procedural primitive as the fallback,
  shown while a model loads and kept if it fails. Cars stay one drei `<Instances>` per part: the
  sedan is split into paint (tinted per car), trim and wheels. Station towns switch to their primitive
  boxes beyond 220 units from the camera (drei `<Detailed>`), so the overview stays cheap. Lots, stations, roads and scenery
  are still primitives. Sources recorded in `apps/web/ASSETS.md`.
- 3D keeps true geography (no 68° rotation, no Los Angeles spread); the camera does the framing.
  Lots extend inland (east) of their gate so they never sit in the ocean.

### 10. 3D only

The 2D SVG view was removed: the 3D scene is the only map. Without WebGL (or if the scene
crashes) the map area explains why, and the sidebar still works: upload, Submit, Send, and the
route card. Playwright covers the 3D view (`apps/web/e2e/`).

## Network topology (fixed)

27 nodes, 35 roads. Real places at approximate city coordinates; links are hand-picked and
illustrative. Source of truth is `apps/server/src/graph/topology.ts`; a test keeps it equal to these tables. Link ID =
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
| `barstow`       | Barstow             | router | Barstow, CA         | 34.8958 | -117.0173 |
| `las-vegas`     | Las Vegas           | router | Las Vegas, NV       | 36.1699 | -115.1398 |
| `tonopah`       | Tonopah             | router | Tonopah, NV         | 38.0672 | -117.2301 |
| `winnemucca`    | Winnemucca          | router | Winnemucca, NV      | 40.973  | -117.7357 |
| `boise`         | Boise               | router | Boise, ID           | 43.615  | -116.2023 |
| `ontario`       | Ontario             | router | Ontario, OR         | 44.0266 | -116.9629 |
| `burns`         | Burns               | router | Burns, OR           | 43.5862 | -119.0541 |
| `pendleton`     | Pendleton           | router | Pendleton, OR       | 45.6721 | -118.7886 |
| `oregon-dc`     | US-West Data Center | server | Boardman, OR        | 45.8399 | -119.7006 |

Roads: csulb–lb-isp, csulb–el-segundo, lb-isp–la-wilshire, lb-isp–riverside,
la-wilshire–bakersfield, riverside–bakersfield, el-segundo–slo, bakersfield–fresno,
slo–san-jose, fresno–sacramento, san-jose–oakland, oakland–sacramento, oakland–redding,
sacramento–redding, sacramento–reno, reno–klamath-falls, redding–medford,
medford–klamath-falls, medford–eugene, klamath-falls–bend, eugene–bend, eugene–portland,
bend–oregon-dc, portland–oregon-dc, riverside–barstow, barstow–las-vegas, las-vegas–tonopah,
tonopah–winnemucca, reno–winnemucca, winnemucca–boise, boise–ontario, ontario–pendleton,
pendleton–oregon-dc, bend–burns, burns–ontario. Longest: reno–klamath-falls, 342 km.

Two station-disjoint corridors: **coast** (El Segundo → SLO → San Jose → Oakland → Redding →
Medford → Eugene) and **inland** (LB ISP → LA/Riverside → Bakersfield → Fresno → Sacramento →
Reno → Klamath Falls). No single station failure disconnects CSULB from Oregon. A third, longer
**east** (desert) corridor follows the I-15, US-95, I-84 and US-20 long-haul routes: Riverside →
Barstow → Las Vegas → Tonopah → Winnemucca → Boise → Ontario → Pendleton, with cross-links
Reno–Winnemucca and Bend–Burns–Ontario. At 10 hops BFS never picks it over the 9-hop default (it
is the BFS route only when both western corridors are cut, which only the API can request).

### Demo routes (asserted in tests)

BFS neighbors are sorted by code-unit string order (not `localeCompare`), so routes never depend
on server locale.

| Failures                             | Route                                                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| none                                 | csulb → el-segundo → slo → san-jose → oakland → redding → medford → eugene → bend → oregon-dc (9 hops)                      |
| station `oakland`                    | csulb → lb-isp → la-wilshire → bakersfield → fresno → sacramento → reno → klamath-falls → bend → oregon-dc                  |
| road `oakland--redding`              | csulb → el-segundo → slo → san-jose → oakland → sacramento → reno → klamath-falls → bend → oregon-dc                        |
| `sacramento` + `redding`             | csulb → lb-isp → riverside → barstow → las-vegas → tonopah → winnemucca → boise → ontario → pendleton → oregon-dc (10 hops) |
| `sacramento` + `redding` + `barstow` | none — BFS explores 10 stations, "No route available"                                                                       |
| start at `sacramento`                | sacramento → reno → klamath-falls → bend → oregon-dc                                                                        |

### Packetization examples

| Input               | Packets | Cars | Notes                       |
| ------------------- | ------- | ---- | --------------------------- |
| 1 B                 | 1       | 1    |                             |
| 12,000 B            | 8       | 1    | under one car's 416.7 KB    |
| 1 MiB (1,048,576 B) | 700     | 3    | 234, 233, 233 packets       |
| 5,000,000 B         | 3,334   | 12   |                             |
| 10,000,000 B        | 6,667   | 24   | the limit fills all 24 cars |

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

`noRoute` occurs if a new Send cannot reach the destination. During live rerouting, individual
stranded groups instead enter `blocked`; restoring connectivity resumes them automatically.

### Live failures, retries and timing

The browser owns failure sets and calls the existing stateless `/route` API from the sender,
and (on restoration) from each distinct next-router anchor. Requests with the same start share a reply.
Only **router hardware and router labels** are clickable on the 3D map. Roads are not clickable;
road failures use the sidebar switches. Town scenery, visit rings and pass effects do not toggle
routers. Endpoints cannot be disabled. The clock freezes immediately during API requests;
Reset/new input invalidates pending replies and the user's pause setting is preserved.

This is a simplified **progress-aware routing model**, not OSPF or a physical network measurement.
Router crossing times come from the same eased, curved movement used by the 3D renderer. A router
failure interrupts groups that have not passed it (including a group exactly at the router).
A road failure interrupts groups still on or approaching that road; a road is completed at its
far endpoint. Groups already past the failed element continue unchanged, even when the sender
no longer has a route. Only affected groups retry from their sender slot, excluding all outages.
Delivered groups keep their positions and arrival timestamps.

When a connection reopens, queued/blocked groups choose the current best sender route. Moving
groups finish their current road, then follow the selected algorithm's best route from the next
router. Their already-travelled prefix and movement up to that junction remain unchanged; this
is not a retry and does not reset travel time or add a retry count. A route only returns to the
original corridor when it is optimal and reachable from that group’s next router. There is no
forced teleport/backtrack to the original source route. BFS minimizes remaining hops; Dijkstra
minimizes remaining configured cost, with the same bandwidth settings as the initial Send.

Orange roads are the union of **remaining** paths for moving/queued groups, including their
current road. Segments disappear after every group clears them; old completed routes and blocked
groups do not keep them orange. An online outgoing road may remain orange even if its starting
router failed after a car already left it. Offline styling takes precedence on failed elements.
The route card describes the latest calculated best **sender** route, not one shared hop count
for every group after a live update. The timing table reports completed hops across attempts and
remaining hops on each current route.

If no source-to-destination path exists, affected groups remain at their sender slots with
`blocked` status. A red **No route — transfer incomplete** notice identifies pending groups;
the total is not reported as a completed transfer. A Send that starts disconnected also has a
blocked plan for every group, so map counts and sidebar counts cannot disagree. Restoring a
connection automatically releases blocked groups and reoptimizes the other unfinished groups. Renderer, footer, totals and table share the
same `carStatus()` function. Source/destination labels display current waiting/delivered counts;
blocked groups have red beacons/halos at the sender.

Timing uses **simulation seconds**, not network latency or upload speed. Per-group active travel
time sums the active portions of its attempts and excludes blocked waits and pre-departure
queues. Its timer freezes while blocked and after arrival. Overall transfer run time is one
shared clock, excluding the initial BFS replay, HTTP calls, pauses and periods where every
group is delivered or blocked. It resumes after restoration. Concurrent group durations are
not summed. The estimated total is unknown while any group has no route; final completion time
is shown only once every group is delivered. Playback speed changes wall-clock playback duration,
not these units. Packet-level transmission, actual OSPF convergence and reassembly processing
time are not measured.

### BFS and configurable Dijkstra routing

The routing selector uses one UI with two explicit modes; editing bandwidth never switches the
algorithm automatically. BFS remains the default and minimizes hops, ignoring bandwidth.
Dijkstra minimizes the sum of configured link costs. Each road defaults to **1000 Mbps** and
can be edited only to **10, 100 or 1000 Mbps** (validated in the browser and API). Cost is
`1000 / Mbps`, giving costs 100, 10 and 1 respectively. All roads are modeled as bidirectional
with the same configured bandwidth in each direction. Distance remains geographic display data;
it is not mixed into the cost. This is an educational metric inspired by bandwidth-based OSPF
cost, not a full OSPF implementation or a measurement of congestion, latency or throughput.

Routing and bandwidth can be edited in idle/loaded/completed/no-route states, and are locked
while a transfer is active, blocked or recovering from a live API error. Online/offline controls
still work during playback. Changes apply to the next Send. Switching algorithms clears the previous route/run while
keeping the submitted file and stored Dijkstra settings for comparison. BFS hides all bandwidth
controls and total route cost; Dijkstra shows the Mbps editor and cost. Reset clears the transfer and failures but preserves the
selected mode/bandwidths for comparison. A separate Reset bandwidths button restores 1000 Mbps.
Settings are local to this browser session and are sent per request, never stored on the server.

Dijkstra is a pure deterministic algorithm in `apps/server/src/graph/dijkstra.ts`: candidates
settle by cumulative cost, then hops and code-unit node ID. The fixed graph is small, so the
implementation uses O(V² + E) scanning. The response trace records settled nodes and cumulative
costs; the UI calls it **Settled order**, rather than a FIFO queue. Every group follows the returned route in both modes. BFS shows hops only in the route card;
Dijkstra additionally shows total route cost. The former random alternate-route traffic is disabled.
Live failure retries use the selected algorithm and the same configured bandwidths. Animation
speed and travel-time estimation still use the existing simulation clock and geometry; Mbps
affects route choice in ordinary runs. In the optional Dijkstra congestion demo, groups depart
together and queue in arrival order on one selected road if the chosen route uses it.
Each group occupies the road for its size in bits divided by the configured bits per second.
The timeline holds the group at the upstream station during its wait and transmission, then
resumes the existing motion. Transfer timing reports queue waits separately. The network stays
fixed during demo playback, and a route that bypasses the selected road adds no queue delay.

The v2 extension is optional and backward compatible: `/api/route` accepts `algorithm` (`bfs`
or `dijkstra`) and `linkBandwidthMbps` (at most 64 known road IDs mapped to the three allowed
values). Existing requests keep the exact four-field BFS response. Requests explicitly supplying
routing settings also receive `algorithm` and `totalCost` (null if unreachable); Dijkstra trace
steps add optional `cost`. Unknown road IDs, invalid keys, unsupported modes and invalid Mbps
are rejected. Deploy the extended API before a frontend that sends the new optional fields.

## Playback

`sim/timeline.ts` is pure: it turns cars and routes into departure and arrival times at a
simulation time `t`, using distances from the shared projection.

- **One clock.** `useSimulation` advances `t` by real elapsed time times the playback speed
  (0.25×, 0.5×, 1×, 2×). Speed changes mid-flight are smooth and Pause stops the clock. Slowing
  down exists so a class can watch packets that would otherwise arrive instantly.
- **Phases.** `/route` returns, then `t` first replays the BFS visit order (searching), then cars
  leave the CSULB lot one after another (driving) and park in the destination lot (delivered).
  An unreachable result ends after the search replay (noRoute).
- **Packetize.** Uploaded files get their plan from `POST /api/upload`; presets and messages use
  `sim/packetize.ts`, which validates and calls the same shared `toCarPlan()`. The
  `packetizing` state is instantaneous and never shown.
- **Every group follows the chosen route** (`sim/plan.ts`): BFS uses the returned fewest-hop
  path; Dijkstra uses the returned minimum-cost path. No groups are randomly assigned alternate
  routes. This keeps the map animation consistent with the route card and algorithm comparison.
  An unreachable answer plans no driving; failed groups remain at the sender.
- **Natural traffic.** Departure gaps vary (0.55–1.45 × `CAR_STAGGER_SEC`) and each car cruises
  at its own speed (±12 %). Speeds are handed out fastest first, so no car drives through a
  slower one on the shared road out of the CSULB lot. Without an `rng` the timeline is fully
  deterministic.

## Playback (3D)

`scene3d/` renders the same run from the same inputs: network, BFS sets, and the
`Timeline` from `sim/timeline.ts`. `useSimulation` exposes `timeline` and a read-only `clockRef`;
3D components read the clock inside `useFrame`, so no React state changes per frame.

- **Pure layout.** `scene3d/world.ts` (no three.js imports, unit-tested) places stations with
  `project()`, bows each road into a slight quadratic arch, lays out 24-slot lots, and builds
  each car's path: slot → aisle → CSULB gate → its route's road curves (reversed when a road is
  driven target → source) → Oregon gate → slot. A car's progress is
  `(t − departAt) / (arriveAt − departAt)` from the shared timeline, so the sidebar counts and
  the cars always agree.
- **Natural turns.** Every corner of a car's path (slot exits, lot gates, stations) is rounded
  with a fillet of up to `TURN_RADIUS`. A speed profile from the path's curvature makes cars
  brake into turns and accelerate out (rate-limited), while still leaving and arriving at the
  timeline's times. Heading points rear axle → front axle; the body leans out of turns and
  pitches with acceleration (wheels stay flat).
- **Search.** A station's ring fires at `visitIndex × BFS_STEP_SEC`, the same clock the BFS
  panel uses. Labels show "BFS depth N" while searching.
- **Route stations.** Stations are drawn 1.5× their design size. `passTime()` in `world.ts`
  gives the sim time each car drives past each station on its route; from the first pass the station
  shows a light column in the route colour, and every pass fires a gold shockwave ring and a
  beacon flash.
- **Cars.** One drei `<Instances>` per car part (body, glass, wheels, lights, stalk, halo,
  beacon): seven draw calls for 24 cars. Beacons on a stalk above each car scale with camera
  distance, and driving cars get a pulsing ground halo in their colour, so cars stay visible in
  the overview.
- **Labels.** Plain DOM in a layer over the canvas, projected and decluttered by priority each
  frame (lots > route > visited > idle).
- **Camera.** `CameraRig` modes: Auto (lot after Submit, overview while searching, chase the
  lead car while driving, Oregon lot when delivered), Overview, Follow lead car. Any drag or
  scroll switches to Free. The sun's shadow box follows the orbit target.
- **Fallback.** three.js loads lazily. Without WebGL, or if the scene throws (error boundary),
  the map area shows an explanation and the sidebar keeps working.

## API contract

Base path `/api`. JSON bodies. Source of truth: `packages/shared/src/schemas.ts`.

> **Frozen (v2, 2026-11-02).** Build against these shapes. A breaking change needs a PR approved
> by the contract owner and an announcement in the team channel. Mock responses for every
> endpoint: [`packages/shared/mocks/`](../packages/shared/mocks/README.md).

Outside the base path: `GET /` returns `{ "message": "Welcome to Network Simulator", "docs": "/docs", "health": "/api/health" }`; `/docs` serves Swagger UI and `/docs/json` the OpenAPI document.

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

### `POST /api/upload` — upload a file (≤ 10 MB)

Request: `Content-Type: application/octet-stream`, raw bytes streamed (never buffered); optional
URI-encoded `X-File-Name` header (display only, never logged or stored).

```json
{
  "fileName": "essay.pdf",
  "bytesReceived": 1048576,
  "size": "1.05 MB",
  "limitBytes": 10000000,
  "underLimit": true,
  "sha256": "<64 hex chars>",
  "receivedAt": "2026-10-20T12:00:00.000Z",
  "region": "oregon",
  "packetSizeBytes": 1500,
  "packetCount": 700,
  "carCount": 3,
  "cars": [{ "id": "car-0", "seq": 0, "firstPacket": 0, "lastPacket": 233, "bytes": 351000 }],
  "summary": "essay.pdf is 1.05 MB (under the 10 MB limit): 700 packets in 3 cars."
}
```

In Swagger UI (`/docs`) the body is a file picker: **Try it out → choose a file → Execute** shows
exactly the JSON the web app receives. The binary body, `X-File-Name` header and 400/413/429
error shapes are documentation only (the handler reads the raw stream itself).

Bytes are hashed and discarded. `cars` follows the size-based plan (decision 3); 413
`PAYLOAD_TOO_LARGE` over 10,000,000 bytes (counted while streaming, not only `Content-Length`),
400 when empty, 429 after ~10 uploads per minute per IP.

### Errors

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "body/sizeBytes must be <= 10000000" } }
```

| Status | Code                | When                                          |
| ------ | ------------------- | --------------------------------------------- |
| 400    | `VALIDATION_ERROR`  | Schema violation (type, length, extra fields) |
| 400    | `UNKNOWN_ID`        | Node/link ID not in topology                  |
| 400    | `VALIDATION_ERROR`  | `/upload` with an empty body                  |
| 404    | `NOT_FOUND`         | Unknown route                                 |
| 413    | `PAYLOAD_TOO_LARGE` | `/upload` body over 10 MB                     |
| 429    | `RATE_LIMITED`      | `/upload` over ~10 per minute per IP          |
| 500    | `INTERNAL_ERROR`    | Unhandled error (logged, not returned)        |

### Limits

| Limit                 | Value        |
| --------------------- | ------------ |
| Message               | 1–140 chars  |
| File name             | 1–255 chars  |
| File size             | 1 B – 10 MB  |
| Packet size           | 1,500 B      |
| Max cars per transfer | 24           |
| Disabled IDs per list | 64           |
| Request body (JSON)   | 16 KiB       |
| Upload body           | 10,000,000 B |
| Uploads per IP        | ~10 / min    |

## Configuration

| Var            | App    | Default                 | Notes                                  |
| -------------- | ------ | ----------------------- | -------------------------------------- |
| `PORT`         | server | `3001`                  | Render sets it                         |
| `HOST`         | server | `0.0.0.0`               |                                        |
| `CORS_ORIGIN`  | server | `http://localhost:5173` | Comma-separated allowed origins        |
| `LOG_LEVEL`    | server | `info`                  | Pino level                             |
| `LOG_FORMAT`   | server | `pretty`                | `pretty` or `json`                     |
| `VITE_API_URL` | web    | empty                   | Empty in dev (Vite proxy). Build-time. |

No secrets.

## Deployment (Render)

`render.yaml` defines `netsim-api` (Node, region **oregon**, health check `/api/health`) and
`netsim-web` (static site, SPA rewrite). After creating the Blueprint:

1. `netsim-web` → `VITE_API_URL` = API URL, redeploy (build-time variable).
2. `netsim-api` → `CORS_ORIGIN` = static site URL.

Free API instances sleep when idle; first request can take ~30–60 s. Warm up before presenting.
The web app handles this itself: it downloads the 3D map chunk in parallel with `GET /api/network`,
shows a loading screen (`ui/LoadingScreen.tsx`) that explains the wake-up after 4 s, and retries
connection failures and 502/503/504 with backoff for up to 2 minutes (`api/wake.ts`) before showing
the error banner.

## Testing

The partial-delivery/outage browser regression pauses the real simulation and seeks to a
partial arrival through the development-only `window.__packetHighway` clock hook. It then
checks actual rendered car positions, delivery counts and frozen timers. Demand rendering
avoids waiting for hundreds of software-WebGL frames on CI; the hook is absent in production.
CI runs browser tests with one worker so software-WebGL scenes do not compete for the runner CPU.
Live failure tests wait for the route response before checking the rendered update.

| Layer      | Tool                      | Covers                                                                |
| ---------- | ------------------------- | --------------------------------------------------------------------- |
| Algorithms | Vitest                    | BFS, topology invariants, `fromNodeId`, packetization math, haversine |
| API        | Vitest + `inject()`       | Endpoints, validation, error codes                                    |
| Sim        | Vitest                    | Reducer transitions, single-route group plans, timeline ordering      |
| E2E        | Playwright (CI job `e2e`) | `e2e/`: upload → cars, Submit → Send, camera release, no-WebGL notice |
| 3D         | Manual checklist + smoke  | `docs/3d-checklist.md`; `e2e/scene3d.spec.ts` (non-blank, fallback)   |

## Implementation status

| Area                                   | Status                                            |
| -------------------------------------- | ------------------------------------------------- |
| Monorepo, CI, Render blueprint         | Done                                              |
| Shared contract, error handling        | Done (v2; freeze pending #4)                      |
| BFS + tests                            | Done on West Coast topology; demo routes asserted |
| 2D SVG view                            | Removed; 3D is the only map                       |
| West Coast topology, lat/lon, distance | Done; east desert corridor added (27 / 35)        |
| `POST /api/upload` + drag-and-drop UI  | Done (size-based car plan)                        |
| `/packetize`, `fromNodeId`             | To do (web packetizes client-side meanwhile)      |
| `sim/` hook + timeline                 | Done (`useSimulation`, `timeline.ts`)             |
| 3D scene, cars, camera                 | Done (Kenney cars and towns, primitive fallback)  |
| E2E tests (Playwright, CI job `e2e`)   | Done                                              |
| Component tests                        | To do                                             |

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

1. Abrupt packet loss/retransmission (live failure retries are implemented above).
2. Distance/latency routing metrics (bandwidth-cost Dijkstra and BFS comparison are implemented).
3. Guided demo mode.
4. Follow-car camera polish, day/night lighting.
