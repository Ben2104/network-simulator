import { describe, expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { LIMITS } from './limits.js';
import {
  NetworkLinkSchema,
  NetworkNodeSchema,
  PacketizeRequestSchema,
  PacketizeResponseSchema,
  RouteRequestSchema,
} from './schemas.js';

describe('LIMITS', () => {
  it('holds the v2 contract values', () => {
    expect(LIMITS).toMatchObject({
      packetSizeBytes: 1500,
      maxCars: 24,
      messageMaxLength: 140,
      fileNameMaxLength: 255,
      fileMaxBytes: 1_073_741_824,
    });
  });
});

describe('NetworkNodeSchema / NetworkLinkSchema', () => {
  const node = {
    id: 'csulb',
    label: 'CSULB',
    kind: 'client',
    lat: 33.78,
    lon: -118.11,
    place: 'Long Beach, CA',
  };

  it('accepts lat/lon nodes and links with distanceKm', () => {
    expect(Value.Check(NetworkNodeSchema, node)).toBe(true);
    expect(
      Value.Check(NetworkLinkSchema, { id: 'a--b', source: 'a', target: 'b', distanceKm: 12.5 }),
    ).toBe(true);
  });

  it('rejects v1 x/y nodes, out-of-range coordinates and links without distanceKm', () => {
    expect(
      Value.Check(NetworkNodeSchema, { id: 'r1', label: 'R1', kind: 'router', x: 1, y: 2 }),
    ).toBe(false);
    expect(Value.Check(NetworkNodeSchema, { ...node, lat: 91 })).toBe(false);
    expect(Value.Check(NetworkNodeSchema, { ...node, lon: -181 })).toBe(false);
    expect(Value.Check(NetworkLinkSchema, { id: 'a--b', source: 'a', target: 'b' })).toBe(false);
    expect(
      Value.Check(NetworkLinkSchema, { id: 'a--b', source: 'a', target: 'b', distanceKm: -1 }),
    ).toBe(false);
  });
});

describe('PacketizeRequestSchema', () => {
  const file = { source: 'file', fileName: 'essay.pdf', sizeBytes: 1_048_576 };

  it.each([
    ['a file', file],
    ['the smallest file', { ...file, sizeBytes: 1 }],
    ['the largest file', { ...file, sizeBytes: LIMITS.fileMaxBytes }],
    ['a 255-char file name', { ...file, fileName: 'x'.repeat(255) }],
    ['a message', { source: 'message', message: 'Hello Oregon' }],
    ['a 140-char message', { source: 'message', message: 'x'.repeat(140) }],
  ])('accepts %s', (_, req) => {
    expect(Value.Check(PacketizeRequestSchema, req)).toBe(true);
  });

  it.each([
    ['an empty file', { ...file, sizeBytes: 0 }],
    ['a file over 1 GiB', { ...file, sizeBytes: LIMITS.fileMaxBytes + 1 }],
    ['a fractional size', { ...file, sizeBytes: 1.5 }],
    ['an empty file name', { ...file, fileName: '' }],
    ['a 256-char file name', { ...file, fileName: 'x'.repeat(256) }],
    ['an empty message', { source: 'message', message: '' }],
    ['a 141-char message', { source: 'message', message: 'x'.repeat(141) }],
    ['extra fields', { ...file, contents: 'AAAA' }],
    ['mixed variants', { source: 'message', fileName: 'a.txt', sizeBytes: 1 }],
    ['an unknown source', { source: 'url', url: 'https://example.com' }],
  ])('rejects %s', (_, req) => {
    expect(Value.Check(PacketizeRequestSchema, req)).toBe(false);
  });
});

describe('PacketizeResponseSchema', () => {
  it('accepts the documented 1 MiB example', () => {
    const res = {
      totalBytes: 1_048_576,
      packetSizeBytes: 1500,
      packetCount: 700,
      cars: [{ id: 'car-0', seq: 0, firstPacket: 0, lastPacket: 29, bytes: 45_000 }],
    };
    expect(Value.Check(PacketizeResponseSchema, res)).toBe(true);
  });
});

describe('RouteRequestSchema', () => {
  const base = { disabledNodeIds: [], disabledLinkIds: [] };

  it('accepts requests with and without fromNodeId', () => {
    expect(Value.Check(RouteRequestSchema, base)).toBe(true);
    expect(Value.Check(RouteRequestSchema, { ...base, fromNodeId: 'sacramento' })).toBe(true);
  });

  it('rejects the removed v1 message field and malformed IDs', () => {
    expect(Value.Check(RouteRequestSchema, { ...base, message: 'hi' })).toBe(false);
    expect(Value.Check(RouteRequestSchema, { ...base, fromNodeId: 'Not An Id' })).toBe(false);
    expect(Value.Check(RouteRequestSchema, { ...base, fromNodeId: '' })).toBe(false);
  });

  it('caps disabled ID lists', () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `r${i}`);
    expect(
      Value.Check(RouteRequestSchema, { ...base, disabledNodeIds: ids(LIMITS.maxDisabledIds) }),
    ).toBe(true);
    expect(
      Value.Check(RouteRequestSchema, { ...base, disabledNodeIds: ids(LIMITS.maxDisabledIds + 1) }),
    ).toBe(false);
  });
});
