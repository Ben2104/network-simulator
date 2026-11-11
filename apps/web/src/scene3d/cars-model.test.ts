import { describe, expect, it } from 'vitest';
import { Box3, BufferAttribute, BufferGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { carModelParts } from './Cars';

/** One triangle per UV v value, laid out along +z like a Kenney car. */
function mesh(name: string, vs: number[], z0: number, z1: number) {
  const pos: number[] = [];
  const uv: number[] = [];
  vs.forEach((v, i) => {
    const z = z0 + ((z1 - z0) * i) / Math.max(1, vs.length - 1);
    pos.push(-0.5, 0, z, 0.5, 0, z, 0, 1, z);
    uv.push(0.1, v, 0.2, v, 0.15, v);
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(pos.length).fill(0), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  const m = new Mesh(g, new MeshStandardMaterial());
  m.name = name;
  return m;
}

describe('carModelParts', () => {
  const scene = new Group();
  const body = mesh('body', [0.3, 0.3, 0.6, 0.9], -1.5, 1.5);
  body.position.y = 0.2;
  const wheel = mesh('wheel-front-left', [0.6], 1, 1);
  wheel.position.y = 0.1;
  scene.add(body, wheel);
  const parts = carModelParts(scene);
  const box = (g: BufferGeometry) =>
    new Box3().setFromBufferAttribute(g.getAttribute('position') as BufferAttribute);

  it('puts paint-row triangles in the tinted part and the rest in trim', () => {
    expect(parts.paint.getAttribute('position').count).toBe(6);
    expect(parts.trim.getAttribute('position').count).toBe(6);
    expect(parts.wheels.getAttribute('position').count).toBe(3);
  });

  it('throws (so the primitive fallback shows) when the model has no wheels', () => {
    const bad = new Group();
    bad.add(mesh('body', [0.3, 0.6], -1, 1));
    expect(() => carModelParts(bad)).toThrow(/wheel/);
  });

  it('turns the car to face +x, 2.4 long, with its lowest point on y = 0', () => {
    const all = box(parts.paint).union(box(parts.trim)).union(box(parts.wheels));
    expect(all.max.x - all.min.x).toBeCloseTo(2.4);
    expect(all.min.y).toBeCloseTo(0);
    // The front wheel (Kenney +z) ends up at the front (+x).
    expect(box(parts.wheels).min.x).toBeGreaterThan(0);
  });
});
