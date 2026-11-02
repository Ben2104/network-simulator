import type { Network } from '@netsim/shared';

const place = 'Demo network';

/**
 * The default demo network. Fixed (not random) so every presentation run is reproducible.
 *
 * Temporary v2 bridge until the West Coast topology (#2) replaces it: the 9-node demo graph laid
 * out south (client) to north (server) inside the shared map bounds. Coordinates are placeholders
 * and `distanceKm` stays 0; #2 computes real distances with haversine.
 *
 *              server
 *            ╱        ╲
 *          r6          r7
 *          │  ╲      ╱  │
 *          r3    r4     r5
 *          │  ╱      ╲  │
 *          r1          r2
 *            ╲        ╱
 *              client
 */
export function createDefaultNetwork(): Network {
  return {
    clientId: 'client',
    serverId: 'server',
    nodes: [
      { id: 'client', label: 'Your computer', kind: 'client', lat: 33.8, lon: -120.5, place },
      { id: 'r1', label: 'Router 1', kind: 'router', lat: 36.34, lon: -121.74, place },
      { id: 'r2', label: 'Router 2', kind: 'router', lat: 36.34, lon: -119.26, place },
      { id: 'r3', label: 'Router 3', kind: 'router', lat: 39.59, lon: -122.5, place },
      { id: 'r4', label: 'Router 4', kind: 'router', lat: 39.59, lon: -120.5, place },
      { id: 'r5', label: 'Router 5', kind: 'router', lat: 39.59, lon: -118.5, place },
      { id: 'r6', label: 'Router 6', kind: 'router', lat: 42.98, lon: -121.74, place },
      { id: 'r7', label: 'Router 7', kind: 'router', lat: 42.98, lon: -119.26, place },
      { id: 'server', label: 'Server', kind: 'server', lat: 45.8, lon: -120.5, place },
    ],
    links: [
      ['client', 'r1'],
      ['client', 'r2'],
      ['r1', 'r3'],
      ['r1', 'r4'],
      ['r2', 'r4'],
      ['r2', 'r5'],
      ['r3', 'r6'],
      ['r4', 'r6'],
      ['r4', 'r7'],
      ['r5', 'r7'],
      ['r6', 'server'],
      ['r7', 'server'],
    ].map(([source, target]) => ({
      id: `${source}-${target}`,
      source: source!,
      target: target!,
      distanceKm: 0,
    })),
  };
}
