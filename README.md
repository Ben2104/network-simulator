# Packet Highway — Network Route Simulator

Submit a file at the **CSULB parking lot**. It is split into packets, shown as 3D **cars**.
Choose **BFS** (fewest hops), **Dijkstra** (lowest configured cost) or **BGP** (illustrative AS policy), then press **Send** to search the West Coast network of **stations** (routers),
then the cars drive the chosen route to the **US-West Data Center, Oregon** lot. Click routers (or use sidebar road switches) to switch connections offline, even while groups are driving, and watch only groups that have not passed the failure retry from the sender. Groups already past it continue. Restore connections to release blocked groups and reoptimize moving groups from their next router. Orange roads track remaining group paths. The Transfer timing card shows simulated group and total completion times.

> **Educational simulation only.** Stations are nodes in an in-memory graph; the network is
> illustrative, not real ISP topology. The app does not inspect, control, or route real network
> traffic. Presets and messages never leave your browser. A file you drag into the upload zone
> (≤ 10 MB) is streamed to our Oregon server, hashed, and immediately deleted — never stored. Real
> bytes take whatever internet path ISPs choose; the cars show an illustrative BFS route.

## Live

- Website: https://network-simulator-xi.vercel.app/
- API docs (Swagger UI): https://network-simulator-xf2s.onrender.com/docs

The API runs on Render's free tier, so the first request after idle can take about a minute.

**Stack:** React + TypeScript (Vite) · Three.js via React Three Fiber · Fastify + TypeScript ·
shared TypeBox contract · npm workspaces · Render (API) · Vercel (web).

## Routing comparison

Select **Dijkstra**, then use **Live network → Roads → Edit** to choose **10 / 100 / 1000 Mbps**.
Cost is `1000 / Mbps`. BFS ignores these costs; Dijkstra minimizes their total. Edit between
transfers and press Send again to compare routes. Both algorithms send every group along their selected route. BFS hides bandwidth/cost controls;
Dijkstra shows them. Switching modes preserves stored Dijkstra bandwidth settings. These settings affect path selection, not animation speed or measured network latency.

Select **BGP** to route through six invented Autonomous Systems instead. Business policy decides
first (customer routes beat peer routes, which beat paid-provider routes), then the shortest AS
path; the same bandwidth costs only pick roads inside each AS. On the healthy network BGP takes the
10-hop desert route because SoCal Metro prefers its free peer over its paid provider. The AS map
and agreements are in `packages/shared/src/bgp.ts` and `docs/architecture.md`.

## Quick start

**Prerequisites:** Node 22 (see `.nvmrc`; 20.19+ also works) and npm.

```bash
nvm use                                          # picks the version from .nvmrc
npm install
cp apps/server/.env.example apps/server/.env     # optional: defaults work locally
cp apps/web/.env.example apps/web/.env           # optional
npm run dev
npm run check                                    # before pushing: lint, format, types, tests
```

- Web: http://localhost:5173
- API: http://localhost:3001 (welcome message), http://localhost:3001/docs (Swagger UI)

`npm run dev` builds the shared package, then runs three processes: shared `tsc --watch`, API
(`tsx watch`), and Vite. Vite proxies `/api` to port 3001, so no env setup is needed locally.
Every env variable each app reads is listed, with a comment, in its `.env.example`.

## Scripts (root)

| Command                           | Does                                              |
| --------------------------------- | ------------------------------------------------- |
| `npm run dev`                     | All apps in watch mode                            |
| `npm run build`                   | Build shared → server → web                       |
| `npm test`                        | Vitest (BFS unit + API integration tests)         |
| `npm run typecheck`               | `tsc --noEmit` in every package                   |
| `npm run lint`                    | ESLint                                            |
| `npm run format`                  | Prettier write                                    |
| `npm run format:check`            | Prettier check                                    |
| `npm run check`                   | lint + format:check + typecheck + test (pre-push) |
| `npm run test:e2e -w @netsim/web` | Playwright: upload, 3D smoke, no-WebGL fallback   |

Per-package: `npm run <script> -w @netsim/server` (or `@netsim/web`, `@netsim/shared`).

## Layout

