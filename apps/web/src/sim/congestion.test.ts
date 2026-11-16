import { describe, expect, it } from 'vitest';
import { scheduleBottleneck } from './congestion';
import { buildTimeline, movementTime, queueWait } from './timeline';

const route = { nodeIds: ['a', 'b', 'c'], linkIds: ['a--b', 'b--c'] };
const points = new Map([
  ['a', { x: 0, y: 0 }],
  ['b', { x: 80, y: 0 }],
  ['c', { x: 160, y: 0 }],
]);
const cars = [0, 1].map((seq) => ({
  id: `car-${seq}`,
  seq,
  firstPacket: seq,
  lastPacket: seq,
  bytes: 1_000_000,
}));
const base = buildTimeline(cars, [route, route], points, 0, undefined, 0);
base.plans = base.plans.map((plan) => ({ ...plan, nodeTimes: [0, 1, 2] }));

describe('scheduleBottleneck', () => {
  it('serves simultaneous arrivals in group order and holds motion until release', () => {
    const result = scheduleBottleneck(base, 'b--c', 10);
    const [first, second] = result.plans;
    expect(first!.bottleneck).toEqual({ arrival: 1, start: 1, release: 1.8 });
    expect(second!.bottleneck?.start).toBeCloseTo(1.8);
    expect(queueWait(second!, 2)).toBeCloseTo(0.8);
    expect(movementTime(second!, 2)).toBe(1);
    expect(movementTime(second!, second!.arriveAt)).toBeCloseTo(base.end);
    expect(second!.nodeTimes?.[2]).toBeCloseTo(3.6);
    expect(result.end).toBeCloseTo(3.6);
  });

  it('increases queue wait and completion time on the same route at lower bandwidth', () => {
    const fast = scheduleBottleneck(base, 'b--c', 1000);
    const slow = scheduleBottleneck(base, 'b--c', 10);
    expect(queueWait(fast.plans[1]!, fast.end)).toBeCloseTo(0.008);
    expect(queueWait(slow.plans[1]!, slow.end)).toBeCloseTo(0.8);
    expect(slow.end).toBeGreaterThan(fast.end);
  });

  it('reports a bypass without changing the group schedule', () => {
    const bypass = scheduleBottleneck(base, 'a--c', 10);
    expect(bypass.bottleneck?.used).toBe(false);
    expect(bypass.plans).toBe(base.plans);
    expect(bypass.end).toBe(base.end);
  });
});
