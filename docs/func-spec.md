# Slack Topic Keeper — Functional Specification

## 1. Purpose

The plugin automatically archives Slack messages involving the user into the Obsidian vault as daily Markdown files. It enables users to search, link, and reference their Slack conversations within their knowledge base without leaving Obsidian.

---

## 2. User Roles

| Role | Description |
|------|-------------|
| Vault owner | The single user who installs the plugin, configures their Slack token, and uses the archived messages. Multi-user is out of scope. |

---

## 3. Functional Requirements

### FR-1: Automatic Sync on Startup

- **Trigger:** Every time Obsidian finishes loading (layout ready).
- **Behavior:** The plugin identifies all **completed past days** (yesterday and earlier) within the `backfillDays` window that are missing from the vault, fetches their Slack messages, and writes them. **Today is never fetched** because the day is still in progress and its data is incomplete.
- **Precondition:** Slack token and user ID are configured. If not, a Notice is shown directing the user to settings; no sync occurs.

### FR-2: Manual Sync via Command Palette

- **Trigger:** User executes "Sync Slack messages now" from the command palette (Ctrl/Cmd+P).
- **Behavior:** Identical to startup sync — fetches all missing completed past days within the backfill window. Today is excluded.
- **Feedback:** A Notice appears when sync starts and when it completes (or fails).

### FR-3: Periodic Sync (Optional)

- **Trigger:** Repeating timer, interval configured in settings (`periodicSyncMinutes`).
- **Behavior:** If the interval is > 0, the plugin re-syncs on that cadence. If 0, periodic sync is disabled.
- **Constraint:** Only one sync operation runs at a time. If a sync is already in progress, a subsequent trigger is skipped.

### FR-4: Backfill Missing Days

- **Trigger:** During any sync operation.
- **Behavior:** The plugin scans the archive folder for the last N **completed** days — from yesterday back through `backfillDays` days ago. For each day where the expected files (`mentions.md`, `my_messages.md`) are missing, it fetches and generates them. Today (the current, incomplete day) is always excluded.
- **Order:** Backfill processes dates oldest-first.
- **Scope:** Only completed dates within the `backfillDays` window are checked. Older gaps and today are ignored.

### FR-5: Fetch Mentions

- **Data:** All Slack messages in which the configured user is @mentioned.
- **Source:** `search.messages` API with query targeting user mentions.
- **Scope:** Public channels, private channels (if token has access), group DMs, and direct messages (if `includeDMs` is enabled).
- **Output:** Written to `<archiveFolder>/YYYY-MM-DD/mentions.md`.

### FR-6: Fetch Authored Messages

- **Data:** All Slack messages authored by the configured user.
- **Source:** `search.messages` API with `from:<userId>` query.
- **Scope:** Same as FR-5.
- **Output:** Written to `<archiveFolder>/YYYY-MM-DD/my_messages.md`.

### FR-7: Markdown File Structure

Each generated file contains:

1. **YAML frontmatter** with `date`, `type`, and `fetched_at` fields.
2. **H1 heading** with the file type and date.
3. **H2 headings** per channel (using resolved channel name, e.g., `## #general`).
4. **Bullet list** of messages under each channel, sorted chronologically:
   - `mentions.md`: `- **HH:MM AM/PM** — @author: message text`
   - `my_messages.md`: `- **HH:MM AM/PM** — message text`
5. **Dedup metadata** — hidden HTML comment at end of file containing message keys.

### FR-8: Message Deduplication

