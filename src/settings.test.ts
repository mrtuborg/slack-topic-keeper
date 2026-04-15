import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, isValidToken, isValidUserId } from "./settings";
import type { PluginSettings } from "./settings";
import SlackTopicKeeperPlugin from "./main";

// The real obsidian Plugin constructor requires (app, manifest), but the mock
// has a no-arg constructor. Cast through unknown to bypass TypeScript's signature check.
function makePlugin(): SlackTopicKeeperPlugin {
  return new (SlackTopicKeeperPlugin as unknown as new () => SlackTopicKeeperPlugin)();
}

describe("Settings", () => {
  it("T-SETTINGS-1: loadSettings returns all defaults when no saved data exists", async () => {
    const plugin = makePlugin();
    await plugin.loadSettings();
    expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("T-SETTINGS-2: saved settings persist after reload", async () => {
    vi.useFakeTimers();
    try {
      const plugin = makePlugin();
      await plugin.loadSettings();
      plugin.settings.slackUserId = "UABC123";
      plugin.settings.backfillDays = 30;
      plugin.saveSettings();
      // Flush the 300 ms debounce timer and its async saveData callback.
      await vi.runAllTimersAsync();

      // Clear in-memory settings and reload from the mock data store
      plugin.settings = {} as PluginSettings;
      await plugin.loadSettings();

      expect(plugin.settings.slackUserId).toBe("UABC123");
      expect(plugin.settings.backfillDays).toBe(30);
      // Fields not modified should still equal defaults
      expect(plugin.settings.archiveFolder).toBe(DEFAULT_SETTINGS.archiveFolder);
    } finally {
      vi.useRealTimers();
    }
  });

  it("T-SETTINGS-3: isValidToken rejects invalid prefix", () => {
    expect(isValidToken("not-a-token")).toBe(false);
    expect(isValidToken("xoxc-abc123")).toBe(false);
    expect(isValidToken("xoxp-abc123")).toBe(true);
    expect(isValidToken("xoxb-abc123")).toBe(true);
  });

  it("T-SETTINGS-4: isValidUserId rejects invalid format", () => {
    expect(isValidUserId("alice")).toBe(false);
    expect(isValidUserId("u123ABC")).toBe(false);
    expect(isValidUserId("U123ABC")).toBe(true);
    expect(isValidUserId("U1234567890ABCDEF")).toBe(true);
  });
});
