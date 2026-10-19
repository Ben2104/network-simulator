# Plan 1: Contract + Backend v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 9-node demo graph with the West Coast topology (lat/lon, distances), add `POST /api/packetize`, move `/api/route` to the v2 contract (`fromNodeId`, no message), and keep the existing 2D web view working against it.

**Architecture:** `packages/shared` holds the TypeBox contract plus a lat/lon → map projection used by both web views. `apps/server/src/graph/` holds pure functions (`haversineKm`, `createDefaultNetwork`, `findRoute`, `toCarPlan`); Fastify routes only validate, call them, and shape responses. The backend stays stateless.

**Tech Stack:** TypeScript, Fastify 5, TypeBox 0.34, Vitest 5, React 19, Vite 8, npm workspaces.

## Global Constraints

- Educational simulation: never imply real routing. UI copy: "Illustrative network — not real internet routing".
- Backend stateless: no server-side storage between requests.
- BFS = fewest hops; neighbors ordered by **code-unit** string comparison (not `localeCompare`) so results never depend on server locale.
- Packet size 1,500 B; max 24 cars per transfer; message 1–140 chars; file name 1–255 chars; declared file size 1 B – 1 GiB (1,073,741,824).
- Only `fileName` and `sizeBytes` leave the browser; file contents are never uploaded.
- Errors: `{ "error": { "code", "message" } }`; codes `VALIDATION_ERROR`, `UNKNOWN_ID`, `NOT_FOUND`, `INTERNAL_ERROR`. Validation strict (no coercion, no extra fields).
- Node/link ID pattern `^[a-z0-9-]+$`, max 32 chars. Link ID = `${source}--${target}`.
- Topology invariants: no single router failure disconnects client from server; default route has no link > 450 km.
- Server tests require the shared package built first: `npm run build -w @netsim/shared`.

## File map

| File                                       | Change  | Responsibility                                       |
| ------------------------------------------ | ------- | ---------------------------------------------------- |
| `packages/shared/package.json`             | modify  | add `test` script + vitest                           |
| `packages/shared/src/projection.ts`        | create  | `MAP_BOUNDS`, `MAP_WIDTH`, `MAP_HEIGHT`, `project()` |
| `packages/shared/src/projection.test.ts`   | create  | projection tests                                     |
| `packages/shared/src/limits.ts`            | modify  | v2 limits                                            |
| `packages/shared/src/schemas.ts`           | modify  | v2 node/link, packetize, route                       |
| `packages/shared/src/index.ts`             | modify  | export projection                                    |
| `apps/server/src/graph/geo.ts`             | create  | `haversineKm()`                                      |
| `apps/server/src/graph/geo.test.ts`        | create  | haversine tests                                      |
| `apps/server/src/graph/topology.ts`        | rewrite | West Coast network                                   |
| `apps/server/src/graph/topology.test.ts`   | create  | invariants                                           |
| `apps/server/src/graph/bfs.ts`             | modify  | locale-independent sort                              |
| `apps/server/src/graph/bfs.test.ts`        | rewrite | new topology expectations                            |
| `apps/server/src/graph/packets.ts`         | rewrite | `toCarPlan()`                                        |
| `apps/server/src/graph/packets.test.ts`    | create  | packetization math                                   |
| `apps/server/src/routes/packetize.ts`      | create  | `POST /api/packetize`                                |
| `apps/server/src/routes/network.ts`        | modify  | route v2                                             |
| `apps/server/src/app.ts`                   | modify  | register packetize                                   |
| `apps/server/src/app.test.ts`              | modify  | API tests v2                                         |
| `apps/web/src/api/client.ts`               | modify  | `packetize()`                                        |
| `apps/web/src/components/NetworkGraph.tsx` | modify  | lat/lon via `project()`                              |
| `apps/web/src/App.tsx`                     | modify  | Submit → Send flow                                   |
| `apps/web/src/styles.css`                  | modify  | tall map sizing                                      |
| `docs/architecture.md`                     | modify  | status table                                         |

---

### Task 1: Map projection in shared

**Files:**

- Modify: `packages/shared/package.json`
- Create: `packages/shared/src/projection.ts`
- Create: `packages/shared/src/projection.test.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/tsconfig.json`

**Interfaces:**

- Produces: `MAP_BOUNDS: { minLat: 32.5; maxLat: 46.5; minLon: -125; maxLon: -116 }`, `MAP_WIDTH: number` (600), `MAP_HEIGHT: number` (≈1209.6), `project(lat: number, lon: number): { x: number; y: number }` — x grows east, y grows south (SVG convention). 3D maps `x → x`, `y → z`.

- [ ] **Step 1: Add vitest to shared**

```bash
npm i -D -w @netsim/shared vitest
```

In `packages/shared/package.json` add to `scripts`:

```json
"test": "vitest run"
```

In `packages/shared/tsconfig.json` exclude tests from the build output:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

- [ ] **Step 2: Write the failing test**

`packages/shared/src/projection.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MAP_BOUNDS, MAP_HEIGHT, MAP_WIDTH, project } from './projection.js';

describe('project', () => {
  it('maps the north-west corner to the origin', () => {
    const p = project(MAP_BOUNDS.maxLat, MAP_BOUNDS.minLon);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
  });

  it('maps the south-east corner to (MAP_WIDTH, MAP_HEIGHT)', () => {
    const p = project(MAP_BOUNDS.minLat, MAP_BOUNDS.maxLon);
    expect(p.x).toBeCloseTo(MAP_WIDTH);
    expect(p.y).toBeCloseTo(MAP_HEIGHT);
  });

  it('puts Long Beach south of Oregon and Reno east of Oakland', () => {
    const csulb = project(33.7838, -118.1141);
    const oregon = project(45.8399, -119.7006);
    const oakland = project(37.8044, -122.2712);
    const reno = project(39.5296, -119.8138);
    expect(csulb.y).toBeGreaterThan(oregon.y);
    expect(reno.x).toBeGreaterThan(oakland.x);
  });

  it('keeps the map taller than wide (West Coast is a north-south strip)', () => {
    expect(MAP_WIDTH).toBe(600);
    expect(MAP_HEIGHT).toBeGreaterThan(1200);
    expect(MAP_HEIGHT).toBeLessThan(1220);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -w @netsim/shared`
Expected: FAIL — `Failed to resolve import "./projection.js"`.

- [ ] **Step 4: Implement**

`packages/shared/src/projection.ts`:

