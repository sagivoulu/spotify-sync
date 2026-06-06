# Configuration

spotify-sync is configured via a JSON file, environment variables, and CLI flags. Settings
are resolved in this order — **higher items win**:

1. **CLI flags** (highest priority)
2. **Environment variables**
3. **Config file**
4. **Defaults** (lowest priority)

---

## Config file

**Location:** `~/.config/spotify-sync/config.json`

The exact path is `$XDG_CONFIG_HOME/spotify-sync/config.json`. On most systems
`$XDG_CONFIG_HOME` defaults to `~/.config`.

A missing config file is not an error — spotify-sync will use environment variables and
defaults for any fields not explicitly set.

### Minimal config

The four fields below are required. Everything else has a sensible default.

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

### Full config with defaults shown

```json
{
  "spotify": {
    "client_id": "YOUR_CLIENT_ID",
    "client_secret": "YOUR_CLIENT_SECRET",
    "playlist_url": "https://open.spotify.com/playlist/..."
  },
  "library": {
    "id": "default",
    "path": "/path/to/your/music"
  },
  "download": {
    "backend": "yt-dlp",
    "format": "mp3",
    "bitrate_kbps": 320,
    "concurrency": 3,
    "retry_count": 3,
    "search_source": "youtube-music"
  },
  "logging": {
    "level": "info",
    "max_run_logs": 20
  }
}
```

---

## Config field reference

### `spotify`

| Field | Type | Required | Description |
|---|---|---|---|
| `spotify.client_id` | string | **Yes** | OAuth client ID from your Spotify developer app. |
| `spotify.client_secret` | string | **Yes** | OAuth client secret. Used for token validation (not sent in the PKCE exchange). |
| `spotify.playlist_url` | string | **Yes** | Full Spotify playlist URL, e.g. `https://open.spotify.com/playlist/...`. |

### `library`

| Field | Type | Default | Description |
|---|---|---|---|
| `library.path` | string | **Required** | Absolute path to the directory where downloaded tracks are stored. |
| `library.id` | string | `"default"` | Logical library name. Reserved for future multi-library support; leave as `"default"` for now. |

### `download`

| Field | Type | Default | Description |
|---|---|---|---|
| `download.backend` | string | `"yt-dlp"` | Download backend. Only `"yt-dlp"` is supported in v1. |
| `download.format` | string | `"mp3"` | Output audio format. |
| `download.bitrate_kbps` | number | `320` | Target bitrate in kbps. Must be a positive integer. |
| `download.concurrency` | number | `3` | Number of tracks to download in parallel. Must be a positive integer. |
| `download.retry_count` | number | `3` | Number of retry attempts per track on failure. Must be a non-negative integer. |
| `download.search_source` | string | `"youtube-music"` | Search source used by yt-dlp when looking up a track. |

### `logging`

| Field | Type | Default | Description |
|---|---|---|---|
| `logging.level` | `"debug"` \| `"info"` \| `"warn"` \| `"error"` | `"info"` | Minimum log level written to the run log file. |
| `logging.max_run_logs` | number | `20` | Maximum number of per-run log files to retain. Older logs are pruned automatically. |

### Advanced / override fields

| Field | Type | Default | Description |
|---|---|---|---|
| `data_dir` | string \| null | `null` | Override the data directory. Defaults to `$XDG_DATA_HOME/spotify-sync` (`~/.local/share/spotify-sync`). |
| `db_path` | string \| null | `null` | Override the SQLite database file path. Defaults to `<data_dir>/db.sqlite`. |

---

## Environment variables

Every config field can be set via an environment variable. The naming convention is:

```
SPOTIFY_SYNC_<DOTTED_FIELD_PATH_IN_UPPERCASE_WITH_UNDERSCORES>
```

For example, `spotify.client_id` → `SPOTIFY_SYNC_SPOTIFY_CLIENT_ID`.

Full list:

| Environment variable | Config field |
|---|---|
| `SPOTIFY_SYNC_SPOTIFY_CLIENT_ID` | `spotify.client_id` |
| `SPOTIFY_SYNC_SPOTIFY_CLIENT_SECRET` | `spotify.client_secret` |
| `SPOTIFY_SYNC_SPOTIFY_PLAYLIST_URL` | `spotify.playlist_url` |
| `SPOTIFY_SYNC_LIBRARY_PATH` | `library.path` |
| `SPOTIFY_SYNC_LIBRARY_ID` | `library.id` |
| `SPOTIFY_SYNC_DATA_DIR` | `data_dir` |
| `SPOTIFY_SYNC_DB_PATH` | `db_path` |
| `SPOTIFY_SYNC_DOWNLOAD_BACKEND` | `download.backend` |
| `SPOTIFY_SYNC_DOWNLOAD_FORMAT` | `download.format` |
| `SPOTIFY_SYNC_DOWNLOAD_BITRATE_KBPS` | `download.bitrate_kbps` |
| `SPOTIFY_SYNC_DOWNLOAD_CONCURRENCY` | `download.concurrency` |
| `SPOTIFY_SYNC_DOWNLOAD_RETRY_COUNT` | `download.retry_count` |
| `SPOTIFY_SYNC_DOWNLOAD_SEARCH_SOURCE` | `download.search_source` |
| `SPOTIFY_SYNC_LOGGING_LEVEL` | `logging.level` |
| `SPOTIFY_SYNC_LOGGING_MAX_RUN_LOGS` | `logging.max_run_logs` |

---

## CLI flag overrides

Two config fields can be overridden directly on the command line. These take the highest
precedence and apply to every subcommand:

| Flag | Config field | Description |
|---|---|---|
| `--library-path <path>` | `library.path` | Override the local library directory for this run. |
| `--db-path <path>` | `db_path` | Override the SQLite database file path for this run. |

Example:

```bash
spotify-sync --library-path /tmp/test-lib sync
```

---

## File locations

| Purpose | Default path |
|---|---|
| Config file | `$XDG_CONFIG_HOME/spotify-sync/config.json` → `~/.config/spotify-sync/config.json` |
| Auth token | `$XDG_CONFIG_HOME/spotify-sync/auth.json` (mode `0600`) |
| Data directory | `$XDG_DATA_HOME/spotify-sync` → `~/.local/share/spotify-sync` |
| Database | `<data_dir>/db.sqlite` |
| Log files | `$XDG_STATE_HOME/spotify-sync/logs/<run-id>.log` → `~/.local/state/spotify-sync/logs/` |

XDG variables (`$XDG_CONFIG_HOME`, `$XDG_DATA_HOME`, `$XDG_STATE_HOME`) fall back to
their standard defaults (`~/.config`, `~/.local/share`, `~/.local/state`) when unset.
