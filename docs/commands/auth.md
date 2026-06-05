# auth

Authenticate with Spotify using the OAuth 2.0 PKCE flow. This is a one-time setup
step — you only need to re-run it if your token expires or you want to switch accounts.

## Usage

```
spotify-sync auth [options]
```

## Options

| Flag | Default | Description |
|---|---|---|
| `--port <number>` | `8888` | Local port for the OAuth callback server. |
| `--json` | `false` | Output result as JSON instead of human-readable text. |

## What it does

1. Starts a temporary local HTTP server on `--port` to receive the OAuth callback.
2. Opens your browser to Spotify's authorization page.
3. After you approve access, Spotify redirects to `http://127.0.0.1:<port>/callback`.
4. The CLI exchanges the authorization code for tokens and saves the refresh token to
   `~/.config/spotify-sync/auth.json` with permissions `0600` (readable by you only).
5. Re-running `auth` overwrites the existing token file cleanly.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Authentication succeeded. |
| `2` | Fatal error — config is missing or invalid, or the auth flow failed. |

## Examples

```bash
# Standard flow — opens browser, waits for callback on port 8888
spotify-sync auth

# Use a different port if 8888 is already in use
spotify-sync auth --port 9000

# Machine-readable output
spotify-sync auth --json
```

::: tip Redirect URI must match
The redirect URI registered in your Spotify app settings must match exactly:
`http://127.0.0.1:<port>/callback`. If you use `--port 9000`, the registered URI
must be `http://127.0.0.1:9000/callback`. Use the literal IP address — `localhost`
is not accepted by Spotify.
:::
