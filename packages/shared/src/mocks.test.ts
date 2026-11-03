import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import type { TSchema } from '@sinclair/typebox';
import { LIMITS } from './limits.js';
import {
  NetworkSchema,
  PacketizeResponseSchema,
  RouteResponseSchema,
  type Network,
  type PacketizeResponse,
  type RouteResponse,
} from './schemas.js';

const mock = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`../mocks/${name}.json`, import.meta.url), 'utf8')) as T;

const network = mock<Network>('network');
const routed = mock<RouteResponse>('route-routed');
const unreachable = mock<RouteResponse>('route-unreachable');
const packetize = mock<PacketizeResponse>('packetize-1mib');

describe('mock responses match the frozen v2 contract', () => {
  it.each<[string, TSchema, unknown]>([
    ['network', NetworkSchema, network],
    ['route-routed', RouteResponseSchema, routed],
    ['route-unreachable', RouteResponseSchema, unreachable],
    ['packetize-1mib', PacketizeResponseSchema, packetize],
  ])('%s.json passes its schema', (_, schema, body) => {
    expect([...Value.Errors(schema, body)]).toEqual([]);
  });

  it('route mocks only use stations and roads from network.json', () => {
    const nodeIds = new Set(network.nodes.map((n) => n.id));
    const linkIds = new Set(network.links.map((l) => l.id));
    for (const r of [routed, unreachable]) {
      for (const step of r.visitOrder) expect(nodeIds.has(step.nodeId)).toBe(true);
      for (const id of r.path) expect(nodeIds.has(id)).toBe(true);
      for (const id of r.linkPath) expect(linkIds.has(id)).toBe(true);
    }
  });

  it('route-routed runs CSULB → Oregon; route-unreachable has no path', () => {
    expect(routed.status).toBe('routed');
    expect(routed.path.at(0)).toBe(network.clientId);
    expect(routed.path.at(-1)).toBe(network.serverId);
    expect(routed.linkPath).toHaveLength(routed.path.length - 1);
    expect(unreachable).toMatchObject({ status: 'unreachable', path: [], linkPath: [] });
    expect(unreachable.visitOrder.length).toBeGreaterThan(0);
  });
});

describe('packetize-1mib.json (hand-written until POST /api/packetize lands)', () => {
  it('is the documented 1 MiB example: 700 packets in 24 cars', () => {
    expect(packetize.totalBytes).toBe(1024 ** 2);
    expect(packetize.packetSizeBytes).toBe(LIMITS.packetSizeBytes);
    expect(packetize.packetCount).toBe(Math.ceil(packetize.totalBytes / LIMITS.packetSizeBytes));
    expect(packetize.cars).toHaveLength(LIMITS.maxCars);
  });

  it('spreads packets evenly: cars 0–3 carry 30 packets, the rest 29', () => {
    const counts = packetize.cars.map((c) => c.lastPacket - c.firstPacket + 1);
    expect(counts).toEqual([...Array(4).fill(30), ...Array(20).fill(29)]);
  });

  it('covers every packet exactly once, in order, and every byte', () => {
    packetize.cars.forEach((car, i) => {
      expect(car).toMatchObject({ id: `car-${i}`, seq: i });
      expect(car.firstPacket).toBe(i === 0 ? 0 : packetize.cars[i - 1]!.lastPacket + 1);
    });
    expect(packetize.cars.at(-1)!.lastPacket).toBe(packetize.packetCount - 1);
    expect(packetize.cars.reduce((sum, c) => sum + c.bytes, 0)).toBe(packetize.totalBytes);
  });
});
