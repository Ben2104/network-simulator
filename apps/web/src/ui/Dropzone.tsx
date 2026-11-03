import { useRef, useState, type DragEvent } from 'react';
import { BYTES_PER_CAR, LIMITS, formatSize, toCarPlan } from '@netsim/shared';
import { api, ApiRequestError } from '../api/client';
import type { Upload } from '../sim/useSimulation';

type State =
  | { kind: 'idle' }
  | { kind: 'uploading'; name: string; size: number; progress: number }
  | { kind: 'error'; message: string };

async function sha256Hex(file: Blob): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null; // crypto.subtle needs a secure context; skip the check rather than fail.
  }
}

/**
 * Drag-and-drop (or browse) upload. The file goes to `POST /api/upload`, which hashes and
 * discards it and returns the size-based car plan; the browser checks the hash itself.
 */
export function Dropzone(props: { disabled: boolean; onUploaded: (u: Upload) => void }) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [over, setOver] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const busy = state.kind === 'uploading';

  const send = async (file: File) => {
    if (file.size === 0) return setState({ kind: 'error', message: `${file.name} is empty.` });
    if (file.size > LIMITS.uploadMaxBytes) {
      return setState({
        kind: 'error',
        message: `${file.name} is ${formatSize(file.size)}. Files must be ${formatSize(LIMITS.uploadMaxBytes)} or smaller.`,
      });
    }
    setState({ kind: 'uploading', name: file.name, size: file.size, progress: 0 });
    try {
      const [res, local] = await Promise.all([
        api.upload(file, file.name, (progress) =>
          setState((s) => (s.kind === 'uploading' ? { ...s, progress } : s)),
        ),
        sha256Hex(file),
      ]);
      setState({ kind: 'idle' });
      props.onUploaded({
        label: res.fileName ?? file.name,
        packets: {
          totalBytes: res.bytesReceived,
          packetSizeBytes: res.packetSizeBytes,
          packetCount: res.packetCount,
          cars: res.cars,
        },
        server: {
          size: res.size,
          summary: res.summary,
          sha256: res.sha256,
          verified: local === res.sha256,
        },
      });
    } catch (e) {
      setState({
        kind: 'error',
        message: e instanceof ApiRequestError ? e.message : 'Upload failed. Try again.',
      });
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file && !props.disabled && !busy) void send(file);
  };

  const preview = state.kind === 'uploading' ? toCarPlan(state.size).cars.length : null;

  return (
    <div className="upload">
      <div
        className={`dropzone${over ? ' over' : ''}${busy ? ' busy' : ''}`}
        role="button"
        tabIndex={props.disabled ? -1 : 0}
        aria-disabled={props.disabled || busy}
        aria-describedby="dropzone-hint"
        onClick={() => !props.disabled && !busy && picker.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !props.disabled && !busy) {
            e.preventDefault();
            picker.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!props.disabled) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <svg
          className="dropzone-icon"
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 16V4m0 0-4 4m4-4 4 4" />
          <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
        </svg>
        {state.kind === 'uploading' ? (
          <>
            <p className="dropzone-title">
              Uploading {state.name} · {formatSize(state.size)}
            </p>
            <progress max={1} value={state.progress} aria-label="Upload progress" />
            <p className="dropzone-sub">
              {Math.round(state.progress * 100)}% · will split into {preview} car
              {preview === 1 ? '' : 's'}
            </p>
          </>
        ) : (
          <>
            <p className="dropzone-title">
              <b>Drag &amp; drop a file</b> or <u>browse</u>
            </p>
            <p className="dropzone-sub" id="dropzone-hint">
              Up to {formatSize(LIMITS.uploadMaxBytes)} · sent to our Oregon server, hashed, then
              deleted (never stored)
            </p>
          </>
        )}
      </div>
      <p className="dropzone-rule">
        1 car per {formatSize(Math.round(BYTES_PER_CAR))} · {formatSize(LIMITS.uploadMaxBytes)} ={' '}
        {LIMITS.maxCars} cars
      </p>
      {state.kind === 'error' && (
        <p className="field-error" role="alert">
          {state.message}
        </p>
      )}
      <input
        ref={picker}
        type="file"
        hidden
        data-testid="upload-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void send(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

/** 24 slots, one per possible car, filled for this file. */
export function CarMeter({ cars }: { cars: number }) {
  return (
    <div
      className="car-meter"
      role="img"
      aria-label={`${cars} of ${LIMITS.maxCars} cars used`}
      title={`${cars} of ${LIMITS.maxCars} cars`}
    >
      {Array.from({ length: LIMITS.maxCars }, (_, i) => (
        <i key={i} className={i < cars ? 'on' : ''} />
      ))}
    </div>
  );
}
