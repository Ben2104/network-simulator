import { describe, expect, it } from 'vitest';
import { MAP_BOUNDS, MAP_HEIGHT, MAP_WIDTH, project } from './projection.js';

describe('project', () => {
  it('maps the north-west corner to the origin', () => {
    const p = project(MAP_BOUNDS.maxLat, MAP_BOUNDS.minLon);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
  });

  it('maps the south-east corner to (MAP_WIDTH, MAP_HEIGHT)', () => {
    const p = project(MAP_BOUNDS.minLat, MAP_BOUNDS.maxLon);
    expect(p.x).toBeCloseTo(MAP_WIDTH);
    expect(p.y).toBeCloseTo(MAP_HEIGHT);
  });

  it('puts Long Beach south of Oregon and Reno east of Oakland', () => {
    const csulb = project(33.7838, -118.1141);
    const oregon = project(45.8399, -119.7006);
    const oakland = project(37.8044, -122.2712);
    const reno = project(39.5296, -119.8138);
    expect(csulb.y).toBeGreaterThan(oregon.y);
    expect(reno.x).toBeGreaterThan(oakland.x);
  });

  it('keeps the map taller than wide (West Coast is a north-south strip)', () => {
    expect(MAP_WIDTH).toBe(600);
    expect(MAP_HEIGHT).toBeGreaterThan(1200);
    expect(MAP_HEIGHT).toBeLessThan(1220);
  });
});
