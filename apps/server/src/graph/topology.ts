import { haversineKm, type Network, type NetworkLink, type NetworkNode } from '@netsim/shared';

/**
 * Illustrative West Coast network: real places (approximate city coordinates), hand-picked links.
 * NOT real ISP topology. Fixed so every presentation is reproducible.
 *
 * Two station-disjoint corridors (coast via Oakland/Redding/Medford, inland via
 * Bakersfield/Fresno/Sacramento/Reno) so any single router failure still has a detour.
 */
const NODES: readonly NetworkNode[] = [
  {
    id: 'csulb',
    label: 'CSULB Parking Lot',
    kind: 'client',
    lat: 33.7838,
    lon: -118.1141,
    place: 'Long Beach, CA',
  },
  {
    id: 'lb-isp',
    label: 'Long Beach ISP',
    kind: 'router',
    lat: 33.7701,
    lon: -118.1937,
    place: 'Long Beach, CA',
  },
  {
    id: 'el-segundo',
    label: 'El Segundo',
    kind: 'router',
    lat: 33.9192,
    lon: -118.4165,
    place: 'El Segundo, CA',
  },
  {
    id: 'la-wilshire',
    label: 'One Wilshire',
    kind: 'router',
    lat: 34.0488,
    lon: -118.2558,
    place: 'Los Angeles, CA',
  },
  {
    id: 'riverside',
    label: 'Riverside',
    kind: 'router',
    lat: 33.9806,
    lon: -117.3755,
    place: 'Riverside, CA',
  },
  {
    id: 'bakersfield',
    label: 'Bakersfield',
    kind: 'router',
    lat: 35.3733,
    lon: -119.0187,
    place: 'Bakersfield, CA',
  },
  {
    id: 'slo',
    label: 'San Luis Obispo',
    kind: 'router',
    lat: 35.2828,
    lon: -120.6596,
    place: 'San Luis Obispo, CA',
  },
  {
    id: 'fresno',
    label: 'Fresno',
    kind: 'router',
    lat: 36.7378,
    lon: -119.7871,
    place: 'Fresno, CA',
  },
  {
    id: 'san-jose',
    label: 'San Jose',
    kind: 'router',
    lat: 37.3382,
    lon: -121.8863,
    place: 'San Jose, CA',
  },
  {
    id: 'oakland',
    label: 'Oakland',
    kind: 'router',
    lat: 37.8044,
    lon: -122.2712,
    place: 'Oakland, CA',
  },
  {
    id: 'sacramento',
    label: 'Sacramento',
    kind: 'router',
    lat: 38.5816,
    lon: -121.4944,
    place: 'Sacramento, CA',
  },
  { id: 'reno', label: 'Reno', kind: 'router', lat: 39.5296, lon: -119.8138, place: 'Reno, NV' },
  {
    id: 'redding',
    label: 'Redding',
    kind: 'router',
    lat: 40.5865,
    lon: -122.3917,
    place: 'Redding, CA',
  },
  {
    id: 'klamath-falls',
    label: 'Klamath Falls',
    kind: 'router',
    lat: 42.2249,
    lon: -121.7817,
    place: 'Klamath Falls, OR',
  },
  {
    id: 'medford',
    label: 'Medford',
    kind: 'router',
    lat: 42.3265,
    lon: -122.8756,
    place: 'Medford, OR',
  },
  {
    id: 'eugene',
    label: 'Eugene',
    kind: 'router',
    lat: 44.0521,
    lon: -123.0868,
    place: 'Eugene, OR',
  },
  { id: 'bend', label: 'Bend', kind: 'router', lat: 44.0582, lon: -121.3153, place: 'Bend, OR' },
  {
    id: 'portland',
    label: 'Portland',
    kind: 'router',
    lat: 45.5152,
    lon: -122.6784,
    place: 'Portland, OR',
  },
  {
    id: 'oregon-dc',
    label: 'US-West Data Center',
    kind: 'server',
    lat: 45.8399,
    lon: -119.7006,
    place: 'Boardman, OR',
  },
];

const LINKS: readonly (readonly [string, string])[] = [
  ['csulb', 'lb-isp'],
  ['csulb', 'el-segundo'],
  ['lb-isp', 'la-wilshire'],
  ['lb-isp', 'riverside'],
  ['la-wilshire', 'bakersfield'],
  ['riverside', 'bakersfield'],
  ['el-segundo', 'slo'],
  ['bakersfield', 'fresno'],
  ['slo', 'san-jose'],
  ['fresno', 'sacramento'],
  ['san-jose', 'oakland'],
  ['oakland', 'sacramento'],
  ['oakland', 'redding'],
  ['sacramento', 'redding'],
  ['sacramento', 'reno'],
  ['reno', 'klamath-falls'],
  ['redding', 'medford'],
  ['medford', 'klamath-falls'],
  ['medford', 'eugene'],
  ['klamath-falls', 'bend'],
  ['eugene', 'bend'],
  ['eugene', 'portland'],
  ['bend', 'oregon-dc'],
  ['portland', 'oregon-dc'],
];

const nodeById = new Map(NODES.map((n) => [n.id, n]));

/** Computed once at module load; distances rounded to 0.1 km for display. */
const NETWORK_LINKS: readonly NetworkLink[] = LINKS.map(([source, target]) => ({
  id: `${source}--${target}`,
  source,
  target,
  distanceKm: Math.round(haversineKm(nodeById.get(source)!, nodeById.get(target)!) * 10) / 10,
}));

/** Returns a fresh copy so callers can never mutate the shared topology. */
export function createDefaultNetwork(): Network {
  return {
    clientId: 'csulb',
    serverId: 'oregon-dc',
    nodes: NODES.map((n) => ({ ...n })),
    links: NETWORK_LINKS.map((l) => ({ ...l })),
  };
}
