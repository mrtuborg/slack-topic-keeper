# Slack Topic Keeper — User Guide

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Installing the Plugin](#2-installing-the-plugin)
3. [Creating a Slack App](#3-creating-a-slack-app)
4. [First-Time Configuration](#4-first-time-configuration)
5. [Using the Plugin](#5-using-the-plugin)
6. [Understanding the Output Files](#6-understanding-the-output-files)
7. [Settings Reference](#7-settings-reference)
8. [Troubleshooting](#8-troubleshooting)
9. [Security Notes](#9-security-notes)

---

## 1. Prerequisites

- **Obsidian 1.0.0 or later**
- A **Slack workspace** you belong to (free or paid)
- Ability to create a Slack App in that workspace (most workspaces allow this by default; some enterprise grids restrict it — check with your admin)

---

## 2. Installing the Plugin

This plugin is not yet listed in the Obsidian Community Plugins directory, so installation is manual.

1. Go to the [latest release](https://github.com/your-repo/slack-topic-keeper/releases/latest) and download:
   - `main.js`
   - `manifest.json`
   - `styles.css`

2. Locate your vault folder on disk. Inside it, navigate to (or create):
   ```
   <your-vault>/.obsidian/plugins/slack-topic-keeper/
   ```

3. Copy the three downloaded files into that folder.

4. In Obsidian, open **Settings** (gear icon) → **Community plugins**.

5. If you see a "Safe mode" banner, click **Turn on community plugins**.

6. Under **Installed plugins**, find **Slack Topic Keeper** and toggle it on.

You should see a brief notice confirming the plugin loaded. If not, try restarting Obsidian.

---

## 3. Creating a Slack App

You need a Slack App to generate a token that lets the plugin read your messages. You only do this once.

### 3.1 Create the App

1. Go to <https://api.slack.com/apps> and click **Create New App**.
2. Choose **From scratch**.
3. Give it any name (e.g. `Obsidian Archiver`) and select the workspace you want to archive.
4. Click **Create App**.

### 3.2 Add Token Scopes

1. In the left sidebar click **OAuth & Permissions**.
2. Scroll to **Scopes** → **User Token Scopes** and add all of the following:

   | Scope | What it allows |
   |---|---|
   | `search:read` | Search messages you authored or were mentioned in |
   | `channels:history` | Read messages in public channels |
   | `groups:history` | Read messages in private channels you belong to |
   | `im:history` | Read direct messages (required if "Include DMs" is on) |
   | `mpim:history` | Read group direct messages |
   | `channels:read` | Resolve channel IDs to names |
   | `users:read` | Resolve user IDs to display names |

   > **Note:** The `im:history` and `mpim:history` scopes are only needed when **Include DMs** is enabled in the plugin settings. If you don't want to archive DMs you can skip them.

3. Click **Install to Workspace** (at the top of the page) and click **Allow**.

### 3.3 Copy Your Token

After installing, you are redirected back to the **OAuth & Permissions** page. Copy the **User OAuth Token** — it begins with `xoxp-`.  
Store it somewhere temporary (clipboard is fine); you will paste it into the plugin settings next.

### 3.4 Find Your Member ID

1. Open Slack and click your name/avatar at the top of the sidebar to open your profile.
2. Click **⋯** (More options).
3. Click **Copy member ID**.

The ID looks like `U01AB2CD3EF` — it starts with `U`.

---

## 4. First-Time Configuration

1. In Obsidian, open **Settings** → **Community plugins** → **Slack Topic Keeper** (click the gear icon next to the toggle).

2. Fill in the two required fields:

   | Field | What to paste |
   |---|---|
   | **Slack Token** | The `xoxp-…` token from step 3.3 |
   | **Slack User ID** | The `U…` member ID from step 3.4 |

3. Review the optional settings (see [Settings Reference](#7-settings-reference)) and adjust if needed. The defaults work for most people.

4. Close Settings. The plugin will run its first sync automatically within a few seconds and show a notice when it finishes.

---

## 5. Using the Plugin

### Automatic sync on startup

Every time Obsidian starts, the plugin checks which past days (up to `Backfill Days` back) are not yet in your archive folder and fetches them automatically. Today is never fetched — the day is still in progress.

No action is required from you.

### Manual sync

To trigger a sync at any time:

1. Open the command palette: `Cmd+P` (macOS) or `Ctrl+P` (Windows/Linux).
2. Type `Slack` and select **Sync Slack messages now**.

A notice appears while the sync runs and another when it completes.

### Periodic sync

To keep your archive up to date throughout the day:

1. Open **Settings** → **Slack Topic Keeper**.
2. Set **Periodic sync (minutes)** to a value greater than `0` (e.g. `60` for hourly).

The plugin will sync in the background on that interval. Set it back to `0` to disable.

---

## 6. Understanding the Output Files

For each archived day the plugin creates a subfolder inside your archive folder and writes two files:

```
slack/
└── 2026-04-14/
    ├── mentions.md      ← messages where you were @mentioned
    └── my_messages.md   ← messages you sent
```

### mentions.md

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
```

### my_messages.md

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
```

Messages inside each file are grouped by channel and sorted chronologically. The YAML frontmatter makes the files queryable with Dataview or other plugins.

### Re-syncing a day

If you run a sync when a file already exists for a given day, the plugin **merges** new messages in without creating duplicates. It is safe to sync the same day multiple times.

---

## 7. Settings Reference

| Setting | Default | Description |
|---|---|---|
| **Slack Token** | _(required)_ | Your `xoxp-` User OAuth Token. Masked; click the eye icon to reveal. |
| **Slack User ID** | _(required)_ | Your Slack member ID (starts with `U`). |
| **Archive folder** | `slack` | Vault folder where daily note subfolders are created. No leading slash. |
| **Backfill days** | `7` | How many past completed days to check on each sync. Range: 1–90. |
| **Periodic sync (minutes)** | `0` | Sync automatically every N minutes while Obsidian is open. `0` disables periodic sync. |
| **Timestamp format** | `hh:mm A` | [Moment.js format string](https://momentjs.com/docs/#/displaying/format/) for message timestamps. Examples: `HH:mm` (24-hour), `h:mm a` (12-hour lowercase). |
| **Include thread replies** | off | When on, threaded replies to matching messages are also archived. |
| **Include DMs** | on | When off, direct messages and group DMs are excluded (and you can omit `im:history` / `mpim:history` scopes from your token). |
| **Show notices** | on | Show sync status toasts inside Obsidian. Errors are always logged to the developer console regardless of this setting. |

---

## 8. Troubleshooting

### "Configure your token and user ID in settings" notice on startup

The plugin detected that the required fields are empty. Open **Settings → Slack Topic Keeper** and fill in your token and user ID.

### "Invalid or expired Slack token" notice

- The token may have expired. Go to <https://api.slack.com/apps>, select your app, open **OAuth & Permissions**, and reinstall the app to generate a new token.
- Double-check that you copied the **User OAuth Token** (starts with `xoxp-`), not the Bot Token.

### Sync completes but no files appear

- Confirm the **Archive folder** setting matches an existing (or writable) path in your vault.
- Verify that the **Backfill days** window covers the dates you expect. If you want to fetch data older than 7 days, increase the value.
- Check that the `search:read` scope is present on your token — without it, no messages are returned.

### Some channels show IDs instead of names (e.g. `#C01ABC123`)

The `channels:read` scope is missing from your token. Add it in **OAuth & Permissions** and reinstall the app.

### DMs are missing

- Confirm **Include DMs** is toggled on in settings.
- Verify that your token has the `im:history` and `mpim:history` scopes.

### "Rate limited, pausing…" notice

Slack's API has request limits. The plugin backs off automatically and retries. If this notice appears frequently, increase the **Periodic sync** interval (or disable it) to reduce API load.

### Checking the developer console

For detailed error messages: open Obsidian's developer tools with `Cmd+Option+I` (macOS) or `Ctrl+Shift+I` (Windows/Linux) and check the **Console** tab.

---

## 9. Security Notes

- Your Slack token is stored in **`<vault>/.obsidian/plugins/slack-topic-keeper/data.json`** in plain text.
  - If your vault syncs to a cloud service (iCloud, Dropbox, Google Drive, Obsidian Sync, etc.) the token travels with it.
  - To prevent this, add `data.json` to your cloud provider's ignore list, or keep your vault in a local-only location.
- The plugin communicates **only** with `https://slack.com/api/` — no data is sent to any other endpoint.
- The token is never written to Obsidian's console or included in error messages.
- If you stop using the plugin or share your vault, revoke the token at <https://api.slack.com/apps> → **OAuth & Permissions** → **Revoke Token**.
