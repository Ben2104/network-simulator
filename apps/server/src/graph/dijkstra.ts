import { bandwidthCost, bandwidthFor, type BfsStep, type Network } from '@netsim/shared';
import type { BfsResult, FailureState } from './bfs.js';

const EPSILON = 1e-9;
const codeOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Positive-weight Dijkstra; O(V² + E) is sufficient for the fixed 27-router teaching graph.
 * Nodes settle by cost, then hops, then code-unit ID so ties do not depend on locale/input order. */
export function findWeightedRoute(
  network: Network,
  from: string,
  to: string,
  failures: FailureState,
  bandwidths: Readonly<Record<string, number>> = {},
): BfsResult {
  const adjacency = new Map<string, { to: string; linkId: string; cost: number }[]>();
  for (const n of network.nodes) if (!failures.disabledNodeIds.has(n.id)) adjacency.set(n.id, []);
  for (const l of network.links) {
    if (failures.disabledLinkIds.has(l.id)) continue;
    const a = adjacency.get(l.source),
      b = adjacency.get(l.target);
    if (!a || !b) continue;
    const cost = bandwidthCost(bandwidthFor(l.id, bandwidths));
    a.push({ to: l.target, linkId: l.id, cost });
    b.push({ to: l.source, linkId: l.id, cost });
  }
  for (const edges of adjacency.values())
    edges.sort((a, b) => codeOrder(a.to, b.to) || codeOrder(a.linkId, b.linkId));
  const visitOrder: BfsStep[] = [];
  const unreachable = (): BfsResult => ({ found: false, visitOrder, path: [], linkPath: [] });
  if (!adjacency.has(from) || !adjacency.has(to)) return unreachable();
  const best = new Map<string, BfsStep>([
    [from, { nodeId: from, parentId: null, viaLinkId: null, depth: 0, cost: 0 }],
  ]);
  const settled = new Set<string>();
  for (;;) {
    let current: BfsStep | undefined;
    for (const step of best.values()) {
      if (settled.has(step.nodeId)) continue;
      if (
        !current ||
        step.cost! < current.cost! - EPSILON ||
        (Math.abs(step.cost! - current.cost!) <= EPSILON &&
          (step.depth < current.depth ||
            (step.depth === current.depth && codeOrder(step.nodeId, current.nodeId) < 0)))
      )
        current = step;
    }
    if (!current) return unreachable();
    settled.add(current.nodeId);
    visitOrder.push(current);
    if (current.nodeId === to) {
      const path: string[] = [],
        linkPath: string[] = [];
      for (
        let step: BfsStep | undefined = current;
        step;
        step = step.parentId ? best.get(step.parentId) : undefined
      ) {
        path.push(step.nodeId);
        if (step.viaLinkId) linkPath.push(step.viaLinkId);
      }
      return { found: true, visitOrder, path: path.reverse(), linkPath: linkPath.reverse() };
    }
    for (const edge of adjacency.get(current.nodeId)!) {
      if (settled.has(edge.to)) continue;
      const cost = current.cost! + edge.cost;
      const depth = current.depth + 1;
      const old = best.get(edge.to);
      if (
        !old ||
        cost < old.cost! - EPSILON ||
        (Math.abs(cost - old.cost!) <= EPSILON && depth < old.depth)
      )
        best.set(edge.to, {
          nodeId: edge.to,
          parentId: current.nodeId,
          viaLinkId: edge.linkId,
          depth,
          cost,
        });
    }
  }
}
