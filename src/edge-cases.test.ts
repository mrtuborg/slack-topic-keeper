import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Vault } from "obsidian";
import type { SlackClient } from "./slack/client";
import type { RateLimiter } from "./slack/rate-limiter";
import { SlackSearch } from "./slack/search";
import { MarkdownWriter } from "./sync/writer";
import type { ChannelMessages } from "./sync/writer";
import { escapeMarkdown } from "./util/markdown";
import { today, yesterday } from "./util/date";

// ---------------------------------------------------------------------------
// Minimal in-memory mock vault (same pattern as writer.test.ts)
// ---------------------------------------------------------------------------
function makeMockVault() {
  const files = new Map<string, string>();
  const folders = new Set<string>();
  return {
    adapter: {
      exists: vi.fn(async (path: string) => files.has(path) || folders.has(path)),
      read: vi.fn(async (path: string) => files.get(path) ?? ""),
    },
    createFolder: vi.fn(async (path: string) => {
      folders.add(path);
    }),
    create: vi.fn(async (path: string, content: string) => {
      files.set(path, content);
    }),
    getAbstractFileByPath: vi.fn((path: string) => (files.has(path) ? { path } : null)),
    modify: vi.fn(async (file: { path: string }, content: string) => {
      files.set(file.path, content);
    }),
    _files: files,
    _folders: folders,
  };
}

type MockVault = ReturnType<typeof makeMockVault>;

function makeWriter(vault: MockVault, folder = "slack") {
  return new MarkdownWriter(vault as unknown as Vault, folder);
}

function makeChannel(
  name: string,
  isDM: boolean,
  messages: ChannelMessages["messages"],
): ChannelMessages {
  return { channelName: name, isDM, messages };
}

const FETCHED_AT = "2026-04-15T10:00:00.000Z";
const DATE = "2026-04-14";

