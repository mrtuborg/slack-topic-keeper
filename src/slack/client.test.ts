import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({
  requestUrl: vi.fn(),
}));

import { requestUrl } from "obsidian";
import { SlackAuthError, SlackClient, SlackNetworkError, SlackRateLimitError } from "./client";

const TOKEN = "xoxp-test-token-12345";

describe("SlackClient", () => {
  let client: SlackClient;

  beforeEach(() => {
    client = new SlackClient(TOKEN);
    vi.clearAllMocks();
  });

  it("T-CLIENT-1: parses successful response, correct URL and auth header", async () => {
    const mockData = { ok: true, messages: { matches: [] } };
    vi.mocked(requestUrl).mockResolvedValueOnce({
      json: mockData,
      headers: {},
      status: 200,
      text: "",
      arrayBuffer: new ArrayBuffer(0),
    });

    const result = await client.call("search.messages", { query: "test" });
    expect(result).toEqual(mockData);

    const callArgs = vi.mocked(requestUrl).mock.calls[0][0] as {
      url: string;
      headers: Record<string, string>;
    };
    expect(callArgs.url).toBe("https://slack.com/api/search.messages");
    expect(callArgs.headers["Authorization"]).toBe(`Bearer ${TOKEN}`);
  });

  it("T-CLIENT-2: throws SlackAuthError on invalid_auth", async () => {
    vi.mocked(requestUrl).mockResolvedValueOnce({
      json: { ok: false, error: "invalid_auth" },
      headers: {},
      status: 200,
      text: "",
      arrayBuffer: new ArrayBuffer(0),
    });

    await expect(client.call("search.messages", {})).rejects.toThrow(SlackAuthError);
  });

  it("T-CLIENT-3: throws SlackNetworkError when requestUrl throws", async () => {
    vi.mocked(requestUrl).mockRejectedValueOnce(new Error("Connection refused"));

    await expect(client.call("search.messages", {})).rejects.toThrow(SlackNetworkError);
  });

  it("T-CLIENT-4: every URL starts with https://slack.com/api/", async () => {
    const mockData = { ok: true };
    vi.mocked(requestUrl).mockResolvedValue({
      json: mockData,
      headers: {},
      status: 200,
      text: "",
      arrayBuffer: new ArrayBuffer(0),
    });

    await client.call("search.messages", {});
    await client.call("conversations.history", {});

    for (const [arg] of vi.mocked(requestUrl).mock.calls) {
      const { url } = arg as { url: string };
      expect(url).toMatch(/^https:\/\/slack\.com\/api\//);
    }
  });

  it("T-CLIENT-5: token never appears in any console output on error path", async () => {
    const spyError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const spyWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const spyLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const spyInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const spyDebug = vi.spyOn(console, "debug").mockImplementation(() => undefined);

    vi.mocked(requestUrl).mockResolvedValueOnce({
      json: { ok: false, error: "invalid_auth" },
      headers: {},
      status: 200,
      text: "",
      arrayBuffer: new ArrayBuffer(0),
    });

    try {
      await client.call("search.messages", {});
    } catch {
      // expected
    }

    const output = [
      ...spyError.mock.calls.flat(),
      ...spyWarn.mock.calls.flat(),
      ...spyLog.mock.calls.flat(),
      ...spyInfo.mock.calls.flat(),
      ...spyDebug.mock.calls.flat(),
    ].join(" ");

    expect(output).not.toContain(TOKEN);
    spyError.mockRestore();
    spyWarn.mockRestore();
    spyLog.mockRestore();
    spyInfo.mockRestore();
    spyDebug.mockRestore();
  });

  it("throws SlackNetworkError on HTTP 5xx response", async () => {
    vi.mocked(requestUrl).mockResolvedValueOnce({
      json: null, // not reached — status check fires first
      headers: {},
      status: 503,
      text: "",
      arrayBuffer: new ArrayBuffer(0),
    });

    const err = await client.call("search.messages", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SlackNetworkError);
    expect((err as SlackNetworkError).message).toContain("HTTP 503");
  });

  it("throws SlackNetworkError when response JSON is null", async () => {
    vi.mocked(requestUrl).mockResolvedValueOnce({
      json: null,
      headers: {},
      status: 200,
      text: "",
      arrayBuffer: new ArrayBuffer(0),
    });

    const err = await client.call("search.messages", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SlackNetworkError);
    expect((err as SlackNetworkError).message).toContain("non-JSON");
  });

  it("throws SlackRateLimitError with parsed Retry-After on ratelimited response", async () => {
    vi.mocked(requestUrl).mockResolvedValueOnce({
      json: { ok: false, error: "ratelimited" },
      headers: { "retry-after": "30" },
      status: 200,
      text: "",
      arrayBuffer: new ArrayBuffer(0),
    });

    const err = await client.call("search.messages", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SlackRateLimitError);
    expect((err as SlackRateLimitError).retryAfter).toBe(30);
  });

  it("defaults retryAfter to 1 when ratelimited response has no Retry-After header", async () => {
    vi.mocked(requestUrl).mockResolvedValueOnce({
      json: { ok: false, error: "ratelimited" },
      headers: {},
      status: 200,
      text: "",
      arrayBuffer: new ArrayBuffer(0),
    });

    const err = await client.call("search.messages", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SlackRateLimitError);
    expect((err as SlackRateLimitError).retryAfter).toBe(1);
  });
});
