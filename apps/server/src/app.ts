import Fastify, { type FastifyServerOptions } from 'fastify';
import { createRequire } from 'node:module';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { WelcomeResponseSchema, type Network, type WelcomeResponse } from '@netsim/shared';
import { registerErrorHandlers } from './errors.js';
import { healthRoutes } from './routes/health.js';
import { networkRoutes } from './routes/network.js';
import { createDefaultNetwork } from './graph/topology.js';

const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

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
  await app.register(swagger, {
    openapi: { info: { title: 'Network Simulator API', version } },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });
  app.get<{ Reply: WelcomeResponse }>(
    '/',
    {
      schema: {
        tags: ['meta'],
        summary: 'Welcome message with links to the docs and health check',
        response: { 200: WelcomeResponseSchema },
      },
    },
    async () => ({ message: 'Welcome to Network Simulator', docs: '/docs', health: '/api/health' }),
  );
  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(networkRoutes, { network: opts.network ?? createDefaultNetwork() });
    },
    { prefix: '/api' },
  );
  return app;
}
