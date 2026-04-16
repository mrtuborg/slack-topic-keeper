import { Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, SlackTopicKeeperSettingTab } from "./settings";
import type { PluginSettings } from "./settings";
import { SlackClient } from "./slack/client";
import { RateLimiter } from "./slack/rate-limiter";
import { SlackSearch } from "./slack/search";
import { SlackResolver } from "./slack/resolver";
import { MarkdownWriter } from "./sync/writer";
import { SyncEngine } from "./sync/engine";
import { BackfillDetector } from "./sync/backfill";

export default class SlackTopicKeeperPlugin extends Plugin {
  settings!: PluginSettings;
  private _saveTimeout: ReturnType<typeof setTimeout> | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new SlackTopicKeeperSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      void this.syncSlackData();
    });

    this.addCommand({
      id: "sync-slack-now",
      name: "Sync Slack messages now",
      callback: () => {
        void this.syncSlackData();
      },
    });

    if (this.settings.periodicSyncMinutes > 0) {
      this.registerInterval(
        window.setInterval(
          () => void this.syncSlackData(),
          this.settings.periodicSyncMinutes * 60_000,
        ),
      );
    }
  }

  async syncSlackData(): Promise<void> {
    const { slackToken, slackUserId, showNotices } = this.settings;

    if (!slackToken || !slackUserId) {
      if (showNotices) {
        new Notice("Slack Topic Keeper: configure your token and user ID in settings.", 10000);
      }
      return;
    }

    const startNotice = showNotices ? new Notice("Slack sync: fetching messages…", 0) : null;

    try {
      const client = new SlackClient(slackToken);
      const rateLimiter = new RateLimiter();
      const search = new SlackSearch(client, rateLimiter);
      const resolver = new SlackResolver(client, rateLimiter);
      const archiveFolder = this.settings.archiveFolder;
      const writer = new MarkdownWriter(this.app.vault, archiveFolder);
      const backfillDetector = new BackfillDetector(this.app.vault, archiveFolder);
      const engine = new SyncEngine(this.settings, search, writer, backfillDetector, resolver);

      const syncResult = await engine.syncAll();

      startNotice?.hide();

      if (!showNotices) return;

      if (syncResult.failedDates.length > 0) {
        const kinds = syncResult.failedDates.map((f) => f.kind);
        if (kinds.some((k) => k === "auth")) {
          new Notice("Slack sync failed: invalid or expired Slack token.", 10000);
        } else if (kinds.some((k) => k === "rate-limit")) {
          new Notice("Slack sync: rate limited, pausing…", 5000);
        } else if (kinds.some((k) => k === "network")) {
          new Notice("Slack sync failed: network error. Will retry on next trigger.", 8000);
        } else {
          const dateList = syncResult.failedDates.map((f) => f.date).join(", ");
          new Notice(`Slack sync: completed with errors for dates: ${dateList}`, 8000);
        }
      } else {
        new Notice(
          `Slack sync: done — ${syncResult.newMessageCount} new messages archived`,
          5000,
        );
      }
    } catch (err) {
      startNotice?.hide();
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("Slack Topic Keeper: Sync failed:", errMsg);
      if (showNotices) {
        new Notice("Slack sync failed: network error. Will retry on next trigger.", 8000);
      }
    }
  }

  onunload(): void {
    if (this._saveTimeout !== null) {
      clearTimeout(this._saveTimeout);
      this._saveTimeout = null;
      void this.saveData(this.settings);
    }
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) ?? {});
  }

  saveSettings(): void {
    if (this._saveTimeout !== null) clearTimeout(this._saveTimeout);
    this._saveTimeout = setTimeout(() => {
      this._saveTimeout = null;
      void this.saveData(this.settings);
    }, 300);
  }
}
