import type { Network } from '@netsim/shared';

export interface Route {
  nodeIds: string[];
  linkIds: string[];
}

/** Hard stop for the search; the 27-station graph has ~40 routes within two extra hops. */
const MAX_ROUTES = 256;

/**
 * Extra hops a car may take beyond the BFS hop count. Two lets traffic spill onto the inland
 * cross-links and the east (desert) corridor, which is one hop longer than the default route.
 */
export const ROUTE_SLACK = 2;

/** Weight multiplier per extra hop: a route one hop longer is picked 0.55× as often. */
const SLACK_DECAY = 0.55;

/**
 * Every simple client → server path with at most `maxHops` hops, skipping disabled stations and
 * roads. Fewest hops first, then by ID, so output is deterministic. `maxHops` is the BFS hop count
 * plus a small slack: cars then spread over plausible alternatives instead of absurd detours.
 * Branches that cannot reach the server within the hop budget are pruned (hop distance to the
 * server is precomputed), so the cap only guards against pathological graphs.
 */
export function enumerateRoutes(
  network: Network,
  disabledNodeIds: ReadonlySet<string>,
  disabledLinkIds: ReadonlySet<string>,
  maxHops: number,
): Route[] {
  const adj = new Map<string, { to: string; linkId: string }[]>();
  const edge = (from: string, to: string, linkId: string) =>
    (adj.get(from) ?? adj.set(from, []).get(from)!).push({ to, linkId });
  for (const l of network.links) {
    if (disabledLinkIds.has(l.id)) continue;
    if (disabledNodeIds.has(l.source) || disabledNodeIds.has(l.target)) continue;
    edge(l.source, l.target, l.id);
    edge(l.target, l.source, l.id);
  }

  // Hops from every station to the server (reverse BFS); unreachable stations are absent.
  const toServer = new Map([[network.serverId, 0]]);
  const queue = [network.serverId];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!;
    for (const e of adj.get(id) ?? []) {
      if (toServer.has(e.to)) continue;
      toServer.set(e.to, toServer.get(id)! + 1);
      queue.push(e.to);
    }
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
    for (const e of adj.get(id) ?? []) {
      if (onPath.has(e.to)) continue;
      const rest = toServer.get(e.to);
      if (rest === undefined || linkIds.length + 1 + rest > maxHops) continue;
      onPath.add(e.to);
      nodeIds.push(e.to);
      linkIds.push(e.linkId);
      visit(e.to);
      linkIds.pop();
      nodeIds.pop();
      onPath.delete(e.to);
    }
  };
  if (toServer.has(network.clientId)) visit(network.clientId);

  // Code-unit order (not localeCompare), like the server's BFS, so output never depends on locale.
  const key = (r: Route) => r.nodeIds.join();
  return routes.sort(
    (a, b) =>
      a.linkIds.length - b.linkIds.length || (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0),
  );
}

/**
 * How likely each route is, relative to the others. Shorter routes are preferred (each extra hop
 * multiplies by `SLACK_DECAY`), and routes over rarely shared roads get a boost: a route's
 * "uniqueness" is the average of 1 / (routes using that road) over its roads. Without it the many
 * near-identical western variants would crowd out the lone desert corridor.
 */
export function routeWeights(routes: readonly Route[]): number[] {
  if (routes.length === 0) return [];
  const shortest = Math.min(...routes.map((r) => r.linkIds.length));
  const uses = new Map<string, number>();
  for (const r of routes) for (const id of r.linkIds) uses.set(id, (uses.get(id) ?? 0) + 1);
  return routes.map((r) => {
    const unique = r.linkIds.reduce((s, id) => s + 1 / uses.get(id)!, 0) / r.linkIds.length;
    return SLACK_DECAY ** (r.linkIds.length - shortest) * unique;
  });
}

/**
 * One route per car, chosen independently at random in proportion to `weights` (uniform when
 * omitted). `rng` returns [0, 1).
 */
export function assignRoutes(
  routes: readonly Route[],
  carCount: number,
  rng: () => number,
  weights?: readonly number[],
): Route[] {
  if (routes.length === 0) return [];
  const w = weights ?? routes.map(() => 1);
  const total = w.reduce((s, x) => s + x, 0);
  return Array.from({ length: carCount }, () => {
    let r = rng() * total;
    for (let i = 0; i < routes.length; i++) {
      r -= w[i]!;
      if (r < 0) return routes[i]!;
    }
    return routes[routes.length - 1]!;
  });
}
