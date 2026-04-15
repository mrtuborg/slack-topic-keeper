import type { SlackClient } from "./client";
import type { RateLimiter } from "./rate-limiter";
import type { SlackMessage } from "../types";

const PAGE_COUNT = 20;

interface SearchResponse {
  ok: boolean;
  messages: {
    matches: SlackMessage[];
    paging: {
      count: number;
      total: number;
      page: number;
      pages: number;
    };
  };
}

export class SlackSearch {
  constructor(
    private readonly client: SlackClient,
    private readonly rateLimiter: RateLimiter,
  ) {}

  async fetchMentions(
    userId: string,
    date: string,
    includeDMs = true,
  ): Promise<SlackMessage[]> {
    return this.search(`<@${userId}>`, date, includeDMs);
  }

  async fetchAuthored(
    userId: string,
    date: string,
    includeDMs = true,
  ): Promise<SlackMessage[]> {
    return this.search(`from:<@${userId}>`, date, includeDMs);
  }

  private async search(
    query: string,
    date: string,
    includeDMs: boolean,
  ): Promise<SlackMessage[]> {
    const { dateAfter, dateBefore } = buildDateRange(date);
    const fullQuery = `${query} after:${dateAfter} before:${dateBefore}`;

    const firstRaw = await this.rateLimiter.execute(() =>
      this.client.call("search.messages", {
        query: fullQuery,
        count: String(PAGE_COUNT),
        page: "1",
      }),
    );
    const firstPage = firstRaw as SearchResponse;
    const totalPages = firstPage.messages.paging.pages;
    const allMatches = [...firstPage.messages.matches];

    for (let page = 2; page <= totalPages; page++) {
      const raw = await this.rateLimiter.execute(() =>
        this.client.call("search.messages", {
          query: fullQuery,
          count: String(PAGE_COUNT),
          page: String(page),
        }),
      );
      const pageData = raw as SearchResponse;
      allMatches.push(...pageData.messages.matches);
    }

    if (!includeDMs) {
      return allMatches.filter((msg) => !msg.channel.is_im && !msg.channel.is_mpim);
    }

    return allMatches;
  }
}

// Note: `new Date("YYYY-MM-DD")` parses as UTC midnight, so all arithmetic
// must use UTC methods to avoid off-by-one errors in non-UTC timezones.
function buildDateRange(date: string): { dateAfter: string; dateBefore: string } {
  const d = new Date(date);
  const after = new Date(d);
  after.setUTCDate(after.getUTCDate() - 1);
  const before = new Date(d);
  before.setUTCDate(before.getUTCDate() + 1);
  return { dateAfter: formatDate(after), dateBefore: formatDate(before) };
}

function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
