# Packet Highway — Network Route Simulator

Submit a file at the **CSULB parking lot**. It is split into packets, shown as 3D **cars**.
Press **Send**: breadth-first search explores a West Coast network of **stations** (routers),
then the cars drive the chosen route to the **US-West Data Center, Oregon** lot. Break stations
or roads and send again to watch it reroute.

> **Educational simulation only.** Stations are nodes in an in-memory graph; the network is
> illustrative, not real ISP topology. The app does not inspect, control, or route real network
> traffic. By default file contents never leave your browser — only name and size are sent. If you
> tick the opt-in checkbox, the bytes (≤ 10 MB) are streamed to our Oregon server, hashed, and
> immediately deleted — never stored. Real bytes take whatever internet path ISPs choose; the cars
> show an illustrative BFS route.

**Stack:** React + TypeScript (Vite) · Three.js via React Three Fiber · Fastify + TypeScript ·
shared TypeBox contract · npm workspaces · Render.

## Quick start

Requires Node 20.19+ (22 recommended, see `.nvmrc`).

```bash
npm install
npm run dev
```

- Web: http://localhost:5173
- API: http://localhost:3001/api/health

`npm run dev` builds the shared package, then runs three processes: shared `tsc --watch`, API
(`tsx watch`), and Vite. Vite proxies `/api` to port 3001, so no env setup is needed locally.

Optional: copy `apps/server/.env.example` → `apps/server/.env` and
`apps/web/.env.example` → `apps/web/.env` to override defaults.

## Scripts (root)

| Command                | Does                                              |
| ---------------------- | ------------------------------------------------- |
| `npm run dev`          | All apps in watch mode                            |
| `npm run build`        | Build shared → server → web                       |
| `npm test`             | Vitest (BFS unit + API integration tests)         |
| `npm run typecheck`    | `tsc --noEmit` in every package                   |
| `npm run lint`         | ESLint                                            |
| `npm run format`       | Prettier write                                    |
| `npm run format:check` | Prettier check                                    |
| `npm run check`        | lint + format:check + typecheck + test (pre-push) |

Per-package: `npm run <script> -w @netsim/server` (or `@netsim/web`, `@netsim/shared`).

## Layout

```
apps/server      Fastify API (topology, BFS, packetization)
apps/web         React UI: 3D scene (scene3d/), 2D fallback (view2d/), sim state + timeline (sim/)
packages/shared  API schemas, types, limits, lat/lon projection (used by both apps)
docs/            architecture.md, design spec, implementation plans, Stitch UI prompt
render.yaml      Render deployment blueprint
```

## Architecture

See **[docs/architecture.md](docs/architecture.md)** for diagrams, design decisions, the full API
contract, error codes, limits, config, and deployment details. Summary:

- **Two steps.** Submit → `/packetize` splits the file into ≤ 24 cars. Send → `/route` runs BFS
  against current failures, then search animation, then cars drive.
- **Stateless API.** Server holds one fixed topology. Browser holds cars and disabled
  stations/roads. Survives Render restarts; concurrent users do not collide.
- **BFS = fewest hops,** not shortest distance. Topology is designed so fewest-hop routes look
  sensible on the map.
- **One contract.** `packages/shared` TypeBox schemas drive Fastify validation _and_ TS types in
  both apps.
- **Pure algorithms.** `apps/server/src/graph/` has no HTTP code; tested directly.
- **Deterministic.** Fixed topology, sorted neighbor order. Same input → same route, every demo.
- **3D + 2D.** React Three Fiber scene with an SVG fallback (no WebGL, reduced motion, keyboard
  and screen-reader use). Both render from one pure timeline.

### API at a glance

| Method | Path             | Purpose                                                                                                                      |
| ------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/health`    | Liveness for Render                                                                                                          |
| GET    | `/api/network`   | Stations/lots (lat/lon), roads (`distanceKm`), client/server IDs                                                             |
| POST   | `/api/packetize` | Submit: `{ source: "file", fileName, sizeBytes }` or `{ source: "message", message }` → packets + cars                       |
| POST   | `/api/route`     | Send: `{ fromNodeId?, disabledNodeIds, disabledLinkIds }` → `visitOrder`, `path`, `linkPath`                                 |
| POST   | `/api/upload`    | Opt-in real upload: raw bytes (≤ 10 MB, streamed) → `bytesReceived`, `sha256`, `receivedAt`, `region`; hashed then discarded |

Errors: `{ "error": { "code", "message" } }` (incl. `PAYLOAD_TOO_LARGE` 413, `RATE_LIMITED` 429).

## Deployment

Render → **New → Blueprint** → select this repo. Then in the dashboard:

1. `netsim-web` → set `VITE_API_URL` = API URL (e.g. `https://netsim-api.onrender.com`),
   redeploy.
2. `netsim-api` → set `CORS_ORIGIN` = static site URL.

No secrets. Free API instance sleeps when idle; warm it up before presenting.

## Contributing

1. Branch from `main`: `feat/<short-name>` or `fix/<short-name>`.
2. Contract change? Edit `packages/shared/src/schemas.ts` first, then fix both apps until
   `npm run typecheck` passes.
3. Run `npm run check` before pushing. CI runs the same plus `build`.
4. Open a PR; one reviewer approval to merge.

## Design docs

- [Design spec](docs/superpowers/specs/2026-10-19-3d-packet-highway-design.md) — decisions,
  contract, state machine, team ownership, stretch goals.
- [Implementation plans](docs/superpowers/plans/README.md) — one plan per subsystem, owner and
  week. Start with Plan 1.
- [Stitch UI prompt](docs/design/stitch-prompt.md) — paste into Google Stitch for mockups.

## Status

Foundation done: monorepo, CI, Render blueprint, shared contract, BFS with tests, 2D SVG view
with send/reset and toggles on a 9-node demo graph. The v1 code still uses `x/y` nodes and
`message` on `/route`.

Next ([Plan 1](docs/superpowers/plans/2026-10-19-plan-1-contract-backend-v2.md)): West Coast
topology (19 stations, see [architecture](docs/architecture.md#network-topology-fixed)),
`/packetize`, `fromNodeId`; then `sim/` reducer and timeline,
3D scene and cars, component and E2E tests. See the status table in
[docs/architecture.md](docs/architecture.md#implementation-status).
