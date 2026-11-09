import { describe, expect, it } from 'vitest';
import { project, toCarPlan, type Network, type RouteResponse } from '@netsim/shared';
import mockNetwork from '@netsim/shared/mocks/network.json';
import { rng } from '../scene3d/world';
import { planRun } from './plan';

const network = mockNetwork as Network;
const pos = new Map(network.nodes.map((n) => [n.id, project(n.lat, n.lon)]));
const packets = toCarPlan(10_000_000);
// The default 9-hop BFS answer (docs/architecture.md, demo routes).
const path = [
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
];
const linkBetween = (net: Network, a: string, b: string) =>
  net.links.find((l) => (l.source === a && l.target === b) || (l.target === a && l.source === b));
const bfs: RouteResponse = {
  status: 'routed',
  visitOrder: [],
  path,
  linkPath: path.slice(1).map((id, i) => linkBetween(network, path[i]!, id)!.id),
};
const isBfs = (nodeIds: readonly string[]) => nodeIds.join() === path.join();

describe('planRun', () => {
  // 24 cars (LIMITS, 10 MB) x 70 % BFS share, rounded up: 17 on BFS, 7 wandering.
  it('sends 17 of 24 cars along BFS and lets the other 7 wander', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const tl = planRun(network, packets, bfs, pos, rng(seed));
      expect(tl.plans).toHaveLength(24);
      const onBfs = tl.plans.filter((p) => isBfs(p.route.nodeIds));
      expect(onBfs).toHaveLength(17);
      for (const p of onBfs) expect(p.route.linkIds).toEqual(bfs.linkPath);
    }
  });

  it('routes every wandering car client to server over real roads, never via BFS', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const { route } of planRun(network, packets, bfs, pos, rng(seed)).plans) {
        if (isBfs(route.nodeIds)) continue;
        expect(route.nodeIds[0]).toBe(network.clientId);
        expect(route.nodeIds.at(-1)).toBe(network.serverId);
        expect(new Set(route.nodeIds).size).toBe(route.nodeIds.length);
        expect(route.linkIds).toHaveLength(route.nodeIds.length - 1);
        route.linkIds.forEach((id, i) =>
          expect(linkBetween(network, route.nodeIds[i]!, route.nodeIds[i + 1]!)?.id).toBe(id),
        );
        // At most 2 hops longer than the 9-hop BFS answer.
        expect(route.linkIds.length).toBeLessThanOrEqual(11);
      }
    }
  });

  it('always puts the lead car on BFS but varies which other cars wander', () => {
    const wanderSets = new Set<string>();
    for (let seed = 1; seed <= 10; seed++) {
      const tl = planRun(network, packets, bfs, pos, rng(seed));
      expect(isBfs(tl.plans[0]!.route.nodeIds)).toBe(true);
      wanderSets.add(tl.plans.map((p) => (isBfs(p.route.nodeIds) ? 'b' : 'w')).join(''));
    }
    expect(wanderSets.size).toBeGreaterThan(1);
  });

  it('plans the same run for the same seed', () => {
    expect(planRun(network, packets, bfs, pos, rng(42))).toEqual(
      planRun(network, packets, bfs, pos, rng(42)),
    );
  });

  it('sends every car along BFS when there is no other route', () => {
    // Keep only the BFS roads: the graph becomes a single line from client to server.
    const line = { ...network, links: network.links.filter((l) => bfs.linkPath.includes(l.id)) };
    const tl = planRun(line, packets, bfs, pos, rng(3));
    expect(tl.plans).toHaveLength(24);
    for (const p of tl.plans) expect(p.route.nodeIds).toEqual(path);
  });

  it('still varies departure gaps between cars', () => {
    const tl = planRun(network, packets, bfs, pos, rng(7));
    const gaps = tl.plans.slice(1).map((p, i) => p.departAt - tl.plans[i]!.departAt);
    expect(new Set(gaps.map((g) => g.toFixed(3))).size).toBeGreaterThan(1);
    for (const g of gaps) expect(g).toBeGreaterThan(0);
  });

  it('plans no driving when BFS found no route', () => {
    const tl = planRun(
      network,
      packets,
      { ...bfs, status: 'unreachable', path: [], linkPath: [] },
      pos,
      rng(1),
    );
    expect(tl.plans).toEqual([]);
  });
});
