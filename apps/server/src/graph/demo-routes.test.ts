import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Network } from '@netsim/shared';
import { findRoute, type FailureState } from './bfs.js';
import { createDefaultNetwork } from './topology.js';

const net = createDefaultNetwork();

interface Scenario {
  from?: string;
  nodes?: string[];
  links?: string[];
}

/** Keyed by the "Failures" column of the demo-routes table in `docs/architecture.md`. */
const SCENARIOS: Record<string, Scenario> = {
  none: {},
  'station `oakland`': { nodes: ['oakland'] },
  'road `oakland--redding`': { links: ['oakland--redding'] },
  '`sacramento` + `redding`': { nodes: ['sacramento', 'redding'] },
  'start at `sacramento`': { from: 'sacramento' },
};

const failures = ({ nodes = [], links = [] }: Scenario): FailureState => ({
  disabledNodeIds: new Set(nodes),
  disabledLinkIds: new Set(links),
});
const run = (s: Scenario, network: Network = net) =>
  findRoute(network, s.from ?? network.clientId, network.serverId, failures(s));

type Expected = { path: string[]; hops?: number } | { unreachable: true; explored: number };

/** Parses the demo-routes table so the doc and these tests can never drift apart. */
function documentedRoutes(): [string, Expected][] {
  const doc = readFileSync(new URL('../../../../docs/architecture.md', import.meta.url), 'utf8');
  const section = /^### Demo routes[\s\S]*?(?=^### )/m.exec(doc)?.[0] ?? '';
  const rows = [...section.matchAll(/^\| (.+?) +\| (.+?) +\|$/gm)].slice(2); // skip header + rule
  return rows.map(([, label, route]) => {
    const explored = /^none — BFS explores (\d+) stations/.exec(route!);
    if (explored) return [label!, { unreachable: true, explored: Number(explored[1]) }];
    const hops = /\((\d+) hops\)$/.exec(route!);
    const path = route!.replace(/\s*\(\d+ hops\)$/, '').split(' → ');
    return [label!, { path, hops: hops ? Number(hops[1]) : undefined }];
  });
}

const documented = documentedRoutes();

function expectDocumented(s: Scenario, expected: Expected, network: Network = net) {
  const r = run(s, network);
  if ('unreachable' in expected) {
    expect(r.found).toBe(false);
    expect(r.path).toEqual([]);
    expect(r.linkPath).toEqual([]);
    expect(r.visitOrder).toHaveLength(expected.explored);
  } else {
    expect(r.found).toBe(true);
    expect(r.path).toEqual(expected.path);
    expect(r.linkPath).toHaveLength(r.path.length - 1);
    if (expected.hops !== undefined) expect(r.path.length - 1).toBe(expected.hops);
  }
}

describe('demo routes in docs/architecture.md', () => {
  it('documents exactly the five demo scenarios', () => {
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

  it('explores the documented 10 stations before giving up', () => {
    expect(run(SCENARIOS['`sacramento` + `redding`']!).visitOrder.map((s) => s.nodeId)).toEqual([
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
