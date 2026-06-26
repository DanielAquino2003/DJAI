# DJAI

DJAI is a Spotify MCP server for coding agents. It lets Codex, Claude Code, Cursor, and other MCP clients control Spotify playback, search tracks, create playlists, and generate playlists from natural-language prompts.

Example:

```text
Voy a entrenar, generame una playlist de entrenamiento de techno de 60 minutos.
```

The playlist generator uses Spotify text search and deduplication. It intentionally does not depend on deprecated or restricted Spotify recommendation/audio-feature endpoints.

## Disclaimer

DJAI is not affiliated with Spotify. Spotify Premium is required for playback-control endpoints. DJAI does not use Spotify audio-features, audio-analysis, or recommendations endpoints because those endpoints are deprecated or restricted for many apps.

## Requirements

- Node.js 20+
- A Spotify developer app
- Spotify Premium for playback control tools such as play, pause, queue, and next track

## Quick setup

1. Create a Spotify app at <https://developer.spotify.com/dashboard>.
2. Add this redirect URI exactly:

```text
http://127.0.0.1:8765/callback
```

3. Run the auth wizard and paste your Spotify Client ID when prompted:

```bash
npx djai-auth
```

DJAI stores non-secret config at `~/.djai/config.json` and OAuth tokens at `~/.djai/token.json`. A client secret is not required because DJAI uses OAuth PKCE.

You can also run it non-interactively:

```bash
npx djai-auth --client-id your-client-id
```

## Install from source

```bash
git clone https://github.com/DanielAquino2003/DJ.AI.git
cd DJ.AI
npm install
```

Authenticate:

```bash
npm run auth
```

The wizard saves your Spotify Client ID to `~/.djai/config.json`, so you do not need a `.env` file for normal use.

The auth flow stores tokens at `~/.djai/token.json` by default. Override with `DJAI_TOKEN_PATH` if needed.

Build:

```bash
npm run build
```

## Configure Codex

Add this to `~/.codex/config.toml`:

```toml
[mcp_servers.djai]
command = "node"
args = ["/absolute/path/to/djai/dist/server.js"]
cwd = "/absolute/path/to/djai"
startup_timeout_sec = 10
tool_timeout_sec = 120
```

Start a new Codex session and run:

```text
/mcp
```

You should see `djai`.

## Configure Claude Code or other MCP clients

Use a stdio MCP server config like this:

```json
{
  "mcpServers": {
    "djai": {
      "command": "node",
      "args": ["/absolute/path/to/djai/dist/server.js"],
      "cwd": "/absolute/path/to/djai"
    }
  }
}
```

## Tools

Diagnostics and auth tools:

- `spotify_auth_status`
- `spotify_doctor`

Playback and device tools:

- `spotify_get_current_playback`
- `spotify_get_playback_state`
- `spotify_get_devices`
- `spotify_play`
- `spotify_play_playlist_by_name`
- `spotify_pause`
- `spotify_next_track`
- `spotify_previous_track`
- `spotify_add_to_queue`
- `spotify_set_volume`
- `spotify_set_shuffle`
- `spotify_set_repeat`
- `spotify_transfer_playback`

Playlist tools:

- `spotify_list_my_playlists`
- `spotify_search_my_playlists`
- `spotify_get_playlist`
- `spotify_get_playlist_tracks`
- `spotify_analyze_playlist`
- `spotify_export_playlist`
- `spotify_create_playlist`
- `spotify_add_tracks_to_playlist`
- `spotify_duplicate_playlist`
- `spotify_merge_playlists`
- `spotify_remove_duplicate_playlist_tracks`
- `spotify_generate_playlist_from_prompt`
- `spotify_create_playlist_from_recently_played`
- `spotify_create_playlist_from_top_tracks`
- `spotify_create_playlist_like_playlist`

Library and taste tools:

- `spotify_search_tracks`
- `spotify_get_saved_tracks`
- `spotify_save_tracks`
- `spotify_get_recently_played`
- `spotify_get_top_tracks`
- `spotify_get_top_artists`
- `spotify_get_followed_artists`

Playback control requires Spotify Premium and an active device. If you add new scopes after authenticating, run `rm ~/.djai/token.json && npm run auth` to approve the new permissions.

## Package usage after npm publish

Users can run auth with:

```bash
npx djai-auth
```

or:

```bash
npx djai-auth --client-id your-client-id
```

And configure their MCP client with:

```json
{
  "mcpServers": {
    "djai": {
      "command": "npx",
      "args": ["-y", "djai"],
          }
  }
}
```

## Development

```bash
npm install
npm test
npm run build
```

## License

MIT
