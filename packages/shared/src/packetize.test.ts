import { describe, expect, it } from 'vitest';
import { LIMITS } from './limits.js';
import { BYTES_PER_CAR, carCountFor, formatSize, toCarPlan } from './packetize.js';

const sum = (xs: { bytes: number }[]) => xs.reduce((s, c) => s + c.bytes, 0);

describe('carCountFor', () => {
  it.each([
    [1, 1],
    [12_000, 1],
    [Math.floor(BYTES_PER_CAR), 1],
    [Math.ceil(BYTES_PER_CAR) + 1, 2],
    [1_048_576, 3],
    [5_000_000, 12],
    [9_600_000, 24],
    [10_000_000, 24],
  ])('%i B → %i cars', (bytes, cars) => {
    expect(carCountFor(bytes)).toBe(cars);
  });

  it('never exceeds 24 cars', () => {
    expect(carCountFor(LIMITS.fileMaxBytes * 10)).toBe(LIMITS.maxCars);
  });
});

describe('toCarPlan', () => {
  it('10 MB → 6,667 packets in 24 cars; bytes sum to the total', () => {
    const p = toCarPlan(10_000_000);
    expect(p.packetCount).toBe(6667);
    expect(p.cars).toHaveLength(24);
    expect(sum(p.cars)).toBe(10_000_000);
    expect(p.cars.at(-1)!.lastPacket).toBe(6666);
  });

  it('1 MiB → 700 packets in 3 cars (234, 233, 233)', () => {
    const p = toCarPlan(1_048_576);
    expect(p.packetCount).toBe(700);
    expect(p.cars.map((c) => c.lastPacket - c.firstPacket + 1)).toEqual([234, 233, 233]);
    expect(sum(p.cars)).toBe(1_048_576);
  });

  it('1 byte → one packet in one car', () => {
    expect(toCarPlan(1)).toEqual({
      totalBytes: 1,
      packetSizeBytes: 1500,
      packetCount: 1,
      cars: [{ id: 'car-0', seq: 0, firstPacket: 0, lastPacket: 0, bytes: 1 }],
    });
  });

  it('packet ranges are contiguous', () => {
    const { cars } = toCarPlan(7_777_777);
    cars.forEach((c, i) => {
      if (i > 0) expect(c.firstPacket).toBe(cars[i - 1]!.lastPacket + 1);
    });
  });

  it('rejects non-positive or fractional sizes', () => {
    expect(() => toCarPlan(0)).toThrow();
    expect(() => toCarPlan(1.5)).toThrow();
  });
});

describe('formatSize', () => {
  it.each([
    [512, '512 B'],
    [12_000, '12 KB'],
    [1_048_576, '1.05 MB'],
    [10_000_000, '10 MB'],
  ])('%i → %s', (b, s) => expect(formatSize(b)).toBe(s));
});
