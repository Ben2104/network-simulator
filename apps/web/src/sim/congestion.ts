import type { Timeline } from './timeline';

/** Reserve one road in FIFO order. All groups in a run traverse it in the same direction. */
export function scheduleBottleneck(timeline: Timeline, linkId: string, mbps: number): Timeline {
  const index = timeline.plans[0]?.route.linkIds.indexOf(linkId) ?? -1;
  const bottleneck = { linkId, mbps, used: index >= 0 };
  if (index < 0) return { ...timeline, bottleneck };

  const arrivals = timeline.plans
    .map((plan) => ({ plan, arrival: plan.nodeTimes![index]! }))
    .sort((a, b) => a.arrival - b.arrival || a.plan.seq - b.plan.seq);
  let available = timeline.driveStart;
  const plans = arrivals.map(({ plan, arrival }) => {
    const start = Math.max(arrival, available);
    const release = start + (plan.bytes * 8) / (mbps * 1_000_000);
    available = release;
    const delay = release - arrival;
    return {
      ...plan,
      bottleneck: { arrival, start, release },
      arriveAt: plan.arriveAt + delay,
      nodeTimes: plan.nodeTimes!.map((time, i) => (i > index ? time + delay : time)),
    };
  });
  plans.sort((a, b) => a.seq - b.seq);
  return { ...timeline, plans, bottleneck, end: Math.max(...plans.map((p) => p.arriveAt)) };
}
