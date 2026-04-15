# Slack Topic Keeper — Test Specification

## 1. Overview

This document defines unit, integration, and manual test cases for the Slack Topic Keeper plugin. Tests are derived from the functional specification (func-spec.md) and development specification (dev-spec.md). Test IDs use the format `T-<module>-<number>`.

**Test runner:** vitest  
**Mocking:** vitest built-in `vi.fn()` / `vi.mock()`  
**Convention:** Each source module `src/<path>/<module>.ts` has a corresponding test at `src/<path>/<module>.test.ts`.

---

## 2. Mocking Strategy

| Dependency | Mock Approach |
|------------|---------------|
| `requestUrl` (from `obsidian`) | Module mock returning canned JSON responses |
| `Vault` API (`create`, `modify`, `read`, `adapter.exists`, `adapter.list`) | In-memory filesystem object |
| `Plugin` lifecycle (`loadData`, `saveData`) | Simple object store |
| `Notice` | Spy; capture message strings for assertion |
| `window.setInterval` / `clearInterval` | vitest fake timers |
| Date/time | vitest `vi.setSystemTime()` for deterministic dates |

---

## 3. Unit Tests — Slack Client (`src/slack/client.ts`)

### T-CLIENT-1: Successful API call

- **Setup:** Mock `requestUrl` to return `{ ok: true, messages: [...] }`.
- **Action:** Call `slackClient.searchMessages("from:U123", "2026-04-15")`.
- **Assert:** Returns parsed message array. `requestUrl` called with correct URL, `Authorization: Bearer <token>` header, and query params.

### T-CLIENT-2: Authentication failure

- **Setup:** Mock returns `{ ok: false, error: "invalid_auth" }`.
- **Action:** Call any client method.
- **Assert:** Throws `SlackAuthError` with message containing "invalid_auth".

### T-CLIENT-3: Network error

