import { beforeEach, describe, expect, it, vi } from "vitest";
import { SlackClient } from "./client";
import { RateLimiter } from "./rate-limiter";
import { SlackResolver } from "./resolver";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makePassthroughRateLimiter() {
  return { execute: <T>(fn: () => Promise<T>) => fn() } as unknown as RateLimiter;
}

function makeClient() {
  return { call: vi.fn() } as unknown as SlackClient;
}

// ---------------------------------------------------------------------------
describe("SlackResolver", () => {
  let client: SlackClient;
  let resolver: SlackResolver;

  beforeEach(() => {
    client = makeClient();
    resolver = new SlackResolver(client, makePassthroughRateLimiter());
  });

  // -------------------------------------------------------------------------
  it("T-RESOLVE-1: resolveChannel returns channel name from conversations.info", async () => {
    vi.mocked(client.call).mockResolvedValueOnce({
      ok: true,
      channel: { name: "general" },
    });

    const name = await resolver.resolveChannel("C01ABC");
    expect(name).toBe("general");
  });

  // -------------------------------------------------------------------------
  it("T-RESOLVE-2: second resolveChannel call uses cache (API called once)", async () => {
    vi.mocked(client.call).mockResolvedValue({
      ok: true,
      channel: { name: "general" },
    });

    await resolver.resolveChannel("C01ABC");
    await resolver.resolveChannel("C01ABC");

    expect(client.call).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  it("T-RESOLVE-3: resolveUser returns real_name from users.info", async () => {
    vi.mocked(client.call).mockResolvedValueOnce({
      ok: true,
      user: { real_name: "Alice Smith", name: "alice" },
    });

    const name = await resolver.resolveUser("U01XYZ");
    expect(name).toBe("Alice Smith");
  });

  // -------------------------------------------------------------------------
  it("T-RESOLVE-4: resolveChannel returns raw ID when API throws", async () => {
    vi.mocked(client.call).mockRejectedValueOnce(new Error("channel_not_found"));

    const name = await resolver.resolveChannel("C01ABC");
    expect(name).toBe("C01ABC");
  });

  // -------------------------------------------------------------------------
  it("T-RESOLVE-5: resolveUser returns raw ID when API throws", async () => {
    vi.mocked(client.call).mockRejectedValueOnce(new Error("user_not_found"));

    const name = await resolver.resolveUser("U01XYZ");
    expect(name).toBe("U01XYZ");
  });

  // -------------------------------------------------------------------------
  it("clearCache forces a new API call for previously cached channel", async () => {
    vi.mocked(client.call).mockResolvedValue({
      ok: true,
      channel: { name: "general" },
    });

    await resolver.resolveChannel("C01ABC");
    resolver.clearCache();
    await resolver.resolveChannel("C01ABC");

    expect(client.call).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  it("resolveUser falls back to user.name when real_name is empty", async () => {
    vi.mocked(client.call).mockResolvedValueOnce({
      ok: true,
      user: { real_name: "", name: "alice" },
    });

    const name = await resolver.resolveUser("U01XYZ");
    expect(name).toBe("alice");
  });

  // -------------------------------------------------------------------------
  it("fallback raw ID is not cached — API is retried on next call", async () => {
    // First call: API returns malformed response (no channel.name) → fallback to raw ID
    vi.mocked(client.call).mockResolvedValueOnce({ ok: true, channel: {} });
    // Second call: API returns a real name
    vi.mocked(client.call).mockResolvedValueOnce({ ok: true, channel: { name: "general" } });

    const first = await resolver.resolveChannel("C01ABC");
    expect(first).toBe("C01ABC"); // fallback

    const second = await resolver.resolveChannel("C01ABC");
    expect(second).toBe("general"); // retried, got real name
    expect(client.call).toHaveBeenCalledTimes(2); // no cache on first call
  });

  // -------------------------------------------------------------------------
  it("cache cap: entries beyond limit are returned but not cached", async () => {
    const CACHE_MAX = 10_000;
    // Fill the channel cache to the limit
    for (let i = 0; i < CACHE_MAX; i++) {
      vi.mocked(client.call).mockResolvedValueOnce({ ok: true, channel: { name: `ch-${i}` } });
      await resolver.resolveChannel(`C${i}`);
    }

    // Now add one more — should NOT be cached
    vi.mocked(client.call).mockResolvedValue({ ok: true, channel: { name: "overflow" } });

    const name1 = await resolver.resolveChannel("C_OVERFLOW");
    expect(name1).toBe("overflow");

    // Calling again must trigger another API call (not a cache hit)
    const name2 = await resolver.resolveChannel("C_OVERFLOW");
    expect(name2).toBe("overflow");

    // 10_000 fills + 2 overflow calls
    const overflowCalls = vi.mocked(client.call).mock.calls.filter(
      ([, params]) => (params as Record<string, string>)["channel"] === "C_OVERFLOW",
    );
    expect(overflowCalls).toHaveLength(2);
  });
});
