import type { Car } from '@netsim/shared';

/** A route as station and road IDs, client first. */
export interface Route {
  nodeIds: string[];
  linkIds: string[];
}

/** A position in projected map units (shared `project()`: x east, y south). */
export interface Point {
  x: number;
  y: number;
}

/** Sim seconds per BFS step in the search replay. */
export const BFS_STEP_SEC = 0.3;
/** Sim seconds between two cars leaving the CSULB lot. */
export const CAR_STAGGER_SEC = 0.45;
/** Map units a car covers per sim second. Playback speed scales the clock, not this. */
export const CAR_SPEED = 80;
/** With traffic randomness on, each car's cruising speed is within ±this fraction of CAR_SPEED. */
export const CAR_SPEED_SPREAD = 0.12;

export interface CarPlan {
  carId: string;
  seq: number;
  bytes: number;
  route: Route;
  /** This car's cruising speed in map units per sim second. */
  speed: number;
  points: Point[];
  /** Distance from the start at each point. */
  cum: number[];
  departAt: number;
  arriveAt: number;
}

export interface Timeline {
  /** Sim time when the search replay ends and the first car leaves. */
  driveStart: number;
  plans: CarPlan[];
  end: number;
}

export interface CarFrame {
  carId: string;
  seq: number;
  status: 'waiting' | 'driving' | 'arrived';
  x: number;
  y: number;
  /** Heading in degrees, 0 = east, clockwise (SVG convention). */
  angle: number;
}

/**
 * Timed plan for every car. Without `rng` cars leave every `CAR_STAGGER_SEC` at `CAR_SPEED`
 * (fully deterministic, used by tests). With `rng` traffic looks natural: gaps between departures
 * vary (0.55–1.45× the stagger) and each car cruises at its own speed (±`CAR_SPEED_SPREAD`).
 * Speeds are handed out fastest first, so a quicker car never drives through a slower one on
 * the shared road out of the CSULB lot.
 */
export function buildTimeline(
  cars: readonly Car[],
  routes: readonly Route[],
  pos: ReadonlyMap<string, Point>,
  bfsSteps: number,
  rng?: () => number,
): Timeline {
  const driveStart = bfsSteps * BFS_STEP_SEC;
  const speeds = cars
    .map(() => (rng ? CAR_SPEED * (1 + (rng() * 2 - 1) * CAR_SPEED_SPREAD) : CAR_SPEED))
    .sort((a, b) => b - a);
  let departAt = driveStart;
  // No routes (unreachable) means no car ever leaves, so there are no plans.
  const plans = cars.flatMap((car, i): CarPlan[] => {
    const route = routes[i];
    if (!route) return [];
    if (i > 0) departAt += CAR_STAGGER_SEC * (rng ? 0.55 + rng() * 0.9 : 1);
    const points = route.nodeIds.map((id) => pos.get(id)!);
    const cum = [0];
    for (let k = 1; k < points.length; k++) {
      cum.push(
        cum[k - 1]! + Math.hypot(points[k]!.x - points[k - 1]!.x, points[k]!.y - points[k - 1]!.y),
      );
    }
    const speed = speeds[i]!;
    return [
      {
        carId: car.id,
        seq: car.seq,
        bytes: car.bytes,
        route,
        speed,
        points,
        cum,
        departAt,
        arriveAt: departAt + cum[cum.length - 1]! / speed,
      },
    ];
  });
  return { driveStart, plans, end: Math.max(driveStart, ...plans.map((p) => p.arriveAt)) };
}

export function carFrame(plan: CarPlan, t: number): CarFrame {
  const total = plan.cum[plan.cum.length - 1]!;
  const dist = Math.min(Math.max((t - plan.departAt) * plan.speed, 0), total);
  let k = 1;
  while (k < plan.cum.length - 1 && plan.cum[k]! < dist) k++;
  const a = plan.points[k - 1]!;
  const b = plan.points[k]!;
  const segLen = plan.cum[k]! - plan.cum[k - 1]!;
  const f = segLen === 0 ? 0 : (dist - plan.cum[k - 1]!) / segLen;
  return {
    carId: plan.carId,
    seq: plan.seq,
    status: t < plan.departAt ? 'waiting' : t >= plan.arriveAt ? 'arrived' : 'driving',
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
  };
}

export function framesAt(tl: Timeline, t: number): CarFrame[] {
  return tl.plans.map((p) => carFrame(p, t));
}

/** How many BFS steps the replay has revealed at sim time `t`. */
export function bfsStepsShown(t: number, total: number): number {
  return Math.min(total, Math.floor(t / BFS_STEP_SEC) + 1);
}
