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
const bfs: RouteResponse = {
  status: 'routed',
  visitOrder: [],
  path,
  linkPath: path.slice(1).map((id, i) => {
    const l = network.links.find(
      (x) => (x.source === path[i] && x.target === id) || (x.target === path[i] && x.source === id),
    )!;
    return l.id;
  }),
};

describe('planRun', () => {
  it('sends every car along the BFS route, straight to the server', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const tl = planRun(packets, bfs, pos, rng(seed));
      expect(tl.plans).toHaveLength(24);
      for (const p of tl.plans) {
        expect(p.route.nodeIds).toEqual(bfs.path);
        expect(p.route.linkIds).toEqual(bfs.linkPath);
      }
    }
  });

  it('still varies departure gaps between cars', () => {
    const tl = planRun(packets, bfs, pos, rng(7));
    const gaps = tl.plans.slice(1).map((p, i) => p.departAt - tl.plans[i]!.departAt);
    expect(new Set(gaps.map((g) => g.toFixed(3))).size).toBeGreaterThan(1);
    for (const g of gaps) expect(g).toBeGreaterThan(0);
  });

  it('plans no driving when BFS found no route', () => {
    const tl = planRun(
      packets,
      { ...bfs, status: 'unreachable', path: [], linkPath: [] },
      pos,
      rng(1),
    );
    expect(tl.plans).toEqual([]);
  });
});
