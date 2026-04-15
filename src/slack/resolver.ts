import type { SlackClient } from "./client";
import type { RateLimiter } from "./rate-limiter";

const CACHE_MAX = 10_000;

export class SlackResolver {
  private readonly channelCache = new Map<string, string>();
  private readonly userCache = new Map<string, string>();

  constructor(
    private readonly client: SlackClient,
    private readonly rateLimiter: RateLimiter,
  ) {}

  async resolveChannel(channelId: string): Promise<string> {
    if (this.channelCache.has(channelId)) {
      return this.channelCache.get(channelId)!;
    }
    try {
      const response = await this.rateLimiter.execute(() =>
        this.client.call("conversations.info", { channel: channelId }),
      );
      const data = response as { ok: boolean; channel?: { name?: string } };
      const name = data.channel?.name ?? channelId;
      // Only cache a real resolved name, not the fallback raw ID
      if (name !== channelId && this.channelCache.size < CACHE_MAX) {
        this.channelCache.set(channelId, name);
      }
      return name;
    } catch {
      return channelId;
    }
  }

  async resolveUser(userId: string): Promise<string> {
    if (this.userCache.has(userId)) {
      return this.userCache.get(userId)!;
    }
    try {
      const response = await this.rateLimiter.execute(() =>
        this.client.call("users.info", { user: userId }),
      );
      const data = response as { ok: boolean; user?: { real_name?: string; name?: string } };
      const name = data.user?.real_name || data.user?.name || userId;
      // Only cache a real resolved name, not the fallback raw ID
      if (name !== userId && this.userCache.size < CACHE_MAX) {
        this.userCache.set(userId, name);
      }
      return name;
    } catch {
      return userId;
    }
  }

  clearCache(): void {
    this.channelCache.clear();
    this.userCache.clear();
  }
}
