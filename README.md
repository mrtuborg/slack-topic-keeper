# Slack Topic Keeper

Obsidian plugin that archives your Slack mentions and messages as daily Markdown notes.

## Features

- **Automatic sync on startup** — missing past days are backfilled when Obsidian opens
- **Manual sync** — trigger at any time via the command palette
- **Optional periodic sync** — runs in the background on a configurable interval
- **Backfill** — fetch any number of past days you may have missed
- **Deduplication** — re-syncing the same day never creates duplicate entries
- **Configurable** — archive folder, timestamp format, backfill range, and more
- **Cross-platform** — works on macOS, Windows, Linux, iOS, and Android

## Installation

> **Note:** This plugin is not yet listed in the Obsidian Community Plugins directory. Install it manually.

1. Download the latest release assets: `main.js`, `manifest.json`, `styles.css`
2. Create the folder `<vault>/.obsidian/plugins/slack-topic-keeper/`
3. Copy the three files into that folder
4. In Obsidian, go to **Settings → Community plugins**, disable Safe mode if prompted, and enable **Slack Topic Keeper**

## Slack App Setup

1. Go to <https://api.slack.com/apps> and click **Create New App** → **From scratch**
2. Under **OAuth & Permissions**, add the following **User Token Scopes**:
   - `search:read`
   - `channels:history`
   - `groups:history`
   - `im:history`
   - `mpim:history`
   - `channels:read`
   - `users:read`
3. Click **Install to Workspace** and authorize
4. Copy the **User OAuth Token** (starts with `xoxp-`)
5. Find your **Slack Member ID**: open your Slack profile → **⋯** → **Copy member ID**

## Configuration

1. Open **Settings → Community plugins → Slack Topic Keeper**
2. Paste your **Slack Token** (`xoxp-…`) and **User ID** (`U…`)
3. Adjust optional settings:

| Setting | Default | Description |
|---|---|---|
| Archive folder | `slack` | Vault folder where daily notes are written |
| Backfill days | `7` | How many past days to fetch on first run |
| Periodic sync (minutes) | `0` (disabled) | Sync automatically every N minutes; `0` = off |
| Timestamp format | `HH:mm` | Format for message timestamps inside notes |
| Show notices | `true` | Display sync status notices in Obsidian |

## Usage

- **Startup sync** — the plugin automatically fetches messages for any days not yet archived
- **Manual sync** — open the command palette (`Cmd/Ctrl+P`) and run **Sync Slack messages now**
- **Output files** — two Markdown files are written per day:
  - `<archive-folder>/YYYY-MM-DD/mentions.md` — messages where you were mentioned
  - `<archive-folder>/YYYY-MM-DD/my_messages.md` — messages you sent

## Security

> ⚠️ **Token storage warning:** Your Slack token is stored in `data.json` inside your vault. If you sync your vault to a cloud service (iCloud, Dropbox, Google Drive, etc.), the token travels with it. Keep your vault storage private or exclude `data.json` from sync.

- The plugin communicates **only** with `https://slack.com/api/` — no other endpoints.
- The token is **never** logged to the console or included in error messages.

## Documentation

For a full step-by-step walkthrough, see the [User Guide](docs/user-guide.md).

## License

MIT — see [LICENSE](LICENSE)
