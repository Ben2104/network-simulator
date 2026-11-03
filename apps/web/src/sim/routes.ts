import type { Network } from '@netsim/shared';

export interface Route {
  nodeIds: string[];
  linkIds: string[];
}

/** Hard stop for the DFS; the real 19-node graph stays far below it. */
const MAX_ROUTES = 64;

/**
 * Every simple client → server path with at most `maxHops` hops, skipping disabled stations and
 * roads. Fewest hops first, then by ID, so output is deterministic. `maxHops` is the BFS hop count
 * plus a small slack: cars then spread over plausible alternatives instead of absurd detours.
 */
export function enumerateRoutes(
  network: Network,
  disabledNodeIds: ReadonlySet<string>,
  disabledLinkIds: ReadonlySet<string>,
  maxHops: number,
): Route[] {
  const adj = new Map<string, { to: string; linkId: string }[]>();
  for (const l of network.links) {
    if (disabledLinkIds.has(l.id)) continue;
    if (disabledNodeIds.has(l.source) || disabledNodeIds.has(l.target)) continue;
    (adj.get(l.source) ?? adj.set(l.source, []).get(l.source)!).push({
      to: l.target,
      linkId: l.id,
    });
    (adj.get(l.target) ?? adj.set(l.target, []).get(l.target)!).push({
      to: l.source,
      linkId: l.id,
    });
  }

  const routes: Route[] = [];
  const nodeIds = [network.clientId];
  const linkIds: string[] = [];
  const onPath = new Set(nodeIds);

  const visit = (id: string) => {
    if (routes.length >= MAX_ROUTES) return;
    if (id === network.serverId) {
      routes.push({ nodeIds: [...nodeIds], linkIds: [...linkIds] });
      return;
    }
    if (linkIds.length >= maxHops) return;
    for (const edge of adj.get(id) ?? []) {
      if (onPath.has(edge.to)) continue;
      onPath.add(edge.to);
      nodeIds.push(edge.to);
      linkIds.push(edge.linkId);
      visit(edge.to);
      linkIds.pop();
      nodeIds.pop();
      onPath.delete(edge.to);
    }
  };
  visit(network.clientId);

  return routes.sort(
    (a, b) =>
      a.linkIds.length - b.linkIds.length || a.nodeIds.join().localeCompare(b.nodeIds.join()),
  );
}

/** One route per car, chosen independently and uniformly at random. `rng` returns [0, 1). */
export function assignRoutes(
  routes: readonly Route[],
  carCount: number,
  rng: () => number,
): Route[] {
  if (routes.length === 0) return [];
  return Array.from({ length: carCount }, () => routes[Math.floor(rng() * routes.length)]!);
}
