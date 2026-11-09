import { describe, expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { ROUTING, bandwidthCost, bandwidthFor, isBandwidthMbps, pathCost } from './routing.js';
import { RouteRequestSchema, RouteResponseSchema } from './schemas.js';

const base = { disabledNodeIds: [], disabledLinkIds: [] };

describe('configured routing cost and contract', () => {
  it.each(ROUTING.bandwidthOptions)('accepts %s Mbps in the helper and API schema', (mbps) => {
    expect(isBandwidthMbps(mbps)).toBe(true);
    expect(bandwidthCost(mbps)).toBe(1000 / mbps);
    expect(
      Value.Check(RouteRequestSchema, {
        ...base,
        algorithm: 'dijkstra',
        linkBandwidthMbps: { 'a--b': mbps },
      }),
    ).toBe(true);
  });
  it.each([-100, -1, 0, 1, 9, 99, 100.5, 500, 1001, Infinity, NaN])(
    'rejects unsupported bandwidth %s',
    (mbps) => {
      expect(isBandwidthMbps(mbps)).toBe(false);
      expect(() => bandwidthCost(mbps)).toThrow(RangeError);
      expect(
        Value.Check(RouteRequestSchema, { ...base, linkBandwidthMbps: { 'a--b': mbps } }),
      ).toBe(false);
    },
  );
  it('defaults to 1000 Mbps and ignores inherited properties', () => {
    expect(bandwidthFor('a--b', {})).toBe(1000);
    expect(bandwidthFor('constructor', {})).toBe(1000);
    expect(pathCost(['a--b', 'b--c'], { 'a--b': 10 })).toBe(101);
    expect(pathCost([], {})).toBe(0);
  });
  it('keeps legacy requests and replies valid and rejects unknown modes/invalid keys', () => {
    expect(Value.Check(RouteRequestSchema, base)).toBe(true);
    expect(Value.Check(RouteRequestSchema, { ...base, algorithm: 'ospf' })).toBe(false);
    expect(Value.Check(RouteRequestSchema, { ...base, linkBandwidthMbps: { 'bad id': 100 } })).toBe(
      false,
    );
    expect(
      Value.Check(RouteRequestSchema, { ...base, linkBandwidthMbps: { ['a'.repeat(33)]: 100 } }),
    ).toBe(false);
    expect(Value.Check(RouteRequestSchema, { ...base, linkBandwidthMbps: [] })).toBe(false);
    expect(
      Value.Check(RouteRequestSchema, {
        ...base,
        linkBandwidthMbps: Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`l${i}`, 100])),
      }),
    ).toBe(false);
    expect(
      Value.Check(RouteResponseSchema, {
        status: 'unreachable',
        path: [],
        linkPath: [],
        visitOrder: [],
      }),
    ).toBe(true);
    expect(
      Value.Check(RouteResponseSchema, {
        status: 'unreachable',
        path: [],
        linkPath: [],
        visitOrder: [],
        algorithm: 'dijkstra',
        totalCost: null,
      }),
    ).toBe(true);
  });
});
