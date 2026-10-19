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

  it('GET /api/network returns the topology', async () => {
    const net = (await app.inject({ method: 'GET', url: '/api/network' })).json<Network>();
    expect(net.clientId).toBe('client');
    expect(net.nodes.length).toBeGreaterThan(2);
  });

  it('POST /api/route routes and packetizes the message', async () => {
    const res = await route({
      message: 'hello network!!! :)',
      disabledNodeIds: [],
      disabledLinkIds: [],
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<RouteResponse>();
    expect(body.status).toBe('routed');
    expect(body.path.at(0)).toBe('client');
    expect(body.path.at(-1)).toBe('server');
    expect(body.packets.map((p) => p.payload).join('')).toBe('hello network!!! :)');
  });

  it('POST /api/route reroutes and reports unreachable', async () => {
    const rerouted = (
      await route({ message: 'hi', disabledNodeIds: ['r6'], disabledLinkIds: [] })
    ).json<RouteResponse>();
    expect(rerouted.path).not.toContain('r6');
    const cut = (
      await route({ message: 'hi', disabledNodeIds: ['r6', 'r7'], disabledLinkIds: [] })
    ).json<RouteResponse>();
    expect(cut.status).toBe('unreachable');
    expect(cut.packets).toEqual([]);
  });

  it.each([
    ['empty message', { message: '', disabledNodeIds: [], disabledLinkIds: [] }],
    ['message too long', { message: 'x'.repeat(141), disabledNodeIds: [], disabledLinkIds: [] }],
    ['missing fields', { message: 'hi' }],
    ['extra fields', { message: 'hi', disabledNodeIds: [], disabledLinkIds: [], hack: true }],
  ])('rejects %s with VALIDATION_ERROR', async (_, payload) => {
    const res = await route(payload);
    expect(res.statusCode).toBe(400);
    expect(res.json<ApiError>().error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects unknown IDs with UNKNOWN_ID', async () => {
    const res = await route({ message: 'hi', disabledNodeIds: ['r99'], disabledLinkIds: [] });
    expect(res.statusCode).toBe(400);
    expect(res.json<ApiError>().error.code).toBe('UNKNOWN_ID');
  });

  it('returns NOT_FOUND for unknown routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json<ApiError>().error.code).toBe('NOT_FOUND');
  });
});
