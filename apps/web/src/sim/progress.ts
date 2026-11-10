import type { Network } from '@netsim/shared';
import { buildWorld, carPath, passTime, type World } from '../scene3d/world';
import { carStatus, type CarPlan, type Timeline } from './timeline';

/** Router crossing times use the same eased, curved movement as the rendered car. */
export function nodeTime(plan: CarPlan, index: number): number {
  return plan.nodeTimes?.[index] ?? plan.departAt + plan.cum[index]! / plan.speed;
}

export function scheduleNodes(network: Network, plan: CarPlan, world?: World): CarPlan {
  if (plan.blocked) return { ...plan, nodeTimes: [plan.departAt] };
  const layout = world ?? buildWorld(network);
  const path = carPath(layout, network, plan);
  return {
    ...plan,
    nodeTimes: plan.route.nodeIds.map((id, i) =>
      plan.handoff && i <= plan.handoff.nodeIndex
        ? nodeTime(plan.handoff.plan, i)
        : i === 0
          ? plan.departAt
          : passTime(path, layout.pos.get(id)!),
    ),
  };
}

export function scheduleTimeline(network: Network, timeline: Timeline): Timeline {
  const world = buildWorld(network);
  return { ...timeline, plans: timeline.plans.map((p) => scheduleNodes(network, p, world)) };
}

/** The current road is completed at its downstream node; reconnect at the next node. */
export function nextNodeIndex(plan: CarPlan, now: number): number {
  if (carStatus(plan, now) !== 'driving') return 0;
  const next = plan.route.nodeIds.findIndex((_, i) => i > 0 && nodeTime(plan, i) > now);
  return next < 0 ? plan.route.nodeIds.length - 1 : next;
}

export function remainingLinks(plan: CarPlan, now: number): string[] {
  const status = carStatus(plan, now);
  if (status === 'arrived' || status === 'blocked') return [];
  return plan.route.linkIds.filter((_, i) => nodeTime(plan, i + 1) > now);
}

export function groupHops(plan: CarPlan, now: number): { completed: number; remaining: number } {
  const previous = plan.previous ? groupHops(plan.previous, plan.interruptedAt!).completed : 0;
  const completed = plan.blocked
    ? 0
    : plan.route.linkIds.filter((_, i) => nodeTime(plan, i + 1) <= now).length;
  return { completed: previous + completed, remaining: remainingLinks(plan, now).length };
}
