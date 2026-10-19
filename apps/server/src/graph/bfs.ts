import type { BfsStep, Network } from '@netsim/shared';

export interface FailureState {
  disabledNodeIds: ReadonlySet<string>;
  disabledLinkIds: ReadonlySet<string>;
}

export interface BfsResult {
  found: boolean;
  visitOrder: BfsStep[];
  path: string[];
  linkPath: string[];
}

interface Edge {
  to: string;
  linkId: string;
}

/** Undirected adjacency list. Neighbors are sorted by node ID so BFS output never depends on link array order. */
function buildAdjacency(network: Network, failures: FailureState): Map<string, Edge[]> {
  const adj = new Map<string, Edge[]>();
  for (const node of network.nodes) {
    if (!failures.disabledNodeIds.has(node.id)) adj.set(node.id, []);
  }
  for (const link of network.links) {
    if (failures.disabledLinkIds.has(link.id)) continue;
    const a = adj.get(link.source);
    const b = adj.get(link.target);
    if (!a || !b) continue; // an endpoint is disabled
    a.push({ to: link.target, linkId: link.id });
    b.push({ to: link.source, linkId: link.id });
  }
  for (const edges of adj.values()) edges.sort((x, y) => x.to.localeCompare(y.to));
  return adj;
}

/**
 * Breadth-first search from `from` to `to`, skipping disabled routers and links.
 * Pure function: no I/O, no shared state, so it is trivially unit-testable.
 */
export function findRoute(
  network: Network,
  from: string,
  to: string,
  failures: FailureState,
): BfsResult {
  const adj = buildAdjacency(network, failures);
  const unreachable = (visitOrder: BfsStep[]): BfsResult => ({
    found: false,
    visitOrder,
    path: [],
    linkPath: [],
  });
  if (!adj.has(from) || !adj.has(to)) return unreachable([]);

  const parents = new Map<string, BfsStep>();
  const start: BfsStep = { nodeId: from, parentId: null, viaLinkId: null, depth: 0 };
  parents.set(from, start);
  const queue: BfsStep[] = [start];
  const visitOrder: BfsStep[] = [];

  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!;
    visitOrder.push(current);
    if (current.nodeId === to) {
      const path: string[] = [];
      const linkPath: string[] = [];
      for (let step: BfsStep | undefined = current; step;) {
        path.push(step.nodeId);
        if (step.viaLinkId) linkPath.push(step.viaLinkId);
        step = step.parentId ? parents.get(step.parentId) : undefined;
      }
      return { found: true, visitOrder, path: path.reverse(), linkPath: linkPath.reverse() };
    }
    for (const edge of adj.get(current.nodeId)!) {
      if (parents.has(edge.to)) continue;
      const next: BfsStep = {
        nodeId: edge.to,
        parentId: current.nodeId,
        viaLinkId: edge.linkId,
        depth: current.depth + 1,
      };
      parents.set(edge.to, next);
      queue.push(next);
    }
  }
  return unreachable(visitOrder);
}
