import type { PacketizeResponse, RouteResponse } from '@netsim/shared';
import { buildTimeline, type Point, type Route, type Timeline } from './timeline';

/**
 * Builds the animation for one Send. Every car drives the server's BFS route (fewest hops, the
 * highlighted answer), straight to the server. Departure gaps and cruising speeds still vary per
 * car so the convoy looks like traffic; `rng` is injectable so tests can pin them.
 */
export function planRun(
  packets: PacketizeResponse,
  route: RouteResponse,
  pos: ReadonlyMap<string, Point>,
  rng: () => number,
): Timeline {
  const bfs: Route = { nodeIds: route.path, linkIds: route.linkPath };
  const routes = route.status === 'routed' ? packets.cars.map(() => bfs) : [];
  return buildTimeline(packets.cars, routes, pos, route.visitOrder.length, rng);
}
