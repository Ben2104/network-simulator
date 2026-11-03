import { memo, useMemo, useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';

export interface LabelItem {
  id: string;
  text: string;
  /** Second line, e.g. "Offline" or "BFS depth 3". */
  sub?: string;
  x: number;
  y: number;
  z: number;
  /** Higher wins when labels would overlap on screen. */
  priority: number;
  tone: 'lot' | 'idle' | 'visited' | 'path' | 'broken';
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Screen-aligned DOM labels (crisp text, readable by screen readers). Each frame they are projected
 * to the screen and placed greedily by priority, so the dense Los Angeles cluster never stacks
 * labels on top of each other: lower-priority labels fade out until the camera moves closer.
 */
export const Labels = memo(function Labels({ items }: { items: readonly LabelItem[] }) {
  const els = useRef(new Map<string, HTMLDivElement>());
  const order = useMemo(() => [...items].sort((a, b) => b.priority - a.priority), [items]);
  const v = useMemo(() => new Vector3(), []);

  useFrame(({ camera, size }) => {
    const placed: Rect[] = [];
    for (const item of order) {
      const el = els.current.get(item.id);
      if (!el) continue;
      v.set(item.x, item.y, item.z).project(camera);
      const sx = ((v.x + 1) / 2) * size.width;
      const sy = ((1 - v.y) / 2) * size.height;
      const w = el.offsetWidth || item.text.length * 7 + 16;
      const h = el.offsetHeight || 20;
      const r = { x0: sx - w / 2, y0: sy - h - 6, x1: sx + w / 2, y1: sy - 6 };
      const onScreen = v.z < 1 && r.x1 > 0 && r.x0 < size.width && r.y1 > 0 && r.y0 < size.height;
      const free = !placed.some((p) => r.x0 < p.x1 && r.x1 > p.x0 && r.y0 < p.y1 && r.y1 > p.y0);
      const show = onScreen && free;
      if (show) placed.push(r);
      el.style.opacity = show ? '1' : '0';
    }
  });

  return (
    <>
      {items.map((item) => (
        <Html
          key={item.id}
          position={[item.x, item.y, item.z]}
          zIndexRange={[10, 0]}
          style={{ transform: 'translate(-50%, calc(-100% - 6px))', pointerEvents: 'none' }}
        >
          <div
            ref={(el) => {
              if (el) els.current.set(item.id, el);
              else els.current.delete(item.id);
            }}
            className={`label3d ${item.tone}`}
          >
            <span>{item.text}</span>
            {item.sub && <small>{item.sub}</small>}
          </div>
        </Html>
      ))}
    </>
  );
});
