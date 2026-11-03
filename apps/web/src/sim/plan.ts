import type { Network, PacketizeResponse, RouteResponse } from '@netsim/shared';
import type { Point } from '../view2d/layout';
import { assignRoutes, enumerateRoutes } from './routes';
import { buildTimeline, type Timeline } from './timeline';

/**
 * Builds the animation for one Send. Every car gets a randomly chosen route among all routes with
 * the same (minimum) hop count as the BFS result, so every route is a valid "fewest hops" answer.
 * `rng` is injectable so tests can pin the choice.
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
  const routes =
    route.status === 'routed'
      ? assignRoutes(
          enumerateRoutes(network, disabledNodeIds, disabledLinkIds, hops),
          packets.cars.length,
          rng,
        )
      : [];
  return buildTimeline(packets.cars, routes, pos, route.visitOrder.length);
}
