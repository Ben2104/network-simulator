import { describe, expect, it } from 'vitest';
import { countCars, describePhase, type CopyInput } from './copy';

const base: CopyInput = {
  phase: 'delivered',
  fileLabel: 'essay.pdf',
  totalBytes: 1_048_576,
  packetCount: 700,
  hops: 9,
  visitedCount: 19,
  stationCount: 19,
  cars: { total: 24, atSender: 0, onRoad: 0, atDestination: 24 },
  paused: false,
};

describe('describePhase', () => {
  it('matches the design copy for delivered', () => {
    const c = describePhase(base);
    expect(c.banner).toBe('Delivered via 9 hops');
    expect(c.footer).toBe('Delivered · 24 / 24 cars at US-West Data Center, Oregon');
  });

  it('formats the loaded banner with grouped numbers', () => {
    const c = describePhase({ ...base, phase: 'loaded', cars: countCars(24, []) });
    expect(c.banner).toContain('(1,048,576 B) · 700 packets prepared into 24 packet cars');
  });

  it('says Paused while paused mid-drive', () => {
    expect(describePhase({ ...base, phase: 'driving', paused: true }).footer).toMatch(/^Paused/);
  });
});

describe('countCars', () => {
  it('counts waiting cars as at the sender', () => {
    expect(countCars(4, ['driving', 'arrived', 'waiting'])).toEqual({
      total: 4,
      onRoad: 1,
      atDestination: 1,
      atSender: 2,
    });
  });
});
