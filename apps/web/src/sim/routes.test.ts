import { describe, expect, it } from 'vitest';
import type { Network } from '@netsim/shared';
import { assignRoutes, enumerateRoutes, routeWeights } from './routes';

const node = (id: string, kind: 'client' | 'router' | 'server' = 'router') => ({
  id,
  label: id,
  kind,
  lat: 0,
  lon: 0,
  place: id,
});
const link = (source: string, target: string) => ({
  id: `${source}--${target}`,
  source,
  target,
  distanceKm: 1,
});

// c → a → s (2 hops), c → b → s (2 hops), c → a → b → s (3 hops), plus a dead-end d.
const network: Network = {
  nodes: [node('c', 'client'), node('a'), node('b'), node('d'), node('s', 'server')],
  links: [
    link('c', 'a'),
    link('c', 'b'),
    link('a', 's'),
    link('b', 's'),
    link('a', 'b'),
    link('a', 'd'),
  ],
  clientId: 'c',
  serverId: 's',
};

describe('enumerateRoutes', () => {
  it('returns shortest routes first and respects the hop bound', () => {
    expect(enumerateRoutes(network, 2).map((r) => r.nodeIds)).toEqual([
      ['c', 'a', 's'],
      ['c', 'b', 's'],
    ]);
    const withSlack = enumerateRoutes(network, 3).map((r) => r.nodeIds.join('>'));
    expect(withSlack).toEqual(['c>a>s', 'c>b>s', 'c>a>b>s', 'c>b>a>s']);
  });

  it('reports link IDs that match the hop sequence', () => {
    const [first] = enumerateRoutes(network, 2);
    expect(first?.linkIds).toEqual(['c--a', 'a--s']);
  });

  it('never truncates: every route within the hop bound is found', () => {
    expect(enumerateRoutes(network, 4)).toHaveLength(4);
  });

  it('returns nothing when the server is unreachable', () => {
    const cut = { ...network, links: network.links.filter((l) => l.target !== 's') };
    expect(enumerateRoutes(cut, 5)).toEqual([]);
  });
});

describe('assignRoutes', () => {
  const routes = enumerateRoutes(network, 2);

  it('gives every car a valid route, picked by the rng', () => {
    const seq = [0, 0.99, 0.5, 0.2];
    let i = 0;
    const picked = assignRoutes(routes, 4, () => seq[i++]!);
    expect(picked.map((r) => r.nodeIds[1])).toEqual(['a', 'b', 'b', 'a']);
  });

  it('picks in proportion to weights', () => {
    // Weights 1 and 3: rng < 0.25 → first route, otherwise the second.
    const picked = assignRoutes(
      routes,
      3,
      (() => {
        const seq = [0.1, 0.3, 0.99];
        let i = 0;
        return () => seq[i++]!;
      })(),
      [1, 3],
    );
    expect(picked.map((r) => r.nodeIds[1])).toEqual(['a', 'b', 'b']);
  });

  it('assigns nothing when there are no routes', () => {
    expect(assignRoutes([], 3, Math.random)).toEqual([]);
  });
});

describe('routeWeights', () => {
  it('prefers fewer hops', () => {
    const routes = enumerateRoutes(network, 3);
    const w = routeWeights(routes);
    // c>a>s and c>b>s (2 hops) outweigh c>a>b>s and c>b>a>s (3 hops).
    expect(Math.min(w[0]!, w[1]!)).toBeGreaterThan(Math.max(w[2]!, w[3]!));
  });

  it('boosts routes over roads that few other routes share', () => {
    // Three routes share x--s; only one uses the lonely y--s road.
    const r = (...ids: string[]) => ({ nodeIds: [], linkIds: ids });
    const w = routeWeights([
      r('c--x', 'x--s'),
      r('c--x2', 'x--s'),
      r('c--x3', 'x--s'),
      r('c--y', 'y--s'),
    ]);
    expect(w[3]).toBeGreaterThan(w[0]!);
  });

  it('is empty for no routes', () => {
    expect(routeWeights([])).toEqual([]);
  });
});
