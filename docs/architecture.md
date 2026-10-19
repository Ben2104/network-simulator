# Architecture

> Educational simulation. "Routers" are nodes in an in-memory graph. Nothing here inspects,
> controls, or routes real network traffic.

## System overview

```
┌──────────────────────────── Browser ────────────────────────────┐
│  apps/web  (React + Vite)                                       │
│                                                                 │
│  App state: disabledNodeIds, disabledLinkIds, last RouteResponse│
│     │                                                           │
│     ├── NetworkGraph (SVG)   ◄── renders Network + result       │
│     └── api/client.ts        ──► fetch /api/*                   │
└─────────────────────────────────┬───────────────────────────────┘
                                  │ JSON over HTTPS
┌─────────────────────────────────▼───────────────────────────────┐
│  apps/server  (Fastify)                                         │
│                                                                 │
│  routes/health.ts    GET  /api/health                           │
│  routes/network.ts   GET  /api/network                          │
│                      POST /api/route ──► graph/bfs.ts (pure)    │
│                                     └──► graph/packets.ts (pure)│
│  errors.ts           uniform { error: { code, message } }       │
└─────────────────────────────────────────────────────────────────┘
            ▲                                   ▲
            └──── packages/shared (TypeBox) ────┘
                 schemas + types + LIMITS
```

## Repository layout

```
apps/
  server/            Fastify API
    src/app.ts         buildApp(): wires plugins, no listen (testable via inject)
    src/index.ts       process entry: config, listen, graceful shutdown
    src/config.ts      env parsing
    src/errors.ts      HttpError + error/404 handlers
    src/graph/         pure algorithm code, no Fastify imports
    src/routes/        HTTP layer only: validate → call graph/ → shape response
  web/               React SPA
    src/api/           typed fetch wrapper
    src/components/    UI components
packages/
  shared/            API contract (TypeBox schemas, derived TS types, limits)
docs/                architecture, this file
render.yaml          Render Blueprint (API web service + static site)
.github/workflows/   CI
```

## Key decisions

### 1. Stateless backend: the client owns failure state

The server holds one fixed topology. The **browser** holds which routers/links are disabled and
sends them with each `POST /api/route`.

Why:

- Render free instances spin down and restart; server-side state would vanish mid-demo.
- Several people can use the deployed demo at once without breaking each other's networks.
- No database, no sessions, no locking. Every response is a pure function of the request.
- Reset is free: clear two sets in the browser.

Trade-off: if the team later wants editable topologies or shared sessions, that becomes a
stretch goal needing persistence.

### 2. Shared contract via TypeBox

`packages/shared` defines every request/response as a TypeBox schema. One definition gives:

- JSON Schema that Fastify uses to **validate requests** and **serialize responses**.
- TS types (`Static<typeof X>`) imported by both apps.

Change the contract in one place → both apps fail typecheck until updated. The package is
compiled with `tsc` to `dist/` so Node can import it at runtime; root scripts build it first.

Dependency rationale:

| Package                                   | Why                                                        |
| ----------------------------------------- | ---------------------------------------------------------- |
| `@sinclair/typebox`                       | Schema + types from one source; Fastify-native JSON Schema |
| `fastify`, `@fastify/cors`                | API server; CORS for separate static-site origin           |
| `react`, `react-dom`, `vite`              | UI + dev server/bundler                                    |
| `tsx`                                     | Run TS server in dev with watch, no build step             |
| `vitest`                                  | Unit + `inject()` integration tests                        |
| `eslint`, `typescript-eslint`, `prettier` | Lint/format                                                |
| `concurrently`                            | One `npm run dev` for all three packages                   |

No graph/animation library yet. Graph is plain SVG (9 nodes need no layout engine). Packet
animation can start with CSS/`requestAnimationFrame`; add a library only if that proves painful.

### 3. Algorithms isolated from HTTP

`graph/bfs.ts` exports `findRoute(network, from, to, failures)`. No Fastify, no I/O. Route
handlers only validate, call it, and shape the response. All algorithm tests run without HTTP.

### 4. Determinism

Presentations must be reproducible:

- Topology is hard-coded (`graph/topology.ts`), not random.
- Node positions come from the server so every client draws the same picture.
- BFS sorts each node's neighbors by ID, so output does not depend on link array order
  (tested).

Default network:

```
           r1 ── r3 ── r6
         ╱    ╲      ╱    ╲
  client       r4 ──       server
         ╲    ╱    ╲      ╱
           r2 ── r5 ── r7
```

| Failure         | Route                          |
| --------------- | ------------------------------ |
| none            | client → r1 → r3 → r6 → server |
| r6 down         | client → r1 → r4 → r7 → server |
| link r3-r6 down | client → r1 → r4 → r6 → server |
| r6 + r7 down    | unreachable                    |

