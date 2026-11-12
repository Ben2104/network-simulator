import { nextNodeIndex, nodeTime, scheduleNodes } from './progress';
import type { Car, Network, RouteResponse } from '@netsim/shared';
import {
  CAR_SPEED,
  CAR_STAGGER_SEC,
  carStatus,
  queueWait,
  type CarPlan,
  type Point,
  type Timeline,
} from './timeline';

/** Only current/future failures interrupt a group. Passed routers and completed roads are safe. */
export function needsRetry(
  plan: CarPlan,
  now: number,
  nodes: ReadonlySet<string>,
  links: ReadonlySet<string>,
): boolean {
  if (carStatus(plan, now) === 'arrived') return false;
  return (
    !!plan.blocked ||
    plan.route.nodeIds.some((id, i) => nodes.has(id) && nodeTime(plan, i) >= now) ||
    plan.route.linkIds.some((id, i) => links.has(id) && nodeTime(plan, i + 1) > now)
  );
}

/** Keep unaffected and delivered groups. Retry only affected groups, strictly avoiding outages. */
export function retryTimeline(
  network: Network,
  timeline: Timeline,
  now: number,
  nodes: ReadonlySet<string>,
  links: ReadonlySet<string>,
  answer: RouteResponse,
  pos: ReadonlyMap<string, Point>,
  restoredRoutes?: ReadonlyMap<string, RouteResponse>,
): Timeline {
  let retryIndex = 0;
  const plans = timeline.plans.map((plan): CarPlan => {
    if (!needsRetry(plan, now, nodes, links)) {
      if (!restoredRoutes || carStatus(plan, now) === 'arrived') return plan;
      const k = nextNodeIndex(plan, now);
      const suffix = restoredRoutes.get(plan.route.nodeIds[k]!);
      if (
        !suffix ||
        suffix.status !== 'routed' ||
        suffix.linkPath.join('|') === plan.route.linkIds.slice(k).join('|')
      )
        return plan;
      const route = {
        nodeIds: [...plan.route.nodeIds.slice(0, k), ...suffix.path],
        linkIds: [...plan.route.linkIds.slice(0, k), ...suffix.linkPath],
      };
      const points = route.nodeIds.map((id) => pos.get(id)!);
      const cum = [0];
      for (let i = 1; i < points.length; i++)
        cum.push(
          cum[i - 1]! +
            Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y),
        );
      const at = k === 0 ? Math.max(now, plan.departAt) : nodeTime(plan, k);
      return scheduleNodes(network, {
        ...plan,
        route,
        points,
        cum,
        departAt: k === 0 ? at : plan.departAt,
        arriveAt: at + (cum[cum.length - 1]! - cum[k]!) / plan.speed,
        handoff: k === 0 ? undefined : { plan, at, nodeIndex: k },
      });
    }
    const blocked = answer.status !== 'routed';
    const route = blocked
      ? { nodeIds: [network.clientId], linkIds: [] }
      : { nodeIds: answer.path, linkIds: answer.linkPath };
    const points = route.nodeIds.map((id) => pos.get(id)!);
    const cum = [0];
    for (let i = 1; i < points.length; i++)
      cum.push(
        cum[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y),
      );
    const departAt = blocked
      ? now
      : Math.max(now, timeline.driveStart) + retryIndex++ * CAR_STAGGER_SEC;
    return scheduleNodes(network, {
      ...plan,
      handoff: undefined,
      nodeTimes: undefined,
      previous: plan,
      interruptedAt: now,
      blocked,
      route,
      points,
      cum,
      departAt,
      retries: (plan.retries ?? 0) + (blocked ? 0 : 1),
      arriveAt: departAt + cum[cum.length - 1]! / plan.speed,
    });
  });
  return {
    ...timeline,
    plans,
    end: plans.some((p) => p.blocked)
      ? Infinity
      : Math.max(timeline.driveStart, ...plans.map((p) => p.arriveAt)),
  };
}

/** An initially disconnected send still has one parked, blocked plan per actual group. */
export function blockedTimeline(
  network: Network,
  cars: readonly Car[],
  pos: ReadonlyMap<string, Point>,
  driveStart: number,
): Timeline {
  return {
    driveStart,
    end: Infinity,
    plans: cars.map((car) => ({
      carId: car.id,
      seq: car.seq,
      bytes: car.bytes,
      speed: CAR_SPEED,
      route: { nodeIds: [network.clientId], linkIds: [] },
      points: [pos.get(network.clientId)!],
      cum: [0],
      departAt: driveStart,
      arriveAt: driveStart,
      blocked: true,
    })),
  };
}

/** Only advance while a group is moving/queued. Never run an endless clock for blocked groups. */
export function clockStop(timeline: Timeline): number {
  return timeline.plans.length
    ? Math.max(...timeline.plans.map((p) => (p.blocked ? p.departAt : p.arriveAt)))
    : timeline.driveStart;
}

/** Active travel over all attempts. Queuing, blocked waits and HTTP latency are excluded. */
export function groupTravelTime(plan: CarPlan, now: number): number {
  const history = plan.previous ? groupTravelTime(plan.previous, plan.interruptedAt!) : 0;
  return (
    history +
    (plan.blocked
      ? 0
      : Math.max(0, Math.min(now, plan.arriveAt) - plan.departAt - queueWait(plan, now)))
  );
}

export function transferTiming(timeline: Timeline, now: number) {
  const blocked = timeline.plans.filter((p) => carStatus(p, now) === 'blocked').length;
  const arrived = timeline.plans.filter((p) => carStatus(p, now) === 'arrived').length;
  const finished = timeline.plans.length > 0 && arrived === timeline.plans.length;
  return {
    blocked,
    arrived,
    finished,
    elapsed: Math.max(0, Math.min(now, clockStop(timeline)) - timeline.driveStart),
    total:
      Number.isFinite(timeline.end) && timeline.plans.length
        ? timeline.end - timeline.driveStart
        : null,
  };
}
