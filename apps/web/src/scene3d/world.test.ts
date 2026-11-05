import { describe, expect, it } from 'vitest';
import { MAP_HEIGHT, MAP_WIDTH, project, type Network } from '@netsim/shared';
import mockNetwork from '@netsim/shared/mocks/network.json';
import { buildTimeline } from '../sim/timeline';
import {
  bounds,
  buildWorld,
  carPath,
  distanceToLine,
  inLotArea,
  inRing,
  leadCar,
  lotSlot,
  parkedPose,
  poseAt,
  roadCurve,
  rng,
  smoothCorners,
  toWorld,
} from './world';

const node = (id: string, lat: number, lon: number, kind: 'client' | 'router' | 'server') => ({
  id,
  label: id,
  kind,
  lat,
  lon,
  place: id,
});

// A tiny three-station line: client (south) → router → server (north).
const network: Network = {
  nodes: [
    node('c', 34, -118, 'client'),
    node('r', 40, -121, 'router'),
    node('s', 45, -120, 'server'),
  ],
  links: [
    { id: 'c--r', source: 'c', target: 'r', distanceKm: 1 },
    { id: 's--r', source: 's', target: 'r', distanceKm: 1 },
  ],
  clientId: 'c',
  serverId: 's',
};
const cars = [0, 1, 2].map((seq) => ({
  id: `car-${seq}`,
  seq,
  firstPacket: seq,
  lastPacket: seq,
  bytes: 1500,
}));
const route = { nodeIds: ['c', 'r', 's'], linkIds: ['c--r', 's--r'] };
const pos2d = new Map([
  ['c', { x: 0, y: 0 }],
  ['r', { x: 100, y: 0 }],
  ['s', { x: 200, y: 0 }],
]);
const timeline = buildTimeline(cars, [route, route, route], pos2d, 5);
const world = buildWorld(network);

describe('toWorld', () => {
  it('centres the shared projection on the origin, x east and z south', () => {
    const p = project(40, -121);
    expect(toWorld(40, -121)).toEqual({ x: p.x - MAP_WIDTH / 2, z: p.y - MAP_HEIGHT / 2 });
    expect(toWorld(45, -120).z).toBeLessThan(toWorld(34, -120).z);
    expect(toWorld(40, -118).x).toBeGreaterThan(toWorld(40, -122).x);
  });
});

describe('roadCurve', () => {
  const a = { x: 0, z: 0 };
  const b = { x: 100, z: 0 };
  const curve = roadCurve(a, b, 'x--y');

  it('starts and ends at the stations', () => {
    expect(curve[0]).toEqual(a);
    expect(curve.at(-1)!.x).toBeCloseTo(100);
    expect(curve.at(-1)!.z).toBeCloseTo(0);
  });

  it('is slightly arched, not straight and not a detour', () => {
    const mid = curve[Math.floor(curve.length / 2)]!;
    expect(Math.abs(mid.z)).toBeGreaterThan(1);
    expect(Math.abs(mid.z)).toBeLessThan(5);
  });

  it('bows the same way every time (deterministic)', () => {
    expect(roadCurve(a, b, 'x--y')).toEqual(curve);
  });
});

describe('lots', () => {
  it('gives 24 distinct slots, alternating sides of the aisle', () => {
    const slots = Array.from({ length: 24 }, (_, i) => lotSlot(world.client, i).slot);
    const keys = new Set(slots.map((s) => `${s.x.toFixed(2)},${s.z.toFixed(2)}`));
    expect(keys.size).toBe(24);
    expect(Math.sign(slots[0]!.z - world.client.gate.z)).toBe(
      -Math.sign(slots[1]!.z - world.client.gate.z),
    );
  });

  it('marks the lot and its building as occupied, not the road beyond the gate', () => {
    for (let i = 0; i < 24; i++)
      expect(inLotArea(lotSlot(world.client, i).slot, world.client)).toBe(true);
    expect(inLotArea({ x: world.client.gate.x - 10, z: world.client.gate.z }, world.client)).toBe(
      false,
    );
  });

  it('extends inland (east) of the gate', () => {
    expect(lotSlot(world.client, 0).slot.x).toBeGreaterThan(world.client.gate.x);
    expect(world.server.center.x).toBeGreaterThan(world.server.gate.x);
  });
});

