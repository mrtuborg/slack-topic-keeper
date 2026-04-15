const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 60_000;
// MAX_RETRIES = 5 retries after the initial attempt → 6 total calls maximum.
const MAX_RETRIES = 5;

/** An error with a server-supplied retry-after value (seconds). */
interface RetryableError {
  retryAfter: number;
}

function isRetryableError(e: unknown): e is RetryableError {
  return typeof (e as Record<string, unknown>)["retryAfter"] === "number";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class RateLimiter {
  private queue: Promise<void> = Promise.resolve();

  execute<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queue.then(() => this.runWithRetry(fn));
    this.queue = result.then(
      (): void => undefined,
      (): void => undefined,
    );
    return result;
  }

  private async runWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        if (attempt === MAX_RETRIES) break;
        let waitMs: number;
        if (isRetryableError(err)) {
          // Cap at MAX_DELAY_MS so a malicious/buggy Retry-After can't block the queue indefinitely.
          waitMs = Math.min(err.retryAfter * 1000, MAX_DELAY_MS);
        } else {
          const exponential = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
          waitMs = exponential + Math.floor(Math.random() * 500);
        }
        await delay(waitMs);
      }
    }
    throw lastError;
  }
}
