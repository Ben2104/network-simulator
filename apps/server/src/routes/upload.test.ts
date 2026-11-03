import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { LIMITS, type ApiError, type UploadResponse } from '@netsim/shared';
import { buildApp } from '../app.js';

let app: FastifyInstance;
afterEach(() => app?.close());

async function upload(body: Buffer | string, headers: Record<string, string> = {}, perMinute = 50) {
  app ??= await buildApp({ uploadsPerMinute: perMinute });
  return app.inject({
    method: 'POST',
    url: '/api/upload',
    payload: body,
    headers: { 'content-type': 'application/octet-stream', ...headers },
  });
}

describe('POST /api/upload', () => {
  afterEach(() => {
    app = undefined as unknown as FastifyInstance;
  });

  it('hashes the bytes (SHA-256 test vector) and reports the file', async () => {
    const res = await upload('abc', { 'x-file-name': encodeURIComponent('notes 1.txt') });
    expect(res.statusCode).toBe(200);
    const body = res.json<UploadResponse>();
    expect(body).toMatchObject({
      fileName: 'notes 1.txt',
      bytesReceived: 3,
      size: '3 B',
      limitBytes: 10_000_000,
      underLimit: true,
      sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      region: 'oregon',
      packetCount: 1,
      carCount: 1,
      summary: 'notes 1.txt is 3 B (under the 10 MB limit): 1 packet in 1 car.',
    });
    expect(Date.parse(body.receivedAt)).not.toBeNaN();
  });

  it('a file at the 10 MB limit fills 24 cars', async () => {
    const res = await upload(Buffer.alloc(LIMITS.uploadMaxBytes, 7));
    expect(res.statusCode).toBe(200);
    const body = res.json<UploadResponse>();
    expect(body.carCount).toBe(24);
    expect(body.cars).toHaveLength(24);
    expect(body.packetCount).toBe(6667);
    expect(body.cars.reduce((s, c) => s + c.bytes, 0)).toBe(LIMITS.uploadMaxBytes);
    expect(body.fileName).toBeNull();
  });

  it('smaller files get proportionally fewer cars', async () => {
    const res = await upload(Buffer.alloc(5_000_000));
    expect(res.json<UploadResponse>().carCount).toBe(12);
  });

  it('rejects a body over 10 MB with 413 PAYLOAD_TOO_LARGE', async () => {
    const res = await upload(Buffer.alloc(LIMITS.uploadMaxBytes + 1));
    expect(res.statusCode).toBe(413);
    expect(res.json<ApiError>().error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('rejects an empty body with 400 VALIDATION_ERROR', async () => {
    const res = await upload(Buffer.alloc(0));
    expect(res.statusCode).toBe(400);
    expect(res.json<ApiError>().error.code).toBe('VALIDATION_ERROR');
  });

  it('rate-limits per IP with 429 RATE_LIMITED', async () => {
    for (let i = 0; i < 3; i++) expect((await upload('x', {}, 3)).statusCode).toBe(200);
    const res = await upload('x', {}, 3);
    expect(res.statusCode).toBe(429);
    expect(res.json<ApiError>().error.code).toBe('RATE_LIMITED');
  });
});
