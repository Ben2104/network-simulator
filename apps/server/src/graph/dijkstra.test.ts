import { describe, expect, it } from 'vitest';
import { pathCost, type Network } from '@netsim/shared';
import { findRoute } from './bfs.js';
import { findWeightedRoute } from './dijkstra.js';

const network: Network = {
  nodes: ['s', 'a', 'b', 'c', 't'].map((id) => ({
    id,
    label: id,
    place: 'test',
    lat: 34,
    lon: -118,
    kind: id === 's' ? 'client' : id === 't' ? 'server' : 'router',
  })),
  links: [
    ['s', 'a'],
    ['a', 't'],
    ['s', 'b'],
    ['b', 'c'],
    ['c', 't'],
    ['b', 'a'],
  ].map(([source, target]) => ({
    id: `${source}--${target}`,
    source: source!,
    target: target!,
    distanceKm: 1,
  })),
  clientId: 's',
  serverId: 't',
};
const failures = (nodes: string[] = [], links: string[] = []) => ({
  disabledNodeIds: new Set(nodes),
  disabledLinkIds: new Set(links),
});
const speeds = { 's--a': 10, 'a--t': 100 };

describe('Dijkstra', () => {
  it('selects a cheaper path with more hops, unlike BFS', () => {
    expect(findRoute(network, 's', 't', failures()).path).toEqual(['s', 'a', 't']);
    const r = findWeightedRoute(network, 's', 't', failures(), speeds);
    expect(r.path).toEqual(['s', 'b', 'c', 't']);
    expect(pathCost(r.linkPath, speeds)).toBe(3);
    expect(r.visitOrder.at(-1)!.cost).toBe(3);
    const costs = r.visitOrder.map((s) => s.cost!);
    expect(costs).toEqual([...costs].sort((a, b) => a - b));
    expect(new Set(r.visitOrder.map((s) => s.nodeId)).size).toBe(r.visitOrder.length);
  });
  it('improves an already discovered candidate rather than treating discovery as settlement', () => {
    const r = findWeightedRoute(network, 's', 'a', failures(), speeds);
    expect(r.path).toEqual(['s', 'b', 'a']);
    expect(r.visitOrder.at(-1)).toMatchObject({ nodeId: 'a', cost: 2, depth: 2, parentId: 'b' });
  });
  it('skips disabled nodes/roads and reports unreachable', () => {
    const r = findWeightedRoute(network, 's', 't', failures(['c']), speeds);
    expect(r.path).toEqual(['s', 'b', 'a', 't']);
    expect(r.path).not.toContain('c');
    expect(findWeightedRoute(network, 's', 't', failures([], ['s--a', 's--b']), speeds).found).toBe(
      false,
    );
    expect(findWeightedRoute(network, 's', 't', failures(['t']), speeds).visitOrder).toEqual([]);
    expect(findWeightedRoute(network, 'missing', 't', failures()).found).toBe(false);
  });
  it('returns a zero-cost zero-hop route at the destination', () => {
    expect(findWeightedRoute(network, 't', 't', failures())).toEqual({
      found: true,
      path: ['t'],
      linkPath: [],
      visitOrder: [{ nodeId: 't', parentId: null, viaLinkId: null, depth: 0, cost: 0 }],
    });
  });
  it('is deterministic under node/link reordering and swapped link orientation', () => {
    const reordered = {
      ...network,
      nodes: [...network.nodes].reverse(),
      links: [...network.links]
        .reverse()
        .map((l) => ({ ...l, source: l.target, target: l.source })),
    };
    expect(findWeightedRoute(reordered, 's', 't', failures(), speeds)).toEqual(
      findWeightedRoute(network, 's', 't', failures(), speeds),
    );
    expect(findWeightedRoute(reordered, 's', 't', failures())).toEqual(
      findWeightedRoute(network, 's', 't', failures()),
    );
  });
  it('matches exhaustive simple-path costs for every assignment on the small teaching graph', () => {
    // Independent DFS oracle: enumerates all simple paths rather than using Dijkstra.
    for (let mask = 0; mask < 64; mask++) {
      const bandwidths = Object.fromEntries(
        network.links.map((l, i) => [l.id, mask & (1 << i) ? 10 : 1000]),
      );
      let minimum = Infinity;
      const visit = (node: string, seen: Set<string>, cost: number) => {
        if (node === 't') {
          minimum = Math.min(minimum, cost);
          return;
        }
        for (const l of network.links) {
          const next = l.source === node ? l.target : l.target === node ? l.source : null;
          if (next && !seen.has(next))
            visit(next, new Set([...seen, next]), cost + 1000 / bandwidths[l.id]!);
        }
      };
      visit('s', new Set(['s']), 0);
      const result = findWeightedRoute(network, 's', 't', failures(), bandwidths);
      expect(pathCost(result.linkPath, bandwidths)).toBeCloseTo(minimum);
    }
  });
});
