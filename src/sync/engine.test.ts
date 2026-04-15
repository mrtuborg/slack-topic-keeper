import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Vault } from "obsidian";
import type { SlackSearch } from "../slack/search";
import type { SlackResolver } from "../slack/resolver";
import { SlackAuthError } from "../slack/client";
import { SyncEngine } from "./engine";
import { MarkdownWriter } from "./writer";
import type { BackfillDetector } from "./backfill";
import type { PluginSettings } from "../settings";
import { DEFAULT_SETTINGS } from "../settings";

// ---------------------------------------------------------------------------
// In-memory mock vault (same shape as in writer.test.ts)
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
    getAbstractFileByPath: vi.fn((path: string) => files.has(path) ? { path } : null),
    modify: vi.fn(async (file: { path: string }, content: string) => {
      files.set(file.path, content);
    }),
    _files: files,
  };
}

function makeSettings(overrides: Partial<PluginSettings> = {}): PluginSettings {
  return {
    ...DEFAULT_SETTINGS,
    slackToken: "xoxp-test-token",
    slackUserId: "U01ABC",
    archiveFolder: "slack",
    timestampFormat: "hh:mm A",
    includeDMs: true,
    ...overrides,
  };
}

describe("SyncEngine", () => {
  let mockSearch: { fetchMentions: ReturnType<typeof vi.fn>; fetchAuthored: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockSearch = {
      fetchMentions: vi.fn().mockResolvedValue([]),
      fetchAuthored:  vi.fn().mockResolvedValue([]),
    };
  });

  // -------------------------------------------------------------------------
  it("T-ENGINE-3: empty token returns config error immediately with no API calls", async () => {
    const settings = makeSettings({ slackToken: "" });
    const vault = makeMockVault();
    const writer = new MarkdownWriter(vault as unknown as Vault, settings.archiveFolder);
    const engine = new SyncEngine(settings, mockSearch as unknown as SlackSearch, writer);

    const result = await engine.sync(["2026-04-14"]);

    expect(mockSearch.fetchMentions).not.toHaveBeenCalled();
    expect(mockSearch.fetchAuthored).not.toHaveBeenCalled();
    expect(result.successDates).toHaveLength(0);
    expect(result.failedDates).toHaveLength(1);
    expect(result.failedDates[0].date).toBe("2026-04-14");
    expect(result.failedDates[0].error).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  it("T-ENGINE-4: SlackAuthError from search is captured in failedDates", async () => {
    mockSearch.fetchMentions.mockRejectedValue(new SlackAuthError());

    const settings = makeSettings();
    const vault = makeMockVault();
    const writer = new MarkdownWriter(vault as unknown as Vault, settings.archiveFolder);
    const engine = new SyncEngine(settings, mockSearch as unknown as SlackSearch, writer);

    const result = await engine.sync(["2026-04-14"]);

    expect(result.successDates).toHaveLength(0);
    expect(result.failedDates).toHaveLength(1);
    expect(result.failedDates[0].date).toBe("2026-04-14");
    expect(result.failedDates[0].error).toContain("Invalid Slack credentials");
  });

  // -------------------------------------------------------------------------
  it("T-ENGINE-7: empty search results — writer called, files created with heading but no bullets", async () => {
    // search returns empty arrays
    mockSearch.fetchMentions.mockResolvedValue([]);
    mockSearch.fetchAuthored.mockResolvedValue([]);

    const settings = makeSettings();
    const vault = makeMockVault();
    const writer = new MarkdownWriter(vault as unknown as Vault, settings.archiveFolder);
    const engine = new SyncEngine(settings, mockSearch as unknown as SlackSearch, writer);

    const result = await engine.sync(["2026-04-14"]);

    expect(result.successDates).toContain("2026-04-14");
    expect(result.failedDates).toHaveLength(0);

    const mentionsFile = vault._files.get("slack/2026-04-14/mentions.md");
    const myMsgFile    = vault._files.get("slack/2026-04-14/my_messages.md");

    expect(mentionsFile).toBeDefined();
    expect(myMsgFile).toBeDefined();

    // Has H1 heading
    expect(mentionsFile).toContain("# Slack Mentions — 2026-04-14");
    // Has no bullet lines
    expect(mentionsFile).not.toContain("- **");
  });

  // -------------------------------------------------------------------------
  it("continues processing remaining dates when one date fails", async () => {
    mockSearch.fetchMentions
      .mockRejectedValueOnce(new Error("transient error"))
      .mockResolvedValueOnce([]);

    const settings = makeSettings();
    const vault = makeMockVault();
    const writer = new MarkdownWriter(vault as unknown as Vault, settings.archiveFolder);
    const engine = new SyncEngine(settings, mockSearch as unknown as SlackSearch, writer);

    const result = await engine.sync(["2026-04-13", "2026-04-14"]);

    expect(result.failedDates).toHaveLength(1);
    expect(result.failedDates[0].date).toBe("2026-04-13");
    expect(result.successDates).toContain("2026-04-14");
  });

  // -------------------------------------------------------------------------
  it("T-ENGINE-1: all dates present — syncAll makes no API calls", async () => {
    const mockBackfill = {
      getMissingDates: vi.fn().mockResolvedValue([]),
    };
    const settings = makeSettings();
    const vault = makeMockVault();
    const writer = new MarkdownWriter(vault as unknown as Vault, settings.archiveFolder);
    const engine = new SyncEngine(
      settings,
      mockSearch as unknown as SlackSearch,
      writer,
      mockBackfill as unknown as BackfillDetector,
    );

    const result = await engine.syncAll();

    expect(mockSearch.fetchMentions).not.toHaveBeenCalled();
    expect(mockSearch.fetchAuthored).not.toHaveBeenCalled();
    expect(result.successDates).toHaveLength(0);
    expect(result.failedDates).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  it("T-ENGINE-2: 2 missing past days — fetches for 2 dates, today not fetched", async () => {
    const mockBackfill = {
      getMissingDates: vi.fn().mockResolvedValue(["2026-04-13", "2026-04-14"]),
    };
    const settings = makeSettings();
    const vault = makeMockVault();
    const writer = new MarkdownWriter(vault as unknown as Vault, settings.archiveFolder);
    const engine = new SyncEngine(
      settings,
      mockSearch as unknown as SlackSearch,
      writer,
      mockBackfill as unknown as BackfillDetector,
    );

    await engine.syncAll();

    expect(mockSearch.fetchMentions).toHaveBeenCalledTimes(2);
    expect(mockSearch.fetchMentions).toHaveBeenCalledWith("U01ABC", "2026-04-13", true);
    expect(mockSearch.fetchMentions).toHaveBeenCalledWith("U01ABC", "2026-04-14", true);
    expect(mockSearch.fetchMentions).not.toHaveBeenCalledWith(
      "U01ABC",
      "2026-04-15",
      expect.anything(),
    );
  });

  // -------------------------------------------------------------------------
  it("T-ENGINE-5: 3 dates, middle date fails — other dates succeed", async () => {
    mockSearch.fetchMentions
      .mockResolvedValueOnce([])                        // 2026-04-12
      .mockRejectedValueOnce(new Error("API error"))    // 2026-04-13
      .mockResolvedValueOnce([]);                       // 2026-04-14

    const mockBackfill = {
      getMissingDates: vi.fn().mockResolvedValue(["2026-04-12", "2026-04-13", "2026-04-14"]),
    };
    const settings = makeSettings();
    const vault = makeMockVault();
    const writer = new MarkdownWriter(vault as unknown as Vault, settings.archiveFolder);
    const engine = new SyncEngine(
      settings,
      mockSearch as unknown as SlackSearch,
      writer,
      mockBackfill as unknown as BackfillDetector,
    );

    const result = await engine.syncAll();

    expect(result.successDates).toContain("2026-04-12");
    expect(result.successDates).toContain("2026-04-14");
    expect(result.failedDates).toHaveLength(1);
    expect(result.failedDates[0].date).toBe("2026-04-13");
  });

  // -------------------------------------------------------------------------
  it("T-ENGINE-6: concurrent syncAll guard — second call returns immediately", async () => {
    const mockBackfill = {
      getMissingDates: vi.fn().mockResolvedValue(["2026-04-14"]),
    };
    const settings = makeSettings();
    const vault = makeMockVault();
    const writer = new MarkdownWriter(vault as unknown as Vault, settings.archiveFolder);
    const engine = new SyncEngine(
      settings,
      mockSearch as unknown as SlackSearch,
      writer,
      mockBackfill as unknown as BackfillDetector,
    );

    // Start first sync (async — will await getMissingDates on next microtask)
    const first = engine.syncAll();
    // Second call fires synchronously before first's await resolves
    const second = engine.syncAll();

    const secondResult = await second;
    expect(secondResult.successDates).toHaveLength(0);
    expect(secondResult.failedDates).toHaveLength(0);
    expect(secondResult.newMessageCount).toBe(0);
    // Ensure first completes cleanly
    await first;
  });

  // -------------------------------------------------------------------------
  it("T-ENGINE-8: sync processes non-empty messages and writes channel content", async () => {
    mockSearch.fetchMentions.mockResolvedValue([
      { channel: { id: "C01", name: "general" }, ts: "1681560240.000100", text: "hello world", user: "U01", username: "alice" },
    ]);
    mockSearch.fetchAuthored.mockResolvedValue([
      { channel: { id: "C01", name: "general" }, ts: "1681560300.000000", text: "my authored msg", user: "U01" },
    ]);

    const settings = makeSettings();
    const vault = makeMockVault();
    const writer = new MarkdownWriter(vault as unknown as Vault, settings.archiveFolder);
    const engine = new SyncEngine(settings, mockSearch as unknown as SlackSearch, writer);

    const result = await engine.sync(["2026-04-14"]);

    expect(result.newMessageCount).toBe(2);
    const mentionsContent = vault._files.get("slack/2026-04-14/mentions.md");
    expect(mentionsContent).toContain("## #general");
    expect(mentionsContent).toContain("hello world");
    expect(mentionsContent).toContain("@alice:");
    const myMsgContent = vault._files.get("slack/2026-04-14/my_messages.md");
    expect(myMsgContent).toContain("my authored msg");
  });

  // -------------------------------------------------------------------------
  it("sync uses resolver to look up channel and user display names", async () => {
    const mockResolver: Partial<SlackResolver> & { resolveChannel: ReturnType<typeof vi.fn>; resolveUser: ReturnType<typeof vi.fn>; clearCache: ReturnType<typeof vi.fn> } = {
      resolveChannel: vi.fn().mockResolvedValue("resolved-general"),
      resolveUser: vi.fn().mockResolvedValue("Alice Smith"),
      clearCache: vi.fn(),
    };

    mockSearch.fetchMentions.mockResolvedValue([
      { channel: { id: "C01", name: "old-name" }, ts: "1000.0", text: "mention text", user: "U01" },
    ]);
    mockSearch.fetchAuthored.mockResolvedValue([]);

    const settings = makeSettings();
    const vault = makeMockVault();
    const writer = new MarkdownWriter(vault as unknown as Vault, settings.archiveFolder);
    const engine = new SyncEngine(
      settings,
      mockSearch as unknown as SlackSearch,
      writer,
      undefined,
      mockResolver as unknown as SlackResolver,
    );

    await engine.sync(["2026-04-14"]);

    expect(mockResolver.resolveChannel).toHaveBeenCalledWith("C01");
    expect(mockResolver.resolveUser).toHaveBeenCalledWith("U01");
    const content = vault._files.get("slack/2026-04-14/mentions.md");
    expect(content).toContain("## #resolved-general");
    expect(content).toContain("@Alice Smith:");
  });

  // -------------------------------------------------------------------------
  it("syncAll with no backfillDetector processes zero dates and makes no API calls", async () => {
    const settings = makeSettings();
    const vault = makeMockVault();
    const writer = new MarkdownWriter(vault as unknown as Vault, settings.archiveFolder);
    // No backfillDetector (4th arg omitted)
    const engine = new SyncEngine(settings, mockSearch as unknown as SlackSearch, writer);

    const result = await engine.syncAll();

    expect(result.successDates).toHaveLength(0);
    expect(result.failedDates).toHaveLength(0);
    expect(result.newMessageCount).toBe(0);
    expect(mockSearch.fetchMentions).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  it("syncAll with missing token returns errors for all backfill dates without calling API", async () => {
    const mockBackfill = {
      getMissingDates: vi.fn().mockResolvedValue(["2026-04-14"]),
    };
    const settings = makeSettings({ slackToken: "" });
    const vault = makeMockVault();
    const writer = new MarkdownWriter(vault as unknown as Vault, settings.archiveFolder);
    const engine = new SyncEngine(
      settings,
      mockSearch as unknown as SlackSearch,
      writer,
      mockBackfill as unknown as BackfillDetector,
    );

    const result = await engine.syncAll();

    expect(result.failedDates).toHaveLength(1);
    expect(result.failedDates[0].date).toBe("2026-04-14");
    expect(result.failedDates[0].kind).toBe("unknown");
    expect(mockSearch.fetchMentions).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  it("concurrent sync() guard — second call returns immediately", async () => {
    const settings = makeSettings();
    const vault = makeMockVault();
    const writer = new MarkdownWriter(vault as unknown as Vault, settings.archiveFolder);
    const engine = new SyncEngine(settings, mockSearch as unknown as SlackSearch, writer);

    const first = engine.sync(["2026-04-14"]);
    const second = engine.sync(["2026-04-14"]);

    const secondResult = await second;
    expect(secondResult.successDates).toHaveLength(0);
    expect(secondResult.failedDates).toHaveLength(0);
    expect(secondResult.newMessageCount).toBe(0);
    await first;
  });
});