describe('carPath and poseAt', () => {
  const paths = timeline.plans.map((p) => carPath(world, network, p));
  const path = paths[0]!;

  it('uses the shared timeline times so 2D and 3D cars depart and arrive together', () => {
    expect(path.departAt).toBe(timeline.plans[0]!.departAt);
    expect(path.arriveAt).toBe(timeline.plans[0]!.arriveAt);
  });

  it('starts in the CSULB slot and ends in the Oregon slot', () => {
    expect(path.pts[0]).toEqual(lotSlot(world.client, 0).slot);
    expect(path.pts.at(-1)).toEqual(lotSlot(world.server, 0).slot);
  });

  it('drives a link backwards when the route crosses it target → source', () => {
    // s--r is stored server → router; the car must pass the router before reaching the server.
    const r = world.pos.get('r')!;
    const nearR = path.pts.findIndex((p) => Math.hypot(p.x - r.x, p.z - r.z) < 1);
    const s = world.pos.get('s')!;
    const nearS = path.pts.findIndex((p) => Math.hypot(p.x - s.x, p.z - s.z) < 1.5);
    expect(nearR).toBeGreaterThan(0);
    expect(nearS).toBeGreaterThan(nearR);
  });

  it('is parked before departure, moving in between, parked after arrival', () => {
    expect(poseAt(path, path.departAt - 1)).toMatchObject({ status: 'waiting', ...path.pts[0] });
    const mid = poseAt(path, (path.departAt + path.arriveAt) / 2);
    expect(mid.status).toBe('driving');
    expect(mid.z).toBeLessThan(world.pos.get('c')!.z);
    const end = poseAt(path, path.arriveAt + 1);
    expect(end.status).toBe('arrived');
    expect(end.x).toBeCloseTo(path.pts.at(-1)!.x);
  });

  it('heads north (−z) while driving north', () => {
    const mid = poseAt(path, (path.departAt + path.arriveAt) / 2);
    // heading = atan2(−dz, dx): northbound means dz < 0, so sin(heading) > 0.
    expect(Math.sin(mid.heading)).toBeGreaterThan(0);
  });

  it('follows the car furthest along', () => {
    const t = (paths[2]!.departAt + paths[0]!.arriveAt) / 2;
    expect(leadCar(paths, t)).toBe(0);
    expect(leadCar(paths, 0)).toBe(-1);
  });
});

