import { describe, expect, it } from 'vitest';
import type { Network } from '@netsim/shared';
import mockNetwork from '@netsim/shared/mocks/network.json';
import {
  biomeAt,
  clearOfNetwork,
  features,
  groundRgb,
  noise2,
  onLand,
  placeLakes,
  placePeaks,
  scatterProps,
} from './scenery';
import { buildWorld, toWorld } from './world';

const world = buildWorld(mockNetwork as Network);

describe('land data', () => {
  it('covers the east corridor and the neighbours the camera sees', () => {
    const postal = new Set(features.map((f) => f.properties.postal));
    for (const s of ['CA', 'OR', 'WA', 'NV', 'ID', 'UT', 'AZ', 'MT', 'WY', 'CO', 'NM', 'MX'])
      expect(postal).toContain(s);
  });

  it('puts every station on land, including Las Vegas and Boise', () => {
    for (const n of mockNetwork.nodes) expect(onLand(n.lat, n.lon), n.id).toBe(true);
  });

  it('has land well east of Boise and south of the border', () => {
    expect(onLand(43.6, -110.5)).toBe(true); // Wyoming
    expect(onLand(31, -112)).toBe(true); // Sonora
    expect(onLand(40, -127)).toBe(false); // Pacific
  });
});

describe('biomeAt', () => {
  it('places the main regions where they are', () => {
    expect(biomeAt(36.2, -115.2)).toBe('desert'); // Las Vegas
    expect(biomeAt(39.5, -116.5)).toBe('basin'); // central Nevada
    expect(biomeAt(43.2, -118.5)).toBe('steppe'); // eastern Oregon
    expect(biomeAt(44.5, -123.3)).toBe('forest'); // Willamette / Coast Range
    expect(biomeAt(37.5, -120.8)).toBe('valley'); // Central Valley
    expect(biomeAt(38.5, -110.5)).toBe('redrock'); // Utah
  });

  it('gives a pale ground colour everywhere', () => {
    for (const [lat, lon] of [
      [36, -115],
      [44, -123],
      [37.5, -120.8],
    ] as const) {
      const [r, g, b] = groundRgb(lat, lon);
      expect(Math.min(r, g, b)).toBeGreaterThan(170);
    }
  });
});

describe('noise2', () => {
  it('is deterministic and in [0, 1)', () => {
    expect(noise2(1.3, 2.7)).toBe(noise2(1.3, 2.7));
    for (let i = 0; i < 50; i++) {
      const v = noise2(i * 0.37, i * 1.13);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('placement', () => {
  const peaks = placePeaks(world);
  const lakes = placeLakes(world);
  const props = scatterProps(world, lakes, 6000);

  it('keeps mountains, lakes and props off the network', () => {
    for (const p of peaks) expect(clearOfNetwork(p, world, p.r)).toBe(true);
    for (const l of lakes) expect(clearOfNetwork(l, world, Math.max(l.rx, l.rz))).toBe(true);
    for (const p of props) expect(clearOfNetwork(p, world, 2)).toBe(true);
  });

  it('adds scenery along the desert corridor', () => {
    const vegas = toWorld(36.17, -115.14);
    const boise = toWorld(43.6, -116.2);
    const near = (c: { x: number; z: number }, r: number) =>
      props.filter((p) => Math.hypot(p.x - c.x, p.z - c.z) < r).length;
    expect(near(vegas, 80)).toBeGreaterThan(5);
    expect(near(boise, 80)).toBeGreaterThan(5);
    expect(peaks.some((p) => Math.hypot(p.x - vegas.x, p.z - vegas.z) < 120)).toBe(true);
  });

  it('mixes vegetation kinds and is deterministic', () => {
    expect(new Set(props.map((p) => p.kind))).toEqual(
      new Set(['pine', 'broadleaf', 'shrub', 'cactus', 'rock']),
    );
    expect(scatterProps(world, lakes, 6000)).toEqual(props);
  });
});
