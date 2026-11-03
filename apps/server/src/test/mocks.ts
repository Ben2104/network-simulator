import type { FastifyInstance } from 'fastify';
import type { RouteRequest } from '@netsim/shared';

/**
 * Test support only (excluded from the build). The mock responses in `packages/shared/mocks/`
 * are real API output, so frontend and 3D work can build against them. `mocks.test.ts` fails if
 * they go stale; regenerate with `npm run mocks -w @netsim/server`.
 */
export const MOCKS_DIR = new URL('../../../../packages/shared/mocks/', import.meta.url);

/** Requests behind the generated route mocks (also listed in the mocks README). */
export const ROUTE_MOCK_REQUESTS: Record<string, RouteRequest> = {
  'route-routed': { disabledNodeIds: [], disabledLinkIds: [] },
  'route-unreachable': { disabledNodeIds: ['sacramento', 'redding'], disabledLinkIds: [] },
};

/** Generated from the running app. `packetize-1mib.json` is hand-written until #7 lands. */
export async function buildApiMocks(app: FastifyInstance): Promise<Record<string, unknown>> {
  const mocks: Record<string, unknown> = {
    network: (await app.inject({ method: 'GET', url: '/api/network' })).json(),
  };
  for (const [name, payload] of Object.entries(ROUTE_MOCK_REQUESTS)) {
    mocks[name] = (await app.inject({ method: 'POST', url: '/api/route', payload })).json();
  }
  return mocks;
}
