import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());
const request = (body: object) =>
  app.inject({
    method: 'POST',
    url: '/api/route',
    payload: { disabledNodeIds: [], disabledLinkIds: [], ...body },
  });

describe('weighted routing API', () => {
  it('preserves the exact legacy BFS reply and adds metadata only when requested', async () => {
    const old = (await request({})).json();
    const current = (await request({ algorithm: 'bfs' })).json();
    expect(Object.keys(old).sort()).toEqual(['linkPath', 'path', 'status', 'visitOrder']);
    expect(current).toEqual({ ...old, algorithm: 'bfs', totalCost: old.linkPath.length });
  });
  it('avoids a slow first road while BFS still follows its fewest-hop path', async () => {
    const normal = (await request({ algorithm: 'dijkstra' })).json();
    const id = normal.linkPath[0];
    const overrides = { [id]: 10 };
    const weighted = (
      await request({ algorithm: 'dijkstra', linkBandwidthMbps: overrides })
    ).json();
    expect(weighted.status).toBe('routed');
    expect(weighted.linkPath).not.toContain(id);
    const bfs = (await request({ algorithm: 'bfs', linkBandwidthMbps: overrides })).json();
    const originalBfs = (await request({ algorithm: 'bfs' })).json();
    expect(bfs.path).toEqual(originalBfs.path);
    expect(weighted.algorithm).toBe('dijkstra');
    expect(weighted.visitOrder.at(-1).cost).toBe(weighted.totalCost);
    // Request overrides are stateless; the next default request is unchanged.
    expect((await request({ algorithm: 'dijkstra' })).json()).toEqual(normal);
  });
  it('respects offline connections and returns null cost for unreachable', async () => {
    const res = await request({
      algorithm: 'dijkstra',
      disabledNodeIds: ['san-jose', 'sacramento', 'winnemucca'],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: 'unreachable',
      path: [],
      linkPath: [],
      totalCost: null,
    });
    expect(
      res
        .json()
        .visitOrder.every(
          (s: { nodeId: string }) => !['san-jose', 'sacramento', 'winnemucca'].includes(s.nodeId),
        ),
    ).toBe(true);
  });
  it.each([-10, 0, 1, 50, 100.5, 1001, '100', null])('rejects invalid Mbps %s', async (value) => {
    const res = await request({
      algorithm: 'dijkstra',
      linkBandwidthMbps: { 'csulb--el-segundo': value },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
  it('rejects unknown road IDs and unsupported algorithms', async () => {
    const unknown = await request({
      algorithm: 'dijkstra',
      linkBandwidthMbps: { 'unknown-road': 100 },
    });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json().error.code).toBe('UNKNOWN_ID');
    expect((await request({ algorithm: 'ospf' })).statusCode).toBe(400);
  });
});
