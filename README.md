# DJAI

DJAI is a Spotify MCP server for AI coding agents and desktop MCP clients. It gives tools such as Codex, Claude Code, Cursor, and any stdio-compatible MCP client controlled access to Spotify playback, playlists, saved music, listening history, and prompt-based playlist creation.

With DJAI, an agent can answer requests like:

```text
Put on my R&B playlist.
Create a 60 minute techno workout playlist.
Find duplicate tracks in this playlist.
Make a private playlist from my recently played tracks.
Queue this song next.
```

DJAI uses Spotify's supported Web API surfaces and OAuth PKCE. It does not require a Spotify client secret, and it avoids deprecated or restricted Spotify recommendation, audio-feature, and audio-analysis endpoints.

## Features

- Spotify playback control from an MCP client: play, pause, skip, queue, volume, shuffle, repeat, and device transfer.
- Playlist workflows: list, search, inspect, export, duplicate, merge, deduplicate, and add tracks.
- Playlist generation from natural-language prompts using Spotify text search and deduplication.
- Taste and library access: saved tracks, recently played tracks, top tracks, top artists, and followed artists.
- Auth diagnostics through `spotify_auth_status` and `spotify_doctor`.
- Secure local OAuth token storage with owner-only file permissions.
- Simple `npx` setup for Codex and standard stdio MCP configuration for other clients.

## Requirements

- Node.js 20 or newer.
- A Spotify developer app.
- Spotify Premium for playback-control actions such as play, pause, queue, skip, volume, shuffle, repeat, and device transfer.

Read-only tools such as playlist inspection and search do not require an active playback device. Playback tools require Spotify Premium and at least one active Spotify device.

## Spotify App Setup

Create a Spotify app at <https://developer.spotify.com/dashboard> and add this redirect URI exactly:

```text
http://127.0.0.1:8765/callback
```

Copy the app Client ID. DJAI uses OAuth PKCE, so no client secret is needed.

## Authentication

Run the auth wizard:

```bash
npx djai-auth
```

Paste your Spotify Client ID when prompted, open the authorization URL, and approve the requested scopes.

You can also run the wizard non-interactively:

```bash
npx djai-auth --client-id your-spotify-client-id
```

Or use a custom redirect URI if your Spotify app is configured for it:

```bash
npx djai-auth --client-id your-spotify-client-id --redirect-uri http://127.0.0.1:8765/callback
```

DJAI stores local files under `~/.djai`:

- `~/.djai/config.json`: non-secret app configuration, including the Spotify Client ID and redirect URI.
- `~/.djai/token.json`: OAuth access and refresh tokens.

Both files are written with owner-only permissions on POSIX systems.

## Configure Codex

Run:

```bash
npx djai setup codex
```

This updates `~/.codex/config.toml` with:

```toml
[mcp_servers.djai]
command = "npx"
args = ["-y", "djai"]
startup_timeout_sec = 10
tool_timeout_sec = 120
```

Restart Codex and run:

```text
/mcp
```

You should see `djai` in the MCP server list.

## Configure Other MCP Clients

Use DJAI as a stdio MCP server:

```json
{
  "mcpServers": {
    "djai": {
      "command": "npx",
      "args": ["-y", "djai"]
    }
  }
}
```

If your client supports longer-running tools, set a timeout of at least 120 seconds. Playlist generation and playlist-copy operations can require multiple Spotify API calls.

## CLI Commands

```bash
npx djai
```

Starts the MCP server over stdio.

```bash
npx djai setup codex
```

Adds or updates the DJAI MCP server block in Codex config.

```bash
npx djai help
```

Prints CLI usage.

```bash
npx djai-auth
```

Runs the Spotify OAuth setup wizard.

## MCP Tools

### Diagnostics

- `spotify_auth_status`: checks token path, expiry, granted scopes, missing scopes, and reauthorization guidance without exposing token values.
- `spotify_doctor`: runs non-destructive checks for auth, profile, devices, playlists, top tracks, and recently played access.

### Playback and Devices

- `spotify_get_current_playback`: returns the currently playing track or playback state.
- `spotify_get_playback_state`: returns device, shuffle, repeat, progress, and context details.
- `spotify_get_devices`: lists available Spotify playback devices.
- `spotify_play`: starts or resumes playback from tracks or a context URI.
- `spotify_play_playlist_by_name`: finds one of your playlists by name and starts playback.
- `spotify_pause`: pauses playback.
- `spotify_next_track`: skips to the next track.
- `spotify_previous_track`: skips to the previous track.
- `spotify_add_to_queue`: adds a track URI to the playback queue.
- `spotify_set_volume`: sets playback volume from 0 to 100.
- `spotify_set_shuffle`: enables or disables shuffle.
- `spotify_set_repeat`: sets repeat mode to `track`, `context`, or `off`.
- `spotify_transfer_playback`: transfers playback to one or more device IDs.

### Playlists

