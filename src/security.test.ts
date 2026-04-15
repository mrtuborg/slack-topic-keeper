import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Vault } from "obsidian";
import { readFileSync } from "fs";

// vi.mock is hoisted before all imports — provides requestUrl for SlackClient
vi.mock("obsidian", () => ({
  requestUrl: vi.fn(),
}));

import { requestUrl } from "obsidian";
import { SlackClient } from "./slack/client";
import { escapeMarkdown, sanitizeChannelName } from "./util/markdown";
import { MarkdownWriter } from "./sync/writer";
import { SyncEngine } from "./sync/engine";
import type { SlackSearch } from "./slack/search";

// ---------------------------------------------------------------------------
// Inline settings type — avoids importing settings.ts which extends PluginSettingTab
// ---------------------------------------------------------------------------
const TEST_SETTINGS = {
  slackToken: "xoxp-test-token",
  slackUserId: "U01ABC",
  backfillDays: 7,
  archiveFolder: "slack",
  periodicSyncMinutes: 0,
  timestampFormat: "hh:mm A",
  includeDMs: true,
  showNotices: true,
};

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
  };
}

describe("Security tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  it("T-SEC-1: token never appears in console output during success + failure sync", async () => {
    const TOKEN = "xoxp-unique-secret-98765-abcdef";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy  = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logSpy   = vi.spyOn(console, "log").mockImplementation(() => {});
    const infoSpy  = vi.spyOn(console, "info").mockImplementation(() => {});
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    try {
      const settings = { ...TEST_SETTINGS, slackToken: TOKEN };
      const mockSearch = {
        fetchMentions: vi.fn().mockResolvedValue([]),
        fetchAuthored: vi.fn().mockResolvedValue([]),
      };
      const vault = makeMockVault();
      const writer = new MarkdownWriter(vault as unknown as Vault, settings.archiveFolder);

      // Success path
      const engine = new SyncEngine(settings, mockSearch as unknown as SlackSearch, writer);
      await engine.sync(["2026-04-14"]);

      // Failure path
      mockSearch.fetchMentions.mockRejectedValueOnce(new Error("generic API failure"));
      await engine.sync(["2026-04-14"]);

      const allOutput = [
        ...errorSpy.mock.calls,
        ...warnSpy.mock.calls,
        ...logSpy.mock.calls,
        ...infoSpy.mock.calls,
        ...debugSpy.mock.calls,
      ].flat().map(String);

      for (const line of allOutput) {
        expect(line).not.toContain(TOKEN);
      }
    } finally {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
      logSpy.mockRestore();
      infoSpy.mockRestore();
      debugSpy.mockRestore();
    }
  });

  // -------------------------------------------------------------------------
  it("T-SEC-2: sanitizeChannelName prevents path traversal", () => {
    const result = sanitizeChannelName("../../etc/passwd");
    expect(result).not.toContain("..");
    expect(result).not.toContain("/");
    expect(result).not.toContain("\\");
    expect(result).toBe("etcpasswd");
  });

  // -------------------------------------------------------------------------
  it("T-SEC-3: escapeMarkdown neutralises Markdown link injection", () => {
    const input = "](evil)[click](http://evil.com)";
    const result = escapeMarkdown(input);
    // All [ and ] must be escaped — no valid [text](url) pattern survives
    expect(result).not.toMatch(/(?<!\\)\[/);
    expect(result).not.toMatch(/(?<!\\)\]/);
    // A Markdown link requires an unescaped [ — verify none exist followed by ](url)
    expect(result).not.toMatch(/(?<!\\)\[.*\]\(/);
  });

  // -------------------------------------------------------------------------
  it("T-SEC-4: all SlackClient request URLs start with https://slack.com/api/", async () => {
    vi.mocked(requestUrl).mockResolvedValue({
      json: { ok: true },
      headers: {},
      status: 200,
      text: "",
      arrayBuffer: new ArrayBuffer(0),
    });

    const client = new SlackClient("xoxp-test");
    await client.call("search.messages", {});
    await client.call("conversations.info", { channel: "C01" });

    for (const [arg] of vi.mocked(requestUrl).mock.calls) {
      const { url } = arg as { url: string };
      expect(url).toMatch(/^https:\/\/slack\.com\/api\//);
    }
  });

  // -------------------------------------------------------------------------
  it("T-SEC-5: no eval, new Function, or dynamic import in bundle", () => {
    let bundle: string;
    try {
      bundle = readFileSync("main.js", "utf-8");
    } catch {
      // main.js not yet built — skip this check
      console.warn("T-SEC-5: main.js not found, skipping bundle static analysis");
      return;
    }
    expect(bundle).not.toMatch(/\beval\s*\(/);
    expect(bundle).not.toMatch(/new\s+Function\s*\(/);
    // Dynamic import with a non-literal argument (variable) — e.g. import(variable)
    expect(bundle).not.toMatch(/import\s*\([^"'`\n]/);
  });
});
