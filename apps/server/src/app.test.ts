import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ApiError, Network, RouteResponse } from '@netsim/shared';
import { buildApp } from './app.js';

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());

const route = (payload: object) => app.inject({ method: 'POST', url: '/api/route', payload });

describe('API', () => {
  it('GET /api/health', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });
  });

  it('GET /api/network returns the v2 topology', async () => {
    const net = (await app.inject({ method: 'GET', url: '/api/network' })).json<Network>();
    expect(net.clientId).toBe('client');
    expect(net.nodes.length).toBeGreaterThan(2);
    for (const node of net.nodes) {
      expect(node).toEqual(
        expect.objectContaining({
          lat: expect.any(Number),
          lon: expect.any(Number),
          place: expect.any(String),
        }),
      );
    }
    for (const link of net.links) expect(link.distanceKm).toBeGreaterThanOrEqual(0);
  });

  it('POST /api/route routes from the client by default', async () => {
    const res = await route({ disabledNodeIds: [], disabledLinkIds: [] });
    expect(res.statusCode).toBe(200);
    const body = res.json<RouteResponse>();
    expect(body.status).toBe('routed');
    expect(body.path.at(0)).toBe('client');
    expect(body.path.at(-1)).toBe('server');
    expect(body.linkPath).toHaveLength(body.path.length - 1);
    expect(body).not.toHaveProperty('packets');
  });

  it('POST /api/route starts at fromNodeId', async () => {
    const body = (
      await route({ fromNodeId: 'r4', disabledNodeIds: [], disabledLinkIds: [] })
    ).json<RouteResponse>();
    expect(body.status).toBe('routed');
    expect(body.visitOrder.at(0)).toEqual({
      nodeId: 'r4',
      parentId: null,
      viaLinkId: null,
      depth: 0,
    });
    expect(body.path).toEqual(['r4', 'r6', 'server']);
  });

  it('POST /api/route reroutes and reports unreachable', async () => {
    const rerouted = (
      await route({ disabledNodeIds: ['r6'], disabledLinkIds: [] })
    ).json<RouteResponse>();
    expect(rerouted.path).not.toContain('r6');
    const cut = (
      await route({ disabledNodeIds: ['r6', 'r7'], disabledLinkIds: [] })
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
    ['duplicate disabled IDs', { disabledNodeIds: ['r1', 'r1'], disabledLinkIds: [] }],
  ])('rejects %s with VALIDATION_ERROR', async (_, payload) => {
    const res = await route(payload);
    expect(res.statusCode).toBe(400);
    expect(res.json<ApiError>().error.code).toBe('VALIDATION_ERROR');
  });

  it.each([
    ['disabled node', { disabledNodeIds: ['r99'], disabledLinkIds: [] }],
    ['disabled link', { disabledNodeIds: [], disabledLinkIds: ['r1-r99'] }],
    ['fromNodeId', { fromNodeId: 'r99', disabledNodeIds: [], disabledLinkIds: [] }],
  ])('rejects an unknown %s with UNKNOWN_ID', async (_, payload) => {
    const res = await route(payload);
    expect(res.statusCode).toBe(400);
    expect(res.json<ApiError>().error.code).toBe('UNKNOWN_ID');
  });

  it('returns NOT_FOUND for unknown routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json<ApiError>().error.code).toBe('NOT_FOUND');
  });
});
