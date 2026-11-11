import { describe, expect, it } from 'vitest';
import { project, type Network, type RouteResponse } from '@netsim/shared';
import mockNetwork from '@netsim/shared/mocks/network.json';
import { buildWorld, carPath, lotSlot, poseAt } from '../scene3d/world';
import { groupHops, nodeTime, remainingLinks, scheduleTimeline } from './progress';
import { buildTimeline, carStatus, framesAt } from './timeline';
import {
  blockedTimeline,
  clockStop,
  groupTravelTime,
  needsRetry,
  retryTimeline,
  transferTiming,
} from './reroute';

const network = mockNetwork as Network;
const pos = new Map(network.nodes.map((n) => [n.id, project(n.lat, n.lon)]));
const world = buildWorld(network);
const car = { id: 'car-0', seq: 0, bytes: 1500, firstPacket: 0, lastPacket: 0 };
const coast = [
  'csulb',
  'el-segundo',
  'slo',
  'san-jose',
  'oakland',
  'redding',
  'medford',
  'eugene',
  'bend',
  'oregon-dc',
];
const inland = [
  'csulb',
  'lb-isp',
  'la-wilshire',
  'bakersfield',
  'fresno',
  'sacramento',
  'reno',
  'klamath-falls',
  'bend',
  'oregon-dc',
];
const linksFor = (ids: string[]) =>
  ids
    .slice(1)
    .map(
      (b, i) =>
        network.links.find(
          (l) => (l.source === ids[i] && l.target === b) || (l.target === ids[i] && l.source === b),
        )!.id,
    );
const route = (ids: string[]) => ({ nodeIds: ids, linkIds: linksFor(ids) });
const answer = (ids: string[]): RouteResponse => ({
  status: 'routed',
  path: ids,
  linkPath: linksFor(ids),
  visitOrder: [],
});
const unreachable: RouteResponse = {
  status: 'unreachable',
  path: [],
  linkPath: [],
  visitOrder: [],
};
const empty = new Set<string>();
const timeline = scheduleTimeline(network, buildTimeline([car], [route(coast)], pos, 0));

