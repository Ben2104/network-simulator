import { BufferAttribute, BufferGeometry } from 'three';
import type { Vec2 } from './world';

/**
 * Flat strip of `width` along a polyline at height `y`, with UVs (u across, v = distance along) so
 * materials can draw lane paint. Used for roads and the route highlight.
 */
export function ribbon(pts: readonly Vec2[], width: number, y: number): BufferGeometry {
  const n = pts.length;
  const pos = new Float32Array(n * 2 * 3);
  const uv = new Float32Array(n * 2 * 2);
  let along = 0;
  for (let i = 0; i < n; i++) {
    const prev = pts[Math.max(0, i - 1)]!;
    const next = pts[Math.min(n - 1, i + 1)]!;
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const l = Math.hypot(dx, dz) || 1;
    // Right-hand normal (x east, z south).
    const nx = -dz / l;
    const nz = dx / l;
    if (i > 0) along += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.z - pts[i - 1]!.z);
    const p = pts[i]!;
    pos.set([p.x - (nx * width) / 2, y, p.z - (nz * width) / 2], i * 6);
    pos.set([p.x + (nx * width) / 2, y, p.z + (nz * width) / 2], i * 6 + 3);
    uv.set([0, along, 1, along], i * 4);
  }
  const index: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}
