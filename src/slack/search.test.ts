import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SlackClient } from "./client";
import type { RateLimiter } from "./rate-limiter";
import { SlackSearch } from "./search";
import type { SlackMessage } from "../types";

describe("SlackSearch", () => {
  let mockClient: { call: ReturnType<typeof vi.fn> };
  let mockRateLimiter: { execute: ReturnType<typeof vi.fn> };
  let search: SlackSearch;

  beforeEach(() => {
    mockClient = { call: vi.fn() };
    // Execute calls the function directly so tests stay synchronous
    mockRateLimiter = {
      execute: vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
    };
    search = new SlackSearch(
      mockClient as unknown as SlackClient,
      mockRateLimiter as unknown as RateLimiter,
    );
  });

  function makeResponse(matches: Partial<SlackMessage>[], pages = 1, page = 1) {
    return {
      ok: true,
      messages: {
        matches,
        paging: { count: 20, total: matches.length, page, pages },
      },
    };
  }

  function makeMessage(overrides: Partial<SlackMessage> = {}): SlackMessage {
    return {
      text: "hello world",
      ts: "1234567890.000100",
      channel: { id: "C001", name: "general" },
      user: "U01ABC",
      ...overrides,
    };
  }

  it("T-SEARCH-1: fetchMentions builds query with <@userId> and correct date range", async () => {
    mockClient.call.mockResolvedValue(makeResponse([makeMessage()]));

    await search.fetchMentions("U01ABC", "2026-04-15");

    const [method, params] = mockClient.call.mock.calls[0] as [
      string,
      Record<string, string>,
    ];
    expect(method).toBe("search.messages");
    expect(params["query"]).toContain("<@U01ABC>");
    expect(params["query"]).toContain("after:2026-04-14");
    expect(params["query"]).toContain("before:2026-04-16");
  });

  it("T-SEARCH-2: fetchAuthored builds query with from:<@userId> and correct date range", async () => {
    mockClient.call.mockResolvedValue(makeResponse([makeMessage()]));

    await search.fetchAuthored("U01ABC", "2026-04-15");

    const [method, params] = mockClient.call.mock.calls[0] as [
      string,
      Record<string, string>,
    ];
    expect(method).toBe("search.messages");
    expect(params["query"]).toContain("from:<@U01ABC>");
    expect(params["query"]).toContain("after:2026-04-14");
    expect(params["query"]).toContain("before:2026-04-16");
  });

  it("T-SEARCH-3: fetches all pages and merges results for multi-page response", async () => {
    const msg1 = makeMessage({ ts: "100.000" });
    const msg2 = makeMessage({ ts: "200.000" });
    mockClient.call
      .mockResolvedValueOnce(makeResponse([msg1], 2, 1))
      .mockResolvedValueOnce(makeResponse([msg2], 2, 2));

    const results = await search.fetchMentions("U01ABC", "2026-04-15");

    expect(mockClient.call).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(2);
    expect(results[0].ts).toBe("100.000");
    expect(results[1].ts).toBe("200.000");
  });

  it("T-SEARCH-4: single-page response results in exactly one API call", async () => {
    mockClient.call.mockResolvedValue(makeResponse([makeMessage()], 1));

    await search.fetchMentions("U01ABC", "2026-04-15");

    expect(mockClient.call).toHaveBeenCalledTimes(1);
  });

  it("T-SEARCH-5: empty matches returns empty array without error", async () => {
    mockClient.call.mockResolvedValue(makeResponse([]));

    const results = await search.fetchMentions("U01ABC", "2026-04-15");

    expect(results).toEqual([]);
  });

  it("T-SEARCH-6: filters out DM/MPIM messages when includeDMs is false", async () => {
    const dmMsg = makeMessage({
      ts: "dm.000",
      channel: { id: "D001", name: "direct", is_im: true },
    });
    const channelMsg = makeMessage({ ts: "ch.000" });
    mockClient.call.mockResolvedValue(makeResponse([dmMsg, channelMsg]));

    const results = await search.fetchMentions("U01ABC", "2026-04-15", false);

    expect(results).toHaveLength(1);
    expect(results[0].ts).toBe("ch.000");
  });
});
