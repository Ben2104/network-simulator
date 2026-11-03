import { useRef, useState, type PointerEvent } from 'react';
import type { Network, NetworkNode } from '@netsim/shared';
import type { CarFrame } from '../sim/timeline';
import type { Layout, Point } from './layout';

interface Props {
  network: Network;
  layout: Layout;
  carCount: number;
  frames: readonly CarFrame[];
  disabledNodeIds: ReadonlySet<string>;
  disabledLinkIds: ReadonlySet<string>;
  pathLinkIds: ReadonlySet<string>;
  pathNodeIds: ReadonlySet<string>;
  visitedNodeIds: ReadonlySet<string>;
  canToggle: boolean;
  zoom: number;
  onToggleNode: (id: string) => void;
  onToggleLink: (id: string) => void;
}

const LOT_W = 66;
const LOT_H = 46;
const SLOT_COLS = 6;
const SLOT_GAP = 9;
/** Stations whose label would run into a neighbour if drawn on the right. */
const LABEL_LEFT: ReadonlySet<string> = new Set(['lb-isp']);

/** Centre of parking slot `seq` inside a lot centred on `lot`. */
function slot(lot: Point, seq: number): Point {
  const col = seq % SLOT_COLS;
  const row = Math.floor(seq / SLOT_COLS);
  return {
    x: lot.x + (col - (SLOT_COLS - 1) / 2) * SLOT_GAP,
    y: lot.y + (row - 1.5) * SLOT_GAP,
  };
}

const lotLabel = (node: NetworkNode) =>
  node.kind === 'client' ? 'Sender: CSULB parking lot' : 'Destination: US-West Data Center, Oregon';

/**
 * 2D renderer. Station positions come from `layout`; cars are drawn from sim frames, parked in
 * lot slots before departure and after arrival. Drag to pan, `zoom` scales around the centre.
 */
export function NetworkGraph(props: Props) {
  const { network, layout, frames, disabledNodeIds, disabledLinkIds, pathLinkIds } = props;
  const { pos, width, height } = layout;
  const client = pos.get(network.clientId)!;
  const server = pos.get(network.serverId)!;

  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  /** Set when a drag moved the map, so the click that ends it does not toggle a failure. */
  const moved = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const vw = width / props.zoom;
  const vh = height / props.zoom;
  const clamp = (v: number, size: number, total: number) =>
    Math.min(Math.max(v, 0), Math.max(total - size, 0));
  const vx = clamp((width - vw) / 2 - pan.x, vw, width);
  const vy = clamp((height - vh) / 2 - pan.y, vh, height);

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    drag.current = { x: e.clientX, y: e.clientY };
    moved.current = false;
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!d || !rect || props.zoom <= 1) return;
    const k = vw / rect.width;
    const dx = (e.clientX - d.x) * k;
    const dy = (e.clientY - d.y) * k;
    if (Math.abs(dx) + Math.abs(dy) > 0.5) moved.current = true;
    d.x = e.clientX;
    d.y = e.clientY;
    setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
  };
  const endDrag = () => {
    drag.current = null;
  };

  const frameBySeq = new Map(frames.map((f) => [f.seq, f]));
  const cars = Array.from({ length: props.carCount }, (_, seq) => {
    const f = frameBySeq.get(seq);
    const status = f?.status ?? 'waiting';
    if (status === 'waiting') return { seq, status, ...slot(client, seq), angle: 0 };
    if (status === 'arrived') return { seq, status, ...slot(server, seq), angle: 0 };
    return { seq, status, x: f!.x, y: f!.y, angle: f!.angle };
  });

  return (
    <svg
      ref={svgRef}
      className="graph"
      viewBox={`${vx} ${vy} ${vw} ${vh}`}
      role="img"
      aria-label="Simulated West Coast network map"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
    >
      {network.links.map((link) => {
        const a = pos.get(link.source)!;
        const b = pos.get(link.target)!;
        const state = disabledLinkIds.has(link.id)
          ? 'disabled'
          : pathLinkIds.has(link.id)
            ? 'on-path'
            : '';
        return (
          <g key={link.id} className={`link ${state}`}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
            {props.canToggle && (
              <line
                className="hit"
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                onClick={() => !moved.current && props.onToggleLink(link.id)}
              >
                <title>{`${link.source} ↔ ${link.target} · ${link.distanceKm} km (click to toggle)`}</title>
              </line>
            )}
          </g>
        );
      })}

      {network.nodes.map((node) => {
        const p = pos.get(node.id)!;
        if (node.kind !== 'router') {
          const lotName = lotLabel(node);
          return (
            <g key={node.id} className="lot" transform={`translate(${p.x} ${p.y})`}>
              <rect x={-LOT_W / 2} y={-LOT_H / 2} width={LOT_W} height={LOT_H} rx={7} />
              {Array.from({ length: 24 }, (_, i) => {
                const s = slot({ x: 0, y: 0 }, i);
                return (
                  <rect
                    key={i}
                    className="slot"
                    x={s.x - 3}
                    y={s.y - 3}
                    width={6}
                    height={6}
                    rx={1.5}
                  />
                );
              })}
              <Label
                x={p.x > width - 330 ? LOT_W / 2 : 0}
                y={LOT_H / 2 + 16}
                anchor={p.x > width - 330 ? 'end' : 'middle'}
                text={lotName}
                strong
              />
            </g>
          );
        }
        const disabled = disabledNodeIds.has(node.id);
        const cls = [
          'station',
          disabled && 'disabled',
          !disabled && props.pathNodeIds.has(node.id) && 'on-path',
          !disabled && props.visitedNodeIds.has(node.id) && 'visited',
          props.canToggle && 'toggleable',
        ]
          .filter(Boolean)
          .join(' ');
        const flip = p.x > width - 230 || LABEL_LEFT.has(node.id);
        return (
          <g
            key={node.id}
            className={cls}
            transform={`translate(${p.x} ${p.y})`}
            onClick={() => !moved.current && props.canToggle && props.onToggleNode(node.id)}
            role="button"
            tabIndex={props.canToggle ? 0 : -1}
            aria-pressed={disabled}
            aria-disabled={!props.canToggle}
            aria-label={`${node.label} station, ${node.place}. ${disabled ? 'Offline' : 'Online'}.`}
            onKeyDown={(e) => {
              if (props.canToggle && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                props.onToggleNode(node.id);
              }
            }}
          >
            <circle r={9} />
            {disabled && <path className="cross" d="M-4 -4L4 4M4 -4L-4 4" />}
            <Label x={flip ? -15 : 15} y={4} anchor={flip ? 'end' : 'start'} text={node.label} />
          </g>
        );
      })}

      {cars.map((c) =>
        c.status === 'driving' ? (
          <g
            key={c.seq}
            className="car driving"
            transform={`translate(${c.x} ${c.y}) rotate(${c.angle})`}
          >
            <rect x={-11} y={-6.5} width={22} height={13} rx={4} />
            <rect className="windshield" x={2} y={-4.5} width={5} height={9} rx={1.5} />
            <title>{`Car #${String(c.seq + 1).padStart(2, '0')}`}</title>
          </g>
        ) : (
          <rect
            key={c.seq}
            className="car parked"
            x={c.x - 3.5}
            y={c.y - 3.5}
            width={7}
            height={7}
            rx={1.5}
          />
        ),
      )}
    </svg>
  );
}

function Label(props: {
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
  text: string;
  strong?: boolean;
}) {
  return (
    <text
      className={props.strong ? 'label strong' : 'label'}
      x={props.x}
      y={props.y}
      textAnchor={props.anchor}
    >
      {props.text}
    </text>
  );
}
