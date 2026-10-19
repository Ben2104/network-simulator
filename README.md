# Network Route Simulator

Send a message from your "computer" to a server through a network of virtual routers. A
breadth-first search finds the route. Break routers or links and watch it reroute.

> **Educational simulation only.** Routers are nodes in an in-memory graph. The app does not
> inspect, control, or route real network traffic.

**Stack:** React + TypeScript (Vite) · Fastify + TypeScript · shared TypeBox contract · npm
workspaces · Render.

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
apps/server      Fastify API (graph model, BFS, routes)
apps/web         React UI
packages/shared  API schemas, types, limits (used by both apps)
docs/            architecture.md
render.yaml      Render deployment blueprint
```

## Architecture

See **[docs/architecture.md](docs/architecture.md)** for diagrams, design decisions, the full API
contract, error codes, limits, config, and deployment details. Summary:

- **Stateless API.** Server holds one fixed topology. Browser sends disabled routers/links with
  each request. Survives Render restarts; concurrent users do not collide.
- **One contract.** `packages/shared` TypeBox schemas drive Fastify validation _and_ TS types in
  both apps.
- **Pure algorithms.** `apps/server/src/graph/` has no HTTP code; tested directly.
- **Deterministic.** Fixed topology, sorted neighbor order. Same input → same route, every demo.

### API at a glance

| Method | Path           | Purpose                                                                                           |
| ------ | -------------- | ------------------------------------------------------------------------------------------------- |
| GET    | `/api/health`  | Liveness for Render                                                                               |
| GET    | `/api/network` | Topology: nodes (with x/y), links, client/server IDs                                              |
| POST   | `/api/route`   | `{ message, disabledNodeIds, disabledLinkIds }` → BFS `visitOrder`, `path`, `linkPath`, `packets` |

Errors: `{ "error": { "code", "message" } }`.

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

## Status

Foundation only: API, BFS with tests, static SVG graph, send/reset, router/link toggling. Not yet:
BFS step replay, packet animation, playback controls, guided demo mode, frontend/E2E tests.
