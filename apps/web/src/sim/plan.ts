import type { Network, PacketizeResponse, RouteResponse } from '@netsim/shared';
import { assignRoutes, enumerateRoutes, routeWeights, ROUTE_SLACK, type Route } from './routes';
import { buildTimeline, type Point, type Timeline } from './timeline';

/**
 * Builds the animation for one Send. The server's BFS route stays the highlighted answer; the cars
 * spread out like real traffic. Each car picks a random route among all routes at most
 * `ROUTE_SLACK` hops longer than BFS, weighted toward fewer hops and toward roads few other routes
 * share (so the desert corridor carries some cars too). Departure gaps and cruising speeds vary
 * per car. `rng` is injectable so tests can pin every choice.
 */
export function planRun(
  network: Network,
  packets: PacketizeResponse,
  route: RouteResponse,
  pos: ReadonlyMap<string, Point>,
  disabledNodeIds: ReadonlySet<string>,
  disabledLinkIds: ReadonlySet<string>,
  rng: () => number,
): Timeline {
  const hops = route.path.length - 1;
  let routes: Route[] = [];
  if (route.status === 'routed') {
    const candidates = enumerateRoutes(
      network,
      disabledNodeIds,
      disabledLinkIds,
      hops + ROUTE_SLACK,
    );
    routes = assignRoutes(candidates, packets.cars.length, rng, routeWeights(candidates));
  }
  return buildTimeline(packets.cars, routes, pos, route.visitOrder.length, rng);
}
