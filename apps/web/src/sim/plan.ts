import type { PacketizeResponse, RouteResponse } from '@netsim/shared';
import { buildTimeline, type Point, type Timeline } from './timeline';

/** Every group follows the route chosen by the selected algorithm. Only departure gaps and
 * cruising speeds vary; randomness never changes the route used for the algorithm demo. */
export function planRun(
  packets: PacketizeResponse,
  route: RouteResponse,
  pos: ReadonlyMap<string, Point>,
  rng: () => number,
  burst = false,
): Timeline {
  const routes =
    route.status === 'routed'
      ? packets.cars.map(() => ({ nodeIds: route.path, linkIds: route.linkPath }))
      : [];
  return buildTimeline(
    packets.cars,
    routes,
    pos,
    route.visitOrder.length,
    burst ? undefined : rng,
    burst ? 0 : undefined,
  );
}