describe('progress-aware live failures and restoration', () => {
  it('restarts an affected in-flight group at the sender, never forwarding through an offline router', () => {
    const now = 0.1;
    const next = retryTimeline(
      network,
      timeline,
      now,
      new Set(['el-segundo']),
      empty,
      answer(inland),
      pos,
    );
    const p = next.plans[0]!;
    expect(p.departAt).toBe(now);
    expect(p.route.nodeIds).toEqual(inland);
    expect(p.route.nodeIds).not.toContain('el-segundo');
    const pose = poseAt(carPath(world, network, p), now);
    expect(pose.x).toBeCloseTo(lotSlot(world.client, 0).slot.x);
    expect(pose.z).toBeCloseTo(lotSlot(world.client, 0).slot.z);
    expect(p.retries).toBe(1);
  });

  it('keeps groups that already passed the failed router or completed the failed road', () => {
    const plan = timeline.plans[0]!;
    const at = nodeTime(plan, 3);
    expect(needsRetry(plan, at - 0.001, new Set(['san-jose']), empty)).toBe(true);
    expect(needsRetry(plan, at, new Set(['san-jose']), empty)).toBe(true);
    expect(needsRetry(plan, at + 0.001, new Set(['san-jose']), empty)).toBe(false);
    expect(needsRetry(plan, at - 0.001, empty, new Set([plan.route.linkIds[2]!]))).toBe(true);
    expect(needsRetry(plan, at, empty, new Set([plan.route.linkIds[2]!]))).toBe(false);
    expect(
      retryTimeline(network, timeline, at + 0.01, new Set(['san-jose']), empty, answer(inland), pos)
        .plans[0],
    ).toBe(plan);
    expect(remainingLinks(plan, at + 0.01)).not.toContain(plan.route.linkIds[2]);
    expect(groupHops(plan, at + 0.01)).toEqual({ completed: 3, remaining: 6 });
  });

  it('does not retry the last road once the car is inside the destination lot', () => {
    const p = timeline.plans[0]!;
    const enteredLot = nodeTime(p, p.route.nodeIds.length - 1);
    const now = (enteredLot + p.arriveAt) / 2;
    expect(now).toBeLessThan(p.arriveAt);
    expect(needsRetry(p, now, empty, new Set([p.route.linkIds.at(-1)!]))).toBe(false);
    expect(remainingLinks(p, now)).toEqual([]);
    expect(poseAt(carPath(world, network, p), now).status).toBe('driving');
  });

  it('splits a convoy at a failure: the lead continues while later groups retry', () => {
    const tl = scheduleTimeline(
      network,
      buildTimeline([car, { ...car, id: 'car-1', seq: 1 }], [route(coast), route(coast)], pos, 0),
    );
    const now = (nodeTime(tl.plans[0]!, 3) + nodeTime(tl.plans[1]!, 3)) / 2;
    const next = retryTimeline(network, tl, now, new Set(['san-jose']), empty, answer(inland), pos);
    expect(next.plans[0]).toBe(tl.plans[0]);
    expect(next.plans[1]!.route.nodeIds).toEqual(inland);
    expect(next.plans[1]!.departAt).toBe(now);
    expect(groupTravelTime(next.plans[1]!, now)).toBeCloseTo(groupTravelTime(tl.plans[1]!, now));
    expect(groupHops(next.plans[1]!, now).completed).toBe(groupHops(tl.plans[1]!, now).completed);
  });

  it('reoptimizes at the next router on restoration, preserving movement, time and completed hops', () => {
    const detour = [
      'csulb',
      'el-segundo',
      'slo',
      'san-jose',
      'oakland',
      'sacramento',
      'reno',
      'klamath-falls',
      'bend',
      'oregon-dc',
    ];
    const tl = scheduleTimeline(network, buildTimeline([car], [route(detour)], pos, 0));
    const old = tl.plans[0]!;
    const at = nodeTime(old, 1);
    const now = at / 2;
    const next = retryTimeline(
      network,
      tl,
      now,
      empty,
      empty,
      answer(coast),
      pos,
      new Map([['el-segundo', answer(coast.slice(1))]]),
    );
    const plan = next.plans[0]!;
    expect(plan.route.nodeIds).toEqual(coast);
    expect(plan.handoff?.at).toBe(at);
    expect(plan.retries).toBe(old.retries);
    expect(groupTravelTime(plan, now)).toBeCloseTo(groupTravelTime(old, now));
    const oldPath = carPath(world, network, old),
      newPath = carPath(world, network, plan);
    for (const t of [now, at - 0.001, at]) {
      expect(poseAt(newPath, t).x).toBeCloseTo(poseAt(oldPath, t).x, 6);
      expect(poseAt(newPath, t).z).toBeCloseTo(poseAt(oldPath, t).z, 6);
    }
    expect(
      Math.hypot(
        poseAt(newPath, at + 0.001).x - poseAt(newPath, at).x,
        poseAt(newPath, at + 0.001).z - poseAt(newPath, at).z,
      ),
    ).toBeLessThan(0.2);
    expect(groupHops(plan, at)).toEqual({ completed: 1, remaining: 8 });
    expect(groupHops(plan, next.end)).toEqual({ completed: 9, remaining: 0 });
    expect(remainingLinks(plan, next.end)).toEqual([]);
    expect(groupTravelTime(plan, next.end)).toBeCloseTo(plan.arriveAt - plan.departAt);
    expect(poseAt(newPath, next.end).status).toBe('arrived');
  });

  it('reoptimizes queued groups from the sender without incrementing retries', () => {
    const tl = scheduleTimeline(network, buildTimeline([car], [route(inland)], pos, 4));
    const next = retryTimeline(
      network,
      tl,
      0,
      empty,
      empty,
      answer(coast),
      pos,
      new Map([['csulb', answer(coast)]]),
    );
    expect(next.plans[0]!.route.nodeIds).toEqual(coast);
    expect(next.plans[0]!.departAt).toBe(tl.plans[0]!.departAt);
    expect(next.plans[0]!.retries).toBeUndefined();
  });

  it('keeps delivered and unaffected groups unchanged', () => {
    const tl = buildTimeline(
      [car, { ...car, id: 'car-1', seq: 1 }],
      [route(coast), route(inland)],
      pos,
      0,
    );
    const next = retryTimeline(network, tl, 0.1, new Set(['oakland']), empty, unreachable, pos);
    expect(next.plans[1]).toBe(tl.plans[1]);
    const done = retryTimeline(
      network,
      tl,
      tl.end,
      new Set(['oakland', 'sacramento']),
      empty,
      unreachable,
      pos,
    );
    expect(done.plans[0]).toBe(tl.plans[0]);
    expect(done.plans[1]).toBe(tl.plans[1]);
    expect(transferTiming(done, tl.end + 100).arrived).toBe(2);
  });

  it('freezes blocked group timers and the run clock; blocked cars render at sender', () => {
    const now = 1;
    const next = retryTimeline(
      network,
      timeline,
      now,
      new Set(['san-jose']),
      empty,
      unreachable,
      pos,
    );
    expect(next.end).toBe(Infinity);
    expect(clockStop(next)).toBe(now);
    expect(groupTravelTime(next.plans[0]!, now + 100)).toBe(groupTravelTime(next.plans[0]!, now));
    expect(transferTiming(next, now + 100).elapsed).toBe(now);
    expect(transferTiming(next, now + 100).total).toBeNull();
    expect(carStatus(next.plans[0]!, now + 100)).toBe('blocked');
    const pose = poseAt(carPath(world, network, next.plans[0]!), now + 100);
    expect(pose.status).toBe('blocked');
    expect(pose.x).toBeCloseTo(lotSlot(world.client, 0).slot.x);
    expect(pose.z).toBeCloseTo(lotSlot(world.client, 0).slot.z);
  });

  it('restoration retries waiting groups and accumulates attempt time without counting blocked waits', () => {
    const blocked = retryTimeline(
      network,
      timeline,
      1,
      new Set(['san-jose']),
      empty,
      unreachable,
      pos,
    );
    const restored = retryTimeline(network, blocked, 20, empty, empty, answer(inland), pos);
    const p = restored.plans[0]!;
    expect(p.departAt).toBe(20);
    expect(groupTravelTime(p, 20)).toBeCloseTo(1);
    expect(groupTravelTime(p, 21)).toBeCloseTo(2);
    expect(carStatus(p, restored.end)).toBe('arrived');
    expect(groupTravelTime(p, restored.end + 100)).toBe(groupTravelTime(p, restored.end));
  });

  it('keeps confirmed deliveries while other groups fail, with renderer and table statuses matching', () => {
    const tl = buildTimeline(
      [car, { ...car, id: 'car-1', seq: 1 }],
      [route(coast), route(inland)],
      pos,
      0,
    );
    tl.plans[0] = { ...tl.plans[0]!, arriveAt: 0.5 };
    const next = retryTimeline(network, tl, 1, new Set(['sacramento']), empty, unreachable, pos);
    expect(next.plans[0]).toBe(tl.plans[0]);
    expect(framesAt(next, 1).map((f) => f.status)).toEqual(['arrived', 'blocked']);
    expect(next.plans.map((p) => poseAt(carPath(world, network, p), 1).status)).toEqual([
      'arrived',
      'blocked',
    ]);
    expect(transferTiming(next, 100).arrived).toBe(1);
    expect(transferTiming(next, 100).finished).toBe(false);
    expect(clockStop(next)).toBe(1);
    expect(next.plans[0]!.arriveAt).toBe(0.5);
  });

  it('handles all 24 groups losing every path and restores them without losing or double-counting IDs', () => {
    const cars = Array.from({ length: 24 }, (_, seq) => ({ ...car, id: `car-${seq}`, seq }));
    const tl = buildTimeline(
      cars,
      cars.map((_, i) => route(i % 2 ? coast : inland)),
      pos,
      0,
    );
    const blocked = retryTimeline(
      network,
      tl,
      2,
      new Set(['san-jose', 'sacramento']),
      empty,
      unreachable,
      pos,
    );
    expect(framesAt(blocked, 100).every((f) => f.status === 'blocked')).toBe(true);
    expect(clockStop(blocked)).toBe(2);
    for (const p of blocked.plans) {
      const pose = poseAt(carPath(world, network, p), 100);
      expect(pose.status).toBe('blocked');
      expect(pose.x).toBeCloseTo(lotSlot(world.client, p.seq).slot.x);
      expect(pose.z).toBeCloseTo(lotSlot(world.client, p.seq).slot.z);
    }
    const restored = retryTimeline(network, blocked, 2, empty, empty, answer(coast), pos);
    expect(new Set(restored.plans.map((p) => p.carId)).size).toBe(24);
    expect(transferTiming(restored, restored.end).arrived).toBe(24);
    expect(
      restored.plans.map((p) => poseAt(carPath(world, network, p), restored.end).status),
    ).toEqual(Array(24).fill('arrived'));
  });

  it('an initially disconnected send has a blocked plan and matching rendered status for every group', () => {
    const tl = blockedTimeline(network, [car], pos, 1);
    expect(tl.plans).toHaveLength(1);
    expect(clockStop(tl)).toBe(1);
    expect(transferTiming(tl, 10).finished).toBe(false);
    expect(transferTiming(tl, 10).total).toBeNull();
    expect(poseAt(carPath(world, network, tl.plans[0]!), 10).status).toBe(
      carStatus(tl.plans[0]!, 10),
    );
  });

  it('uses the last arrival rather than adding concurrent group travel times', () => {
    const tl = buildTimeline(
      [car, { ...car, id: 'car-1', seq: 1 }],
      [route(coast), route(coast)],
      pos,
      4,
    );
    const timing = transferTiming(tl, tl.end);
    expect(timing.total).toBeCloseTo(tl.end - tl.driveStart);
    expect(timing.total).toBeLessThan(tl.plans.reduce((s, p) => s + groupTravelTime(p, tl.end), 0));
    expect(timing.finished).toBe(true);
  });
});
