import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Network } from '@netsim/shared';
import { findRoute } from './bfs.js';
import { createDefaultNetwork } from './topology.js';
import {
  DOCUMENTED_ROUTES as documented,
  SCENARIOS,
  expectDocumented as expectDocumentedResult,
  type Expected,
  type Scenario,
} from '../test/demo-routes.js';

const net = createDefaultNetwork();

const run = (s: Scenario, network: Network = net) =>
  findRoute(network, s.from ?? network.clientId, network.serverId, {
    disabledNodeIds: new Set(s.nodes),
    disabledLinkIds: new Set(s.links),
  });

const expectDocumented = (s: Scenario, expected: Expected, network: Network = net) => {
  const r = run(s, network);
  expectDocumentedResult({ ...r, routed: r.found }, expected);
};

describe('demo routes in docs/architecture.md', () => {
  it('documents exactly the six demo scenarios', () => {
    expect(documented.map(([label]) => label)).toEqual(Object.keys(SCENARIOS));
  });

  it.each(documented)('%s', (label, expected) => {
    expectDocumented(SCENARIOS[label]!, expected);
  });

  it('follows the documented roads on the healthy network', () => {
    expect(run({}).linkPath).toEqual([
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

  it('searches ring by ring on the healthy network', () => {
    const r = run({});
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
      'barstow',
      'oakland',
      'fresno',
      'las-vegas',
      'redding',
      'sacramento',
      'tonopah',
      'medford',
      'reno',
      'winnemucca',
      'eugene',
      'klamath-falls',
      'boise',
      'bend',
      'portland',
      'ontario',
      'burns',
      'oregon-dc',
    ]);
    const depths = r.visitOrder.map((s) => s.depth);
    expect(depths).toEqual([...depths].sort((a, b) => a - b));
  });

  it('explores the documented 10 stations before giving up', () => {
    expect(
      run(SCENARIOS['`sacramento` + `redding` + `barstow`']!).visitOrder.map((s) => s.nodeId),
    ).toEqual([
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
});

describe('neighbor order', () => {
  it('uses code-unit order, which some locales disagree with', () => {
    // Estonian collation puts "z" before "t"; Danish puts "aa" after "z".
    const ids = ['z', 't', 's', 'ab', 'aa', 'a-b', 'a9'];
    const star: Network = {
      clientId: 'hub',
      serverId: 'z',
      nodes: ['hub', ...ids].map((id) => ({
        id,
        label: id,
        kind: id === 'hub' ? 'client' : 'router',
        lat: 0,
        lon: 0,
        place: 'Fixture',
      })),
      links: ids.map((id) => ({ id: `hub--${id}`, source: 'hub', target: id, distanceKm: 0 })),
    };
    expect(run({}, star).visitOrder.map((s) => s.nodeId)).toEqual([
      'hub',
      'a-b',
      'a9',
      'aa',
      'ab',
      's',
      't',
      'z',
    ]);
  });

  describe('when the server locale sorts strings differently', () => {
    beforeEach(() => {
      // Simulate a locale whose collation is the reverse of code-unit order.
      vi.spyOn(String.prototype, 'localeCompare').mockImplementation(function (
        this: string,
        that: string,
      ) {
        return this < that ? 1 : this > that ? -1 : 0;
      });
    });
    afterEach(() => vi.restoreAllMocks());

    it.each(documented)('still produces the documented route: %s', (label, expected) => {
      expectDocumented(SCENARIOS[label]!, expected);
    });
  });
});

describe('visitOrder determinism', () => {
  const shuffles: [string, (n: Network) => Network][] = [
    ['reversed links', (n) => ({ ...n, links: [...n.links].reverse() })],
    ['reversed nodes', (n) => ({ ...n, nodes: [...n.nodes].reverse() })],
    [
      'rotated links and nodes',
      (n) => ({
        ...n,
        nodes: [...n.nodes.slice(7), ...n.nodes.slice(0, 7)],
        links: [...n.links.slice(11), ...n.links.slice(0, 11)],
      }),
    ],
    [
      'links with source and target swapped',
      (n) => ({
        ...n,
        links: n.links.map((l) => ({ ...l, source: l.target, target: l.source })),
      }),
    ],
  ];

  it.each(Object.entries(SCENARIOS))('is identical across repeated runs: %s', (_, s) => {
    const first = run(s);
    for (let i = 0; i < 5; i++) expect(run(s)).toEqual(first);
  });

  it.each(shuffles)('does not depend on input order: %s', (_, shuffle) => {
    const shuffled = shuffle(net);
    for (const s of Object.values(SCENARIOS)) expect(run(s, shuffled)).toEqual(run(s));
  });
});
