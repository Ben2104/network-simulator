import { project, type Network } from '@netsim/shared';

export interface Point {
  x: number;
  y: number;
}

export interface Layout {
  width: number;
  height: number;
  pos: ReadonlyMap<string, Point>;
}

/** Schematic liberties, same as the 3D design (docs/design/tokens.md §5): rotate, spread LA. */
export const ROTATE_DEG = 68;
const LA_SPREAD = 8;
const PADDING = 90;
// Extra room on the left: the Long Beach ISP label sits left of its station.
const PADDING_LEFT = 150;

// Riverside is far enough out (about 50 units) that it needs no spreading.
const isLosAngeles = (lat: number, lon: number) => lat < 34.2 && lon > -118.5 && lon < -117.8;

/**
 * Projects stations with the shared projection, spreads the dense Los Angeles cluster, rotates
 * the map clockwise so it fills a landscape canvas, and shifts it into a positive viewBox.
 */
export function layoutNetwork(network: Network): Layout {
  const raw = network.nodes.map((n) => ({
    id: n.id,
    la: isLosAngeles(n.lat, n.lon),
    ...project(n.lat, n.lon),
  }));
  const la = raw.filter((p) => p.la);
  const cx = la.reduce((s, p) => s + p.x, 0) / (la.length || 1);
  const cy = la.reduce((s, p) => s + p.y, 0) / (la.length || 1);

  const rad = (ROTATE_DEG * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rotated = raw.map((p) => {
    const x = p.la ? cx + (p.x - cx) * LA_SPREAD : p.x;
    const y = p.la ? cy + (p.y - cy) * LA_SPREAD : p.y;
    return { id: p.id, x: x * cos - y * sin, y: x * sin + y * cos };
  });

  const minX = Math.min(...rotated.map((p) => p.x));
  const minY = Math.min(...rotated.map((p) => p.y));
  const maxX = Math.max(...rotated.map((p) => p.x));
  const maxY = Math.max(...rotated.map((p) => p.y));
  const pos = new Map(
    rotated.map((p) => [p.id, { x: p.x - minX + PADDING_LEFT, y: p.y - minY + PADDING }]),
  );
  return { width: maxX - minX + PADDING + PADDING_LEFT, height: maxY - minY + PADDING * 2, pos };
}
