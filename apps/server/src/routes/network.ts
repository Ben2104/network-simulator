import type { FastifyPluginAsync } from 'fastify';
import {
  NetworkSchema,
  RouteRequestSchema,
  RouteResponseSchema,
  type Network,
  type RouteRequest,
  type RouteResponse,
} from '@netsim/shared';
import { findRoute } from '../graph/bfs.js';
import { toPackets } from '../graph/packets.js';
import { HttpError } from '../errors.js';

export interface NetworkRoutesOptions {
  network: Network;
}

export const networkRoutes: FastifyPluginAsync<NetworkRoutesOptions> = async (app, { network }) => {
  const nodeIds = new Set(network.nodes.map((n) => n.id));
  const linkIds = new Set(network.links.map((l) => l.id));

  app.get<{ Reply: Network }>(
    '/network',
    { schema: { response: { 200: NetworkSchema } } },
    async () => network,
  );

  app.post<{ Body: RouteRequest; Reply: RouteResponse }>(
    '/route',
    { schema: { body: RouteRequestSchema, response: { 200: RouteResponseSchema } } },
    async (req) => {
      const { message, disabledNodeIds, disabledLinkIds } = req.body;
      const unknown = [
        ...disabledNodeIds.filter((id) => !nodeIds.has(id)),
        ...disabledLinkIds.filter((id) => !linkIds.has(id)),
      ];
      if (unknown.length > 0) {
        throw new HttpError(400, 'UNKNOWN_ID', `Unknown node or link IDs: ${unknown.join(', ')}`);
      }

      const result = findRoute(network, network.clientId, network.serverId, {
        disabledNodeIds: new Set(disabledNodeIds),
        disabledLinkIds: new Set(disabledLinkIds),
      });
      return {
        status: result.found ? 'routed' : 'unreachable',
        visitOrder: result.visitOrder,
        path: result.path,
        linkPath: result.linkPath,
        packets: result.found ? toPackets(message) : [],
      };
    },
  );
};