describe("Edge case tests", () => {
  // -------------------------------------------------------------------------
  it("T-EDGE-1: 10,000-character message written without error", async () => {
    const vault = makeMockVault();
    const writer = makeWriter(vault);
    const longText = "a".repeat(10000);
    const channels = [
      makeChannel("general", false, [
        { time: "10:00 AM", text: escapeMarkdown(longText), dedupKey: "C01/ts1" },
      ]),
    ];

    await writer.write(DATE, "my_messages", channels, FETCHED_AT);

    const file = vault._files.get(`slack/${DATE}/my_messages.md`);
    expect(file).toBeDefined();
    expect(file).toContain(longText);
  });

  // -------------------------------------------------------------------------
  it("T-EDGE-2: CJK channel name and emoji/CJK message written correctly", async () => {
    const vault = makeMockVault();
    const writer = makeWriter(vault);
    const channelName = "日本語チャンネル";
    const message = "こんにちは 🎉 world";
    const channels = [
      makeChannel(channelName, false, [
        { time: "10:00 AM", text: escapeMarkdown(message), dedupKey: "C01/ts1" },
      ]),
    ];

    await writer.write(DATE, "my_messages", channels, FETCHED_AT);

    const file = vault._files.get(`slack/${DATE}/my_messages.md`);
    expect(file).toBeDefined();
    expect(file).toContain(channelName);
    expect(file).toContain("こんにちは");
    expect(file).toContain("🎉");
  });

  // -------------------------------------------------------------------------
  it("T-EDGE-3: 0 authored messages — my_messages.md has heading but no bullets", async () => {
    const vault = makeMockVault();
    const writer = makeWriter(vault);

    await writer.write(DATE, "my_messages", [], FETCHED_AT);

    const file = vault._files.get(`slack/${DATE}/my_messages.md`);
    expect(file).toBeDefined();
    expect(file).toContain(`# My Slack Messages — ${DATE}`);
    expect(file).not.toContain("- **");
  });

  // -------------------------------------------------------------------------
  it("T-EDGE-4: 500 messages across 20 channels — all written, dedup keys correct", async () => {
    const vault = makeMockVault();
    const writer = makeWriter(vault);

    const channels: ChannelMessages[] = Array.from({ length: 20 }, (_, c) => ({
      channelName: `channel-${c}`,
      isDM: false,
      messages: Array.from({ length: 25 }, (_, m) => ({
        time: "10:00 AM",
        text: `Message ${c}-${m}`,
        dedupKey: `C${c}/ts${m}`,
      })),
    }));

    await writer.write(DATE, "my_messages", channels, FETCHED_AT);

    const file = vault._files.get(`slack/${DATE}/my_messages.md`);
    expect(file).toBeDefined();
    const bulletLines = file!.split("\n").filter((l) => l.startsWith("- **"));
    expect(bulletLines).toHaveLength(500);
    const keysMatch = file!.match(/<!-- slack-keys: (.*?) -->/);
    expect(keysMatch).not.toBeNull();
    const keys = keysMatch![1].split(",").filter(Boolean);
    expect(keys).toHaveLength(500);
  });

  // -------------------------------------------------------------------------
  it("T-EDGE-5: search date range uses after:date-1 before:date+1 (midnight boundaries correct)", async () => {
    const mockClient: { call: ReturnType<typeof vi.fn> } = { call: vi.fn() };
    const mockRateLimiter = {
      execute: vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
    };
    const emptyResponse = {
      ok: true,
      messages: { matches: [], paging: { count: 0, total: 0, page: 1, pages: 1 } },
    };
    mockClient.call.mockResolvedValue(emptyResponse);

    const search = new SlackSearch(
      mockClient as unknown as SlackClient,
      mockRateLimiter as unknown as RateLimiter,
    );

    await search.fetchMentions("U01", "2026-04-14", true);

    const callArgs = mockClient.call.mock.calls[0] as [string, Record<string, string>];
    const query = callArgs[1]["query"];
    // Messages at 23:59 on 2026-04-14 are within after:2026-04-13 before:2026-04-15
    // Messages at 00:01 on 2026-04-15 are excluded by before:2026-04-15
    expect(query).toContain("after:2026-04-13");
    expect(query).toContain("before:2026-04-15");
  });

  // -------------------------------------------------------------------------
  describe("T-EDGE-6: today() and yesterday() use UTC throughout (DST-safe)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("returns correct UTC date when UTC is one day ahead of local time (UTC-N timezones)", () => {
      // 00:30 UTC on March 8 = March 7 evening in UTC-5 (US Eastern)
      // Local-time-based approaches would return "2026-03-07", UTC returns "2026-03-08"
      vi.setSystemTime(new Date("2026-03-08T00:30:00Z"));
      expect(today()).toBe("2026-03-08");
      expect(yesterday()).toBe("2026-03-07");
    });

    it("returns correct UTC date during US DST spring-forward gap (2026-03-08T07:00Z)", () => {
      // 2026-03-08T07:00Z = 2:00 AM EST — exact DST spring-forward moment in US Eastern
      vi.setSystemTime(new Date("2026-03-08T07:00:00Z"));
      expect(today()).toBe("2026-03-08");
      expect(yesterday()).toBe("2026-03-07");
    });
  });

  // -------------------------------------------------------------------------
  it("T-EDGE-7: nested archiveFolder — file created at correct path, createFolder called", async () => {
    const vault = makeMockVault();
    const writer = makeWriter(vault, "notes/slack/archive");
    const channels = [
      makeChannel("general", false, [
        { time: "10:00 AM", text: "hello", dedupKey: "C01/ts1" },
      ]),
    ];

    await writer.write(DATE, "my_messages", channels, FETCHED_AT);

    const filePath = `notes/slack/archive/${DATE}/my_messages.md`;
    expect(vault._files.get(filePath)).toBeDefined();
    expect(vault.createFolder).toHaveBeenCalledWith(`notes/slack/archive/${DATE}`);
  });

  // -------------------------------------------------------------------------
  it("T-EDGE-8: overlapping messages not duplicated on second writeOrMerge", async () => {
    const vault = makeMockVault();
    const writer = makeWriter(vault);

    const channels = [
      makeChannel("general", false, [
        { time: "10:00 AM", text: "hello", dedupKey: "C01/ts1" },
      ]),
    ];

    await writer.writeOrMerge(DATE, "my_messages", channels, FETCHED_AT);
    const newCount = await writer.writeOrMerge(DATE, "my_messages", channels, FETCHED_AT);

    expect(newCount).toBe(0);
    const file = vault._files.get(`slack/${DATE}/my_messages.md`);
    const bulletLines = file!.split("\n").filter((l) => l.startsWith("- **"));
    expect(bulletLines).toHaveLength(1);
  });
});
