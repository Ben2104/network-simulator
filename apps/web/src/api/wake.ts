import { ApiRequestError } from './client';

/**
 * The API runs on a free host that sleeps when idle and takes up to about a minute to wake.
 * While it wakes, requests fail to connect or get 502/503/504 from the host's proxy. This retries
 * those (and only those) with backoff until `budgetMs` runs out, so a cold start reads as
 * "waking up" instead of an error.
 */
export interface WakeOptions {
  /** Total time to keep trying before giving up. */
  budgetMs?: number;
  /** Called before each retry with the attempt number (2, 3, ...). */
  onRetry?: (attempt: number) => void;
  signal?: AbortSignal;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export const WAKE_BUDGET_MS = 120_000;
const BACKOFF_MS = [1_000, 2_000, 3_000, 5_000];

/** True for failures a sleeping or starting server produces; false for real API errors. */
export function isWakeError(e: unknown): boolean {
  if (!(e instanceof ApiRequestError)) return false;
  return e.status === 0 || e.status === 502 || e.status === 503 || e.status === 504;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function withWake<T>(load: () => Promise<T>, opts: WakeOptions = {}): Promise<T> {
  const { budgetMs = WAKE_BUDGET_MS, onRetry, signal, sleep = defaultSleep, now = Date.now } = opts;
  const start = now();
  for (let attempt = 1; ; attempt++) {
    try {
      return await load();
    } catch (e) {
      const wait = BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)]!;
      if (signal?.aborted || !isWakeError(e) || now() - start + wait > budgetMs) throw e;
      await sleep(wait);
      if (signal?.aborted) throw e;
      onRetry?.(attempt + 1);
    }
  }
}
