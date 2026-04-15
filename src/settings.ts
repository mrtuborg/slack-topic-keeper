/*
 * Changes from initial stub (Milestone 2):
 *   - Added isValidToken() and isValidUserId() pure validation helpers (exported for tests).
 *   - Added SlackTopicKeeperSettingTab class extending PluginSettingTab.
 *   - PluginSettings interface and DEFAULT_SETTINGS are unchanged.
 */

import { App, PluginSettingTab, Setting } from "obsidian";
import type SlackTopicKeeperPlugin from "./main";

export interface PluginSettings {
  slackToken: string;
  slackUserId: string;
  backfillDays: number;
  archiveFolder: string;
  periodicSyncMinutes: number;
  timestampFormat: string;
  includeDMs: boolean;
  showNotices: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  slackToken: "",
  slackUserId: "",
  backfillDays: 7,
  archiveFolder: "slack",
  periodicSyncMinutes: 0,
  timestampFormat: "hh:mm A",
  includeDMs: true,
  showNotices: true,
};

/** Returns true if token has a recognised Slack token prefix. */
export function isValidToken(token: string): boolean {
  return token.startsWith("xoxp-") || token.startsWith("xoxb-");
}

/** Returns true if the string looks like a Slack member ID (U + uppercase alphanumeric). */
export function isValidUserId(id: string): boolean {
  return /^U[A-Z0-9]+$/.test(id);
}

const USER_ID_HELP =
  "Your Slack member ID (starts with U). Find it in your Slack profile → ⋯ → Copy member ID.";

export class SlackTopicKeeperSettingTab extends PluginSettingTab {
  plugin: SlackTopicKeeperPlugin;

  constructor(app: App, plugin: SlackTopicKeeperPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("p", {
      text: "⚠️ Your Slack token is stored in the vault's plugin data file (data.json). If your vault syncs to a cloud service, the token travels with it. Keep your vault storage private.",
      cls: "stk-warning",
    });

    containerEl.createEl("h2", { text: "Slack credentials" });

    const tokenSetting = new Setting(containerEl)
      .setName("Slack Token")
      .setDesc("Slack API token (xoxp- or xoxb-).")
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setPlaceholder("xoxp-...")
          .setValue(this.plugin.settings.slackToken)
          .onChange((value) => {
            this.plugin.settings.slackToken = value;
            void this.plugin.saveSettings();
            tokenSetting.setDesc(
              value && !isValidToken(value)
                ? "⚠️ Token should start with xoxp- or xoxb-."
                : "Slack API token (xoxp- or xoxb-).",
            );
          });
      });

    const userIdSetting = new Setting(containerEl)
      .setName("Slack User ID")
      .setDesc(USER_ID_HELP)
      .addText((text) =>
        text
          .setPlaceholder("UXXXXXXXX")
          .setValue(this.plugin.settings.slackUserId)
          .onChange((value) => {
            this.plugin.settings.slackUserId = value;
            void this.plugin.saveSettings();
            userIdSetting.setDesc(
              value && !isValidUserId(value)
                ? `⚠️ Member ID should start with U followed by uppercase letters/digits. ${USER_ID_HELP}`
                : USER_ID_HELP,
            );
          }),
      );

    containerEl.createEl("h2", { text: "Sync behaviour" });

    new Setting(containerEl)
      .setName("Backfill Days")
      .setDesc("How many days of history to import on first run (1–90).")
      .addSlider((slider) =>
        slider
          .setLimits(1, 90, 1)
          .setValue(this.plugin.settings.backfillDays)
          .setDynamicTooltip()
          .onChange((value) => {
            this.plugin.settings.backfillDays = value;
            void this.plugin.saveSettings();
          }),
      );

    const archiveFolderSetting = new Setting(containerEl)
      .setName("Archive Folder")
      .setDesc("Vault folder where channel notes are written. Must not start with / or contain ..")
      .addText((text) =>
        text
          .setPlaceholder("slack")
          .setValue(this.plugin.settings.archiveFolder)
          .onChange((value) => {
            if (value && !value.startsWith("/") && !value.includes("..")) {
              this.plugin.settings.archiveFolder = value;
              void this.plugin.saveSettings();
              archiveFolderSetting.setDesc(
                "Vault folder where channel notes are written. Must not start with / or contain ..",
              );
            } else {
              archiveFolderSetting.setDesc(
                "⚠️ Folder must not be empty, start with /, or contain ..",
              );
            }
          }),
      );

    const periodicSyncSetting = new Setting(containerEl)
      .setName("Periodic Sync (minutes)")
      .setDesc("Sync every N minutes. 0 disables automatic sync (0–1440).")
      .addText((text) =>
        text
          .setPlaceholder("0")
          .setValue(String(this.plugin.settings.periodicSyncMinutes))
          .onChange((value) => {
            const n = parseInt(value, 10);
            if (!isNaN(n) && n >= 0 && n <= 1440) {
              this.plugin.settings.periodicSyncMinutes = n;
              void this.plugin.saveSettings();
              periodicSyncSetting.setDesc(
                "Sync every N minutes. 0 disables automatic sync (0–1440).",
              );
            } else {
              periodicSyncSetting.setDesc("⚠️ Must be a whole number between 0 and 1440.");
            }
          }),
      );

    new Setting(containerEl)
      .setName("Timestamp Format")
      .setDesc("Moment.js format string for message timestamps.")
      .addText((text) =>
        text
          .setPlaceholder("hh:mm A")
          .setValue(this.plugin.settings.timestampFormat)
          .onChange((value) => {
            if (value) {
              this.plugin.settings.timestampFormat = value;
              void this.plugin.saveSettings();
            }
          }),
      );

    containerEl.createEl("h2", { text: "Content" });

    new Setting(containerEl)
      .setName("Include DMs")
      .setDesc("Import direct messages in addition to channels.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.includeDMs)
          .onChange((value) => {
            this.plugin.settings.includeDMs = value;
            void this.plugin.saveSettings();
          }),
      );

    containerEl.createEl("h2", { text: "UI" });

    new Setting(containerEl)
      .setName("Show Notices")
      .setDesc("Show Obsidian notices on sync completion and errors.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showNotices)
          .onChange((value) => {
            this.plugin.settings.showNotices = value;
            void this.plugin.saveSettings();
          }),
      );
  }
}
