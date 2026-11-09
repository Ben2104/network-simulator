import type { Network, PacketizeResponse, RouteResponse } from '@netsim/shared';
import { assignRoutes, enumerateRoutes, routeWeights, ROUTE_SLACK } from './routes';
import { buildTimeline, type Point, type Route, type Timeline } from './timeline';

/**
 * Share of cars that drive the server's BFS route (rounded up, so BFS is always the majority).
 * The rest wander: each takes another route through other stations.
 */
export const BFS_SHARE = 0.7;

/**
 * Builds the animation for one Send. Most cars (`BFS_SHARE`) drive the server's BFS route (fewest
 * hops, the highlighted answer), straight to the server. The others wander: each picks a random
 * route other than BFS among those at most `ROUTE_SLACK` hops longer, weighted toward fewer hops
 * and rarely shared roads. The first car always takes BFS, so "Follow lead car" opens on the
 * answer. Which cars wander, their routes, departure gaps and speeds all come from `rng`, which is
 * injectable so tests can pin every choice.
 */
export function planRun(
  network: Network,
  packets: PacketizeResponse,
  route: RouteResponse,
  pos: ReadonlyMap<string, Point>,
  rng: () => number,
): Timeline {
  let routes: Route[] = [];
  if (route.status === 'routed') {
    const bfs: Route = { nodeIds: route.path, linkIds: route.linkPath };
    const others = enumerateRoutes(network, bfs.linkIds.length + ROUTE_SLACK).filter(
      (r) => r.nodeIds.join() !== bfs.nodeIds.join(),
    );
    const n = packets.cars.length;
    const wanderers = others.length > 0 ? n - Math.ceil(n * BFS_SHARE) : 0;
    // Shuffle cars 1..n-1 (Fisher-Yates) and let the first `wanderers` of them wander.
    const order = packets.cars.map((_, i) => i).slice(1);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    const picks = assignRoutes(others, wanderers, rng, routeWeights(others));
    routes = packets.cars.map(() => bfs);
    picks.forEach((r, k) => (routes[order[k]!] = r));
  }
  return buildTimeline(packets.cars, routes, pos, route.visitOrder.length, rng);
}
