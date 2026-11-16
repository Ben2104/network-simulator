/** Educational routing cost. This models a configured metric, not measured throughput. */
export const ROUTING = {
  referenceBandwidthMbps: 1000,
  defaultBandwidthMbps: 1000,
  bandwidthOptions: [10, 100, 1000] as const,
  maxOverrides: 64,
} as const;

export type BandwidthMbps = (typeof ROUTING.bandwidthOptions)[number];
export function isBandwidthMbps(value: number): value is BandwidthMbps {
  return (ROUTING.bandwidthOptions as readonly number[]).includes(value);
}

export function bandwidthCost(mbps: number): number {
  if (!isBandwidthMbps(mbps)) throw new RangeError('Bandwidth must be 10, 100 or 1000 Mbps');
  return ROUTING.referenceBandwidthMbps / mbps;
}

/** True for modes that read configured road costs (Dijkstra, and BGP inside each AS). */
export function usesLinkCost(algorithm: string | undefined): boolean {
  return algorithm === 'dijkstra' || algorithm === 'bgp';
}

export function bandwidthFor(id: string, overrides: Readonly<Record<string, number>>): number {
  return Object.hasOwn(overrides, id) ? overrides[id]! : ROUTING.defaultBandwidthMbps;
}

export function pathCost(
  linkIds: readonly string[],
  overrides: Readonly<Record<string, number>>,
): number {
  return linkIds.reduce((cost, id) => cost + bandwidthCost(bandwidthFor(id, overrides)), 0);
}
