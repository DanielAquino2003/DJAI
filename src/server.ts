#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { generatePlaylistFromPrompt } from "./playlist-generator.js";
import { getConfig, SPOTIFY_SCOPES } from "./config.js";
import { SpotifyClient } from "./spotify.js";
import { readToken, resolveTokenPath } from "./token-store.js";

const spotify = new SpotifyClient();
const timeRange = z.enum(["short_term", "medium_term", "long_term"]);

const server = new McpServer(
  { name: "DJAI", version: "0.3.0" },
  {
    instructions:
      "Use DJAI for Spotify actions. Prefer search/list tools before acting when users name playlists ambiguously. Ask for confirmation before destructive tools like duplicate removal. Playback controls require Premium and an active device. If a tool reports insufficient scope, ask the user to run rm ~/.djai/token.json && npm run auth and restart Codex."
  }
);

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] };
}

async function authStatus() {
  const config = getConfig();
  const resolvedTokenPath = await resolveTokenPath(config.tokenPath);
  const token = await readToken(config.tokenPath);
  const grantedScopes = new Set((token.scope ?? "").split(/\s+/).filter(Boolean));
  const requiredScopes = new Set(SPOTIFY_SCOPES);
  return {
    tokenPath: resolvedTokenPath,
    configuredTokenPath: config.tokenPath,
    expiresAt: new Date(token.expires_at).toISOString(),
    isExpired: token.expires_at <= Date.now(),
    grantedScopes: [...grantedScopes].sort(),
    requiredScopes: [...requiredScopes].sort(),
    missingScopes: [...requiredScopes].filter((scope) => !grantedScopes.has(scope)).sort(),
    reauthorizeCommand: "rm ~/.djai/token.json && npm run auth"
  };
}

