import { describe, expect, it } from 'vitest';
import { LIMITS } from '@netsim/shared';
import { packetize } from './packetize';

const file = (sizeBytes: number) => ({ source: 'file' as const, fileName: 'a.bin', sizeBytes });

describe('packetize (matches the architecture.md examples)', () => {
  it('1 B → 1 packet, 1 car', () => {
    const r = packetize(file(1));
    expect(r.packetCount).toBe(1);
    expect(r.cars).toEqual([{ id: 'car-0', seq: 0, firstPacket: 0, lastPacket: 0, bytes: 1 }]);
  });

  it('36,000 B → 24 packets, one per car', () => {
    const r = packetize(file(36_000));
    expect(r.packetCount).toBe(24);
    expect(r.cars).toHaveLength(24);
    expect(r.cars.every((c) => c.firstPacket === c.lastPacket)).toBe(true);
  });

  it('1 MiB → 700 packets in 24 cars; cars 0–3 carry 30, the rest 29', () => {
    const r = packetize(file(1_048_576));
    expect(r.packetCount).toBe(700);
    expect(r.cars).toHaveLength(24);
    const counts = r.cars.map((c) => c.lastPacket - c.firstPacket + 1);
    expect(counts.slice(0, 4)).toEqual([30, 30, 30, 30]);
    expect(counts.slice(4).every((n) => n === 29)).toBe(true);
    expect(r.cars[0]?.bytes).toBe(45_000);
  });

  it('1 GiB → 715,828 packets, still 24 cars; car bytes sum to the total', () => {
    const r = packetize(file(LIMITS.fileMaxBytes));
    expect(r.packetCount).toBe(715_828);
    expect(r.cars).toHaveLength(LIMITS.maxCars);
    expect(r.cars.reduce((s, c) => s + c.bytes, 0)).toBe(LIMITS.fileMaxBytes);
  });

  it('packs messages by UTF-8 byte length', () => {
    const r = packetize({ source: 'message', message: 'héllo' });
    expect(r.totalBytes).toBe(6);
    expect(r.cars).toHaveLength(1);
  });

  it('rejects out-of-range input', () => {
    expect(() => packetize(file(0))).toThrow();
    expect(() => packetize(file(LIMITS.fileMaxBytes + 1))).toThrow();
    expect(() => packetize({ source: 'message', message: '' })).toThrow();
    expect(() => packetize({ source: 'message', message: 'x'.repeat(141) })).toThrow();
  });
});
