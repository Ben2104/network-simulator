import { describe, expect, it } from 'vitest';
import { findRoute, type FailureState } from './bfs.js';
import { createDefaultNetwork } from './topology.js';

const net = createDefaultNetwork();
const failures = (nodes: string[] = [], links: string[] = []): FailureState => ({
  disabledNodeIds: new Set(nodes),
  disabledLinkIds: new Set(links),
});

describe('findRoute', () => {
  it('finds the shortest route on the healthy network', () => {
    const r = findRoute(net, 'client', 'server', failures());
    expect(r.found).toBe(true);
    expect(r.path).toEqual(['client', 'r1', 'r3', 'r6', 'server']);
    expect(r.linkPath).toEqual(['client-r1', 'r1-r3', 'r3-r6', 'r6-server']);
  });

  it('records visit order with depths, starting at the client', () => {
    const r = findRoute(net, 'client', 'server', failures());
    expect(r.visitOrder[0]).toEqual({
      nodeId: 'client',
      parentId: null,
      viaLinkId: null,
      depth: 0,
    });
    expect(r.visitOrder.map((s) => s.nodeId)).toEqual([
      'client',
      'r1',
      'r2',
      'r3',
      'r4',
      'r5',
      'r6',
      'r7',
      'server',
    ]);
    const depths = r.visitOrder.map((s) => s.depth);
    expect(depths).toEqual([...depths].sort((a, b) => a - b));
  });

  it('reroutes around a disabled router', () => {
    const r = findRoute(net, 'client', 'server', failures(['r6']));
    expect(r.path).toEqual(['client', 'r1', 'r4', 'r7', 'server']);
    expect(r.path).not.toContain('r6');
  });

  it('reroutes around a disabled link', () => {
    const r = findRoute(net, 'client', 'server', failures([], ['r3-r6']));
    expect(r.path).toEqual(['client', 'r1', 'r4', 'r6', 'server']);
    expect(r.linkPath).not.toContain('r3-r6');
  });

  it('reports unreachable when every route is cut', () => {
    const r = findRoute(net, 'client', 'server', failures(['r6', 'r7']));
    expect(r.found).toBe(false);
    expect(r.path).toEqual([]);
    expect(r.linkPath).toEqual([]);
    expect(r.visitOrder.length).toBeGreaterThan(0);
  });

  it('reports unreachable when the destination itself is disabled', () => {
    expect(findRoute(net, 'client', 'server', failures(['server'])).found).toBe(false);
  });

  it('is deterministic regardless of link order', () => {
    const shuffled = { ...net, links: [...net.links].reverse() };
    expect(findRoute(shuffled, 'client', 'server', failures())).toEqual(
      findRoute(net, 'client', 'server', failures()),
    );
  });
});
