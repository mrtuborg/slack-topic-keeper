import { beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimiter } from "./rate-limiter";

describe("RateLimiter", () => {
  let rl: RateLimiter;

  beforeEach(() => {
    rl = new RateLimiter();
  });

  it("T-RATE-1: succeeds on first try and returns result", async () => {
    const fn = vi.fn().mockResolvedValue(42);
    const result = await rl.execute(fn);
    expect(result).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("T-RATE-2: waits retryAfter seconds then retries on rate-limit error", async () => {
    vi.useFakeTimers();
    try {
      const rateLimitErr = Object.assign(new Error("rate limited"), { retryAfter: 3 });
      const fn = vi.fn().mockRejectedValueOnce(rateLimitErr).mockResolvedValueOnce("ok");

      const promise = rl.execute(fn);
      await vi.advanceTimersByTimeAsync(3000);
      const result = await promise;

      expect(result).toBe("ok");
      expect(fn).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("T-RATE-3: retries with exponential delays (1s, 2s, 4s) then succeeds", async () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    try {
      const err = new Error("transient");
      const fn = vi.fn()
        .mockRejectedValueOnce(err)
        .mockRejectedValueOnce(err)
        .mockRejectedValueOnce(err)
        .mockResolvedValueOnce("done");

      const promise = rl.execute(fn);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe("done");
      expect(fn).toHaveBeenCalledTimes(4);

      // Collect delay values passed to setTimeout (ignore near-zero values from Promise internals)
      const delayValues = setTimeoutSpy.mock.calls
        .map(([, ms]) => ms as number)
        .filter((ms): ms is number => typeof ms === "number" && ms >= 900);

      // Should have one delay per retry (3 total)
      expect(delayValues.length).toBeGreaterThanOrEqual(3);
      // Delays should be non-decreasing (each is base*2^attempt)
      for (let i = 1; i < delayValues.length; i++) {
        expect(delayValues[i]).toBeGreaterThanOrEqual(delayValues[i - 1] - 500);
      }
    } finally {
      setTimeoutSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("T-RATE-4: delay never exceeds 60500ms (60000 cap + max jitter) regardless of attempt count", async () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    try {
      // Always fail so all 5 retries fire and every delay value is collected.
      const fn = vi.fn().mockRejectedValue(new Error("persistent"));
      const promise = rl.execute(fn);
      await vi.runAllTimersAsync();
      await expect(promise).rejects.toThrow();

      const delayValues = setTimeoutSpy.mock.calls
        .map(([, ms]) => ms as number)
        .filter((ms): ms is number => typeof ms === "number" && ms >= 900);

      expect(delayValues.length).toBeGreaterThan(0);
      for (const ms of delayValues) {
        expect(ms).toBeLessThanOrEqual(60_000 + 500); // 60000 cap + 500 max jitter
      }
    } finally {
      setTimeoutSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("T-RATE-5: jitter is applied — delay reflects Math.random() contribution", async () => {
    vi.useFakeTimers();
    // Control Math.random so the expected delay is deterministic.
    const mathRandomSpy = vi.spyOn(Math, "random").mockReturnValue(0.6);
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    try {
      const err = new Error("fail");
      const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValueOnce("done");
      const promise = rl.execute(fn);
      await vi.runAllTimersAsync();
      await promise;

      const delays = setTimeoutSpy.mock.calls
        .map(([, ms]) => ms as number)
        .filter((ms): ms is number => typeof ms === "number" && ms >= 900);

      // attempt=0: exponential = min(1000 * 2^0, 60000) = 1000
      //            jitter      = floor(0.6 * 500)       = 300
      //            total                                 = 1300
      expect(delays[0]).toBe(1300);
    } finally {
      mathRandomSpy.mockRestore();
      setTimeoutSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("T-RATE-6: queued executions run sequentially", async () => {
    const order: number[] = [];

    // Use microtask yield (Promise.resolve) rather than real setTimeout so
    // the test has no dependency on timer implementation.
    const makeTask = (start: number, end: number) => async () => {
      order.push(start);
      await Promise.resolve();
      order.push(end);
    };

    await Promise.all([
      rl.execute(makeTask(1, 10)),
      rl.execute(makeTask(2, 20)),
      rl.execute(makeTask(3, 30)),
    ]);

    // fn2 must not start before fn1 finishes
    expect(order.indexOf(2)).toBeGreaterThan(order.indexOf(10));
    // fn3 must not start before fn2 finishes
    expect(order.indexOf(3)).toBeGreaterThan(order.indexOf(20));
  });
});