- If a file already exists for a given date, the plugin reads existing message keys from the dedup comment block.
- New messages are appended to the appropriate channel section; duplicates are skipped.
- The dedup block is updated with all keys after merge.
- Key format: `channel_id/message_ts` (Slack's unique tuple).

### FR-9: Channel and User Name Resolution

- Channel IDs from Slack API responses are resolved to human-readable names (`#channel-name`).
- User IDs in mention messages are resolved to display names (`@alice`).
- Resolutions are cached in memory for the duration of the sync to minimize API calls.

### FR-10: Thread Replies (Optional)

- When `includeThreadReplies` is enabled, threaded replies to matching messages are also fetched and included.
- When disabled (default), only top-level messages are archived.

### FR-11: Configurable Timestamp Format

- Message timestamps are formatted using the `timestampFormat` setting.
- Default: `hh:mm A` (12-hour with AM/PM).
- Accepts moment-compatible format strings.

### FR-12: Configurable Archive Folder

- The root folder for all generated files defaults to `slack` but can be changed via `archiveFolder` setting.
- The plugin creates the folder and date subfolders automatically if they don't exist.

---

## 4. Settings Panel

The plugin provides a settings tab accessible via Obsidian's Settings → Community plugins → Slack Topic Keeper.

| Field | Input Type | Validation | Notes |
|-------|-----------|------------|-------|
| Slack Token | Password text | Non-empty; starts with `xoxp-` or `xoxb-` | Masked by default; toggle to reveal |
| Slack User ID | Text | Non-empty; matches `U[A-Z0-9]+` pattern | Help text explains how to find it |
| Backfill Days | Number slider | 1–90 | Default: 7 |
| Archive Folder | Text | Valid vault path (no leading `/`) | Default: `slack` |
| Periodic Sync (minutes) | Number | 0–1440 (0 = disabled) | Default: 0 |
| Timestamp Format | Text | Non-empty | Default: `hh:mm A` |
| Include Thread Replies | Toggle | — | Default: off |
| Include DMs | Toggle | — | Default: on |
| Show Notices | Toggle | — | Default: on |

### 4.1 Token Security Warning

The settings panel displays a prominent warning:

> ⚠️ Your Slack token is stored in the vault's plugin data file (`data.json`). If your vault syncs to a cloud service, the token travels with it. Keep your vault storage private.

---

## 5. User-Visible Notifications

| Event | Notice Text | Duration |
|-------|-------------|----------|
| Sync started | "Slack sync: fetching messages…" | Until completion |
| Sync completed | "Slack sync: done — N new messages archived" | 5 s |
| Sync failed (network) | "Slack sync failed: network error. Will retry on next trigger." | 8 s |
| Sync failed (auth) | "Slack sync failed: invalid or expired Slack token." | 10 s |
| Sync failed (rate limit) | "Slack sync: rate limited, pausing…" | 5 s |
| No config | "Slack Topic Keeper: configure your token and user ID in settings." | 10 s |
| Partial failure | "Slack sync: completed with errors for dates: YYYY-MM-DD, …" | 8 s |

Notices are suppressed when `showNotices` is disabled. Errors are always logged to the developer console regardless of the setting.

---

## 6. File Output Examples

### 6.1 `slack/2026-04-14/mentions.md`

```markdown
---
date: "2026-04-14"
type: slack-mentions
fetched_at: "2026-04-15T08:32:00Z"
---

# Slack Mentions — 2026-04-14

## #engineering

- **10:04 AM** — @alice: Hey @you, can you review the PR?
- **11:22 AM** — @bob: @you FYI the deploy is done.

## #design

- **02:15 PM** — @carol: @you thoughts on the mockup?

<!-- slack-keys: C01ABC123/1681560240.000100,C01ABC123/1681560300.000200,C02DEF456/1681575300.000100 -->
```

### 6.2 `slack/2026-04-14/my_messages.md`

```markdown
---
date: "2026-04-14"
type: slack-my-messages
fetched_at: "2026-04-15T08:32:00Z"
---

# My Slack Messages — 2026-04-14

## #engineering

- **10:12 AM** — Sure, looking at it now.
- **11:30 AM** — Deployed to staging.

## DM with @bob

- **03:00 PM** — Can you re-check the config?

<!-- slack-keys: C01ABC123/1681560360.000100,C01ABC123/1681560600.000100,D03GHI789/1681578000.000100 -->
```

---

## 7. Constraints & Non-Functional Requirements

| Requirement | Detail |
|-------------|--------|
| **Platform independence** | Identical behavior on macOS, Windows, Linux, iOS, and Android. No OS-specific code paths for core functionality. |
| **No external dependencies at runtime** | The plugin ships as a single `main.js` file. No native modules, no WASM, no runtime npm packages. |
| **No external processes** | No shell scripts, no OS automation, no child processes. Everything runs inside Obsidian's JS sandbox. |
| **Vault API only for filesystem** | All reads/writes go through Obsidian's Vault API. No direct `fs` access. |
| **HTTPS only** | All network calls target `https://slack.com/api/*`. |
| **Startup performance** | Sync runs after layout ready, not during Obsidian's load phase. Plugin activation must not add perceptible delay to startup. |
| **Graceful degradation** | Network failures, auth errors, and partial API failures do not crash the plugin or corrupt existing files. |
| **Idempotency** | Running sync multiple times for the same day produces the same output (modulo new messages arriving). |

---

## 8. Out of Scope

- Sending messages to Slack from Obsidian.
- Real-time streaming (WebSocket / RTM API).
- Archiving messages from channels the user is not involved in.
- Multi-workspace / multi-token support (single Slack workspace per vault).
- Editing or deleting archived messages after they are written.
- Rich media attachments (images, files) — only message text is archived.
- Slack emoji rendering — emoji shortcodes are written as-is (e.g., `:thumbsup:`).
