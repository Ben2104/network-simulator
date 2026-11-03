import { describe, expect, it } from 'vitest';
import type { Network } from '@netsim/shared';
import { assignRoutes, enumerateRoutes } from './routes';

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
const none = new Set<string>();

describe('enumerateRoutes', () => {
  it('returns shortest routes first and respects the hop bound', () => {
    expect(enumerateRoutes(network, none, none, 2).map((r) => r.nodeIds)).toEqual([
      ['c', 'a', 's'],
      ['c', 'b', 's'],
    ]);
    const withSlack = enumerateRoutes(network, none, none, 3).map((r) => r.nodeIds.join('>'));
    expect(withSlack).toEqual(['c>a>s', 'c>b>s', 'c>a>b>s', 'c>b>a>s']);
  });

  it('reports link IDs that match the hop sequence', () => {
    const [first] = enumerateRoutes(network, none, none, 2);
    expect(first?.linkIds).toEqual(['c--a', 'a--s']);
  });

  it('skips disabled stations and roads', () => {
    const noA = enumerateRoutes(network, new Set(['a']), none, 3).map((r) => r.nodeIds.join('>'));
    expect(noA).toEqual(['c>b>s']);
    const noBS = enumerateRoutes(network, none, new Set(['b--s']), 3).map((r) =>
      r.nodeIds.join('>'),
    );
    expect(noBS).toEqual(['c>a>s', 'c>b>a>s']);
  });

  it('returns nothing when the server is unreachable', () => {
    expect(enumerateRoutes(network, new Set(['a', 'b']), none, 5)).toEqual([]);
  });
});

describe('assignRoutes', () => {
  const routes = enumerateRoutes(network, none, none, 2);

  it('gives every car a valid route, picked by the rng', () => {
    const seq = [0, 0.99, 0.5, 0.2];
    let i = 0;
    const picked = assignRoutes(routes, 4, () => seq[i++]!);
    expect(picked.map((r) => r.nodeIds[1])).toEqual(['a', 'b', 'b', 'a']);
  });

  it('assigns nothing when there are no routes', () => {
    expect(assignRoutes([], 3, Math.random)).toEqual([]);
  });
});
