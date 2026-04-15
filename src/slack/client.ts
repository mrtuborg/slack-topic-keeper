import { requestUrl } from "obsidian";

const BASE_URL = "https://slack.com/api/";

export class SlackAuthError extends Error {
  constructor(message = "Invalid Slack credentials") {
    super(message);
    this.name = "SlackAuthError";
  }
}

export class SlackNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlackNetworkError";
  }
}

export class SlackRateLimitError extends Error {
  retryAfter: number;
  constructor(retryAfter: number) {
    super("Slack rate limit exceeded");
    this.name = "SlackRateLimitError";
    this.retryAfter = retryAfter;
  }
}

export class SlackClient {
  private readonly token: string;

  constructor(token: string) {
    this.token = token;
  }

  async call(method: string, params: Record<string, string>): Promise<unknown> {
    if (!/^[a-zA-Z0-9_.]+$/.test(method)) {
      throw new Error("Invalid Slack API method name");
    }
    const url = `${BASE_URL}${method}`;
    let response: Awaited<ReturnType<typeof requestUrl>>;
    try {
      response = await requestUrl({
        url,
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(params),
      });
    } catch {
      throw new SlackNetworkError("Network error contacting Slack API");
    }

    if (response.status >= 500) {
      throw new SlackNetworkError(`Slack server error: HTTP ${response.status}`);
    }
    const data = response.json as { ok: boolean; error?: string } | null;
    if (data == null) {
      throw new SlackNetworkError("Slack returned a non-JSON response");
    }

    if (!data.ok) {
      if (data.error === "invalid_auth") {
        throw new SlackAuthError();
      }
      if (data.error === "ratelimited") {
        const raw =
          (response.headers?.["retry-after"] as string | undefined) ??
          (response.headers?.["Retry-After"] as string | undefined);
        const seconds = raw !== undefined ? parseInt(raw, 10) : 1;
        throw new SlackRateLimitError(Number.isFinite(seconds) ? seconds : 1);
      }
      throw new Error(`Slack API error: ${String(data.error)}`);
    }

    return data;
  }
}