| Path              | Contents                                                                        |
| ----------------- | ------------------------------------------------------------------------------- |
| `apps/server`     | Fastify API (topology, BFS, packetization)                                      |
| `apps/web`        | React UI: 3D scene (`scene3d/`), upload and sidebar (`ui/`), sim state (`sim/`) |
| `packages/shared` | API schemas, types, limits, lat/lon projection (used by both apps)              |
| `docs/`           | `architecture.md`, design spec, implementation plans, Stitch UI prompt          |
| `render.yaml`     | Render deployment blueprint                                                     |

The API contract lives in `packages/shared/src/schemas.ts` and is described in
[docs/architecture.md](docs/architecture.md#api-contract).

## Architecture

See **[docs/architecture.md](docs/architecture.md)** for diagrams, design decisions, the full API
contract, error codes, limits, config, and deployment details. Summary:

- **Two steps.** Upload (`/upload`, ≤ 10 MB) or a preset splits the file into cars by size:
  10 MB fills 24 cars, smaller files proportionally fewer. Send → `/route` runs BFS,
  then search animation, then every group follows the route selected by BFS, Dijkstra or BGP.
- **Stateless API.** Server holds one fixed topology. Browser holds cars and playback state.
  Survives Render restarts; concurrent users do not collide.
- **BFS = fewest hops,** not shortest distance. Topology is designed so fewest-hop routes look
  sensible on the map.
- **One contract.** `packages/shared` TypeBox schemas drive Fastify validation _and_ TS types in
  both apps.
- **Pure algorithms.** `apps/server/src/graph/` has no HTTP code; tested directly.
- **Deterministic.** Fixed topology, sorted neighbor order. Same input → same BFS route, every demo. Every group follows the route returned by the selected algorithm. Cars leave at varied gaps and speeds.
- **3D.** React Three Fiber scene driven by one pure timeline; without WebGL the map explains why
  and the sidebar still works.

### API at a glance

| Method | Path             | Purpose                                                                                                                      |
| ------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/health`    | Liveness for Render                                                                                                          |
| GET    | `/api/network`   | Stations/lots (lat/lon), roads (`distanceKm`), client/server IDs                                                             |
| POST   | `/api/packetize` | Submit: `{ source: "file", fileName, sizeBytes }` or `{ source: "message", message }` → packets + cars                       |
| POST   | `/api/route`     | Send: `{ fromNodeId?, disabledNodeIds, disabledLinkIds }` → `visitOrder`, `path`, `linkPath`                                 |
| POST   | `/api/upload`    | Opt-in real upload: raw bytes (≤ 10 MB, streamed) → `bytesReceived`, `sha256`, `receivedAt`, `region`; hashed then discarded |

Errors: `{ "error": { "code", "message" } }` (incl. `PAYLOAD_TOO_LARGE` 413, `RATE_LIMITED` 429).

### API docs and logs

- `GET /` returns a welcome message with links to `/docs` and `/api/health`.
- `/docs` is a Swagger UI generated from the route schemas; the raw OpenAPI document is at `/docs/json`.
- To see what the web app gets for a real file, open `/docs` → `POST /api/upload` → **Try it out**,
  pick a file and **Execute**. The response is the same JSON the upload zone receives.
- Logs are pretty-printed by default, one line per request. Set `LOG_FORMAT=json` for raw JSON
  lines; `LOG_LEVEL` still applies.

```
$ curl localhost:3001/
{"message":"Welcome to Network Simulator","docs":"/docs","health":"/api/health"}

[13:44:41] INFO: incoming request
    reqId: "req-1"
    req: { "method": "GET", "url": "/", ... }
[13:44:41] INFO: request completed
    reqId: "req-1"
    res: { "statusCode": 200 }
    responseTime: 2.87
```

## Deployment

The **API** runs on Render (`render.yaml`, native Node service). The **front end** runs on Vercel
through Vercel's own git integration; this repo's workflows do not deploy it. See the one-time
setup under Contributing. No secrets in the repo. Free API instance sleeps when idle; warm it up
before presenting.

## Contributing

1. Branch from `main`: `feat/<short-name>` or `fix/<short-name>`.
2. Contract change? Edit `packages/shared/src/schemas.ts` first, then fix both apps until
   `npm run typecheck` passes.
3. Run `npm run check` before pushing. CI runs the same plus `build`.
4. Open a PR; one reviewer approval to merge. The PR template lists what to confirm.

**CI** (`.github/workflows/ci.yml`) runs on every PR and on push to `main`: job `check`
(lint, format, typecheck, test, build for shared, server and web) and job `e2e` (Playwright in
headless Chromium against the API and web dev servers, browser cached, report and traces uploaded
as the `playwright-report` artifact when it fails) must be green before merge. The two jobs run in
parallel. Runs on `main` are never cancelled; only superseded PR runs are.

**CD** (`.github/workflows/deploy.yml`) runs only after CI succeeds on a push to `main`, never on
PRs. It compares the CI run's head commit with its parent. If `apps/server/**`,
`packages/shared/**`, root `package.json` / `package-lock.json` or `tsconfig.base.json` changed, it
builds shared and server to prove they build, then calls the Render deploy hook for `netsim-api`
(`autoDeployTrigger: off`, so nothing else deploys it). Front-end-only changes deploy nothing from
this workflow; Vercel handles them. CD uses the `production` GitHub Environment and the secret
`RENDER_API_DEPLOY_HOOK`; a missing secret skips the deploy with a notice. Because CD waits for
the whole CI run, a failing `e2e` on `main` blocks the API deploy.

### One-time setup (repo owner)

**Render (API):**

1. Render → **New → Blueprint** → select this repo (creates `netsim-api`).
2. Set `CORS_ORIGIN` to the Vercel site URL (comma-separated for several origins).
3. Service → Settings → Deploy Hook: copy the URL into the `production` environment secret
   `RENDER_API_DEPLOY_HOOK` (GitHub → Settings → Environments).

**Vercel (front end):**

1. Import this repo and leave **Root Directory** blank (the repo root). Build settings, output
   directory and the ignored-build-step check (skips builds when nothing front-end changed) come
   from [`vercel.json`](vercel.json).
2. In the dashboard set only the env var `VITE_API_URL` = the Render API URL (e.g.
   `https://netsim-api.onrender.com`).

Then apply the branch protection below, requiring `check` and `e2e`.

[CODEOWNERS](.github/CODEOWNERS) requests the area owner as reviewer; their approval is not
mandatory.

### Branch protection (repo owner, applied by hand)

Settings → Branches (or Rules) for `main`:

- [ ] Require a pull request before merging, with 1 approval
- [ ] Dismiss stale approvals when new commits are pushed
- [ ] Require conversation resolution before merging
- [ ] Require status checks `check` and `e2e`, and require the branch to be up to date
- [ ] Do not require review from Code Owners
- [ ] Block force pushes and branch deletion
- [ ] Allow squash merge only (Settings → General → Pull Requests)
- [ ] No admin bypass for the first two weeks

## Design docs

- [Design spec](docs/superpowers/specs/2026-10-19-3d-packet-highway-design.md) — decisions,
  contract, state machine, team ownership, stretch goals.
- [Implementation plans](docs/superpowers/plans/README.md) — one plan per subsystem, owner and
  week. Start with Plan 1.
- [Stitch UI prompt](docs/design/stitch-prompt.md) — paste into Google Stitch for mockups.

## Status

Done: monorepo, CI, Render blueprint, shared contract, BFS with tests, the 3D scene, and
`POST /api/upload` with drag-and-drop upload (the 2D view was removed). The shared contract is v2 (lat/lon nodes, `distanceKm` links,
`/packetize` schemas, `fromNodeId` on `/route`, `project()`, `haversineKm()`), and the server
serves the fixed West Coast topology (27 stations, 35 roads). The contract is frozen; mock
responses for frontend and 3D work are in [`packages/shared/mocks/`](packages/shared/mocks/README.md).

Next ([Plan 1](docs/superpowers/plans/2026-10-19-plan-1-contract-backend-v2.md)): West Coast
topology (27 stations, see [architecture](docs/architecture.md#network-topology-fixed)),
`/packetize`, `fromNodeId`; then `sim/` reducer and timeline,
3D scene and cars, component tests. See the status table in
[docs/architecture.md](docs/architecture.md#implementation-status).
