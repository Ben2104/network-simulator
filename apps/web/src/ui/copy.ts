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
  fileLabel: string | null;
  totalBytes: number;
  packetCount: number;
  hops: number;
  visitedCount: number;
  stationCount: number;
  cars: CarCounts;
  /** Labels of offline stations; roads are not named in the banner. */
  offlineStationLabels: readonly string[];
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
export const formatBytes = (n: number) => `${n.toLocaleString('en-US')} B`;

export function describePhase(i: CopyInput): PhaseCopy {
  const { cars } = i;
  const hint = 'Failures can change between sends';
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
        banner: 'Routing · Asking the route service for the fewest-hop path',
        footer: 'Routing · Waiting for the route service',
        footerHint: 'Network controls locked while sending',
      };
    case 'searching':
      return {
        tone: 'busy',
        banner: `Searching · BFS is exploring stations, ${i.visitedCount} of ${i.stationCount} visited`,
        footer: `Searching · ${i.visitedCount} / ${i.stationCount} stations visited`,
        footerHint: 'Network controls locked while sending',
      };
    case 'driving':
      return {
        tone: 'success',
        banner: `${i.paused ? 'Paused' : 'Sending'} · ${cars.total} cars driving from ${SENDER} to ${DEST}.`,
        footer: `${i.paused ? 'Paused' : 'Driving'} · ${cars.onRoad} on the road · ${cars.atSender} at CSULB · ${cars.atDestination} at destination`,
        footerHint: 'Network controls locked while sending',
      };
    case 'delivered': {
      const avoiding = i.offlineStationLabels.length
        ? `, avoiding offline ${i.offlineStationLabels.join(', ')}`
        : '';
      return {
        tone: 'success',
        banner: `Delivered via ${i.hops} hops${avoiding}`,
        footer: `Delivered · ${cars.atDestination} / ${cars.total} cars at ${DEST}`,
        footerHint: hint,
      };
    }
    case 'noRoute':
      return {
        tone: 'danger',
        banner: 'No route available · Destination unreachable due to multiple link/station outages',
        footer: `No route available · 0 / ${cars.total} cars dispatched`,
        footerHint: 'Toggle failures in Network Status to restore connectivity',
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
  statuses: readonly ('waiting' | 'driving' | 'arrived')[],
): CarCounts {
  const onRoad = statuses.filter((s) => s === 'driving').length;
  const atDestination = statuses.filter((s) => s === 'arrived').length;
  return { total, onRoad, atDestination, atSender: total - onRoad - atDestination };
}
