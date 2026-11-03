import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { haversineKm } from '@netsim/shared';
import { createDefaultNetwork } from './topology.js';
import { findRoute, type FailureState } from './bfs.js';

const net = createDefaultNetwork();
const failures = (nodes: string[] = []): FailureState => ({
  disabledNodeIds: new Set(nodes),
  disabledLinkIds: new Set(),
});
const byId = new Map(net.nodes.map((n) => [n.id, n]));

describe('default topology', () => {
  it('has 27 nodes and 35 links with unique IDs', () => {
    expect(net.nodes).toHaveLength(27);
    expect(net.links).toHaveLength(35);
    expect(new Set(net.nodes.map((n) => n.id)).size).toBe(27);
    expect(new Set(net.links.map((l) => l.id)).size).toBe(35);
  });

  it('has exactly one client lot (CSULB) and one server lot (Oregon)', () => {
    expect(net.nodes.filter((n) => n.kind === 'client').map((n) => n.id)).toEqual(['csulb']);
    expect(net.nodes.filter((n) => n.kind === 'server').map((n) => n.id)).toEqual(['oregon-dc']);
    expect(net.clientId).toBe('csulb');
    expect(net.serverId).toBe('oregon-dc');
  });

  it('links only existing nodes and names links source--target', () => {
    for (const link of net.links) {
      expect(byId.has(link.source)).toBe(true);
      expect(byId.has(link.target)).toBe(true);
      expect(link.id).toBe(`${link.source}--${link.target}`);
    }
  });

  it('is connected: every station is reachable from the CSULB lot', () => {
    for (const node of net.nodes) {
      const r = findRoute(net, net.clientId, node.id, failures());
      expect(r.found, `${node.id} is unreachable`).toBe(true);
    }
  });

  it('stores the haversine distance (0.1 km precision) on every link', () => {
    for (const link of net.links) {
      const expected = haversineKm(byId.get(link.source)!, byId.get(link.target)!);
      expect(Math.abs(link.distanceKm - expected)).toBeLessThanOrEqual(0.05);
    }
  });

  it('survives any single router failure (≥ 2 station-disjoint routes)', () => {
    const routers = net.nodes.filter((n) => n.kind === 'router');
    for (const router of routers) {
      const r = findRoute(net, net.clientId, net.serverId, failures([router.id]));
      expect(r.found, `breaking ${router.id} disconnected the network`).toBe(true);
    }
  });

  it('the east corridor takes over when both western corridors are cut', () => {
    const r = findRoute(net, net.clientId, net.serverId, failures(['sacramento', 'redding']));
    expect(r.found).toBe(true);
    expect(r.path).toContain('las-vegas');
    expect(r.path).toContain('boise');
  });

  it('default route has no link longer than 450 km', () => {
    const r = findRoute(net, net.clientId, net.serverId, failures());
    const linkById = new Map(net.links.map((l) => [l.id, l]));
    for (const id of r.linkPath) {
      expect(linkById.get(id)!.distanceKm).toBeLessThanOrEqual(450);
    }
  });

  it('returns a fresh copy each call', () => {
    const a = createDefaultNetwork();
    a.nodes[0]!.label = 'changed';
    a.links.pop();
    expect(createDefaultNetwork()).toEqual(net);
  });
});

/** `docs/architecture.md` is the source of truth for the topology; keep code and docs in lockstep. */
describe('default topology matches docs/architecture.md', () => {
  const doc = readFileSync(new URL('../../../../docs/architecture.md', import.meta.url), 'utf8');

  it('has the documented nodes, in order', () => {
    const row =
      /^\| `([a-z0-9-]+)` +\| (.+?) +\| (client|router|server) +\| (.+?) +\| ([\d.-]+) +\| ([\d.-]+) +\|$/gm;
    const documented = [...doc.matchAll(row)].map(([, id, label, kind, place, lat, lon]) => ({
      id,
      label,
      kind,
      lat: Number(lat),
      lon: Number(lon),
      place,
    }));
    expect(documented).toHaveLength(27);
    expect(net.nodes).toEqual(documented);
  });

  it('has the documented roads, in order', () => {
    const roads = /^Roads: ([\s\S]+?)\. Longest:/m.exec(doc)?.[1];
    expect(roads).toBeDefined();
    const documented = roads!.split(/,\s+/).map((pair) => pair.replace('–', '--'));
    expect(net.links.map((l) => l.id)).toEqual(documented);
  });

  it('has the documented longest road', () => {
    const [, pair, km] = /Longest: (\S+), (\d+) km\./.exec(doc)!;
    const longest = net.links.reduce((a, b) => (b.distanceKm > a.distanceKm ? b : a));
    expect(longest.id).toBe(pair!.replace('–', '--'));
    expect(Math.round(longest.distanceKm)).toBe(Number(km));
  });
});
