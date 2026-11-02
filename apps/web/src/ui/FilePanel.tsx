import { useState, type FormEvent } from 'react';

export type FileSelection = {
  source: 'file';
  fileName: string;
  sizeBytes: number;
};

type FilePanelProps = {
  onSubmit: (selection: FileSelection) => void;
  disabled?: boolean;
};

/** Collects only file metadata. The File object and its bytes never leave this component. */
export function FilePanel({ onSubmit, disabled = false }: FilePanelProps) {
  const [selection, setSelection] = useState<FileSelection | null>(null);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selection && !disabled) onSubmit(selection);
  };

  return (
    <form className="panel file-panel" onSubmit={submit}>
      <div className="panel-heading">
        <div>
          <h2>Your file</h2>
          <p className="panel-description">Choose a file to packetize for the simulation.</p>
        </div>
        {selection && <span className="status-pill">Ready</span>}
      </div>

      <label className="file-picker" htmlFor="packet-file">
        <span className="file-picker-title">Choose a file</span>
        <span className="file-picker-description">Only the file name and size are used.</span>
        <input
          id="packet-file"
          type="file"
          disabled={disabled}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            setSelection(
              file ? { source: 'file', fileName: file.name, sizeBytes: file.size } : null,
            );
          }}
        />
      </label>

      {selection && (
        <p className="file-summary" aria-live="polite">
          <strong>{selection.fileName}</strong>
          <span>{formatBytes(selection.sizeBytes)}</span>
        </p>
      )}

      <button type="submit" disabled={!selection || disabled}>
        Submit
      </button>
    </form>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1_000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(bytes < 10_000 ? 1 : 0)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
