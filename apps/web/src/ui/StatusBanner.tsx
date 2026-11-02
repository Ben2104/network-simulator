type StatusBannerProps = {
  kind: 'idle' | 'loading' | 'searching' | 'success' | 'no-route' | 'error';
  message: string;
  onRetry?: () => void;
};

const iconByKind: Record<StatusBannerProps['kind'], string> = {
  idle: '•',
  loading: '…',
  searching: '↻',
  success: '✓',
  'no-route': '×',
  error: '!',
};

export function StatusBanner({ kind, message, onRetry }: StatusBannerProps) {
  const isError = kind === 'error' || kind === 'no-route';
  return (
    <section
      className={`status-banner status-banner--${kind}`}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
    >
      <span className="status-banner-icon" aria-hidden="true">
        {iconByKind[kind]}
      </span>
      <p>{message}</p>
      {kind === 'error' && onRetry && (
        <button className="secondary" type="button" onClick={onRetry}>
          Retry
        </button>
      )}
    </section>
  );
}
