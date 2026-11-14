import { autonomousSystem, usesLinkCost, type RoutingAlgorithm } from '@netsim/shared';
import type { Phase } from '../sim/useSimulation';

export type Tone = 'neutral' | 'info' | 'busy' | 'success' | 'danger';

export interface CarCounts {
  total: number;
  atSender: number;
  onRoad: number;
  atDestination: number;
}

export interface CopyInput {
  phase: Phase;
  algorithm?: RoutingAlgorithm;
  fileLabel: string | null;
  totalBytes: number;
  packetCount: number;
  hops: number;
  visitedCount: number;
  stationCount: number;
  cars: CarCounts;
  paused: boolean;
}

export interface PhaseCopy {
  tone: Tone;
  banner: string;
  footer: string;
  footerHint: string;
}

const SENDER = 'CSULB parking lot';
const DEST = 'US-West Data Center, Oregon';
export const ALGORITHM_NAME: Record<RoutingAlgorithm, string> = {
  bfs: 'BFS',
  dijkstra: 'Dijkstra',
  bgp: 'BGP',
};

/** What each mode optimizes, for short sentences like "the fewest-hop path". */
export const ALGORITHM_GOAL: Record<RoutingAlgorithm, string> = {
  bfs: 'fewest-hop',
  dijkstra: 'lowest-cost',
  bgp: 'policy-preferred',
};

export const asLabel = (asn: number) => `AS${asn} ${autonomousSystem(asn)?.name ?? ''}`.trim();

export const formatBytes = (n: number) => `${n.toLocaleString('en-US')} B`;

export function describePhase(i: CopyInput): PhaseCopy {
  const { cars } = i;
  const algorithm = i.algorithm ?? 'bfs';
  const name = ALGORITHM_NAME[algorithm];
  const hint =
    algorithm === 'bgp'
      ? 'Simplified BGP routing; illustrative AS policies; orange shows remaining group routes'
      : usesLinkCost(algorithm)
        ? 'Dijkstra routing; orange shows remaining group routes; cost is not measured latency'
        : 'BFS routing; orange shows remaining group routes';
  switch (i.phase) {
    case 'idle':
      return {
        tone: 'neutral',
        banner: 'Ready to simulate · Submit a file or message to begin network packetization',
        footer: 'System ready · Waiting for user input',
        footerHint: hint,
      };
    case 'loaded':
      return {
        tone: 'info',
        banner: `File packetized: ${i.fileLabel} (${formatBytes(i.totalBytes)}) · ${i.packetCount.toLocaleString('en-US')} packets prepared into ${cars.total} packet cars parked at CSULB`,
        footer: `Loaded · ${cars.atSender} / ${cars.total} cars ready at ${SENDER}`,
        footerHint: hint,
      };
    case 'routing':
      return {
        tone: 'busy',
        banner: `Routing · Asking the route service for the ${ALGORITHM_GOAL[algorithm]} path`,
        footer: 'Routing · Waiting for the route service',
        footerHint: hint,
      };
    case 'searching':
      return {
        tone: 'busy',
        banner: `Searching · ${name} is exploring stations, ${i.visitedCount} of ${i.stationCount} visited`,
        footer: `Searching · ${i.visitedCount} / ${i.stationCount} stations visited`,
        footerHint: hint,
      };
    case 'driving':
      return {
        tone: 'success',
        banner: `${i.paused ? 'Paused' : 'Sending'} · ${cars.total} cars driving from ${SENDER} to ${DEST}.`,
        footer: `${i.paused ? 'Paused' : 'Driving'} · ${cars.onRoad} on the road · ${cars.atSender} at CSULB · ${cars.atDestination} at destination`,
        footerHint: hint,
      };
    case 'delivered':
      return {
        tone: 'success',
        banner: `Delivered via ${i.hops} hops`,
        footer: `Delivered · ${cars.atDestination} / ${cars.total} cars at ${DEST}`,
        footerHint: hint,
      };
    case 'noRoute':
      return {
        tone: 'danger',
        banner: 'No route available · Destination unreachable',
        footer: `No route available · 0 / ${cars.total} cars dispatched`,
        footerHint: 'Click Send to try again',
      };
    case 'blocked':
      return {
        tone: 'danger',
        banner: 'Waiting for a route · Restore a connection to resume',
        footer: 'Packet groups waiting for connectivity',
        footerHint: 'Restore an offline road or router',
      };
    case 'error':
      return {
        tone: 'danger',
        banner: 'Network Simulation Service Error: Unable to reach the route service',
        footer: 'Connection error · Route service unreachable',
        footerHint: 'Click Retry or refresh the page',
      };
  }
}

/** Splits cars by where they are. Before any Send every car is at the sender. */
export function countCars(
  total: number,
  statuses: readonly ('waiting' | 'driving' | 'arrived' | 'blocked')[],
): CarCounts {
  const onRoad = statuses.filter((s) => s === 'driving').length;
  const atDestination = statuses.filter((s) => s === 'arrived').length;
  return { total, onRoad, atDestination, atSender: total - onRoad - atDestination };
}
