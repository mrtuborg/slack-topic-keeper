import type { PluginSettings } from "../settings";
import type { SlackSearch } from "../slack/search";
import type { SlackResolver } from "../slack/resolver";
import type { SlackMessage } from "../types";
import { escapeMarkdown } from "../util/markdown";
import { formatTimestamp } from "../util/date";
import type { MarkdownWriter, ChannelMessages, FormattedMessage } from "./writer";
import type { BackfillDetector } from "./backfill";
import { SlackAuthError, SlackNetworkError, SlackRateLimitError } from "../slack/client";

export type SyncErrorKind = "auth" | "rate-limit" | "network" | "unknown";

export interface SyncResult {
  successDates: string[];
  failedDates: { date: string; error: string; kind: SyncErrorKind }[];
  newMessageCount: number;
}

export class SyncEngine {
  private _syncing = false;

  constructor(
    private readonly settings: PluginSettings,
    private readonly search: SlackSearch,
    private readonly writer: MarkdownWriter,
    private readonly backfillDetector?: BackfillDetector,
    private readonly resolver?: SlackResolver,
  ) {}

  /**
   * Sync a specific list of dates using `writer.write` (skips existing files).
   * Kept for backward compatibility and direct use.
   */
  async sync(dates: string[]): Promise<SyncResult> {
    if (this._syncing) {
      return { successDates: [], failedDates: [], newMessageCount: 0 };
    }
    this._syncing = true;
    try {
      this.resolver?.clearCache();
      if (!this.settings.slackToken || !this.settings.slackUserId) {
        return {
          successDates: [],
          failedDates: dates.map((date) => ({
            date,
            error: "Missing Slack token or user ID — configure plugin settings.",
            kind: "unknown" as SyncErrorKind,
          })),
          newMessageCount: 0,
        };
      }

      const result: SyncResult = { successDates: [], failedDates: [], newMessageCount: 0 };
      const { slackUserId, includeDMs, timestampFormat } = this.settings;

      for (const date of dates) {
        try {
          const mentions = await this.search.fetchMentions(slackUserId, date, includeDMs);
          const authored = await this.search.fetchAuthored(slackUserId, date, includeDMs);

          const fetchedAt = new Date().toISOString();
          await this.writer.write(
            date,
            "mentions",
            await groupAndFormat(mentions, "mentions", timestampFormat, this.resolver),
            fetchedAt,
          );
          await this.writer.write(
            date,
            "my_messages",
            await groupAndFormat(authored, "my_messages", timestampFormat, this.resolver),
            fetchedAt,
          );

          result.newMessageCount += mentions.length + authored.length;
          result.successDates.push(date);
        } catch (err) {
          const kind: SyncErrorKind =
            err instanceof SlackAuthError ? "auth" :
            err instanceof SlackRateLimitError ? "rate-limit" :
            err instanceof SlackNetworkError ? "network" :
            "unknown";
          result.failedDates.push({
            date,
            error: err instanceof Error ? err.message : String(err),
            kind,
          });
        }
      }

      return result;
    } finally {
      this._syncing = false;
    }
  }

  /**
   * Detects missing dates via BackfillDetector, then syncs them using
   * `writer.writeOrMerge` (dedup-aware). Concurrent calls are no-ops.
   */
  async syncAll(): Promise<SyncResult> {
    if (this._syncing) {
      return { successDates: [], failedDates: [], newMessageCount: 0 };
    }
    this._syncing = true;
    try {
      this.resolver?.clearCache();
      const dates = this.backfillDetector
        ? await this.backfillDetector.getMissingDates(this.settings.backfillDays)
        : [];

      if (!this.settings.slackToken || !this.settings.slackUserId) {
        return {
          successDates: [],
          failedDates: dates.map((date) => ({
            date,
            error: "Missing Slack token or user ID — configure plugin settings.",
            kind: "unknown" as SyncErrorKind,
          })),
          newMessageCount: 0,
        };
      }

      const result: SyncResult = { successDates: [], failedDates: [], newMessageCount: 0 };
      const { slackUserId, includeDMs, timestampFormat } = this.settings;

      for (const date of dates) {
        try {
          const mentions = await this.search.fetchMentions(slackUserId, date, includeDMs);
          const authored = await this.search.fetchAuthored(slackUserId, date, includeDMs);
          const fetchedAt = new Date().toISOString();

          const mentionsNew = await this.writer.writeOrMerge(
            date,
            "mentions",
            await groupAndFormat(mentions, "mentions", timestampFormat, this.resolver),
            fetchedAt,
          );
          const authoredNew = await this.writer.writeOrMerge(
            date,
            "my_messages",
            await groupAndFormat(authored, "my_messages", timestampFormat, this.resolver),
            fetchedAt,
          );

          result.newMessageCount += mentionsNew + authoredNew;
          result.successDates.push(date);
        } catch (err) {
          const kind: SyncErrorKind =
            err instanceof SlackAuthError ? "auth" :
            err instanceof SlackRateLimitError ? "rate-limit" :
            err instanceof SlackNetworkError ? "network" :
            "unknown";
          result.failedDates.push({
            date,
            error: err instanceof Error ? err.message : String(err),
            kind,
          });
        }
      }

      return result;
    } finally {
      this._syncing = false;
    }
  }
}

async function groupAndFormat(
  messages: SlackMessage[],
  type: "mentions" | "my_messages",
  tsFormat: string,
  resolver?: SlackResolver,
): Promise<ChannelMessages[]> {
  const channelMap = new Map<
    string,
    { name: string; isDM: boolean; messages: SlackMessage[] }
  >();

  for (const msg of messages) {
    if (!channelMap.has(msg.channel.id)) {
      const name = resolver
        ? await resolver.resolveChannel(msg.channel.id)
        : msg.channel.name;
      channelMap.set(msg.channel.id, {
        name,
        isDM: !!(msg.channel.is_im || msg.channel.is_mpim),
        messages: [],
      });
    }
    channelMap.get(msg.channel.id)!.messages.push(msg);
  }

  const result: ChannelMessages[] = [];
  for (const ch of channelMap.values()) {
    const sorted = [...ch.messages].sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));
    const formatted: FormattedMessage[] = [];
    for (const msg of sorted) {
      const author =
        type === "mentions"
          ? resolver
            ? await resolver.resolveUser(msg.user)
            : (msg.username ?? msg.user)
          : undefined;
      formatted.push({
        time: formatTimestamp(msg.ts, tsFormat),
        author,
        text: escapeMarkdown(msg.text),
        dedupKey: `${msg.channel.id}/${msg.ts}`,
      });
    }
    result.push({ channelName: ch.name, isDM: ch.isDM, messages: formatted });
  }
  return result;
}
