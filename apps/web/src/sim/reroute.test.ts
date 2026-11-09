import { describe, expect, it } from 'vitest';
import { project, type Network, type RouteResponse } from '@netsim/shared';
import mockNetwork from '@netsim/shared/mocks/network.json';
import { buildWorld, carPath, lotSlot, passTime, poseAt } from '../scene3d/world';
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
const timeline = buildTimeline([car], [route(coast)], pos, 0);

describe('strict live failures and retransmission', () => {
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

  it('also retries unacknowledged groups that already passed the failed router', () => {
    const path = carPath(world, network, timeline.plans[0]!);
    const now = passTime(path, world.pos.get('san-jose')!) + 0.1;
    expect(now).toBeLessThan(timeline.end);
    expect(needsRetry(timeline.plans[0]!, now, new Set(['san-jose']), empty)).toBe(true);
    const next = retryTimeline(
      network,
      timeline,
      now,
      new Set(['san-jose']),
      empty,
      answer(inland),
      pos,
    );
    expect(next.plans[0]!.departAt).toBe(now);
    expect(next.plans[0]!.route.nodeIds[0]).toBe(network.clientId);
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
