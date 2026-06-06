# Getting Started

## Prerequisites

Before installing spotify-sync, make sure you have the following on your machine:

| Dependency | Minimum | Notes |
|---|---|---|
| **Node.js** | 24 | Check with `node --version`. Use [nvm](https://github.com/nvm-sh/nvm) to manage versions — a `.nvmrc` is included. |
| **yt-dlp** | 2026.01.01 | Used to download tracks. [Install instructions](#install-yt-dlp) below. |
| **ffmpeg** | any | Used for audio transcoding. [Install instructions](#install-ffmpeg) below. |

### Install yt-dlp

```bash
# macOS (Homebrew)
brew install yt-dlp

# Linux (pipx — recommended)
pipx install yt-dlp

# Linux (pip)
pip install yt-dlp

# Any platform — standalone binary
# https://github.com/yt-dlp/yt-dlp/releases/latest
```

After installing, verify the version is at least `2026.01.01`:

```bash
yt-dlp --version
```

### Install ffmpeg

```bash
# macOS (Homebrew)
brew install ffmpeg

# Debian / Ubuntu
sudo apt install ffmpeg

# Any platform — https://ffmpeg.org/download.html
```

---

## Install spotify-sync

```bash
npm install -g spotify-sync
spotify-sync --help
```

The examples below use the global `spotify-sync` binary.

### Alternative: install from source

Use the source setup only if you are contributing to spotify-sync or want to run an
unpublished checkout. This installs dependencies and builds from source:

```bash
git clone https://github.com/sagivoulu/spotify-sync.git
cd spotify-sync

nvm use
npm run setup
./bin/spotify-sync --help
```

---

## Set up Spotify credentials

spotify-sync uses Spotify's OAuth 2.0 PKCE flow. This is a one-time setup.

### 1. Register a Spotify developer app

Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) and click **Create app**.

Suggested values:

| Field | Value |
|---|---|
| App name | `spotify-sync` |
| App description | `CLI tool to sync a Spotify playlist to a local music library` |
| Website | *(leave blank)* |
| Which API/SDKs | *Web API* only |

Under **Redirect URIs**, add exactly:

```
http://127.0.0.1:8888/callback
```

::: warning Use the IP address, not `localhost`
Spotify requires the literal loopback IP `127.0.0.1`. Entering `localhost` will cause
the OAuth callback to fail. Spotify will also show a "redirect URI is not secure" warning
because the URI uses `http://` — this is expected and safe to ignore. Traffic to
`127.0.0.1` never leaves your machine, and Spotify explicitly allows `http://` for
loopback addresses.
:::

Note your **Client ID** and **Client Secret** from the app settings page.

### 2. Create the config file

Create `~/.config/spotify-sync/config.json`:

```json
{
  "spotify": {
    "client_id": "YOUR_CLIENT_ID",
    "client_secret": "YOUR_CLIENT_SECRET",
    "playlist_url": "https://open.spotify.com/playlist/..."
  },
  "library": {
    "path": "/path/to/your/music"
  }
}
```

Replace `YOUR_CLIENT_ID`, `YOUR_CLIENT_SECRET`, and the playlist URL with your values.

Alternatively, you can set credentials via environment variables — see [Configuration](/configuration#environment-variables).

---

## First-run walkthrough

Follow these three steps in order:

### Step 1 — Authenticate

```bash
spotify-sync auth
```

Your browser opens to Spotify's consent page. After approving, the terminal prints a success
message and saves the refresh token to `~/.config/spotify-sync/auth.json` (mode `0600`,
readable only by you).

::: tip Port conflict?
If port 8888 is already in use, pass `--port <n>` and update the redirect URI in your
Spotify app settings to `http://127.0.0.1:<n>/callback`.
:::

### Step 2 — Verify setup

```bash
spotify-sync doctor
```

This checks your config, authentication, Spotify connectivity, and whether `yt-dlp` and
`ffmpeg` are available. All checks should pass before you run sync.

### Step 3 — Sync your playlist

```bash
spotify-sync sync
```

spotify-sync fetches your Spotify playlist, compares it against what's already on disk, and
downloads every track that's missing. Progress is printed to the terminal. Re-running sync is
safe — it only downloads tracks you don't already have.

---

## Next steps

- [Configuration reference](/configuration) — tune download quality, concurrency, and paths
- [Command reference](/commands/sync) — all flags and exit codes for each command
- [Troubleshooting](/troubleshooting) — common failures and fixes