```ts
/**
 * Equirectangular projection for the West Coast map, shared by the 2D (SVG) and 3D views so
 * both place nodes identically. Distortion is negligible at this scale.
 * Output: x grows east, y grows south. In 3D use x → x and y → z.
 */
export const MAP_BOUNDS = { minLat: 32.5, maxLat: 46.5, minLon: -125, maxLon: -116 } as const;

const midLatRad = (((MAP_BOUNDS.minLat + MAP_BOUNDS.maxLat) / 2) * Math.PI) / 180;
const lonScale = Math.cos(midLatRad);

export const MAP_WIDTH = 600;
const unitsPerDegree = MAP_WIDTH / ((MAP_BOUNDS.maxLon - MAP_BOUNDS.minLon) * lonScale);
export const MAP_HEIGHT = (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat) * unitsPerDegree;

export function project(lat: number, lon: number): { x: number; y: number } {
  return {
    x: (lon - MAP_BOUNDS.minLon) * lonScale * unitsPerDegree,
    y: (MAP_BOUNDS.maxLat - lat) * unitsPerDegree,
  };
}
```

`packages/shared/src/index.ts`:

```ts
export * from './limits.js';
export * from './projection.js';
export * from './schemas.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -w @netsim/shared`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/shared package-lock.json
git commit -m "feat(shared): add West Coast map projection"
```

---

### Task 2: Haversine distance

**Files:**

- Create: `apps/server/src/graph/geo.ts`
- Create: `apps/server/src/graph/geo.test.ts`

**Interfaces:**

- Produces: `haversineKm(a: LatLon, b: LatLon): number`, `interface LatLon { lat: number; lon: number }`.

- [ ] **Step 1: Write the failing test**

`apps/server/src/graph/geo.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { haversineKm } from './geo.js';

const LA = { lat: 34.0522, lon: -118.2437 };
const SF = { lat: 37.7749, lon: -122.4194 };

