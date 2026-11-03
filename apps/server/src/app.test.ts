import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { LIMITS, type ApiError, type Network, type RouteResponse } from '@netsim/shared';
import { buildApp } from './app.js';
import {
  DOCUMENTED_ROUTES,
  SCENARIOS,
  expectDocumented,
  toRouteRequest,
} from './test/demo-routes.js';

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());

const route = (payload: object) => app.inject({ method: 'POST', url: '/api/route', payload });

describe('API', () => {
  it('GET / welcomes and links to docs', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      message: 'Welcome to Network Simulator',
      docs: '/docs',
      health: '/api/health',
    });
  });

  it('GET /docs/json lists the API routes', async () => {
    const doc = (await app.inject({ method: 'GET', url: '/docs/json' })).json<{
      info: { title: string };
      paths: Record<string, unknown>;
    }>();
    expect(doc.info.title).toBe('Network Simulator API');
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining(['/', '/api/health', '/api/network', '/api/route']),
    );
  });

  it('GET /api/health', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });
  });

  it('GET /api/network returns the v2 West Coast topology', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/network' });
    expect(res.statusCode).toBe(200);
    const net = res.json<Network>();
    expect(net.clientId).toBe('csulb');
    expect(net.serverId).toBe('oregon-dc');
    expect(net.nodes).toHaveLength(19);
    expect(net.links).toHaveLength(24);
    for (const node of net.nodes) {
      expect(node).toEqual(
        expect.objectContaining({
          lat: expect.any(Number),
          lon: expect.any(Number),
          place: expect.any(String),
        }),
      );
    }
    for (const link of net.links) expect(link.distanceKm).toBeGreaterThan(0);
  });

  it('POST /api/route routes from the client by default', async () => {
    const res = await route({ disabledNodeIds: [], disabledLinkIds: [] });
    expect(res.statusCode).toBe(200);
    const body = res.json<RouteResponse>();
    expect(body.status).toBe('routed');
    expect(body.path.at(0)).toBe('csulb');
    expect(body.path.at(-1)).toBe('oregon-dc');
    expect(body.linkPath).toHaveLength(body.path.length - 1);
    expect(Object.keys(body).sort()).toEqual(['linkPath', 'path', 'status', 'visitOrder']);
  });

  it.each(DOCUMENTED_ROUTES)(
    'POST /api/route returns the documented demo route: %s',
    async (label, expected) => {
      const res = await route(toRouteRequest(SCENARIOS[label]!));
      expect(res.statusCode).toBe(200);
      const body = res.json<RouteResponse>();
      expectDocumented({ ...body, routed: body.status === 'routed' }, expected);
    },
  );

  it('POST /api/route from the server itself is a zero-hop route', async () => {
    const body = (
      await route({ fromNodeId: 'oregon-dc', disabledNodeIds: [], disabledLinkIds: [] })
    ).json<RouteResponse>();
    expect(body).toEqual({
      status: 'routed',
      visitOrder: [{ nodeId: 'oregon-dc', parentId: null, viaLinkId: null, depth: 0 }],
      path: ['oregon-dc'],
      linkPath: [],
    });
  });

  it('POST /api/route from a disabled station is unreachable without searching', async () => {
    const res = await route({
      fromNodeId: 'oakland',
      disabledNodeIds: ['oakland'],
      disabledLinkIds: [],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<RouteResponse>()).toEqual({
      status: 'unreachable',
      visitOrder: [],
      path: [],
      linkPath: [],
    });
  });

  it('POST /api/route starts at fromNodeId', async () => {
    const body = (
      await route({ fromNodeId: 'sacramento', disabledNodeIds: [], disabledLinkIds: [] })
    ).json<RouteResponse>();
    expect(body.status).toBe('routed');
    expect(body.visitOrder.at(0)).toEqual({
      nodeId: 'sacramento',
      parentId: null,
      viaLinkId: null,
      depth: 0,
    });
    expect(body.path).toEqual(['sacramento', 'reno', 'klamath-falls', 'bend', 'oregon-dc']);
  });

  it('POST /api/route reroutes and reports unreachable', async () => {
    const rerouted = (
      await route({ disabledNodeIds: ['oakland'], disabledLinkIds: [] })
    ).json<RouteResponse>();
    expect(rerouted.status).toBe('routed');
    expect(rerouted.path).not.toContain('oakland');
    const cut = (
      await route({ disabledNodeIds: ['sacramento', 'redding'], disabledLinkIds: [] })
    ).json<RouteResponse>();
    expect(cut.status).toBe('unreachable');
    expect(cut.path).toEqual([]);
    expect(cut.linkPath).toEqual([]);
    expect(cut.visitOrder.length).toBeGreaterThan(0);
  });

  it.each([
    ['missing fields', {}],
    ['extra fields', { disabledNodeIds: [], disabledLinkIds: [], hack: true }],
    ['the removed v1 message field', { message: 'hi', disabledNodeIds: [], disabledLinkIds: [] }],
    ['a malformed fromNodeId', { fromNodeId: 'R4!', disabledNodeIds: [], disabledLinkIds: [] }],
    ['duplicate disabled IDs', { disabledNodeIds: ['oakland', 'oakland'], disabledLinkIds: [] }],
    ['an empty fromNodeId', { fromNodeId: '', disabledNodeIds: [], disabledLinkIds: [] }],
    [
      'an over-long ID',
      { fromNodeId: 'x'.repeat(LIMITS.maxIdLength + 1), disabledNodeIds: [], disabledLinkIds: [] },
    ],
    [
      'too many disabled IDs',
      {
        disabledNodeIds: Array.from({ length: LIMITS.maxDisabledIds + 1 }, (_, i) => `r${i}`),
        disabledLinkIds: [],
      },
    ],
    // No type coercion: Fastify would otherwise turn these into valid-looking values.
    ['a numeric fromNodeId', { fromNodeId: 42, disabledNodeIds: [], disabledLinkIds: [] }],
    ['a null fromNodeId', { fromNodeId: null, disabledNodeIds: [], disabledLinkIds: [] }],
    ['a string instead of an ID list', { disabledNodeIds: 'oakland', disabledLinkIds: [] }],
    ['numbers in an ID list', { disabledNodeIds: [1], disabledLinkIds: [] }],
    ['an array body', []],
  ])('rejects %s with VALIDATION_ERROR', async (_, payload) => {
    const res = await route(payload);
    expect(res.statusCode).toBe(400);
    expect(res.json<ApiError>().error.code).toBe('VALIDATION_ERROR');
  });

  it.each([
    ['disabled node', { disabledNodeIds: ['r99'], disabledLinkIds: [] }],
    ['disabled link', { disabledNodeIds: [], disabledLinkIds: ['oakland--r99'] }],
    ['fromNodeId', { fromNodeId: 'r99', disabledNodeIds: [], disabledLinkIds: [] }],
  ])('rejects an unknown %s with UNKNOWN_ID', async (_, payload) => {
    const res = await route(payload);
    expect(res.statusCode).toBe(400);
    expect(res.json<ApiError>().error.code).toBe('UNKNOWN_ID');
  });

  it('names every unknown ID in the UNKNOWN_ID message', async () => {
    const res = await route({
      fromNodeId: 'atlantis',
      disabledNodeIds: ['oakland', 'r99'],
      disabledLinkIds: ['oakland--r99'],
    });
    expect(res.json<ApiError>().error).toEqual({
      code: 'UNKNOWN_ID',
      message: 'Unknown node or link IDs: atlantis, r99, oakland--r99',
    });
  });

  it('returns NOT_FOUND for unknown routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json<ApiError>().error.code).toBe('NOT_FOUND');
  });
});
