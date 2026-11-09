import type { FastifyPluginAsync } from 'fastify';
import {
  pathCost,
  NetworkSchema,
  RouteRequestSchema,
  RouteResponseSchema,
  type Network,
  type RouteRequest,
  type RouteResponse,
} from '@netsim/shared';
import { findRoute } from '../graph/bfs.js';
import { findWeightedRoute } from '../graph/dijkstra.js';
import { HttpError } from '../errors.js';

export interface NetworkRoutesOptions {
  network: Network;
}

export const networkRoutes: FastifyPluginAsync<NetworkRoutesOptions> = async (app, { network }) => {
  const nodeIds = new Set(network.nodes.map((n) => n.id));
  const linkIds = new Set(network.links.map((l) => l.id));

  app.get<{ Reply: Network }>(
    '/network',
    {
      schema: {
        tags: ['network'],
        summary: 'Fixed topology: nodes and links',
        response: { 200: NetworkSchema },
      },
    },
    async () => network,
  );

  app.post<{ Body: RouteRequest; Reply: RouteResponse }>(
    '/route',
    {
      schema: {
        tags: ['network'],
        summary: 'BFS fewest-hop or Dijkstra lowest-cost route, avoiding disabled connections',
        body: RouteRequestSchema,
        response: { 200: RouteResponseSchema },
      },
    },
    async (req) => {
      const { fromNodeId = network.clientId, disabledNodeIds, disabledLinkIds } = req.body;
      const { algorithm = 'bfs', linkBandwidthMbps = {} } = req.body;
      const unknown = [
        ...[fromNodeId, ...disabledNodeIds].filter((id) => !nodeIds.has(id)),
        ...[...disabledLinkIds, ...Object.keys(linkBandwidthMbps)].filter((id) => !linkIds.has(id)),
      ];
      if (unknown.length > 0) {
        throw new HttpError(400, 'UNKNOWN_ID', `Unknown node or link IDs: ${unknown.join(', ')}`);
      }

      const failures = {
        disabledNodeIds: new Set(disabledNodeIds),
        disabledLinkIds: new Set(disabledLinkIds),
      };
      const result =
        algorithm === 'dijkstra'
          ? findWeightedRoute(network, fromNodeId, network.serverId, failures, linkBandwidthMbps)
          : findRoute(network, fromNodeId, network.serverId, failures);
      return {
        status: result.found ? 'routed' : 'unreachable',
        visitOrder: result.visitOrder,
        path: result.path,
        linkPath: result.linkPath,
        // Preserve the exact v2 reply for legacy clients and frozen mocks.
        ...(req.body.algorithm !== undefined || req.body.linkBandwidthMbps !== undefined
          ? {
              algorithm,
              totalCost: result.found ? pathCost(result.linkPath, linkBandwidthMbps) : null,
            }
          : {}),
      };
    },
  );
};