describe('haversineKm', () => {
  it('measures LA → San Francisco within 1% of 559.1 km', () => {
    expect(Math.abs(haversineKm(LA, SF) - 559.1) / 559.1).toBeLessThan(0.01);
  });

  it('is zero for the same point', () => {
    expect(haversineKm(LA, LA)).toBe(0);
  });

  it('is symmetric', () => {
    expect(haversineKm(LA, SF)).toBeCloseTo(haversineKm(SF, LA), 9);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build -w @netsim/shared && npm test -w @netsim/server -- geo`
Expected: FAIL — `Failed to resolve import "./geo.js"`.

- [ ] **Step 3: Implement**

`apps/server/src/graph/geo.ts`:

```ts
export interface LatLon {
  lat: number;
  lon: number;
}

const EARTH_RADIUS_KM = 6371.0088;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in kilometres. */
export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @netsim/server -- geo`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/graph/geo.ts apps/server/src/graph/geo.test.ts
git commit -m "feat(server): add haversine distance"
```

---

### Task 3: West Coast topology (contract: lat/lon nodes, distanceKm links)

This task changes the `Network` shape, so server tests and the web view are updated in the same
commit to keep `main` green.

**Files:**

- Modify: `packages/shared/src/schemas.ts` (node + link schemas only)
- Rewrite: `apps/server/src/graph/topology.ts`
- Create: `apps/server/src/graph/topology.test.ts`
- Modify: `apps/server/src/graph/bfs.ts` (neighbor sort)
- Rewrite: `apps/server/src/graph/bfs.test.ts`
- Modify: `apps/server/src/app.test.ts` (node IDs)
- Modify: `apps/web/src/components/NetworkGraph.tsx`
- Modify: `apps/web/src/App.tsx` (illustrative note)
- Modify: `apps/web/src/styles.css`

**Interfaces:**

- Consumes: `haversineKm` (Task 2), `project`, `MAP_WIDTH`, `MAP_HEIGHT` (Task 1).
- Produces:
  - `NetworkNode = { id; label; kind: 'client'|'server'|'router'; lat; lon; place }`
  - `NetworkLink = { id; source; target; distanceKm }`
  - `createDefaultNetwork(): Network` with `clientId: 'csulb'`, `serverId: 'oregon-dc'`, 19 nodes, 24 links.
  - Fixed demo facts (asserted in tests, used by the demo script later):
    - Default route: `csulb → el-segundo → slo → san-jose → oakland → redding → medford → eugene → bend → oregon-dc` (9 hops).
    - Break `oakland` → `csulb → lb-isp → la-wilshire → bakersfield → fresno → sacramento → reno → klamath-falls → bend → oregon-dc`.
    - Break link `oakland--redding` → `… → oakland → sacramento → reno → klamath-falls → bend → oregon-dc`.
    - Break `sacramento` + `redding` → unreachable.

- [ ] **Step 1: Update the node and link schemas**

In `packages/shared/src/schemas.ts`, replace `NetworkNodeSchema` and `NetworkLinkSchema` with:

```ts
export const NetworkNodeSchema = Type.Object({
  id: Id,
  label: Type.String(),
  kind: NodeKindSchema,
  /** Approximate real-world location. Projected to the map with `project()`. */
  lat: Type.Number({ minimum: -90, maximum: 90 }),
  lon: Type.Number({ minimum: -180, maximum: 180 }),
  /** Human-readable place, e.g. "Long Beach, CA". */
  place: Type.String(),
});

export const NetworkLinkSchema = Type.Object({
  id: Id,
  source: Id,
  target: Id,
  /** Great-circle distance, display only. BFS ignores it. */
  distanceKm: Type.Number({ minimum: 0 }),
});
```

- [ ] **Step 2: Write the failing topology tests**

`apps/server/src/graph/topology.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createDefaultNetwork } from './topology.js';
import { findRoute, type FailureState } from './bfs.js';
import { haversineKm } from './geo.js';

const net = createDefaultNetwork();
const failures = (nodes: string[] = []): FailureState => ({
  disabledNodeIds: new Set(nodes),
  disabledLinkIds: new Set(),
});
const byId = new Map(net.nodes.map((n) => [n.id, n]));

describe('default topology', () => {
  it('has 19 nodes and 24 links with unique IDs', () => {
    expect(net.nodes).toHaveLength(19);
    expect(net.links).toHaveLength(24);
    expect(new Set(net.nodes.map((n) => n.id)).size).toBe(19);
    expect(new Set(net.links.map((l) => l.id)).size).toBe(24);
  });

  it('has exactly one client lot (CSULB) and one server lot (Oregon)', () => {
    expect(net.nodes.filter((n) => n.kind === 'client').map((n) => n.id)).toEqual(['csulb']);
    expect(net.nodes.filter((n) => n.kind === 'server').map((n) => n.id)).toEqual(['oregon-dc']);
    expect(net.clientId).toBe('csulb');
    expect(net.serverId).toBe('oregon-dc');
  });

  it('links only existing nodes and names links source--target', () => {
    for (const link of net.links) {
      expect(byId.has(link.source)).toBe(true);
      expect(byId.has(link.target)).toBe(true);
      expect(link.id).toBe(`${link.source}--${link.target}`);
    }
  });

  it('stores the haversine distance (0.1 km precision) on every link', () => {
    for (const link of net.links) {
      const expected = haversineKm(byId.get(link.source)!, byId.get(link.target)!);
      expect(Math.abs(link.distanceKm - expected)).toBeLessThanOrEqual(0.05);
    }
  });

  it('survives any single router failure (≥ 2 station-disjoint routes)', () => {
    const routers = net.nodes.filter((n) => n.kind === 'router');
    for (const router of routers) {
      const r = findRoute(net, net.clientId, net.serverId, failures([router.id]));
      expect(r.found, `breaking ${router.id} disconnected the network`).toBe(true);
    }
  });

  it('default route has no link longer than 450 km', () => {
    const r = findRoute(net, net.clientId, net.serverId, failures());
    const linkById = new Map(net.links.map((l) => [l.id, l]));
    for (const id of r.linkPath) {
      expect(linkById.get(id)!.distanceKm).toBeLessThanOrEqual(450);
    }
  });
});
```

- [ ] **Step 3: Rewrite the BFS tests for the new topology**

`apps/server/src/graph/bfs.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { findRoute, type FailureState } from './bfs.js';
import { createDefaultNetwork } from './topology.js';

const net = createDefaultNetwork();
const failures = (nodes: string[] = [], links: string[] = []): FailureState => ({
  disabledNodeIds: new Set(nodes),
  disabledLinkIds: new Set(links),
});
const route = (f: FailureState, from = 'csulb') => findRoute(net, from, 'oregon-dc', f);

describe('findRoute', () => {
  it('finds the fewest-hop route on the healthy network', () => {
    const r = route(failures());
    expect(r.found).toBe(true);
    expect(r.path).toEqual([
      'csulb',
      'el-segundo',
      'slo',
      'san-jose',
      'oakland',
      'redding',
      'medford',
      'eugene',
      'bend',
      'oregon-dc',
    ]);
    expect(r.linkPath).toEqual([
      'csulb--el-segundo',
      'el-segundo--slo',
      'slo--san-jose',
      'san-jose--oakland',
      'oakland--redding',
      'redding--medford',
      'medford--eugene',
      'eugene--bend',
      'bend--oregon-dc',
    ]);
  });

  it('records visit order ring by ring, starting at the client', () => {
    const r = route(failures());
    expect(r.visitOrder[0]).toEqual({ nodeId: 'csulb', parentId: null, viaLinkId: null, depth: 0 });
    expect(r.visitOrder.map((s) => s.nodeId)).toEqual([
      'csulb',
      'el-segundo',
      'lb-isp',
      'slo',
      'la-wilshire',
      'riverside',
      'san-jose',
      'bakersfield',
      'oakland',
      'fresno',
      'redding',
      'sacramento',
      'medford',
      'reno',
      'eugene',
      'klamath-falls',
      'bend',
      'portland',
      'oregon-dc',
    ]);
    const depths = r.visitOrder.map((s) => s.depth);
    expect(depths).toEqual([...depths].sort((a, b) => a - b));
  });

  it('reroutes inland around a disabled router', () => {
    expect(route(failures(['oakland'])).path).toEqual([
      'csulb',
      'lb-isp',
      'la-wilshire',
      'bakersfield',
      'fresno',
      'sacramento',
      'reno',
      'klamath-falls',
      'bend',
      'oregon-dc',
    ]);
  });

  it('reroutes around a disabled link', () => {
    const r = route(failures([], ['oakland--redding']));
    expect(r.path).toEqual([
      'csulb',
      'el-segundo',
      'slo',
      'san-jose',
      'oakland',
      'sacramento',
      'reno',
      'klamath-falls',
      'bend',
      'oregon-dc',
    ]);
    expect(r.linkPath).not.toContain('oakland--redding');
  });

  it('reports unreachable when Sacramento and Redding are both down', () => {
    const r = route(failures(['sacramento', 'redding']));
    expect(r.found).toBe(false);
    expect(r.path).toEqual([]);
    expect(r.linkPath).toEqual([]);
    expect(r.visitOrder.map((s) => s.nodeId)).toEqual([
      'csulb',
      'el-segundo',
      'lb-isp',
      'slo',
      'la-wilshire',
      'riverside',
      'san-jose',
      'bakersfield',
      'oakland',
      'fresno',
    ]);
  });

  it('reports unreachable when the destination itself is disabled', () => {
    expect(route(failures(['oregon-dc'])).found).toBe(false);
  });

  it('can start from any station (fromNodeId)', () => {
    expect(route(failures(), 'sacramento').path).toEqual([
      'sacramento',
      'reno',
      'klamath-falls',
      'bend',
      'oregon-dc',
    ]);
  });

  it('is deterministic regardless of link order', () => {
    const shuffled = { ...net, links: [...net.links].reverse() };
    expect(findRoute(shuffled, 'csulb', 'oregon-dc', failures())).toEqual(route(failures()));
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm run build -w @netsim/shared && npm test -w @netsim/server -- graph`
Expected: FAIL — topology has 9 nodes; paths reference `r1…r7`.

- [ ] **Step 5: Rewrite the topology**

`apps/server/src/graph/topology.ts`:

```ts
import type { Network, NetworkNode } from '@netsim/shared';
import { haversineKm } from './geo.js';

/**
 * Illustrative West Coast network: real places (approximate city coordinates), hand-picked links.
 * NOT real ISP topology. Fixed so every presentation is reproducible.
 *
 * Two station-disjoint corridors (coast via Oakland/Redding/Medford, inland via
 * Bakersfield/Fresno/Sacramento/Reno) so any single router failure still has a detour.
 */
const NODES: readonly NetworkNode[] = [
  {
    id: 'csulb',
    label: 'CSULB Parking Lot',
    kind: 'client',
    lat: 33.7838,
    lon: -118.1141,
    place: 'Long Beach, CA',
  },
  {
    id: 'lb-isp',
    label: 'Long Beach ISP',
    kind: 'router',
    lat: 33.7701,
    lon: -118.1937,
    place: 'Long Beach, CA',
  },
  {
    id: 'el-segundo',
    label: 'El Segundo',
    kind: 'router',
    lat: 33.9192,
    lon: -118.4165,
    place: 'El Segundo, CA',
  },
  {
    id: 'la-wilshire',
    label: 'One Wilshire',
    kind: 'router',
    lat: 34.0488,
    lon: -118.2558,
    place: 'Los Angeles, CA',
  },
  {
    id: 'riverside',
    label: 'Riverside',
    kind: 'router',
    lat: 33.9806,
    lon: -117.3755,
    place: 'Riverside, CA',
  },
  {
    id: 'bakersfield',
    label: 'Bakersfield',
    kind: 'router',
    lat: 35.3733,
    lon: -119.0187,
    place: 'Bakersfield, CA',
  },
  {
    id: 'slo',
    label: 'San Luis Obispo',
    kind: 'router',
    lat: 35.2828,
    lon: -120.6596,
    place: 'San Luis Obispo, CA',
  },
  {
    id: 'fresno',
    label: 'Fresno',
    kind: 'router',
    lat: 36.7378,
    lon: -119.7871,
    place: 'Fresno, CA',
  },
  {
    id: 'san-jose',
    label: 'San Jose',
    kind: 'router',
    lat: 37.3382,
    lon: -121.8863,
    place: 'San Jose, CA',
  },
  {
    id: 'oakland',
    label: 'Oakland',
    kind: 'router',
    lat: 37.8044,
    lon: -122.2712,
    place: 'Oakland, CA',
  },
  {
    id: 'sacramento',
    label: 'Sacramento',
    kind: 'router',
    lat: 38.5816,
    lon: -121.4944,
    place: 'Sacramento, CA',
  },
  { id: 'reno', label: 'Reno', kind: 'router', lat: 39.5296, lon: -119.8138, place: 'Reno, NV' },
  {
    id: 'redding',
    label: 'Redding',
    kind: 'router',
    lat: 40.5865,
    lon: -122.3917,
    place: 'Redding, CA',
  },
  {
    id: 'klamath-falls',
    label: 'Klamath Falls',
    kind: 'router',
    lat: 42.2249,
    lon: -121.7817,
    place: 'Klamath Falls, OR',
  },
  {
    id: 'medford',
    label: 'Medford',
    kind: 'router',
    lat: 42.3265,
    lon: -122.8756,
    place: 'Medford, OR',
  },
  {
    id: 'eugene',
    label: 'Eugene',
    kind: 'router',
    lat: 44.0521,
    lon: -123.0868,
    place: 'Eugene, OR',
  },
  { id: 'bend', label: 'Bend', kind: 'router', lat: 44.0582, lon: -121.3153, place: 'Bend, OR' },
  {
    id: 'portland',
    label: 'Portland',
    kind: 'router',
    lat: 45.5152,
    lon: -122.6784,
    place: 'Portland, OR',
  },
  {
    id: 'oregon-dc',
    label: 'US-West Data Center',
    kind: 'server',
    lat: 45.8399,
    lon: -119.7006,
    place: 'Boardman, OR',
  },
];

const LINKS: readonly (readonly [string, string])[] = [
  ['csulb', 'lb-isp'],
  ['csulb', 'el-segundo'],
  ['lb-isp', 'la-wilshire'],
  ['lb-isp', 'riverside'],
  ['la-wilshire', 'bakersfield'],
  ['riverside', 'bakersfield'],
  ['el-segundo', 'slo'],
  ['bakersfield', 'fresno'],
  ['slo', 'san-jose'],
  ['fresno', 'sacramento'],
  ['san-jose', 'oakland'],
  ['oakland', 'sacramento'],
  ['oakland', 'redding'],
  ['sacramento', 'redding'],
  ['sacramento', 'reno'],
  ['reno', 'klamath-falls'],
  ['redding', 'medford'],
  ['medford', 'klamath-falls'],
  ['medford', 'eugene'],
  ['klamath-falls', 'bend'],
  ['eugene', 'bend'],
  ['eugene', 'portland'],
  ['bend', 'oregon-dc'],
  ['portland', 'oregon-dc'],
];

export function createDefaultNetwork(): Network {
  const byId = new Map(NODES.map((n) => [n.id, n]));
  return {
    clientId: 'csulb',
    serverId: 'oregon-dc',
    nodes: NODES.map((n) => ({ ...n })),
    links: LINKS.map(([source, target]) => ({
      id: `${source}--${target}`,
      source,
      target,
      distanceKm: Math.round(haversineKm(byId.get(source)!, byId.get(target)!) * 10) / 10,
    })),
  };
}
```

- [ ] **Step 6: Make neighbor order locale-independent**

In `apps/server/src/graph/bfs.ts`, replace:

```ts
for (const edges of adj.values()) edges.sort((x, y) => x.to.localeCompare(y.to));
```

with:

```ts
// Code-unit order, not localeCompare: results must not depend on the server's locale.
for (const edges of adj.values()) edges.sort((x, y) => (x.to < y.to ? -1 : x.to > y.to ? 1 : 0));
```

- [ ] **Step 7: Update node IDs in the API tests**

In `apps/server/src/app.test.ts`:

- In `'GET /api/network returns the topology'` change `expect(net.clientId).toBe('client');` to `expect(net.clientId).toBe('csulb');`.
- In `'POST /api/route routes and packetizes the message'` change `expect(body.path.at(0)).toBe('client');` → `toBe('csulb')` and `expect(body.path.at(-1)).toBe('server');` → `toBe('oregon-dc')`.
- Replace the reroute test with:

```ts
it('POST /api/route reroutes and reports unreachable', async () => {
  const rerouted = (
    await route({ message: 'hi', disabledNodeIds: ['oakland'], disabledLinkIds: [] })
  ).json<RouteResponse>();
  expect(rerouted.path).not.toContain('oakland');
  const cut = (
    await route({ message: 'hi', disabledNodeIds: ['sacramento', 'redding'], disabledLinkIds: [] })
  ).json<RouteResponse>();
  expect(cut.status).toBe('unreachable');
  expect(cut.packets).toEqual([]);
});
```

- [ ] **Step 8: Run server tests to verify they pass**

Run: `npm run build -w @netsim/shared && npm test -w @netsim/server`
Expected: PASS — geo, topology, bfs and app suites all green.

- [ ] **Step 9: Update the 2D view to lat/lon**

Replace `apps/web/src/components/NetworkGraph.tsx`:

```tsx
import { MAP_HEIGHT, MAP_WIDTH, project, type Network } from '@netsim/shared';

interface Props {
  network: Network;
  disabledNodeIds: ReadonlySet<string>;
  disabledLinkIds: ReadonlySet<string>;
  pathLinkIds: ReadonlySet<string>;
  visitedNodeIds: ReadonlySet<string>;
  onToggleNode: (id: string) => void;
  onToggleLink: (id: string) => void;
}

/** 2D SVG view. Positions come from the shared projection so they match the 3D scene. */
export function NetworkGraph(props: Props) {
  const { network, disabledNodeIds, disabledLinkIds, pathLinkIds, visitedNodeIds } = props;
  const pos = new Map(network.nodes.map((n) => [n.id, project(n.lat, n.lon)]));

  return (
    <svg
      className="graph"
      viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
      role="img"
      aria-label="Simulated West Coast network graph"
    >
      {network.links.map((link) => {
        const a = pos.get(link.source)!;
        const b = pos.get(link.target)!;
        const cls = disabledLinkIds.has(link.id)
          ? 'disabled'
          : pathLinkIds.has(link.id)
            ? 'on-path'
            : '';
        return (
          <g key={link.id} className={`link ${cls}`}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
            <line
              className="hit"
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              onClick={() => props.onToggleLink(link.id)}
            >
              <title>{`${link.source} ↔ ${link.target} · ${link.distanceKm} km (click to toggle)`}</title>
            </line>
          </g>
        );
      })}
      {network.nodes.map((node) => {
        const p = pos.get(node.id)!;
        const isRouter = node.kind === 'router';
        const cls = [
          'node',
          node.kind,
          disabledNodeIds.has(node.id) && 'disabled',
          visitedNodeIds.has(node.id) && 'visited',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <g
            key={node.id}
            className={cls}
            transform={`translate(${p.x} ${p.y})`}
            onClick={isRouter ? () => props.onToggleNode(node.id) : undefined}
            role={isRouter ? 'button' : undefined}
            tabIndex={isRouter ? 0 : undefined}
            aria-pressed={isRouter ? disabledNodeIds.has(node.id) : undefined}
            aria-label={
              isRouter ? `${node.label} station, ${node.place}. Toggle offline.` : node.label
            }
            onKeyDown={
              isRouter
                ? (e) => (e.key === 'Enter' || e.key === ' ') && props.onToggleNode(node.id)
                : undefined
            }
          >
            <circle r={isRouter ? 8 : 13} />
            <text x={isRouter ? 12 : 17} y={4}>
              {node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
```

In `apps/web/src/App.tsx`, replace the subtitle paragraph with:

```tsx
<p className="subtitle">
  Illustrative network — not real internet routing. BFS picks the fewest hops, not the shortest
  distance.
</p>
```

In `apps/web/src/styles.css`, replace the `.graph`, `.link line`, `.link .hit`, `.link.on-path line:not(.hit)` and `.node text` rules with:

```css
.graph {
  width: 100%;
  max-height: 80vh;
  display: block;
}

.link line {
  stroke: var(--link);
  stroke-width: 3;
}
.link .hit {
  stroke: transparent;
  stroke-width: 14;
  cursor: pointer;
}
.link.on-path line:not(.hit) {
  stroke: var(--ok);
  stroke-width: 5;
}

.node text {
  fill: var(--text);
  font-size: 12px;
}
```

- [ ] **Step 10: Typecheck and smoke-test**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

Run: `npm run dev`, open http://localhost:5173.
Expected: tall West Coast graph, CSULB bottom-right area, Oregon lot top-right; Send highlights the coastal route; clicking Oakland then Send highlights the inland route.

- [ ] **Step 11: Commit**

```bash
npx prettier --write .
git add -A
git commit -m "feat: West Coast topology with lat/lon nodes and link distances"
```

---

### Task 4: `POST /api/packetize`

**Files:**

- Modify: `packages/shared/src/limits.ts`
- Modify: `packages/shared/src/schemas.ts` (add packetize schemas)
- Modify: `apps/server/src/graph/packets.ts` (add `toCarPlan`, keep `toPackets` until Task 5)
- Create: `apps/server/src/graph/packets.test.ts`
- Create: `apps/server/src/routes/packetize.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/app.test.ts`

**Interfaces:**

- Produces:
  - `LIMITS.packetSizeBytes = 1500`, `LIMITS.maxCars = 24`, `LIMITS.fileNameMaxLength = 255`, `LIMITS.fileMaxBytes = 1073741824`.
  - `PacketizeRequest = { source: 'file'; fileName: string; sizeBytes: number } | { source: 'message'; message: string }`
  - `Car = { id: string; seq: number; firstPacket: number; lastPacket: number; bytes: number }`
  - `PacketizeResponse = { totalBytes: number; packetSizeBytes: number; packetCount: number; cars: Car[] }`
  - `toCarPlan(totalBytes: number, packetSizeBytes?: number, maxCars?: number): PacketizeResponse` — throws `RangeError` if `totalBytes` is not a positive integer.

- [ ] **Step 1: Add limits**

Replace `packages/shared/src/limits.ts`:

```ts
/** Hard limits shared by client-side form validation and server-side request validation. */
export const LIMITS = {
  messageMaxLength: 140,
  /** @deprecated Removed in Task 5 together with `/route` packets. */
  packetPayloadSize: 16,
  fileNameMaxLength: 255,
  /** Declared size only; file contents never leave the browser. 1 GiB. */
  fileMaxBytes: 1024 ** 3,
  /** Typical Ethernet MTU-sized packet. */
  packetSizeBytes: 1500,
  /** Cars rendered per transfer; packets are bundled into cars beyond this. */
  maxCars: 24,
  maxDisabledIds: 64,
  maxIdLength: 32,
} as const;
```

- [ ] **Step 2: Add schemas**

Append to `packages/shared/src/schemas.ts` (before the `export type` block):

```ts
export const PacketizeRequestSchema = Type.Union([
  Type.Object(
    {
      source: Type.Literal('file'),
      fileName: Type.String({ minLength: 1, maxLength: LIMITS.fileNameMaxLength }),
      sizeBytes: Type.Integer({ minimum: 1, maximum: LIMITS.fileMaxBytes }),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      source: Type.Literal('message'),
      message: Type.String({ minLength: 1, maxLength: LIMITS.messageMaxLength }),
    },
    { additionalProperties: false },
  ),
]);

export const CarSchema = Type.Object({
  id: Type.String(),
  seq: Type.Integer({ minimum: 0 }),
  /** Inclusive packet index range carried by this car. */
  firstPacket: Type.Integer({ minimum: 0 }),
  lastPacket: Type.Integer({ minimum: 0 }),
  bytes: Type.Integer({ minimum: 1 }),
});

export const PacketizeResponseSchema = Type.Object({
  totalBytes: Type.Integer({ minimum: 1 }),
  packetSizeBytes: Type.Integer({ minimum: 1 }),
  packetCount: Type.Integer({ minimum: 1 }),
  cars: Type.Array(CarSchema),
});
```

And add to the type exports:

```ts
export type PacketizeRequest = Static<typeof PacketizeRequestSchema>;
export type Car = Static<typeof CarSchema>;
export type PacketizeResponse = Static<typeof PacketizeResponseSchema>;
```

- [ ] **Step 3: Write the failing unit tests**

`apps/server/src/graph/packets.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { PacketizeResponse } from '@netsim/shared';
import { toCarPlan } from './packets.js';

const sum = (plan: PacketizeResponse) => plan.cars.reduce((n, c) => n + c.bytes, 0);
const packetsCovered = (plan: PacketizeResponse) =>
  plan.cars.reduce((n, c) => n + (c.lastPacket - c.firstPacket + 1), 0);

describe('toCarPlan', () => {
  it('splits 1 MiB into 700 packets across 24 cars', () => {
    const plan = toCarPlan(1_048_576);
    expect(plan).toMatchObject({ totalBytes: 1_048_576, packetSizeBytes: 1500, packetCount: 700 });
    expect(plan.cars).toHaveLength(24);
    // 700 = 24 × 29 + 4 → first 4 cars carry 30 packets, the rest 29
    expect(plan.cars[0]).toEqual({
      id: 'car-0',
      seq: 0,
      firstPacket: 0,
      lastPacket: 29,
      bytes: 45_000,
    });
    expect(plan.cars[4]).toMatchObject({ firstPacket: 120, lastPacket: 148 });
    expect(plan.cars[23]).toMatchObject({ firstPacket: 671, lastPacket: 699, bytes: 42_076 });
    expect(sum(plan)).toBe(1_048_576);
    expect(packetsCovered(plan)).toBe(700);
  });

  it('uses one car per packet when there are 24 or fewer packets', () => {
    const plan = toCarPlan(36_000);
    expect(plan.packetCount).toBe(24);
    expect(plan.cars).toHaveLength(24);
    expect(plan.cars.every((c) => c.firstPacket === c.lastPacket && c.bytes === 1500)).toBe(true);
  });

  it('handles a 1-byte transfer', () => {
    expect(toCarPlan(1)).toEqual({
      totalBytes: 1,
      packetSizeBytes: 1500,
      packetCount: 1,
      cars: [{ id: 'car-0', seq: 0, firstPacket: 0, lastPacket: 0, bytes: 1 }],
    });
  });

  it('handles 1 GiB', () => {
    const plan = toCarPlan(1024 ** 3);
    expect(plan.packetCount).toBe(715_828);
    expect(plan.cars).toHaveLength(24);
    expect(sum(plan)).toBe(1024 ** 3);
    expect(packetsCovered(plan)).toBe(715_828);
  });

  it('cars cover contiguous, non-overlapping packet ranges', () => {
    const plan = toCarPlan(500_000);
    plan.cars.forEach((car, i) => {
      if (i > 0) expect(car.firstPacket).toBe(plan.cars[i - 1]!.lastPacket + 1);
    });
    expect(plan.cars.at(-1)!.lastPacket).toBe(plan.packetCount - 1);
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects totalBytes = %s', (n) => {
    expect(() => toCarPlan(n)).toThrow(RangeError);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm run build -w @netsim/shared && npm test -w @netsim/server -- packets`
Expected: FAIL — `toCarPlan is not a function` / not exported.

- [ ] **Step 5: Implement `toCarPlan`**

Append to `apps/server/src/graph/packets.ts` (keep `toPackets` for now) and extend its import:

```ts
import { LIMITS, type Car, type Packet, type PacketizeResponse } from '@netsim/shared';
```

```ts
/**
 * Split `totalBytes` into fixed-size packets, then bundle packets into at most `maxCars` cars.
 * Packets are spread as evenly as possible: the first `packetCount % carCount` cars carry one
 * extra packet. Car byte counts always sum to `totalBytes` (last packet may be partial).
 */
export function toCarPlan(
  totalBytes: number,
  packetSizeBytes: number = LIMITS.packetSizeBytes,
  maxCars: number = LIMITS.maxCars,
): PacketizeResponse {
  if (!Number.isInteger(totalBytes) || totalBytes < 1) {
    throw new RangeError(`totalBytes must be a positive integer, got ${totalBytes}`);
  }
  const packetCount = Math.ceil(totalBytes / packetSizeBytes);
  const carCount = Math.min(packetCount, maxCars);
  const base = Math.floor(packetCount / carCount);
  const extra = packetCount % carCount;

  const cars: Car[] = [];
  let next = 0;
  for (let seq = 0; seq < carCount; seq++) {
    const count = base + (seq < extra ? 1 : 0);
    const firstPacket = next;
    const lastPacket = next + count - 1;
    const bytes =
      Math.min(totalBytes, (lastPacket + 1) * packetSizeBytes) - firstPacket * packetSizeBytes;
    cars.push({ id: `car-${seq}`, seq, firstPacket, lastPacket, bytes });
    next = lastPacket + 1;
  }
  return { totalBytes, packetSizeBytes, packetCount, cars };
}
```

- [ ] **Step 6: Run unit tests to verify they pass**

Run: `npm test -w @netsim/server -- packets`
Expected: PASS, 9 tests.

- [ ] **Step 7: Write the failing API tests**

Append inside the `describe('API', …)` block in `apps/server/src/app.test.ts`, and add `PacketizeResponse` to the `@netsim/shared` type import:

```ts
const packetize = (payload: object) =>
  app.inject({ method: 'POST', url: '/api/packetize', payload });

it('POST /api/packetize plans cars for a declared file', async () => {
  const res = await packetize({ source: 'file', fileName: 'essay.pdf', sizeBytes: 1_048_576 });
  expect(res.statusCode).toBe(200);
  const body = res.json<PacketizeResponse>();
  expect(body.packetCount).toBe(700);
  expect(body.cars).toHaveLength(24);
});

it('POST /api/packetize counts message bytes as UTF-8', async () => {
  const body = (await packetize({ source: 'message', message: 'héllo' })).json<PacketizeResponse>();
  expect(body.totalBytes).toBe(6);
  expect(body.cars).toHaveLength(1);
});

it.each([
  ['zero-byte file', { source: 'file', fileName: 'a', sizeBytes: 0 }],
  ['file over 1 GiB', { source: 'file', fileName: 'a', sizeBytes: 1024 ** 3 + 1 }],
  ['file name over 255 chars', { source: 'file', fileName: 'a'.repeat(256), sizeBytes: 1 }],
  ['mixed variants', { source: 'file', fileName: 'a', sizeBytes: 1, message: 'x' }],
  ['unknown source', { source: 'upload', fileName: 'a', sizeBytes: 1 }],
  ['empty message', { source: 'message', message: '' }],
])('POST /api/packetize rejects %s', async (_, payload) => {
  const res = await packetize(payload);
  expect(res.statusCode).toBe(400);
  expect(res.json<ApiError>().error.code).toBe('VALIDATION_ERROR');
});
```

- [ ] **Step 8: Run to verify they fail**

Run: `npm test -w @netsim/server -- app`
Expected: FAIL — `/api/packetize` returns 404.

- [ ] **Step 9: Implement the route**

`apps/server/src/routes/packetize.ts`:

```ts
import type { FastifyPluginAsync } from 'fastify';
import {
  PacketizeRequestSchema,
  PacketizeResponseSchema,
  type PacketizeRequest,
  type PacketizeResponse,
} from '@netsim/shared';
import { toCarPlan } from '../graph/packets.js';

export const packetizeRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: PacketizeRequest; Reply: PacketizeResponse }>(
    '/packetize',
    { schema: { body: PacketizeRequestSchema, response: { 200: PacketizeResponseSchema } } },
    async (req) => {
      const body = req.body;
      const totalBytes =
        body.source === 'file' ? body.sizeBytes : Buffer.byteLength(body.message, 'utf8');
      return toCarPlan(totalBytes);
    },
  );
};
```

In `apps/server/src/app.ts` import it and register next to the network routes:

```ts
import { packetizeRoutes } from './routes/packetize.js';
```

```ts
    async (api) => {
      await api.register(healthRoutes);
      await api.register(packetizeRoutes);
      await api.register(networkRoutes, { network: opts.network ?? createDefaultNetwork() });
    },
```

- [ ] **Step 10: Run all server tests**

Run: `npm run build -w @netsim/shared && npm test -w @netsim/server`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
npx prettier --write .
git add -A
git commit -m "feat(server): add POST /api/packetize with car planning"
```

---

### Task 5: Route v2 + Submit/Send in the web app

**Files:**

- Modify: `packages/shared/src/limits.ts` (remove `packetPayloadSize`)
- Modify: `packages/shared/src/schemas.ts` (route v2, remove `PacketSchema`)
- Modify: `apps/server/src/graph/packets.ts` (remove `toPackets`)
- Modify: `apps/server/src/routes/network.ts`
- Modify: `apps/server/src/app.test.ts`
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**

- Consumes: `toCarPlan`, `PacketizeRequest`, `PacketizeResponse` (Task 4).
- Produces:
  - `RouteRequest = { fromNodeId?: string; disabledNodeIds: string[]; disabledLinkIds: string[] }`
  - `RouteResponse = { status: 'routed' | 'unreachable'; visitOrder: BfsStep[]; path: string[]; linkPath: string[] }`
  - `api.packetize(req: PacketizeRequest): Promise<PacketizeResponse>`, `api.route(req: RouteRequest): Promise<RouteResponse>`

- [ ] **Step 1: Write the failing API tests**

In `apps/server/src/app.test.ts`, replace the three existing route tests (`routes and packetizes the message`, `reroutes and reports unreachable`, and the `it.each` validation block) plus the `UNKNOWN_ID` test with:

```ts
it('POST /api/route routes from the client by default', async () => {
  const res = await route({ disabledNodeIds: [], disabledLinkIds: [] });
  expect(res.statusCode).toBe(200);
  const body = res.json<RouteResponse>();
  expect(body.status).toBe('routed');
  expect(body.path.at(0)).toBe('csulb');
  expect(body.path.at(-1)).toBe('oregon-dc');
  expect(body).not.toHaveProperty('packets');
});

it('POST /api/route accepts fromNodeId', async () => {
  const body = (
    await route({ fromNodeId: 'sacramento', disabledNodeIds: [], disabledLinkIds: [] })
  ).json<RouteResponse>();
  expect(body.path).toEqual(['sacramento', 'reno', 'klamath-falls', 'bend', 'oregon-dc']);
});

it('POST /api/route reroutes and reports unreachable', async () => {
  const rerouted = (
    await route({ disabledNodeIds: ['oakland'], disabledLinkIds: [] })
  ).json<RouteResponse>();
  expect(rerouted.path).not.toContain('oakland');
  const cut = (
    await route({ disabledNodeIds: ['sacramento', 'redding'], disabledLinkIds: [] })
  ).json<RouteResponse>();
  expect(cut.status).toBe('unreachable');
  expect(cut.path).toEqual([]);
});

it.each([
  ['missing lists', {}],
  ['message (v1 field)', { message: 'hi', disabledNodeIds: [], disabledLinkIds: [] }],
  ['bad id characters', { disabledNodeIds: ['Oakland!'], disabledLinkIds: [] }],
])('POST /api/route rejects %s with VALIDATION_ERROR', async (_, payload) => {
  const res = await route(payload);
  expect(res.statusCode).toBe(400);
  expect(res.json<ApiError>().error.code).toBe('VALIDATION_ERROR');
});

it.each([
  ['disabled node', { disabledNodeIds: ['r99'], disabledLinkIds: [] }],
  ['disabled link', { disabledNodeIds: [], disabledLinkIds: ['a--b'] }],
  ['fromNodeId', { fromNodeId: 'tokyo', disabledNodeIds: [], disabledLinkIds: [] }],
])('POST /api/route rejects unknown %s with UNKNOWN_ID', async (_, payload) => {
  const res = await route(payload);
  expect(res.statusCode).toBe(400);
  expect(res.json<ApiError>().error.code).toBe('UNKNOWN_ID');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w @netsim/server -- app`
Expected: FAIL — requests without `message` get `VALIDATION_ERROR`; `fromNodeId` rejected as extra field.

- [ ] **Step 3: Update the contract**

In `packages/shared/src/limits.ts` delete the `packetPayloadSize` entry and its comment.

In `packages/shared/src/schemas.ts`, replace `RouteRequestSchema` and `RouteResponseSchema`, and delete `PacketSchema` and `export type Packet`:

```ts
export const RouteRequestSchema = Type.Object(
  {
    /** Start node. Defaults to the client lot. Enables the live-reroute stretch goal. */
    fromNodeId: Type.Optional(Id),
    disabledNodeIds: Type.Array(Id, { maxItems: LIMITS.maxDisabledIds, uniqueItems: true }),
    disabledLinkIds: Type.Array(Id, { maxItems: LIMITS.maxDisabledIds, uniqueItems: true }),
  },
  { additionalProperties: false },
);

export const RouteResponseSchema = Type.Object({
  status: Type.Union([Type.Literal('routed'), Type.Literal('unreachable')]),
  /** Order in which BFS dequeued nodes. Drives the search visualization. */
  visitOrder: Type.Array(BfsStepSchema),
  /** Node IDs from start to server. Empty when unreachable. */
  path: Type.Array(Id),
  /** Link IDs along `path` (length = path.length - 1). */
  linkPath: Type.Array(Id),
});
```

- [ ] **Step 4: Remove `toPackets`**

In `apps/server/src/graph/packets.ts` delete the `toPackets` function and change the import to:

```ts
import { LIMITS, type Car, type PacketizeResponse } from '@netsim/shared';
```

- [ ] **Step 5: Update the route handler**

Replace the `/route` handler in `apps/server/src/routes/network.ts` (and drop the `toPackets` import):

```ts
app.post<{ Body: RouteRequest; Reply: RouteResponse }>(
  '/route',
  { schema: { body: RouteRequestSchema, response: { 200: RouteResponseSchema } } },
  async (req) => {
    const { fromNodeId = network.clientId, disabledNodeIds, disabledLinkIds } = req.body;
    const unknown = [
      ...[fromNodeId, ...disabledNodeIds].filter((id) => !nodeIds.has(id)),
      ...disabledLinkIds.filter((id) => !linkIds.has(id)),
    ];
    if (unknown.length > 0) {
      throw new HttpError(400, 'UNKNOWN_ID', `Unknown node or link IDs: ${unknown.join(', ')}`);
    }

    const result = findRoute(network, fromNodeId, network.serverId, {
      disabledNodeIds: new Set(disabledNodeIds),
      disabledLinkIds: new Set(disabledLinkIds),
    });
    return {
      status: result.found ? 'routed' : 'unreachable',
      visitOrder: result.visitOrder,
      path: result.path,
      linkPath: result.linkPath,
    };
  },
);
```

- [ ] **Step 6: Run server tests**

Run: `npm run build -w @netsim/shared && npm test -w @netsim/server`
Expected: PASS.

- [ ] **Step 7: Add `packetize` to the web API client**

In `apps/web/src/api/client.ts` change the type import and the `api` object:

```ts
import type {
  ApiError,
  Network,
  PacketizeRequest,
  PacketizeResponse,
  RouteRequest,
  RouteResponse,
} from '@netsim/shared';
```

```ts
export const api = {
  getNetwork: () => request<Network>('/network'),
  packetize: (req: PacketizeRequest) =>
    request<PacketizeResponse>('/packetize', { method: 'POST', body: JSON.stringify(req) }),
  route: (req: RouteRequest) =>
    request<RouteResponse>('/route', { method: 'POST', body: JSON.stringify(req) }),
};
```

- [ ] **Step 8: Split Submit and Send in `App.tsx`**

Replace `apps/web/src/App.tsx`:

```tsx
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  LIMITS,
  type Network,
  type PacketizeRequest,
  type PacketizeResponse,
  type RouteResponse,
} from '@netsim/shared';
import { api, ApiRequestError } from './api/client';
import { NetworkGraph } from './components/NetworkGraph';

const toggle = (set: ReadonlySet<string>, id: string) => {
  const next = new Set(set);
  if (!next.delete(id)) next.add(id);
  return next;
};

const errorText = (err: unknown) =>
  err instanceof ApiRequestError ? err.message : 'Unexpected error';

const formatBytes = (n: number) =>
  n >= 1024 ** 2
    ? `${(n / 1024 ** 2).toFixed(1)} MB`
    : n >= 1024
      ? `${(n / 1024).toFixed(1)} KB`
      : `${n} B`;

/**
 * Foundation UI for the Submit → Send flow. The full panel layout, state machine and 3D scene
 * replace this in Plans 2–4.
 */
export function App() {
  const [network, setNetwork] = useState<Network | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [disabledNodeIds, setDisabledNodeIds] = useState<ReadonlySet<string>>(new Set());
  const [disabledLinkIds, setDisabledLinkIds] = useState<ReadonlySet<string>>(new Set());
  const [message, setMessage] = useState('Hello, Oregon!');
  const [file, setFile] = useState<File | null>(null);
  const [plan, setPlan] = useState<PacketizeResponse | null>(null);
  const [result, setResult] = useState<RouteResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getNetwork()
      .then(setNetwork)
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, []);

  const pathLinkIds = useMemo(() => new Set(result?.linkPath), [result]);
  const visitedNodeIds = useMemo(() => new Set(result?.visitOrder.map((s) => s.nodeId)), [result]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    // Only name and size are sent: file contents never leave the browser.
    const req: PacketizeRequest = file
      ? {
          source: 'file',
          fileName: file.name.slice(0, LIMITS.fileNameMaxLength),
          sizeBytes: file.size,
        }
      : { source: 'message', message };
    void run(async () => {
      setPlan(await api.packetize(req));
      setResult(null);
    });
  };

  const send = () =>
    void run(async () => {
      setResult(
        await api.route({
          disabledNodeIds: [...disabledNodeIds],
          disabledLinkIds: [...disabledLinkIds],
        }),
      );
    });

  const changeFailures = (fn: () => void) => {
    fn();
    setResult(null); // a stale route on a changed network would be misleading
  };

  const reset = () => {
    setDisabledNodeIds(new Set());
    setDisabledLinkIds(new Set());
    setPlan(null);
    setResult(null);
    setActionError(null);
  };

  return (
    <main className="app">
      <header>
        <h1>Packet Highway</h1>
        <p className="subtitle">
          Illustrative network — not real internet routing. BFS picks the fewest hops, not the
          shortest distance.
        </p>
      </header>

      <section className="panel" aria-label="Network">
        {loadError && <p className="status error">Could not load network: {loadError}</p>}
        {!network && !loadError && <p className="status">Loading network…</p>}
        {network && (
          <NetworkGraph
            network={network}
            disabledNodeIds={disabledNodeIds}
            disabledLinkIds={disabledLinkIds}
            pathLinkIds={pathLinkIds}
            visitedNodeIds={visitedNodeIds}
            onToggleNode={(id) => changeFailures(() => setDisabledNodeIds((s) => toggle(s, id)))}
            onToggleLink={(id) => changeFailures(() => setDisabledLinkIds((s) => toggle(s, id)))}
          />
        )}
      </section>

      <form className="panel controls" onSubmit={submit}>
        <label htmlFor="file">File</label>
        <input id="file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <label htmlFor="message">or message</label>
        <input
          id="message"
          value={message}
          maxLength={LIMITS.messageMaxLength}
          disabled={file !== null}
          onChange={(e) => setMessage(e.target.value)}
        />
        <button type="submit" disabled={!network || busy || (!file && message.length === 0)}>
          Submit
        </button>
        <button type="button" disabled={!plan || busy} onClick={send}>
          Send
        </button>
        <button type="button" className="secondary" onClick={reset}>
          Reset
        </button>
      </form>

      <section className="panel" aria-live="polite">
        {actionError && <p className="status error">{actionError}</p>}
        {plan && (
          <p className="status">
            {formatBytes(plan.totalBytes)} → {plan.packetCount} packets → {plan.cars.length} cars
            parked at CSULB
          </p>
        )}
        {result?.status === 'routed' && (
          <p className="status ok">
            Route found ({result.path.length - 1} hops): <strong>{result.path.join(' → ')}</strong>
          </p>
        )}
        {result?.status === 'unreachable' && (
          <p className="status error">
            No route available. BFS explored {result.visitOrder.length} stations.
          </p>
        )}
        {!plan && !actionError && (
          <p className="status">Choose a file or type a message, then Submit.</p>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 9: Full check + smoke test**

Run: `npm run check && npm run build`
Expected: lint, format, typecheck, all tests pass; build succeeds.

Run: `npm run dev`, open http://localhost:5173.
Expected: Submit a ~1 MB file → "1.0 MB → 700 packets → 24 cars parked at CSULB"; Send → coastal route; click Sacramento and Redding, Send → "No route available. BFS explored 10 stations."

- [ ] **Step 10: Commit**

```bash
npx prettier --write .
git add -A
git commit -m "feat!: route v2 with fromNodeId; split Submit (packetize) and Send (route)"
```

---

### Task 6: Mark the contract frozen

**Files:**

- Modify: `docs/architecture.md` (Implementation status table)
- Modify: `docs/superpowers/plans/README.md`

- [ ] **Step 1: Update the status table**

In `docs/architecture.md`, replace the Implementation status table rows for the contract,
BFS, topology and endpoints with:

```markdown
| Shared contract, error handling | Done (v2, frozen) |
| BFS + tests | Done on West Coast topology |
| West Coast topology, lat/lon, distance | Done |
| `/packetize`, `fromNodeId` | Done |
```

- [ ] **Step 2: Update the plan index**

In `docs/superpowers/plans/README.md`, change Plan 1 status from `Ready` to `Done`.

- [ ] **Step 3: Verify and commit**

Run: `npm run format:check`
Expected: all files formatted.

```bash
git add docs
git commit -m "docs: mark contract v2 frozen"
```