- `spotify_list_my_playlists`: lists your playlists with IDs, names, owners, visibility, and track counts.
- `spotify_search_my_playlists`: searches your playlists by name.
- `spotify_get_playlist`: returns raw playlist details by playlist ID.
- `spotify_get_playlist_tracks`: lists playlist tracks with pagination.
- `spotify_analyze_playlist`: reports duration, duplicate groups, unique tracks, and frequent artists.
- `spotify_export_playlist`: exports a playlist as markdown, CSV, or JSON text.
- `spotify_create_playlist`: creates a playlist for the current user.
- `spotify_add_tracks_to_playlist`: adds track URIs to a playlist.
- `spotify_duplicate_playlist`: copies a playlist into your library.
- `spotify_merge_playlists`: merges multiple playlists into a new deduplicated playlist.
- `spotify_remove_duplicate_playlist_tracks`: removes duplicate playlist tracks, keeping the first occurrence.
- `spotify_create_playlist_from_recently_played`: creates a playlist from recently played tracks.
- `spotify_create_playlist_from_top_tracks`: creates a playlist from top tracks for short, medium, or long term.
- `spotify_create_playlist_like_playlist`: creates a new playlist using text-search similarity to a source playlist.
- `spotify_generate_playlist_from_prompt`: creates a playlist from a natural-language prompt.

### Library and Taste

- `spotify_search_tracks`: searches Spotify tracks by text query.
- `spotify_get_saved_tracks`: lists saved or liked tracks.
- `spotify_save_tracks`: saves tracks to your library.
- `spotify_get_recently_played`: lists recently played tracks.
- `spotify_get_top_tracks`: lists top tracks for `short_term`, `medium_term`, or `long_term`.
- `spotify_get_top_artists`: lists top artists for `short_term`, `medium_term`, or `long_term`.
- `spotify_get_followed_artists`: lists followed artists.

## Prompt-Based Playlist Generation

`spotify_generate_playlist_from_prompt` turns natural-language prompts into Spotify playlists. It infers activity, genre hints, duration, and search queries, then deduplicates tracks by Spotify track ID and artist-title pairs.

Example prompts:

```text
Generate a 45 minute drum and bass running playlist.
Create a private chill jazz focus playlist for 2 hours.
Make a techno workout playlist and start playback.
```

The generator uses Spotify text search. It does not use restricted recommendation, audio-feature, or audio-analysis endpoints.

## Environment Variables

DJAI works without environment variables after `djai-auth`, but these overrides are supported:

- `SPOTIFY_CLIENT_ID`: Spotify app Client ID.
- `SPOTIFY_REDIRECT_URI`: redirect URI configured in your Spotify app.
- `DJAI_CONFIG_PATH`: path to DJAI config JSON. Defaults to `~/.djai/config.json`.
- `DJAI_TOKEN_PATH`: path to DJAI token JSON. Defaults to `~/.djai/token.json`.
- `SPO_MCP_TOKEN_PATH`: legacy token path override kept for compatibility.

## Security and Privacy

DJAI stores OAuth credentials locally and does not send them anywhere except Spotify's official OAuth and Web API endpoints. Tool responses intentionally avoid exposing raw token values.

If scopes change or Spotify reports insufficient scope, reauthorize:

```bash
rm ~/.djai/token.json
npx djai-auth
```

If you are developing from source, use:

```bash
rm ~/.djai/token.json
npm run auth
```

## Troubleshooting

Run diagnostics from your MCP client:

```text
spotify_doctor
```

Common issues:

- `No active device found`: open Spotify on a desktop, phone, or web player, start any playback once, then retry or transfer playback to that device.
- `Spotify Premium required`: playback control endpoints require a Premium account.
- `Missing Spotify client ID`: run `npx djai-auth` or set `SPOTIFY_CLIENT_ID`.
- `Insufficient client scope`: remove `~/.djai/token.json`, run auth again, and restart your MCP client.
- `Redirect URI mismatch`: make sure the Spotify app contains `http://127.0.0.1:8765/callback` exactly.

## Development

Clone the repository and install dependencies:

```bash
git clone https://github.com/DanielAquino2003/DJ.AI.git
cd DJ.AI
npm install
```

Run auth from source:

```bash
npm run auth
```

Start the MCP server from source:

```bash
npm run dev
```

Build and validate:

```bash
npm test
npm run build
npm pack --dry-run
```

The test suite covers config resolution, OAuth token storage, Codex config updates, required Spotify scopes, Spotify client request behavior, playback response handling, and missing-scope guidance.

## Package Contents

Published packages include only:

- `dist`
- `README.md`
- `LICENSE`

Source files and tests stay out of the npm tarball.

## Disclaimer

DJAI is not affiliated with, endorsed by, or sponsored by Spotify. Spotify is a trademark of Spotify AB. Use of DJAI is subject to Spotify's developer terms and the permissions granted by your Spotify account.

## License

MIT
