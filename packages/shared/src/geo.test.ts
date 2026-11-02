import { describe, expect, it } from 'vitest';
import { haversineKm } from './geo.js';

const LA = { lat: 34.0522, lon: -118.2437 };
const SF = { lat: 37.7749, lon: -122.4194 };
const CSULB = { lat: 33.7838, lon: -118.1141 };
const OREGON_DC = { lat: 45.8399, lon: -119.7006 };

describe('haversineKm', () => {
  it('measures LA → San Francisco within 1% of 559.1 km', () => {
    expect(Math.abs(haversineKm(LA, SF) - 559.1) / 559.1).toBeLessThan(0.01);
  });

  it('measures CSULB → Oregon data center within 1% of 1,347.3 km', () => {
    // Hand-checked with the spherical law of cosines (1,347.3 km) and Lambert's ellipsoidal
    // formula on WGS-84 (1,345.4 km).
    expect(Math.abs(haversineKm(CSULB, OREGON_DC) - 1347.3) / 1347.3).toBeLessThan(0.01);
  });

  it('is zero for the same point', () => {
    expect(haversineKm(LA, LA)).toBe(0);
  });

  it('is symmetric', () => {
    expect(haversineKm(LA, SF)).toBeCloseTo(haversineKm(SF, LA), 9);
    expect(haversineKm(CSULB, OREGON_DC)).toBeCloseTo(haversineKm(OREGON_DC, CSULB), 9);
  });
});