- **Setup:** Mock `requestUrl` throws (simulating no network).
- **Action:** Call any client method.
- **Assert:** Throws `SlackNetworkError`. No retry at client level (retry is rate-limiter's job).

### T-CLIENT-4: HTTPS enforcement

- **Action:** Inspect all URLs passed to `requestUrl` across all client methods.
- **Assert:** Every URL starts with `https://slack.com/api/`.

### T-CLIENT-5: Token not logged

- **Setup:** Enable console spy.
- **Action:** Trigger an error path that logs.
- **Assert:** Console output does not contain the token string.

---

## 4. Unit Tests — Rate Limiter (`src/slack/rate-limiter.ts`)

### T-RATE-1: Normal request passes through

- **Setup:** No prior requests.
- **Action:** Execute a function through the rate limiter.
- **Assert:** Function executes immediately; result returned.

### T-RATE-2: Retry-After header respected

- **Setup:** Mock function throws with `{ headers: { "retry-after": "3" } }` on first call, succeeds on second.
- **Action:** Execute through rate limiter.
- **Assert:** Waits ~3 s (fake timers), retries, returns success. Total calls = 2.

### T-RATE-3: Exponential backoff on repeated failures

- **Setup:** Mock function fails 3 times with rate-limit, succeeds on 4th.
- **Action:** Execute through rate limiter.
- **Assert:** Delays increase exponentially (1 s, 2 s, 4 s approx). Total calls = 4.

### T-RATE-4: Max backoff cap

- **Setup:** Mock function fails continuously.
- **Action:** Execute through rate limiter; observe delay growth.
- **Assert:** Delay never exceeds 60 s.

### T-RATE-5: Jitter applied

- **Action:** Record 10 delay calculations for the same retry count.
- **Assert:** Not all delays are identical (randomness present).

### T-RATE-6: Sequential execution

- **Action:** Queue 3 requests simultaneously.
- **Assert:** They execute one at a time, not in parallel.

---

## 5. Unit Tests — Search (`src/slack/search.ts`)

### T-SEARCH-1: Mentions query construction

- **Action:** Fetch mentions for user `U01ABC` on `2026-04-15`.
- **Assert:** API called with query `<@U01ABC>`, `after:2026-04-14`, `before:2026-04-16`.

### T-SEARCH-2: Authored messages query construction

- **Action:** Fetch authored messages for user `U01ABC` on `2026-04-15`.
- **Assert:** API called with query `from:<@U01ABC>`, `after:2026-04-14`, `before:2026-04-16`.

### T-SEARCH-3: Pagination — multiple pages

- **Setup:** Mock returns 2 pages of results (page 1 has `paging.pages = 2`).
- **Action:** Fetch mentions.
- **Assert:** Both pages fetched; results merged into single array.

### T-SEARCH-4: Pagination — single page

- **Setup:** Mock returns 1 page.
- **Action:** Fetch mentions.
- **Assert:** Only 1 API call made.

### T-SEARCH-5: Empty results

- **Setup:** Mock returns `{ ok: true, messages: { matches: [] } }`.
- **Action:** Fetch mentions.
- **Assert:** Returns empty array. No error thrown.

### T-SEARCH-6: DMs excluded when setting is off

- **Setup:** `includeDMs = false`.
- **Action:** Fetch messages; mock returns messages from DM channels (type `im`).
- **Assert:** DM messages are filtered out of the result.

---

## 6. Unit Tests — Resolver (`src/slack/resolver.ts`)

### T-RESOLVE-1: Channel name resolved

- **Setup:** Mock `conversations.info` returns `{ channel: { name: "general" } }`.
- **Action:** Resolve channel `C01ABC`.
- **Assert:** Returns `"general"`.

### T-RESOLVE-2: Cache hit (no API call)

- **Setup:** Resolve `C01ABC` twice.
- **Assert:** `requestUrl` called only once.

### T-RESOLVE-3: User name resolved

- **Setup:** Mock `users.info` returns `{ user: { real_name: "Alice Smith" } }`.
- **Action:** Resolve user `U01XYZ`.
- **Assert:** Returns `"Alice Smith"`.

### T-RESOLVE-4: Unknown channel fallback

- **Setup:** Mock returns error for channel ID.
- **Action:** Resolve channel.
- **Assert:** Returns the raw channel ID as fallback (e.g., `C01ABC`).

### T-RESOLVE-5: Unknown user fallback

- **Setup:** Mock returns error for user ID.
- **Action:** Resolve user.
- **Assert:** Returns the raw user ID as fallback (e.g., `U01XYZ`).

---

## 7. Unit Tests — Backfill (`src/sync/backfill.ts`)

### T-BACKFILL-1: All days present — no backfill

- **Setup:** Today is 2026-04-15, `backfillDays = 3`. Folders exist for 04-12, 04-13, 04-14 each containing both files. (Today is excluded — only completed past days are checked.)
- **Assert:** Returns empty array (no missing dates).

### T-BACKFILL-2: One day missing

- **Setup:** Same as above but 04-13 folder missing.
- **Assert:** Returns `["2026-04-13"]`.

### T-BACKFILL-3: All days missing

- **Setup:** No `slack/` folder exists at all. `backfillDays = 3`. Today is 2026-04-15.
- **Assert:** Returns `["2026-04-12", "2026-04-13", "2026-04-14"]` (oldest first). Today (04-15) is NOT included.

### T-BACKFILL-4: Partial files (only mentions.md)

- **Setup:** 04-13 folder exists with only `mentions.md`, no `my_messages.md`.
- **Assert:** Returns `["2026-04-13"]` (day is incomplete).

### T-BACKFILL-5: Respects backfillDays boundary

- **Setup:** `backfillDays = 2`. Today is 2026-04-15. Days 04-10 through 04-12 are missing.
- **Assert:** Returns only `["2026-04-13", "2026-04-14"]` (2-day window before today), not older ones.

### T-BACKFILL-6: Oldest-first ordering

- **Setup:** Multiple missing days.
- **Assert:** Returned array is sorted ascending by date.

### T-BACKFILL-7: Today is never included

- **Setup:** Today is 2026-04-15. `backfillDays = 1`. No folders exist.
- **Assert:** Returns `["2026-04-14"]` only. `"2026-04-15"` is NOT in the result.

---

## 8. Unit Tests — Writer (`src/sync/writer.ts`)

### T-WRITER-1: New file creation — mentions

- **Setup:** No existing file. Provide 3 messages from 2 channels.
- **Action:** Write mentions for 2026-04-15.
- **Assert:** File created at `slack/2026-04-15/mentions.md` with correct frontmatter, H1, H2 per channel, bullet list, and dedup comment.

### T-WRITER-2: New file creation — my_messages

- **Same as T-WRITER-1** but for `my_messages.md` with `type: slack-my-messages`.

### T-WRITER-3: Merge into existing file (append new messages)

- **Setup:** Existing file with 2 messages and dedup keys. Provide 3 messages (2 existing + 1 new).
- **Action:** Write.
- **Assert:** File now has 3 messages. Dedup keys updated. Existing messages unchanged.

### T-WRITER-4: Full duplicate — no changes

- **Setup:** Existing file with 2 messages. Provide the same 2 messages.
- **Action:** Write.
- **Assert:** File content unchanged (or only `fetched_at` updated).

### T-WRITER-5: Messages sorted by timestamp within channel

- **Setup:** Provide messages with timestamps out of order.
- **Action:** Write.
- **Assert:** Bullet items appear in chronological order.

### T-WRITER-6: Messages grouped by channel

- **Setup:** Provide messages from 3 channels interleaved.
- **Action:** Write.
- **Assert:** Each channel has its own H2 section; no interleaving.

### T-WRITER-7: Channel names used as headings

- **Setup:** Resolve channel C01 → "general", C02 → "random".
- **Assert:** Headings are `## #general` and `## #random`.

### T-WRITER-8: DM channel heading format

- **Setup:** Message from a DM channel with resolved user name "Bob".
- **Assert:** Heading is `## DM with @Bob`.

### T-WRITER-9: Dedup key format

- **Assert:** Comment matches `<!-- slack-keys: CH1/TS1,CH2/TS2,... -->` with no spaces around `/`.

### T-WRITER-10: Frontmatter correctness

- **Assert:** YAML frontmatter contains `date`, `type`, and `fetched_at` with ISO 8601 timestamp.

### T-WRITER-11: Special characters in message text

- **Setup:** Message containing `|`, `[`, `]`, `` ` ``, `<`, `>`.
- **Assert:** Characters are escaped so they don't break Markdown rendering.

### T-WRITER-12: Folder creation

- **Setup:** `slack/2026-04-15/` folder does not exist.
- **Action:** Write.
- **Assert:** Folder is created via Vault API before file write.

---

## 9. Unit Tests — Date Utilities (`src/util/date.ts`)

### T-DATE-1: Today's date string

- **Setup:** System time = 2026-04-15T10:00:00Z.
- **Assert:** `today()` returns `"2026-04-15"`.

### T-DATE-2: Date range generation

- **Action:** `dateRange("2026-04-13", "2026-04-15")`.
- **Assert:** Returns `["2026-04-13", "2026-04-14", "2026-04-15"]`.

### T-DATE-3: Timestamp formatting

- **Action:** Format Unix timestamp `1681560240` with format `"hh:mm A"`.
- **Assert:** Returns expected time string.

---

## 10. Unit Tests — Markdown Utilities (`src/util/markdown.ts`)

### T-MD-1: Escape Markdown special characters

- **Input:** `"Check [this link](http://x) and use \`code\`"`.
- **Assert:** Brackets and backticks are escaped.

### T-MD-2: Sanitize channel name for path

- **Input:** `"my/bad\\channel..name"`.
- **Assert:** Returns `"myбadchannel.name"` (slashes and `..` removed).

---

## 11. Unit Tests — Sync Engine (`src/sync/engine.ts`)

### T-ENGINE-1: Full sync — no missing days

- **Setup:** All previous days within backfill window are present in vault.
- **Action:** Run sync.
- **Assert:** No API calls made (nothing to fetch). Shows completion Notice with 0 new messages. Today is not fetched.

### T-ENGINE-2: Sync with backfill

- **Setup:** 2 past days missing within backfill window.
- **Action:** Run sync.
- **Assert:** Fetches for 2 dates. 4 files written (2 dates × 2 files). Today is not fetched.

### T-ENGINE-3: No config — skip with Notice

- **Setup:** Token is empty.
- **Action:** Run sync.
- **Assert:** No API calls made. Notice shown about missing configuration.

### T-ENGINE-4: Auth error — stop and notify

- **Setup:** API returns `invalid_auth`.
- **Action:** Run sync.
- **Assert:** Sync stops. Notice shows auth error message.

### T-ENGINE-5: Partial failure — some dates succeed

- **Setup:** 3 dates to sync. Date 2 returns network error, dates 1 and 3 succeed.
- **Action:** Run sync.
- **Assert:** Files written for dates 1 and 3. Notice reports failure for date 2.

### T-ENGINE-6: Concurrent sync prevention

- **Setup:** Start sync. Trigger another sync before first completes.
- **Assert:** Second sync is skipped / returns immediately without duplicate API calls.

### T-ENGINE-7: Empty results — still writes files

- **Setup:** API returns no messages for a date.
- **Action:** Run sync.
- **Assert:** Files are created with frontmatter and heading but no message bullets.

---

## 12. Unit Tests — Settings (`src/settings.ts`)

### T-SETTINGS-1: Default values

- **Action:** Load plugin with no `data.json`.
- **Assert:** All settings have their documented defaults.

### T-SETTINGS-2: Persistence round-trip

- **Action:** Change a setting value, save, reload.
- **Assert:** Reloaded value matches saved value.

### T-SETTINGS-3: Token prefix validation

- **Input:** Token `"not-a-token"`.
- **Assert:** Validation rejects or warns (does not start with `xoxp-` or `xoxb-`).

### T-SETTINGS-4: User ID format validation

- **Input:** User ID `"alice"`.
- **Assert:** Validation rejects or warns (does not match `U[A-Z0-9]+`).

---

## 13. Integration Tests (Manual — In Obsidian Dev Vault)

### T-INT-1: Fresh install and first sync

1. Install plugin in a vault with no `slack/` folder.
2. Configure valid token and user ID.
3. Reload Obsidian.
4. **Verify:** `slack/YYYY-MM-DD/mentions.md` and `my_messages.md` created for **yesterday** (and other missing past days within backfill window). No folder created for today.

### T-INT-2: Backfill on fresh install

1. Configure `backfillDays = 3`.
2. Reload Obsidian.
3. **Verify:** Folders created for up to 3 previous days (yesterday and earlier). No folder for today.

### T-INT-3: Incremental sync (re-run same day)

1. Run manual sync via command palette.
2. Run it again.
3. **Verify:** No duplicate messages. New messages (if any) appended.

### T-INT-4: Command palette entry

1. Open command palette.
2. Search "Slack".
3. **Verify:** "Sync Slack messages now" appears and executes.

### T-INT-5: Settings panel

1. Open Settings → Community plugins → Slack Topic Keeper.
2. **Verify:** All fields present, token masked, warning visible.
3. Change archive folder to `slack-archive`.
4. Run sync.
5. **Verify:** Files created under `slack-archive/`.

### T-INT-6: Network offline behavior

1. Disable network.
2. Trigger sync.
3. **Verify:** Error Notice shown. No crash. Existing files untouched.

### T-INT-7: Invalid token

1. Set token to `xoxp-invalid`.
2. Trigger sync.
3. **Verify:** Auth error Notice shown.

### T-INT-8: Cross-platform — iOS

1. Install plugin in vault synced to iOS device.
2. Open vault on iOS Obsidian.
3. **Verify:** Sync triggers on startup; files written correctly.

### T-INT-9: Cross-platform — Android

1. Same as T-INT-8 on Android device.
2. **Verify:** Sync triggers on startup; files written correctly.

### T-INT-10: Cross-platform — Windows

1. Open vault on Windows Obsidian.
2. **Verify:** Sync triggers; paths use forward slashes; files written correctly.

### T-INT-11: Cross-platform — Linux

1. Open vault on Linux Obsidian.
2. **Verify:** Sync triggers; files written correctly.

### T-INT-12: Periodic sync

1. Set `periodicSyncMinutes = 1`.
2. Wait > 1 minute.
3. **Verify:** Sync runs automatically (observe Notice or new messages in files).

---

## 14. Security Tests

### T-SEC-1: Token not in console logs

- **Action:** Trigger sync (success and failure paths) with console open.
- **Assert:** Token string never appears in console output.

### T-SEC-2: Path traversal via channel name

- **Setup:** Mock a channel name containing `../../etc`.
- **Action:** Write files.
- **Assert:** Sanitized path used; no file written outside `slack/` folder.

### T-SEC-3: Markdown injection via message text

- **Setup:** Message text is `"](evil) [click me](http://evil.com)"`.
- **Action:** Write file.
- **Assert:** Content is escaped; no unintended clickable link in rendered Markdown.

### T-SEC-4: HTTPS only

- **Action:** Audit all URLs in client code.
- **Assert:** All URLs use `https://` scheme. No `http://` fallback.

### T-SEC-5: No eval or dynamic code execution

- **Action:** Static analysis of bundled `main.js`.
- **Assert:** No `eval()`, `new Function()`, or `import()` with dynamic strings.

---

## 15. Edge Case Tests

### T-EDGE-1: Very long message text

- **Setup:** Message with 10,000 characters.
- **Assert:** Written to file without truncation or error.

### T-EDGE-2: Unicode in channel names and messages

- **Setup:** Channel name `"日本語チャンネル"`, message with emoji and CJK text.
- **Assert:** Written correctly; file readable in Obsidian.

### T-EDGE-3: Channel with no messages (only other date has messages)

- **Setup:** Date has mentions from 1 channel but authored messages from 0 channels.
- **Assert:** `my_messages.md` created with frontmatter/heading but empty body.

### T-EDGE-4: Hundreds of messages on a single day

- **Setup:** Mock 500 messages across 20 channels for one day.
- **Assert:** All messages written; pagination handled; no timeout or memory issue.

### T-EDGE-5: Midnight boundary

- **Setup:** Messages at 23:59 and 00:01 on adjacent days.
- **Assert:** Each message lands in the correct day's file.

### T-EDGE-6: Daylight saving time transition

- **Setup:** System time during a DST change day.
- **Assert:** Date calculation still produces correct `YYYY-MM-DD` strings (uses UTC internally).

### T-EDGE-7: `archiveFolder` with nested path

- **Setup:** Set `archiveFolder = "notes/slack/archive"`.
- **Assert:** Full path created; files written under `notes/slack/archive/YYYY-MM-DD/`.

### T-EDGE-8: Simultaneous Obsidian instances (sync conflict)

- **Setup:** Two devices sync the same vault; both run the plugin.
- **Assert:** Dedup prevents duplicate messages regardless of write order.
