import { describe, expect, it } from 'vitest';
import { project, toCarPlan, type Network, type RouteResponse } from '@netsim/shared';
import mockNetwork from '@netsim/shared/mocks/network.json';
import { rng } from '../scene3d/world';
import { planRun } from './plan';

const network = mockNetwork as Network;
const pos = new Map(network.nodes.map((n) => [n.id, project(n.lat, n.lon)]));
const packets = toCarPlan(10_000_000);
const none = new Set<string>();
// The default 9-hop BFS answer (docs/architecture.md, demo routes).
const bfs: RouteResponse = {
  status: 'routed',
  visitOrder: [],
  path: [
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
  ],
  linkPath: [],
};

describe('planRun', () => {
  it('spreads 24 cars over the coast, inland and desert corridors', () => {
    const corridors = new Set<string>();
    for (let seed = 1; seed <= 5; seed++) {
      const tl = planRun(network, packets, bfs, pos, none, none, rng(seed));
      expect(tl.plans).toHaveLength(24);
      for (const p of tl.plans) {
        const ids = p.route.nodeIds;
        expect(ids[0]).toBe('csulb');
        expect(ids.at(-1)).toBe('oregon-dc');
        expect(ids.length - 1).toBeLessThanOrEqual(9 + 2);
        if (ids.includes('slo')) corridors.add('coast');
        if (ids.includes('bakersfield')) corridors.add('inland');
        if (ids.includes('las-vegas')) corridors.add('desert');
      }
    }
    expect(corridors).toEqual(new Set(['coast', 'inland', 'desert']));
  });

  it('never routes a car through a broken station', () => {
    const broken = new Set(['oakland', 'barstow']);
    const tl = planRun(network, packets, bfs, pos, broken, none, rng(3));
    for (const p of tl.plans) expect(p.route.nodeIds).not.toContain('oakland');
    for (const p of tl.plans) expect(p.route.nodeIds).not.toContain('barstow');
  });

  it('plans no driving when BFS found no route', () => {
    const tl = planRun(
      network,
      packets,
      { ...bfs, status: 'unreachable', path: [] },
      pos,
      none,
      none,
      rng(1),
    );
    expect(tl.plans).toEqual([]);
  });
});
