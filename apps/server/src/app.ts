import Fastify, { type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import type { Network } from '@netsim/shared';
import { registerErrorHandlers } from './errors.js';
import { healthRoutes } from './routes/health.js';
import { networkRoutes } from './routes/network.js';
import { createDefaultNetwork } from './graph/topology.js';

export interface AppOptions {
  corsOrigins?: string[];
  network?: Network;
  logger?: FastifyServerOptions['logger'];
}

/** Builds the app without listening, so tests can use `app.inject()`. */
export async function buildApp(opts: AppOptions = {}) {
  const app = Fastify({
    logger: opts.logger ?? false,
    bodyLimit: 16 * 1024,
    // Fastify defaults silently strip unknown props and coerce types; reject bad input instead.
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  });
  registerErrorHandlers(app);
  await app.register(cors, { origin: opts.corsOrigins ?? true });
  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(networkRoutes, { network: opts.network ?? createDefaultNetwork() });
    },
    { prefix: '/api' },
  );
  return app;
}
