import { useMemo, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';

export interface LabelItem {
  id: string;
  text: string;
  /** Second line, e.g. "BFS depth 3". */
  sub?: string;
  x: number;
  y: number;
  z: number;
  /** Higher wins when labels would overlap on screen. */
  priority: number;
  tone: 'lot' | 'idle' | 'visited' | 'path';
}

export type LabelEls = Map<string, HTMLElement>;

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * DOM side: plain absolutely-positioned labels in a layer over the canvas (crisp text, readable
 * by screen readers, no React root per label). `LabelTracker` moves them every frame.
 */
export function LabelLayer(props: { items: readonly LabelItem[]; els: RefObject<LabelEls> }) {
  return (
    <div className="labels3d">
      {props.items.map((item) => (
        <div
          key={item.id}
          ref={(el) => {
            if (el) props.els.current.set(item.id, el);
            else props.els.current.delete(item.id);
          }}
          className={`label3d ${item.tone}`}
        >
          <span>{item.text}</span>
          {item.sub && <small>{item.sub}</small>}
        </div>
      ))}
    </div>
  );
}

/**
 * Canvas side: projects each label's anchor to the screen and places labels greedily by priority,
 * so the dense Los Angeles cluster never stacks labels: lower-priority ones fade out until the
 * camera moves closer.
 */
export function LabelTracker(props: { items: readonly LabelItem[]; els: RefObject<LabelEls> }) {
  const order = useMemo(
    () => [...props.items].sort((a, b) => b.priority - a.priority),
    [props.items],
  );
  const v = useMemo(() => new Vector3(), []);

  useFrame(({ camera, size }) => {
    const placed: Rect[] = [];
    for (const item of order) {
      const el = props.els.current.get(item.id);
      if (!el) continue;
      v.set(item.x, item.y, item.z).project(camera);
      const sx = ((v.x + 1) / 2) * size.width;
      const sy = ((1 - v.y) / 2) * size.height;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const r = { x0: sx - w / 2, y0: sy - h - 6, x1: sx + w / 2, y1: sy - 6 };
      const onScreen = v.z < 1 && r.x1 > 0 && r.x0 < size.width && r.y1 > 0 && r.y0 < size.height;
      const free = !placed.some((p) => r.x0 < p.x1 && r.x1 > p.x0 && r.y0 < p.y1 && r.y1 > p.y0);
      const show = onScreen && free;
      if (show) placed.push(r);
      el.style.transform = `translate(${Math.round(r.x0)}px, ${Math.round(r.y0)}px)`;
      el.style.opacity = show ? '1' : '0';
    }
  });
  return null;
}
