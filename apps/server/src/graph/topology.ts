import type { Network } from '@netsim/shared';

/**
 * The default demo network. Fixed (not random) so every presentation run is reproducible.
 *
 *            r1 ── r3 ── r6
 *          ╱    ╲      ╱    ╲
 *   client       r4 ──       server
 *          ╲    ╱    ╲      ╱
 *            r2 ── r5 ── r7
 */
export function createDefaultNetwork(): Network {
  return {
    clientId: 'client',
    serverId: 'server',
    nodes: [
      { id: 'client', label: 'Your computer', kind: 'client', x: 70, y: 300 },
      { id: 'r1', label: 'Router 1', kind: 'router', x: 250, y: 170 },
      { id: 'r2', label: 'Router 2', kind: 'router', x: 250, y: 430 },
      { id: 'r3', label: 'Router 3', kind: 'router', x: 480, y: 90 },
      { id: 'r4', label: 'Router 4', kind: 'router', x: 480, y: 300 },
      { id: 'r5', label: 'Router 5', kind: 'router', x: 480, y: 510 },
      { id: 'r6', label: 'Router 6', kind: 'router', x: 720, y: 170 },
      { id: 'r7', label: 'Router 7', kind: 'router', x: 720, y: 430 },
      { id: 'server', label: 'Server', kind: 'server', x: 920, y: 300 },
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
    ].map(([source, target]) => ({ id: `${source}-${target}`, source: source!, target: target! })),
  };
}
