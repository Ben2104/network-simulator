import { describe, expect, it } from 'vitest';
import { AUTONOMOUS_SYSTEMS, asnOf, neighborRole } from '@netsim/shared';
import { findRoute } from './bfs.js';
import { findBgpRoute } from './bgp.js';
import { createDefaultNetwork } from './topology.js';

const network = createDefaultNetwork();
const failures = (nodes: string[] = [], links: string[] = []) => ({
  disabledNodeIds: new Set(nodes),
  disabledLinkIds: new Set(links),
});
const run = (nodes: string[] = [], links: string[] = [], from = network.clientId) =>
  findBgpRoute(network, from, network.serverId, failures(nodes, links));

const DESERT = [
  'csulb',
  'lb-isp',
  'riverside',
  'barstow',
  'las-vegas',
  'tonopah',
  'winnemucca',
  'boise',
  'ontario',
  'pendleton',
  'oregon-dc',
];
const VALLEY = [
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
];

describe('illustrative AS map', () => {
  it('puts every station in exactly one AS', () => {
    const ids = AUTONOMOUS_SYSTEMS.flatMap((as) => as.nodeIds);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(network.nodes.map((n) => n.id).sort());
  });

  it('keeps each AS connected by its own roads', () => {
    for (const as of AUTONOMOUS_SYSTEMS) {
      const members = new Set(as.nodeIds);
      const seen = new Set([as.nodeIds[0]!]);
      for (let grew = true; grew;) {
        grew = false;
        for (const l of network.links) {
          if (!members.has(l.source) || !members.has(l.target)) continue;
          for (const [a, b] of [
            [l.source, l.target],
            [l.target, l.source],
          ] as const)
            if (seen.has(a) && !seen.has(b)) grew = seen.add(b).size > 0;
        }
      }
      expect([...seen].sort(), as.name).toEqual([...as.nodeIds].sort());
    }
  });

  it('gives every road between two ASes a business relationship', () => {
    for (const l of network.links) {
      const a = asnOf(l.source)!,
        b = asnOf(l.target)!;
      if (a !== b) expect(neighborRole(a, b), l.id).toBeDefined();
    }
  });
});

describe('simplified BGP', () => {
  it('follows policy over hop count on the healthy network', () => {
    const r = run();
    expect(r.found).toBe(true);
    // SoCal Metro prefers its free peer (Desert Carrier) over paying its provider.
    expect(r.asPath).toEqual([64512, 64520, 64550, 64560]);
    expect(r.path).toEqual(DESERT);
    expect(r.path.length).toBeGreaterThan(
      findRoute(network, 'csulb', 'oregon-dc', failures()).path.length,
    );
  });

  it('falls back to the paid provider when the peering road is down', () => {
    const r = run([], ['riverside--barstow']);
    expect(r.asPath).toEqual([64512, 64520, 64540, 64560]);
    expect(r.path).toEqual(VALLEY);
  });

  it('never uses roads a policy does not allow, even when they are connected', () => {
    // Coastal Backbone learns Oregon from a peer and only re-advertises to customers, so the
    // intact coast corridor does not help the campus. BFS still finds it.
    const cut = ['barstow', 'sacramento'];
    expect(run(cut).found).toBe(false);
    expect(findRoute(network, 'csulb', 'oregon-dc', failures(cut)).found).toBe(true);
    const r = run(cut);
    expect(r.asPath).toEqual([]);
    expect(r.visitOrder.map((s) => s.nodeId)).toEqual(['csulb', 'el-segundo']);
  });

  it('routes inside an AS by configured cost', () => {
    expect(run(['pendleton']).path.slice(-4)).toEqual(['ontario', 'burns', 'bend', 'oregon-dc']);
    const slow = findBgpRoute(network, 'csulb', 'oregon-dc', failures(), {
      'lb-isp--riverside': 10,
    });
    expect(slow.path).toEqual(DESERT);
    expect(slow.visitOrder.at(-1)!.cost).toBeGreaterThan(100);
  });

  it('never steps back into an AS it already left', () => {
    for (const nodes of [[], ['barstow'], ['pendleton'], ['tonopah']]) {
      const asns = run(nodes).path.map((id) => asnOf(id)!);
      const dedup = asns.filter((asn, i) => asn !== asns[i - 1]);
      expect(new Set(dedup).size, nodes.join()).toBe(dedup.length);
      expect(dedup, nodes.join()).toEqual(run(nodes).asPath);
    }
  });

  it('starts from any station for live reroutes', () => {
    expect(run([], [], 'sacramento').path).toEqual([
      'sacramento',
      'reno',
      'klamath-falls',
      'bend',
      'oregon-dc',
    ]);
  });

  it('is unreachable when the start or destination is offline', () => {
    expect(run(['oregon-dc']).found).toBe(false);
    expect(run(['csulb']).visitOrder).toEqual([]);
  });

  it('is deterministic', () => {
    expect(run(['tonopah'])).toEqual(run(['tonopah']));
  });
});
