import { describe, expect, it } from 'vitest';
import {
  BFS_STEP_SEC,
  CAR_SPEED,
  CAR_SPEED_SPREAD,
  CAR_STAGGER_SEC,
  bfsStepsShown,
  buildTimeline,
  carFrame,
} from './timeline';
import { rng } from '../scene3d/world';

const pos = new Map([
  ['a', { x: 0, y: 0 }],
  ['b', { x: 100, y: 0 }],
  ['c', { x: 100, y: 100 }],
]);
const route = { nodeIds: ['a', 'b', 'c'], linkIds: ['a--b', 'b--c'] };
const cars = [0, 1].map((seq) => ({
  id: `car-${seq}`,
  seq,
  firstPacket: seq,
  lastPacket: seq,
  bytes: 1500,
}));

describe('buildTimeline', () => {
  const tl = buildTimeline(cars, [route, route], pos, 4);

  it('starts driving after the search replay and staggers departures', () => {
    expect(tl.driveStart).toBeCloseTo(4 * BFS_STEP_SEC);
    expect(tl.plans[1]!.departAt - tl.plans[0]!.departAt).toBeCloseTo(CAR_STAGGER_SEC);
  });

  it('ends when the last car arrives', () => {
    expect(tl.end).toBeCloseTo(tl.plans[1]!.departAt + 200 / CAR_SPEED);
  });
});

describe('buildTimeline with traffic randomness', () => {
  const many = Array.from({ length: 12 }, (_, seq) => ({ ...cars[0]!, id: `car-${seq}`, seq }));
  const tl = buildTimeline(
    many,
    many.map(() => route),
    pos,
    0,
    rng(7),
  );

  it('gives each car its own speed, fastest first, within the spread', () => {
    const speeds = tl.plans.map((p) => p.speed);
    expect(new Set(speeds).size).toBeGreaterThan(1);
    expect([...speeds].sort((a, b) => b - a)).toEqual(speeds);
    for (const v of speeds) {
      expect(v).toBeGreaterThanOrEqual(CAR_SPEED * (1 - CAR_SPEED_SPREAD));
      expect(v).toBeLessThanOrEqual(CAR_SPEED * (1 + CAR_SPEED_SPREAD));
    }
  });

  it('varies the gaps between departures around the stagger', () => {
    const gaps = tl.plans.slice(1).map((p, i) => p.departAt - tl.plans[i]!.departAt);
    expect(new Set(gaps.map((g) => g.toFixed(4))).size).toBeGreaterThan(1);
    for (const g of gaps) {
      expect(g).toBeGreaterThanOrEqual(CAR_STAGGER_SEC * 0.55 - 1e-9);
      expect(g).toBeLessThanOrEqual(CAR_STAGGER_SEC * 1.45 + 1e-9);
    }
  });

  it("times arrival from each car's own speed", () => {
    for (const p of tl.plans) expect(p.arriveAt - p.departAt).toBeCloseTo(200 / p.speed);
  });
});

describe('carFrame', () => {
  const plan = buildTimeline(cars, [route, route], pos, 0).plans[0]!;

  it('waits at the start before departing', () => {
    expect(carFrame(plan, -1)).toMatchObject({ status: 'waiting', x: 0, y: 0 });
  });

  it('interpolates along the first segment heading east', () => {
    const f = carFrame(plan, 50 / CAR_SPEED);
    expect(f).toMatchObject({ status: 'driving', x: 50, y: 0, angle: 0 });
  });

  it('turns at the corner and heads south', () => {
    const f = carFrame(plan, 150 / CAR_SPEED);
    expect(f.x).toBeCloseTo(100);
    expect(f.y).toBeCloseTo(50);
    expect(f.angle).toBeCloseTo(90);
  });

  it('parks at the destination', () => {
    expect(carFrame(plan, 1000)).toMatchObject({ status: 'arrived', x: 100, y: 100 });
  });
});

describe('bfsStepsShown', () => {
  it('reveals one step immediately and caps at the total', () => {
    expect(bfsStepsShown(0, 19)).toBe(1);
    expect(bfsStepsShown(BFS_STEP_SEC * 5, 19)).toBe(6);
    expect(bfsStepsShown(999, 19)).toBe(19);
  });
});