### 5. BFS output designed for visualization

The response returns more than the answer, so the frontend can _explain_ the search:

- `visitOrder`: every dequeued node with `parentId`, `viaLinkId`, `depth`. Replay it step by step
  to show the BFS frontier expanding.
- `path` / `linkPath`: the chosen route as nodes and links, for highlighting and for packet
  animation.
- `packets`: message split into 16-character chunks (by code point, emoji-safe). Each is one
  animated "car".

## API contract

Base path `/api`. All bodies JSON. Source of truth: `packages/shared/src/schemas.ts`.

### `GET /api/health`

```json
{ "status": "ok", "uptimeSeconds": 42, "version": "0.1.0" }
```

Used by Render `healthCheckPath`.

### `GET /api/network`

Returns `Network`: `{ nodes, links, clientId, serverId }`. Node:
`{ id, label, kind: "client"|"router"|"server", x, y }` (positions in a 1000×600 viewBox).
Link: `{ id, source, target }` (undirected).

### `POST /api/route`

Request:

```json
{ "message": "Hello", "disabledNodeIds": ["r6"], "disabledLinkIds": [] }
```

Response `200`:

```json
{
  "status": "routed",
  "visitOrder": [{ "nodeId": "client", "parentId": null, "viaLinkId": null, "depth": 0 }, "..."],
  "path": ["client", "r1", "r4", "r7", "server"],
  "linkPath": ["client-r1", "r1-r4", "r4-r7", "r7-server"],
  "packets": [{ "id": "pkt-0", "seq": 0, "payload": "Hello" }]
}
```

`status: "unreachable"` is still `200` (it is a valid simulation outcome, not an error), with
empty `path`, `linkPath`, `packets`, and the full `visitOrder` of what BFS could reach.

### Errors

Every error has the same shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "body/message must be string" } }
```

| Status | Code               | When                                           |
| ------ | ------------------ | ---------------------------------------------- |
| 400    | `VALIDATION_ERROR` | Schema violation (type, length, extra fields)  |
| 400    | `UNKNOWN_ID`       | Disabled ID not in topology                    |
| 404    | `NOT_FOUND`        | Unknown route                                  |
| 500    | `INTERNAL_ERROR`   | Unhandled error (details logged, not returned) |

### Limits (`packages/shared/src/limits.ts`)

| Limit                 | Value  |
| --------------------- | ------ |
| Message length        | 1–140  |
| Packet payload        | 16     |
| Disabled IDs per list | 64     |
| ID length             | 32     |
| Request body          | 16 KiB |

Validation is strict: unknown fields are rejected, types are not coerced.

## Configuration

| Var            | App    | Default                 | Notes                                                |
| -------------- | ------ | ----------------------- | ---------------------------------------------------- |
| `PORT`         | server | `3001`                  | Render sets it                                       |
| `HOST`         | server | `0.0.0.0`               |                                                      |
| `CORS_ORIGIN`  | server | `http://localhost:5173` | Comma-separated allowed origins                      |
| `LOG_LEVEL`    | server | `info`                  | Pino level                                           |
| `VITE_API_URL` | web    | empty                   | Empty in dev (Vite proxies `/api`). Build-time only. |

No secrets exist in this project.

## Deployment (Render)

`render.yaml` creates two services:

- **netsim-api** — Node web service, health check `/api/health`.
- **netsim-web** — static site from `apps/web/dist`, SPA rewrite to `index.html`.

Dashboard steps after "New → Blueprint":

1. Set `VITE_API_URL` on `netsim-web` to the API URL. Trigger a redeploy (baked in at build time).
2. Set `CORS_ORIGIN` on `netsim-api` to the static site URL.

Free API instances sleep after inactivity; first request after sleep can take ~30–60 s. Open the
app a minute before presenting.

## Testing

- `apps/server/src/graph/bfs.test.ts` — shortest path, visit order, disabled router, disabled
  link, unreachable, disabled destination, determinism.
- `apps/server/src/app.test.ts` — endpoints via `app.inject()` (no port), validation and error
  shapes.
- Not yet: frontend component tests, Playwright E2E.

## Extension points

| Feature             | Where                                                                 |
| ------------------- | --------------------------------------------------------------------- |
| BFS step replay     | Frontend: iterate `visitOrder` on a timer, color nodes by step        |
| Packet animation    | Frontend: interpolate along `linkPath` coordinates per packet         |
| Playback controls   | Frontend state machine: idle → searching → transmitting → done        |
| Other algorithms    | Add `graph/dijkstra.ts` etc.; add `algorithm` field to `RouteRequest` |
| Multiple topologies | `GET /api/networks`, `networkId` in request; keep topologies in code  |
