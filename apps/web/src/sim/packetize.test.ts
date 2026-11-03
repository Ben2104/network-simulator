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

  it('12 KB → 8 packets in 1 car', () => {
    const r = packetize(file(12_000));
    expect(r.packetCount).toBe(8);
    expect(r.cars).toHaveLength(1);
  });

  it('1 MiB → 700 packets in 3 cars', () => {
    const r = packetize(file(1_048_576));
    expect(r.packetCount).toBe(700);
    expect(r.cars.map((c) => c.lastPacket - c.firstPacket + 1)).toEqual([234, 233, 233]);
  });

  it('5 MB → 12 cars', () => {
    expect(packetize(file(5_000_000)).cars).toHaveLength(12);
  });

  it('10 MB (the limit) → 6,667 packets in 24 cars; car bytes sum to the total', () => {
    const r = packetize(file(LIMITS.fileMaxBytes));
    expect(r.packetCount).toBe(6667);
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
