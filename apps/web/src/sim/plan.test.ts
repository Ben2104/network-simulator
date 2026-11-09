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
describe('planRun', () => {
  it.each([undefined, 'bfs', 'dijkstra'] as const)(
    'sends all 24 groups along the returned route for %s',
    (algorithm) => {
      for (let seed = 1; seed <= 20; seed++) {
        const tl = planRun(packets, { ...bfs, algorithm }, pos, rng(seed));
        expect(tl.plans).toHaveLength(24);
        for (const p of tl.plans) {
          expect(p.route.nodeIds).toEqual(bfs.path);
          expect(p.route.linkIds).toEqual(bfs.linkPath);
        }
      }
    },
  );

  it('reproduces the same animation for the same seed', () => {
    expect(planRun(packets, bfs, pos, rng(42))).toEqual(planRun(packets, bfs, pos, rng(42)));
  });

  it('varies departure gaps while preserving every group route', () => {
    const tl = planRun(packets, bfs, pos, rng(7));
    const gaps = tl.plans.slice(1).map((p, i) => p.departAt - tl.plans[i]!.departAt);
    expect(new Set(gaps.map((g) => g.toFixed(3))).size).toBeGreaterThan(1);
    for (const gap of gaps) expect(gap).toBeGreaterThan(0);
  });

  it.each(['bfs', 'dijkstra'] as const)('plans no driving when %s found no route', (algorithm) => {
    const tl = planRun(
      packets,
      { ...bfs, algorithm, status: 'unreachable', path: [], linkPath: [] },
      pos,
      rng(1),
    );
    expect(tl.plans).toEqual([]);
  });
});
