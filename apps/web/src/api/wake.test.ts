import { describe, expect, it } from 'vitest';
import { ApiRequestError } from './client';
import { isWakeError, withWake } from './wake';

const offline = () => new ApiRequestError(0, 'NETWORK_ERROR', 'down');

function fakeClock() {
  let t = 0;
  return { now: () => t, sleep: async (ms: number) => void (t += ms) };
}

describe('isWakeError', () => {
  it('treats connection failures and gateway errors as waking', () => {
    for (const s of [0, 502, 503, 504])
      expect(isWakeError(new ApiRequestError(s, 'X', ''))).toBe(true);
  });
  it('does not retry real API errors', () => {
    expect(isWakeError(new ApiRequestError(400, 'BAD', ''))).toBe(false);
    expect(isWakeError(new ApiRequestError(500, 'INTERNAL', ''))).toBe(false);
    expect(isWakeError(new Error('x'))).toBe(false);
  });
});

describe('withWake', () => {
  it('retries until the server answers', async () => {
    let calls = 0;
    const retries: number[] = [];
    const result = await withWake(
      async () => {
        calls++;
        if (calls < 4) throw offline();
        return 'ok';
      },
      { ...fakeClock(), onRetry: (n) => retries.push(n) },
    );
    expect(result).toBe('ok');
    expect(retries).toEqual([2, 3, 4]);
  });

  it('gives up once the budget is spent', async () => {
    let calls = 0;
    await expect(
      withWake(
        async () => {
          calls++;
          throw offline();
        },
        { ...fakeClock(), budgetMs: 10_000 },
      ),
    ).rejects.toBeInstanceOf(ApiRequestError);
    // waits 1s, 2s, 3s (6s total); the next 5s wait would exceed 10s
    expect(calls).toBe(4);
  });

  it('fails fast on non-wake errors', async () => {
    let calls = 0;
    await expect(
      withWake(async () => {
        calls++;
        throw new ApiRequestError(400, 'BAD', 'bad');
      }, fakeClock()),
    ).rejects.toThrow('bad');
    expect(calls).toBe(1);
  });
});
