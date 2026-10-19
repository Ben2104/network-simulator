import type { FastifyPluginAsync } from 'fastify';
import { HealthResponseSchema, type HealthResponse } from '@netsim/shared';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Reply: HealthResponse }>(
    '/health',
    { schema: { response: { 200: HealthResponseSchema } } },
    async () => ({
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      version: process.env.npm_package_version ?? '0.0.0',
    }),
  );
};
