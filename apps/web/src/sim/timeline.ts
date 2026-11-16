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
  /** Actual rendered router crossing times, populated by the simulation scheduler. */
  nodeTimes?: number[];
  bottleneck?: { arrival: number; start: number; release: number };
  /** Preserve movement until reaching this node, then use the new suffix without a retry. */
  handoff?: { plan: CarPlan; at: number; nodeIndex: number };
  /** Previous attempt retained only for timing; replacement copies restart at the sender. */
  previous?: CarPlan;
  interruptedAt?: number;
  retries?: number;
  blocked?: boolean;
}

export interface Timeline {
  /** Sim time when the search replay ends and the first car leaves. */
  driveStart: number;
  plans: CarPlan[];
  end: number;
  bottleneck?: { linkId: string; mbps: number; used: boolean };
}

export interface CarFrame {
  carId: string;
  seq: number;
  status: 'waiting' | 'driving' | 'arrived' | 'blocked';
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
  stagger = CAR_STAGGER_SEC,
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
    if (i > 0) departAt += stagger * (rng ? 0.55 + rng() * 0.9 : 1);
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

export function carStatus(
  plan: Pick<CarPlan, 'blocked' | 'departAt' | 'arriveAt'>,
  t: number,
): CarFrame['status'] {
  if (plan.blocked) return 'blocked';
  return t < plan.departAt ? 'waiting' : t >= plan.arriveAt ? 'arrived' : 'driving';
}

export function carFrame(plan: CarPlan, t: number): CarFrame {
  if (plan.handoff) {
    if (t < plan.handoff.at) return carFrame(plan.handoff.plan, t);
    const k = plan.handoff.nodeIndex;
    return carFrame(
      {
        ...plan,
        handoff: undefined,
        points: plan.points.slice(k),
        cum: plan.cum.slice(k).map((d) => d - plan.cum[k]!),
        departAt: plan.handoff.at,
      },
      t,
    );
  }
  if (plan.blocked) {
    const p = plan.points[0]!;
    return {
      carId: plan.carId,
      seq: plan.seq,
      x: p.x,
      y: p.y,
      angle: 0,
      status: carStatus(plan, t),
    };
  }
  const total = plan.cum[plan.cum.length - 1]!;
  const dist = Math.min(Math.max((movementTime(plan, t) - plan.departAt) * plan.speed, 0), total);
  let k = 1;
  while (k < plan.cum.length - 1 && plan.cum[k]! < dist) k++;
  const a = plan.points[k - 1]!;
  const b = plan.points[k]!;
  const segLen = plan.cum[k]! - plan.cum[k - 1]!;
  const f = segLen === 0 ? 0 : (dist - plan.cum[k - 1]!) / segLen;
  return {
    carId: plan.carId,
    seq: plan.seq,
    status: carStatus(plan, t),
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
  };
}

/** Freeze motion at the bottleneck during queueing and transmission. */
export function movementTime(plan: Pick<CarPlan, 'bottleneck'>, t: number): number {
  const stop = plan.bottleneck;
  if (!stop || t < stop.arrival) return t;
  return Math.max(stop.arrival, t - (stop.release - stop.arrival));
}

export function queueWait(plan: Pick<CarPlan, 'bottleneck'>, t: number): number {
  const stop = plan.bottleneck;
  return stop ? Math.max(0, Math.min(t, stop.start) - stop.arrival) : 0;
}

export function framesAt(tl: Timeline, t: number): CarFrame[] {
  return tl.plans.map((p) => carFrame(p, t));
}

/** How many BFS steps the replay has revealed at sim time `t`. */
export function bfsStepsShown(t: number, total: number): number {
  return Math.min(total, Math.floor(t / BFS_STEP_SEC) + 1);
}