async function safeCheck(name: string, fn: () => Promise<unknown>) {
  try {
    const result = await fn();
    return { name, ok: true, result };
  } catch (error) {
    return { name, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function doctor() {
  const auth = await safeCheck("auth_status", authStatus);
  const profile = await safeCheck("profile", () => spotify.me());
  const devices = await safeCheck("devices", () => spotify.devices());
  const playlists = await safeCheck("playlists", () => spotify.listMyPlaylists(1, 0));
  const topTracks = await safeCheck("top_tracks_scope", () => spotify.topTracks("medium_term", 1, 0));
  const recent = await safeCheck("recently_played_scope", () => spotify.recentlyPlayed(1));
  return { checks: [auth, profile, devices, playlists, topTracks, recent] };
}



server.tool("spotify_auth_status", "Inspect local Spotify auth status: token expiry, granted scopes, missing scopes, and reauthorization command. Does not expose token values.", {}, async () => text(await authStatus()));
server.tool("spotify_doctor", "Run non-destructive diagnostics for Spotify auth, scopes, devices, profile, playlists, top tracks, and recently played access.", {}, async () => text(await doctor()));

server.tool("spotify_get_current_playback", "Get the user's currently playing Spotify track or playback state.", {}, async () => text(await spotify.currentPlayback()));
server.tool("spotify_get_playback_state", "Get the full Spotify playback state, including device, shuffle, repeat, progress, and context.", {}, async () => text(await spotify.playbackState()));
server.tool("spotify_get_devices", "List available Spotify playback devices.", {}, async () => text(await spotify.devices()));

server.tool("spotify_list_my_playlists", "List the current user's Spotify playlists with ids, names, owners, visibility, and track counts.", { limit: z.number().int().min(1).max(50).default(20), offset: z.number().int().min(0).default(0) }, async ({ limit, offset }) => text(await spotify.listMyPlaylists(limit, offset)));
server.tool("spotify_search_my_playlists", "Search the current user's Spotify playlists by name and return matching playlist ids.", { query: z.string().min(1), limit: z.number().int().min(1).max(50).default(20) }, async ({ query, limit }) => text(await spotify.searchMyPlaylists(query, limit)));
server.tool("spotify_get_playlist", "Get raw Spotify playlist details by playlist id.", { playlistId: z.string().min(1), market: z.string().length(2).optional() }, async ({ playlistId, market }) => text(await spotify.getPlaylist(playlistId, market)));
server.tool("spotify_get_playlist_tracks", "List tracks in a Spotify playlist by playlist id. Supports pagination with limit and offset.", { playlistId: z.string().min(1), limit: z.number().int().min(1).max(100).default(100), offset: z.number().int().min(0).default(0), market: z.string().length(2).optional() }, async ({ playlistId, limit, offset, market }) => text(await spotify.getPlaylistTracks(playlistId, { limit, offset, market })));
server.tool("spotify_analyze_playlist", "Analyze a playlist: total duration, duplicate groups, unique tracks, and most frequent artists.", { playlistId: z.string().min(1), market: z.string().length(2).optional() }, async ({ playlistId, market }) => text(await spotify.analyzePlaylist(playlistId, market)));
server.tool("spotify_export_playlist", "Export a playlist track list as markdown, csv, or json text.", { playlistId: z.string().min(1), format: z.enum(["markdown", "csv", "json"]).default("markdown"), market: z.string().length(2).optional() }, async ({ playlistId, format, market }) => text(await spotify.exportPlaylist(playlistId, format, market)));
server.tool("spotify_remove_duplicate_playlist_tracks", "Remove duplicate tracks from a playlist, keeping the first occurrence. This modifies the playlist.", { playlistId: z.string().min(1), market: z.string().length(2).optional() }, async ({ playlistId, market }) => text(await spotify.removeDuplicatePlaylistTracks(playlistId, market)));
server.tool("spotify_duplicate_playlist", "Copy a playlist into a new playlist in the current user's library.", { sourcePlaylistId: z.string().min(1), name: z.string().min(1).optional(), makePublic: z.boolean().default(false), market: z.string().length(2).optional() }, async ({ sourcePlaylistId, name, makePublic, market }) => text(await spotify.duplicatePlaylist(sourcePlaylistId, name, makePublic, market)));
server.tool("spotify_merge_playlists", "Merge multiple playlists into a new playlist, deduplicating tracks by Spotify track id.", { sourcePlaylistIds: z.array(z.string().min(1)).min(2).max(20), name: z.string().min(1), makePublic: z.boolean().default(false), market: z.string().length(2).optional() }, async ({ sourcePlaylistIds, name, makePublic, market }) => text(await spotify.mergePlaylists(sourcePlaylistIds, name, makePublic, market)));

server.tool("spotify_search_tracks", "Search Spotify tracks by text query. Use this before queueing or manually building playlists.", { query: z.string().min(1), limit: z.number().int().min(1).max(50).default(10), market: z.string().length(2).optional() }, async ({ query, limit, market }) => text(await spotify.searchTracks(query, limit, market)));
server.tool("spotify_get_saved_tracks", "List the user's saved/liked Spotify tracks.", { limit: z.number().int().min(1).max(50).default(20), offset: z.number().int().min(0).default(0), market: z.string().length(2).optional() }, async ({ limit, offset, market }) => text(await spotify.savedTracks(limit, offset, market)));
server.tool("spotify_save_tracks", "Save Spotify track ids to the user's library/liked songs.", { ids: z.array(z.string().min(1)).min(1).max(50) }, async ({ ids }) => text(await spotify.saveTracks(ids)));
server.tool("spotify_get_recently_played", "List the user's recently played Spotify tracks.", { limit: z.number().int().min(1).max(50).default(20) }, async ({ limit }) => text(await spotify.recentlyPlayed(limit)));
server.tool("spotify_get_top_tracks", "List the user's top Spotify tracks. timeRange can be short_term, medium_term, or long_term.", { timeRange: timeRange.default("medium_term"), limit: z.number().int().min(1).max(50).default(20), offset: z.number().int().min(0).default(0) }, async ({ timeRange, limit, offset }) => text(await spotify.topTracks(timeRange, limit, offset)));
server.tool("spotify_get_top_artists", "List the user's top Spotify artists. timeRange can be short_term, medium_term, or long_term.", { timeRange: timeRange.default("medium_term"), limit: z.number().int().min(1).max(50).default(20), offset: z.number().int().min(0).default(0) }, async ({ timeRange, limit, offset }) => text(await spotify.topArtists(timeRange, limit, offset)));
server.tool("spotify_get_followed_artists", "List artists followed by the user.", { limit: z.number().int().min(1).max(50).default(20), after: z.string().optional() }, async ({ limit, after }) => text(await spotify.followedArtists(limit, after)));

server.tool("spotify_create_playlist", "Create a Spotify playlist for the current user.", { name: z.string().min(1), description: z.string().optional(), public: z.boolean().default(false) }, async ({ name, description, public: makePublic }) => { const me = await spotify.me(); return text(await spotify.createPlaylist(me.id, { name, description, public: makePublic })); });
server.tool("spotify_add_tracks_to_playlist", "Add Spotify track URIs to a playlist.", { playlistId: z.string().min(1), uris: z.array(z.string().startsWith("spotify:track:")).min(1).max(100) }, async ({ playlistId, uris }) => text(await spotify.addTracksToPlaylist(playlistId, uris)));

server.tool("spotify_create_playlist_from_recently_played", "Create a playlist from the user's recently played tracks, deduplicating repeated tracks.", { name: z.string().min(1).optional(), limit: z.number().int().min(1).max(50).default(30), makePublic: z.boolean().default(false) }, async ({ name, limit, makePublic }) => text(await spotify.createPlaylistFromRecentlyPlayed({ name, limit, makePublic })));
server.tool("spotify_create_playlist_from_top_tracks", "Create a playlist from the user's top tracks for short_term, medium_term, or long_term.", { name: z.string().min(1).optional(), timeRange: timeRange.default("medium_term"), limit: z.number().int().min(1).max(50).default(30), makePublic: z.boolean().default(false) }, async ({ name, timeRange, limit, makePublic }) => text(await spotify.createPlaylistFromTopTracks({ name, timeRange, limit, makePublic })));
server.tool("spotify_create_playlist_like_playlist", "Create a new playlist with tracks text-search-similar to an existing source playlist. Does not use restricted Spotify audio-features/recommendations endpoints.", { sourcePlaylistId: z.string().min(1), name: z.string().min(1).optional(), targetTracks: z.number().int().min(5).max(100).default(30), makePublic: z.boolean().default(false), market: z.string().length(2).optional() }, async ({ sourcePlaylistId, name, targetTracks, makePublic, market }) => text(await spotify.createPlaylistLikePlaylist({ sourcePlaylistId, name, targetTracks, makePublic, market })));

server.tool("spotify_generate_playlist_from_prompt", "Generate a Spotify playlist from a natural-language prompt using text search and deduplication. Example: 'voy a entrenar, generame una playlist de entrenamiento de techno'.", { prompt: z.string().min(1), durationMinutes: z.number().int().min(10).max(300).optional(), name: z.string().min(1).optional(), makePublic: z.boolean().default(false), startPlayback: z.boolean().default(false), market: z.string().length(2).optional() }, async (input) => text(await generatePlaylistFromPrompt(spotify, input)));

server.tool("spotify_add_to_queue", "Add a Spotify track URI to the user's playback queue. Requires Premium and an active device.", { uri: z.string().startsWith("spotify:track:"), deviceId: z.string().optional() }, async ({ uri, deviceId }) => text(await spotify.addToQueue(uri, deviceId)));
server.tool("spotify_play", "Start or resume Spotify playback. Requires Premium and an active device.", { uris: z.array(z.string().startsWith("spotify:track:")).optional(), contextUri: z.string().optional(), deviceId: z.string().optional() }, async ({ uris, contextUri, deviceId }) => text(await spotify.play({ uris, contextUri, deviceId })));
server.tool("spotify_play_playlist_by_name", "Find one of the user's playlists by name and start playback. Requires Premium and an active device.", { name: z.string().min(1), deviceId: z.string().optional() }, async ({ name, deviceId }) => text(await spotify.playPlaylistByName(name, deviceId)));
server.tool("spotify_pause", "Pause Spotify playback. Requires Premium and an active device.", { deviceId: z.string().optional() }, async ({ deviceId }) => text(await spotify.pause(deviceId)));
server.tool("spotify_next_track", "Skip to the next Spotify track. Requires Premium and an active device.", { deviceId: z.string().optional() }, async ({ deviceId }) => text(await spotify.next(deviceId)));
server.tool("spotify_previous_track", "Skip to the previous Spotify track. Requires Premium and an active device.", { deviceId: z.string().optional() }, async ({ deviceId }) => text(await spotify.previous(deviceId)));
server.tool("spotify_set_volume", "Set Spotify playback volume from 0 to 100. Requires Premium and an active device.", { volumePercent: z.number().int().min(0).max(100), deviceId: z.string().optional() }, async ({ volumePercent, deviceId }) => text(await spotify.setVolume(volumePercent, deviceId)));
server.tool("spotify_set_shuffle", "Enable or disable Spotify shuffle. Requires Premium and an active device.", { state: z.boolean(), deviceId: z.string().optional() }, async ({ state, deviceId }) => text(await spotify.setShuffle(state, deviceId)));
server.tool("spotify_set_repeat", "Set Spotify repeat mode: track, context, or off. Requires Premium and an active device.", { state: z.enum(["track", "context", "off"]), deviceId: z.string().optional() }, async ({ state, deviceId }) => text(await spotify.setRepeat(state, deviceId)));
server.tool("spotify_transfer_playback", "Transfer Spotify playback to one or more device ids. Requires Premium.", { deviceIds: z.array(z.string().min(1)).min(1), play: z.boolean().optional() }, async ({ deviceIds, play }) => text(await spotify.transferPlayback(deviceIds, play)));

const transport = new StdioServerTransport();
await server.connect(transport);