describe('natural turns', () => {
  const real = mockNetwork as Network;
  const realWorld = buildWorld(real);
  const realPos = new Map(real.nodes.map((n) => [n.id, project(n.lat, n.lon)]));
  // The default 9-hop route: sharp corners at most stations.
  const ids = [
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
  const linkIds = ids.slice(1).map((id, i) => {
    const l = real.links.find(
      (k) => (k.source === ids[i] && k.target === id) || (k.target === ids[i] && k.source === id),
    )!;
    return l.id;
  });
  const tl = buildTimeline(cars.slice(0, 1), [{ nodeIds: ids, linkIds }], realPos, 0);
  const path = carPath(realWorld, real, tl.plans[0]!);
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

  it('rounds a right-angle corner into a smooth arc', () => {
    const pts = smoothCorners([
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      { x: 10, z: 10 },
    ]);
    expect(pts[0]).toEqual({ x: 0, z: 0 });
    expect(pts.at(-1)).toEqual({ x: 10, z: 10 });
    expect(pts.length).toBeGreaterThan(5);
    for (let i = 2; i < pts.length; i++) {
      const h0 = Math.atan2(pts[i - 1]!.z - pts[i - 2]!.z, pts[i - 1]!.x - pts[i - 2]!.x);
      const h1 = Math.atan2(pts[i]!.z - pts[i - 1]!.z, pts[i]!.x - pts[i - 1]!.x);
      expect(Math.abs(wrap(h1 - h0))).toBeLessThan(0.5);
    }
  });

  it('leaves a straight line alone', () => {
    const line = [0, 5, 10].map((x) => ({ x, z: 0 }));
    expect(smoothCorners(line)).toEqual(line);
  });

  it('never snaps the heading between frames, even at stations and lot gates', () => {
    const steps = 4000;
    let prev = poseAt(path, path.departAt).heading;
    let worst = 0;
    for (let i = 1; i <= steps; i++) {
      const t = path.departAt + ((path.arriveAt - path.departAt) * i) / steps;
      const h = poseAt(path, t).heading;
      worst = Math.max(worst, Math.abs(wrap(h - prev)));
      prev = h;
    }
    expect(worst).toBeLessThan(0.25);
  });

  it('slows down in turns and is quicker on straights', () => {
    expect(Math.min(...path.speed)).toBeLessThan(0.8);
    expect(Math.max(...path.speed)).toBeGreaterThan(0.99);
  });

  it('still leaves and arrives on the shared timeline', () => {
    expect(poseAt(path, path.departAt - 0.1).status).toBe('waiting');
    expect(poseAt(path, path.arriveAt).status).toBe('arrived');
    const end = poseAt(path, path.arriveAt);
    expect(end.x).toBeCloseTo(path.pts.at(-1)!.x);
    expect(end.z).toBeCloseTo(path.pts.at(-1)!.z);
  });

  it('leans out of turns and stays level when parked', () => {
    const p = carPath(world, network, timeline.plans[0]!);
    expect(parkedPose(world.client, 0)).toMatchObject({ roll: 0, pitch: 0 });
    expect(poseAt(p, p.departAt - 1)).toMatchObject({ roll: 0, pitch: 0 });
    let maxRoll = 0;
    for (let i = 1; i < 400; i++) {
      const pose = poseAt(path, path.departAt + ((path.arriveAt - path.departAt) * i) / 400);
      maxRoll = Math.max(maxRoll, Math.abs(pose.roll));
      expect(Math.abs(pose.pitch)).toBeLessThanOrEqual(0.035);
    }
    expect(maxRoll).toBeGreaterThan(0);
    expect(maxRoll).toBeLessThanOrEqual(0.07);
  });
});

describe('parkedPose', () => {
  it('parks in the slot facing the aisle', () => {
    const p = parkedPose(world.client, 0);
    const { slot, aisle } = lotSlot(world.client, 0);
    expect(p).toMatchObject({ x: slot.x, z: slot.z, status: 'waiting' });
    expect(
      Math.cos(p.heading) * (aisle.x - slot.x) - Math.sin(p.heading) * (aisle.z - slot.z),
    ).toBeGreaterThan(0);
  });
});

describe('helpers', () => {
  it('bounds covers every point', () => {
    const pts = [
      { x: -10, z: 0 },
      { x: 10, z: 0 },
      { x: 0, z: 5 },
    ];
    const b = bounds(pts);
    expect(b.center).toEqual({ x: 0, z: 2.5 });
    for (const p of pts)
      expect(Math.hypot(p.x - b.center.x, p.z - b.center.z)).toBeLessThanOrEqual(b.radius);
  });

  it('distanceToLine measures to the nearest segment', () => {
    const line = [
      { x: 0, z: 0 },
      { x: 10, z: 0 },
    ];
    expect(distanceToLine({ x: 5, z: 3 }, line)).toBeCloseTo(3);
    expect(distanceToLine({ x: 13, z: 4 }, line)).toBeCloseTo(5);
  });

  it('rng is deterministic per seed', () => {
    const a = rng(7);
    const b = rng(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('inRing tests [lon, lat] rings', () => {
    const square = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    expect(inRing(0.5, 0.5, square)).toBe(true);
    expect(inRing(1.5, 0.5, square)).toBe(false);
  });
});
