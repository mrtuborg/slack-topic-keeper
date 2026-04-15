import type { TFile, Vault } from "obsidian";
import { escapeMarkdown, sanitizeChannelName } from "../util/markdown";

export interface ChannelMessages {
  channelName: string; // resolved name (e.g. "general" or "Bob" for DMs)
  isDM: boolean;
  messages: FormattedMessage[];
}

export interface FormattedMessage {
  time: string;     // already-formatted timestamp string
  author?: string;  // display name — present only for mentions
  text: string;     // markdown-escaped message text
  dedupKey: string; // "channelId/ts"
}

export class MarkdownWriter {
  constructor(
    private readonly vault: Vault,
    private readonly archiveFolder: string,
  ) {}

  async write(
    date: string,
    type: "mentions" | "my_messages",
    channels: ChannelMessages[],
    fetchedAt: string,
  ): Promise<void> {
    const fileName = type === "mentions" ? "mentions.md" : "my_messages.md";
    const folderPath = `${this.archiveFolder}/${date}`;
    const filePath = `${folderPath}/${fileName}`;

    if (!(await this.vault.adapter.exists(folderPath))) {
      await this.vault.createFolder(folderPath);
    }

    if (await this.vault.adapter.exists(filePath)) {
      return; // skip — merge handled by writeOrMerge
    }

    await this.vault.create(filePath, buildContent(date, type, channels, fetchedAt));
  }

  /**
   * Writes a new file or merges into an existing one, deduplicating by dedupKey.
   * Returns the number of new messages added.
   */
  async writeOrMerge(
    date: string,
    type: "mentions" | "my_messages",
    channels: ChannelMessages[],
    fetchedAt: string,
  ): Promise<number> {
    const fileName = type === "mentions" ? "mentions.md" : "my_messages.md";
    const folderPath = `${this.archiveFolder}/${date}`;
    const filePath = `${folderPath}/${fileName}`;

    if (!(await this.vault.adapter.exists(filePath))) {
      // Fresh write — file does not exist yet
      if (!(await this.vault.adapter.exists(folderPath))) {
        await this.vault.createFolder(folderPath);
      }
      const total = channels.reduce((sum, ch) => sum + ch.messages.length, 0);
      await this.vault.create(filePath, buildContent(date, type, channels, fetchedAt));
      return total;
    }

    // File exists — check for new messages
    const existingContent = await this.vault.adapter.read(filePath);
    const existingKeys = parseKeys(existingContent);

    const newCount = channels.reduce(
      (sum, ch) => sum + ch.messages.filter((m) => !existingKeys.has(m.dedupKey)).length,
      0,
    );

    if (newCount === 0) return 0;

    const fileRef = this.vault.getAbstractFileByPath(filePath) as TFile | null;
    if (!fileRef) return 0; // file disappeared between existence check and modify

    // Check whether incoming data covers every key we already have on disk.
    // If any existing key is absent from the incoming set the API may have returned
    // a partial result — fall back to append-only to prevent data loss.
    const incomingKeys = new Set(channels.flatMap((ch) => ch.messages.map((m) => m.dedupKey)));
    const safeToRebuild = [...existingKeys].every((k) => incomingKeys.has(k));

    if (safeToRebuild) {
      await this.vault.modify(fileRef, buildContent(date, type, channels, fetchedAt));
    } else {
      const newOnly = channels
        .map((ch) => ({ ...ch, messages: ch.messages.filter((m) => !existingKeys.has(m.dedupKey)) }))
        .filter((ch) => ch.messages.length > 0);
      const allKeys = new Set([
        ...existingKeys,
        ...newOnly.flatMap((ch) => ch.messages.map((m) => m.dedupKey)),
      ]);
      await this.vault.modify(fileRef, appendMessages(existingContent, newOnly, type, allKeys));
    }

    return newCount;
  }
}

function parseKeys(content: string): Set<string> {
  const match = content.match(/<!-- slack-keys: (.*?) -->/);
  if (!match || !match[1].trim()) return new Set();
  return new Set(match[1].split(",").map((k) => k.trim()).filter(Boolean));
}

/**
 * Appends new channel sections to existing file content without touching the
 * existing message lines. Used when the incoming data appears truncated
 * (orphan keys detected) so we never overwrite messages already on disk.
 */
function appendMessages(
  existingContent: string,
  newChannels: ChannelMessages[],
  type: "mentions" | "my_messages",
  allKeys: Set<string>,
): string {
  // Strip the trailing keys comment but keep all existing message lines.
  const withoutComment = existingContent.replace(/\n<!-- slack-keys:.*?-->\n$/, "");

  const lines: string[] = [];
  for (const channel of newChannels) {
    const safeName = sanitizeChannelName(channel.channelName);
    const heading = channel.isDM ? `## DM with @${safeName}` : `## #${safeName}`;
    lines.push("", heading, "");
    for (const msg of channel.messages) {
      if (type === "mentions" && msg.author !== undefined) {
        lines.push(`- **${msg.time}** — @${escapeMarkdown(msg.author)}: ${msg.text}`);
      } else {
        lines.push(`- **${msg.time}** — ${msg.text}`);
      }
    }
  }

  const keysComment = `<!-- slack-keys: ${[...allKeys].join(",")} -->`;
  return `${withoutComment}${lines.join("\n")}\n${keysComment}\n`;
}

function buildContent(
  date: string,
  type: "mentions" | "my_messages",
  channels: ChannelMessages[],
  fetchedAt: string,
): string {
  const yamlType = type === "mentions" ? "slack-mentions" : "slack-my-messages";
  const h1 =
    type === "mentions"
      ? `# Slack Mentions — ${date}`
      : `# My Slack Messages — ${date}`;

  const lines: string[] = [
    "---",
    `date: ${date}`,
    `type: ${yamlType}`,
    `fetched_at: ${fetchedAt}`,
    "---",
    "",
    h1,
    "",
  ];

  const allKeys: string[] = [];

  for (const channel of channels) {
    const safeName = sanitizeChannelName(channel.channelName);
    const heading = channel.isDM
      ? `## DM with @${safeName}`
      : `## #${safeName}`;
    lines.push(heading, "");

    for (const msg of channel.messages) {
      allKeys.push(msg.dedupKey);
      if (type === "mentions" && msg.author !== undefined) {
        lines.push(`- **${msg.time}** — @${escapeMarkdown(msg.author)}: ${msg.text}`);
      } else {
        lines.push(`- **${msg.time}** — ${msg.text}`);
      }
    }
    lines.push("");
  }

  const keysList = allKeys.length > 0 ? allKeys.join(",") : "";
  lines.push(`<!-- slack-keys: ${keysList} -->`);
  return lines.join("\n") + "\n";
}
