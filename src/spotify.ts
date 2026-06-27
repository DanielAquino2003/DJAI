import { getConfig } from "./config.js";
import { readToken, StoredToken, writeToken } from "./token-store.js";

export type SpotifyTrack = {
  id: string;
  uri: string;
  name: string;
  artists: string[];
  album: string;
  duration_ms: number;
  external_url: string;
};

export type SpotifyArtist = {
  id: string;
  uri: string;
  name: string;
  genres: string[];
  popularity?: number;
  followers_total?: number;
  external_url: string;
};

export type SpotifyPlaylistSummary = {
  id: string;
  uri: string;
  name: string;
  description: string;
  public: boolean | null;
  collaborative: boolean;
  owner: string;
  tracks_total: number;
  external_url: string;
};

export type SpotifyPlaylistTrack = {
  added_at: string | null;
  added_by_id?: string;
  track: SpotifyTrack | null;
  is_local?: boolean;
};

export type PlaylistAnalysis = {
  playlistId: string;
  totalTracks: number;
  totalDurationMinutes: number;
  uniqueTracks: number;
  duplicateGroups: Array<{ key: string; count: number; tracks: SpotifyPlaylistTrack[] }>;
  topArtists: Array<{ artist: string; count: number }>;
};

type TimeRange = "short_term" | "medium_term" | "long_term";

type Paging<T> = {
  href: string;
  limit: number;
  next: string | null;
  offset: number;
  previous: string | null;
  total: number;
  items: T[];
};

type CursorPaging<T> = {
  href: string;
  limit: number;
  next: string | null;
  total: number;
  cursors?: { after?: string };
  items: T[];
};

type RawPlaylist = {
  id: string;
  uri: string;
  name: string;
  description: string | null;
  public: boolean | null;
  collaborative: boolean;
  owner?: { id?: string; display_name?: string };
  tracks?: { total?: number };
  items?: { total?: number };
  external_urls?: { spotify?: string };
};

type RawPlaylistItem = {
  added_at: string | null;
  added_by?: { id?: string };
  is_local?: boolean;
  track?: RawTrack | null;
  item?: RawTrack | null;
};

type RawTrack = {
  id: string | null;
  type?: string;
  uri: string;
  name: string;
  artists: Array<{ name: string }>;
  album: { name: string };
  duration_ms: number;
  external_urls?: { spotify?: string };
};

type RawArtist = {
  id: string;
  uri: string;
  name: string;
  genres?: string[];
  popularity?: number;
  followers?: { total?: number };
  external_urls?: { spotify?: string };
};

export class SpotifyClient {
  private token?: StoredToken;
  private readonly config = getConfig();

  async me(): Promise<{ id: string; display_name?: string }> {
    return this.request("/me");
  }

  async currentPlayback(): Promise<unknown> {
    return this.request("/me/player/currently-playing", { allowNoContent: true });
  }

  async playbackState(): Promise<unknown> {
    return this.request("/me/player", { allowNoContent: true });
  }

  async devices(): Promise<unknown> {
    return this.request("/me/player/devices");
  }

  async listMyPlaylists(limit = 20, offset = 0): Promise<{ total: number; limit: number; offset: number; items: SpotifyPlaylistSummary[] }> {
    const params = new URLSearchParams({ limit: String(clamp(limit, 1, 50)), offset: String(Math.max(offset, 0)) });
    const result = await this.request<Paging<RawPlaylist>>("/me/playlists?" + params.toString());
    return { total: result.total, limit: result.limit, offset: result.offset, items: result.items.filter(Boolean).map(toPlaylistSummary) };
  }

  async searchMyPlaylists(query: string, limit = 20): Promise<SpotifyPlaylistSummary[]> {
    const needle = normalizeText(query);
    const matches: SpotifyPlaylistSummary[] = [];
    for (let offset = 0; matches.length < limit; offset += 50) {
      const page = await this.listMyPlaylists(50, offset);
      matches.push(...page.items.filter((playlist) => normalizeText(playlist.name).includes(needle)));
      if (offset + page.limit >= page.total) break;
    }
    return matches.slice(0, limit);
  }

  async findPlaylistByName(name: string): Promise<SpotifyPlaylistSummary> {
    const exact = normalizeText(name);
    const matches = await this.searchMyPlaylists(name, 10);
    const match = matches.find((playlist) => normalizeText(playlist.name) === exact) ?? matches[0];
    if (!match) throw new Error("No playlist found matching: " + name);
    return match;
  }

  async getPlaylist(playlistId: string, market?: string): Promise<unknown> {
    const query = market ? "?" + new URLSearchParams({ market }).toString() : "";
    return this.request("/playlists/" + encodeURIComponent(playlistId) + query);
  }

  async getPlaylistTracks(playlistId: string, params: { limit?: number; offset?: number; market?: string } = {}): Promise<{ total: number; limit: number; offset: number; items: SpotifyPlaylistTrack[] }> {
    const query = new URLSearchParams({ limit: String(clamp(params.limit ?? 100, 1, 100)), offset: String(Math.max(params.offset ?? 0, 0)) });
    if (params.market) query.set("market", params.market);
    const result = await this.request<Paging<RawPlaylistItem>>("/playlists/" + encodeURIComponent(playlistId) + "/items?" + query.toString());
    return { total: result.total, limit: result.limit, offset: result.offset, items: result.items.filter(Boolean).map(toPlaylistTrack) };
  }

  async getAllPlaylistTracks(playlistId: string, market?: string): Promise<SpotifyPlaylistTrack[]> {
    const all: SpotifyPlaylistTrack[] = [];
    for (let offset = 0; ; offset += 100) {
      const page = await this.getPlaylistTracks(playlistId, { limit: 100, offset, market });
      all.push(...page.items);
      if (offset + page.limit >= page.total) break;
    }
    return all;
  }

  async analyzePlaylist(playlistId: string, market?: string): Promise<PlaylistAnalysis> {
    const tracks = await this.getAllPlaylistTracks(playlistId, market);
    const duplicateMap = new Map<string, SpotifyPlaylistTrack[]>();
    const artistCounts = new Map<string, number>();
    let durationMs = 0;
    for (const item of tracks) {
      const track = item.track;
      if (!track) continue;
      durationMs += track.duration_ms;
      const key = track.id || normalizeText(track.artists.join(",") + ":" + track.name);
      duplicateMap.set(key, [...(duplicateMap.get(key) ?? []), item]);
      for (const artist of track.artists) artistCounts.set(artist, (artistCounts.get(artist) ?? 0) + 1);
    }
    return {
      playlistId,
      totalTracks: tracks.length,
      totalDurationMinutes: Math.round(durationMs / 60000),
      uniqueTracks: duplicateMap.size,
      duplicateGroups: [...duplicateMap.entries()].filter(([, items]) => items.length > 1).map(([key, items]) => ({ key, count: items.length, tracks: items })),
      topArtists: [...artistCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([artist, count]) => ({ artist, count }))
    };
  }

  async exportPlaylist(playlistId: string, format: "json" | "markdown" | "csv" = "markdown", market?: string): Promise<string> {
    const tracks = await this.getAllPlaylistTracks(playlistId, market);
    if (format === "json") return JSON.stringify(tracks, null, 2);
    if (format === "csv") {
      const rows = [["name", "artists", "album", "duration_ms", "uri", "external_url"]];
      for (const item of tracks) {
        const track = item.track;
        if (!track) continue;
        rows.push([track.name, track.artists.join("; "), track.album, String(track.duration_ms), track.uri, track.external_url]);
      }
      return rows.map((row) => row.map(csvCell).join(",")).join("\n");
    }
    return tracks.map((item, index) => {
      const track = item.track;
      if (!track) return String(index + 1) + ". [unavailable track]";
      return String(index + 1) + ". " + track.name + " - " + track.artists.join(", ") + " (" + track.album + ")";
    }).join("\n");
  }

  async removeDuplicatePlaylistTracks(playlistId: string, market?: string): Promise<{ removed: number; kept: number; duplicateUris: string[] }> {
    const tracks = await this.getAllPlaylistTracks(playlistId, market);
    const seen = new Set<string>();
    const duplicateUris: string[] = [];
    const keptUris: string[] = [];
    for (const item of tracks) {
      const track = item.track;
      if (!track) continue;
      const key = track.id || normalizeText(track.artists.join(",") + ":" + track.name);
      if (seen.has(key)) duplicateUris.push(track.uri);
      else {
        seen.add(key);
        keptUris.push(track.uri);
      }
    }
    if (duplicateUris.length > 0) {
      await this.request("/playlists/" + encodeURIComponent(playlistId) + "/items", { method: "PUT", body: { uris: keptUris.slice(0, 100) } });
      for (const chunk of chunkArray(keptUris.slice(100), 100)) await this.addTracksToPlaylist(playlistId, chunk);
    }
    return { removed: duplicateUris.length, kept: seen.size, duplicateUris };
  }

  async duplicatePlaylist(sourcePlaylistId: string, name?: string, makePublic = false, market?: string) {
    const source = (await this.getPlaylist(sourcePlaylistId, market)) as { name?: string };
    const tracks = await this.getAllPlaylistTracks(sourcePlaylistId, market);
    const me = await this.me();
    const playlist = await this.createPlaylist(me.id, { name: name ?? "Copy of " + (source.name ?? sourcePlaylistId), description: "Copied with DJAI from playlist " + sourcePlaylistId + ".", public: makePublic });
    const uris = tracks.map((item) => item.track?.uri).filter((uri): uri is string => Boolean(uri));
    for (const chunk of chunkArray(uris, 100)) await this.addTracksToPlaylist(playlist.id, chunk);
    return { playlist, copiedTracks: uris.length };
  }

  async mergePlaylists(sourcePlaylistIds: string[], name: string, makePublic = false, market?: string) {
    const me = await this.me();
    const playlist = await this.createPlaylist(me.id, { name, description: "Merged with DJAI from " + sourcePlaylistIds.join(", ") + ".", public: makePublic });
    const seen = new Set<string>();
    const uris: string[] = [];
    for (const playlistId of sourcePlaylistIds) {
      const tracks = await this.getAllPlaylistTracks(playlistId, market);
      for (const item of tracks) {
        const track = item.track;
        if (!track || seen.has(track.id)) continue;
        seen.add(track.id);
        uris.push(track.uri);
      }
    }
    for (const chunk of chunkArray(uris, 100)) await this.addTracksToPlaylist(playlist.id, chunk);
    return { playlist, addedTracks: uris.length };
  }

  async searchTracks(query: string, limit = 10, market?: string): Promise<SpotifyTrack[]> {
    const params = new URLSearchParams({ q: query, type: "track", limit: String(clamp(limit, 1, 10)) });
    if (market) params.set("market", market);
    const result = await this.request<{ tracks: { items: RawTrack[] } }>("/search?" + params.toString());
    return result.tracks.items.map(toTrack);
  }

  async savedTracks(limit = 20, offset = 0, market?: string) {
    const params = new URLSearchParams({ limit: String(clamp(limit, 1, 50)), offset: String(Math.max(offset, 0)) });
    if (market) params.set("market", market);
    const result = await this.request<Paging<{ added_at: string; track: RawTrack }>>("/me/tracks?" + params.toString());
    return { total: result.total, limit: result.limit, offset: result.offset, items: result.items.map((item) => ({ added_at: item.added_at, track: toTrack(item.track) })) };
  }

  async saveTracks(ids: string[]) {
    const uris = ids.map((id) => id.startsWith("spotify:") ? id : "spotify:track:" + id);
    const params = new URLSearchParams({ uris: uris.slice(0, 40).join(",") });
    return this.request("/me/library?" + params.toString(), { method: "PUT", allowNoContent: true });
  }

  async recentlyPlayed(limit = 20) {
    const params = new URLSearchParams({ limit: String(clamp(limit, 1, 50)) });
    const result = await this.request<{ items: Array<{ played_at: string; track: RawTrack }> }>("/me/player/recently-played?" + params.toString());
    return { items: result.items.map((item) => ({ played_at: item.played_at, track: toTrack(item.track) })) };
  }

  async topTracks(timeRange: TimeRange = "medium_term", limit = 20, offset = 0) {
    const params = new URLSearchParams({ time_range: timeRange, limit: String(clamp(limit, 1, 50)), offset: String(Math.max(offset, 0)) });
    const result = await this.request<Paging<RawTrack>>("/me/top/tracks?" + params.toString());
    return { total: result.total, limit: result.limit, offset: result.offset, items: result.items.map(toTrack) };
  }

  async topArtists(timeRange: TimeRange = "medium_term", limit = 20, offset = 0) {
    const params = new URLSearchParams({ time_range: timeRange, limit: String(clamp(limit, 1, 50)), offset: String(Math.max(offset, 0)) });
    const result = await this.request<Paging<RawArtist>>("/me/top/artists?" + params.toString());
    return { total: result.total, limit: result.limit, offset: result.offset, items: result.items.map(toArtist) };
  }

  async followedArtists(limit = 20, after?: string) {
    const params = new URLSearchParams({ type: "artist", limit: String(clamp(limit, 1, 50)) });
    if (after) params.set("after", after);
    const result = await this.request<{ artists: CursorPaging<RawArtist> }>("/me/following?" + params.toString());
    return { total: result.artists.total, limit: result.artists.limit, items: result.artists.items.map(toArtist), cursors: result.artists.cursors };
  }

  async createPlaylist(_userId: string, params: { name: string; description?: string; public?: boolean }) {
    return this.request<{ id: string; uri: string; external_urls?: { spotify?: string } }>("/me/playlists", { method: "POST", body: { name: params.name, description: params.description ?? "", public: params.public ?? false } });
  }

  async addTracksToPlaylist(playlistId: string, uris: string[]) {
    return this.request("/playlists/" + encodeURIComponent(playlistId) + "/items", { method: "POST", body: { uris } });
  }

  async addToQueue(uri: string, deviceId?: string) {
    const params = new URLSearchParams({ uri });
    if (deviceId) params.set("device_id", deviceId);
    return this.request("/me/player/queue?" + params.toString(), { method: "POST", allowNoContent: true });
  }

  async play(params: { uris?: string[]; contextUri?: string; deviceId?: string } = {}) {
    const query = params.deviceId ? "?" + new URLSearchParams({ device_id: params.deviceId }).toString() : "";
    const body = params.contextUri ? { context_uri: params.contextUri } : params.uris ? { uris: params.uris } : undefined;
    return this.request("/me/player/play" + query, { method: "PUT", body, allowNoContent: true });
  }

  async playPlaylistByName(name: string, deviceId?: string) {
    const playlist = await this.findPlaylistByName(name);
    await this.play({ contextUri: playlist.uri, deviceId });
    return { ok: true, playlist };
  }

  async pause(deviceId?: string) {
    const query = deviceId ? "?" + new URLSearchParams({ device_id: deviceId }).toString() : "";
    return this.request("/me/player/pause" + query, { method: "PUT", allowNoContent: true });
  }

  async next(deviceId?: string) {
    const query = deviceId ? "?" + new URLSearchParams({ device_id: deviceId }).toString() : "";
    return this.request("/me/player/next" + query, { method: "POST", allowNoContent: true });
  }

  async previous(deviceId?: string) {
    const query = deviceId ? "?" + new URLSearchParams({ device_id: deviceId }).toString() : "";
    return this.request("/me/player/previous" + query, { method: "POST", allowNoContent: true });
  }

  async setVolume(volumePercent: number, deviceId?: string) {
    const params = new URLSearchParams({ volume_percent: String(clamp(volumePercent, 0, 100)) });
    if (deviceId) params.set("device_id", deviceId);
    return this.request("/me/player/volume?" + params.toString(), { method: "PUT", allowNoContent: true });
  }

  async setShuffle(state: boolean, deviceId?: string) {
    const params = new URLSearchParams({ state: String(state) });
    if (deviceId) params.set("device_id", deviceId);
    return this.request("/me/player/shuffle?" + params.toString(), { method: "PUT", allowNoContent: true });
  }

  async setRepeat(state: "track" | "context" | "off", deviceId?: string) {
    const params = new URLSearchParams({ state });
    if (deviceId) params.set("device_id", deviceId);
    return this.request("/me/player/repeat?" + params.toString(), { method: "PUT", allowNoContent: true });
  }

  async transferPlayback(deviceIds: string[], play?: boolean) {
    return this.request("/me/player", { method: "PUT", body: { device_ids: deviceIds, ...(play === undefined ? {} : { play }) }, allowNoContent: true });
  }

  async createPlaylistFromRecentlyPlayed(params: { name?: string; limit?: number; makePublic?: boolean }) {
    const recent = await this.recentlyPlayed(params.limit ?? 30);
    const seen = new Set<string>();
    const uris: string[] = [];
    for (const item of recent.items) {
      if (seen.has(item.track.id)) continue;
      seen.add(item.track.id);
      uris.push(item.track.uri);
    }
    const me = await this.me();
    const playlist = await this.createPlaylist(me.id, {
      name: params.name ?? "Recently played - DJAI",
      description: "Created from recently played tracks with DJAI.",
      public: params.makePublic ?? false
    });
    for (const chunk of chunkArray(uris, 100)) await this.addTracksToPlaylist(playlist.id, chunk);
    return { playlist, addedTracks: uris.length };
  }

  async createPlaylistFromTopTracks(params: { name?: string; timeRange?: TimeRange; limit?: number; makePublic?: boolean }) {
    const top = await this.topTracks(params.timeRange ?? "medium_term", params.limit ?? 30, 0);
    const uris = top.items.map((track) => track.uri);
    const me = await this.me();
    const playlist = await this.createPlaylist(me.id, {
      name: params.name ?? "Top tracks - DJAI",
      description: "Created from top tracks (" + (params.timeRange ?? "medium_term") + ") with DJAI.",
      public: params.makePublic ?? false
    });
    for (const chunk of chunkArray(uris, 100)) await this.addTracksToPlaylist(playlist.id, chunk);
    return { playlist, addedTracks: uris.length };
  }

  async createPlaylistLikePlaylist(params: { sourcePlaylistId: string; name?: string; targetTracks?: number; makePublic?: boolean; market?: string }) {
    const source = (await this.getPlaylist(params.sourcePlaylistId, params.market)) as { name?: string };
    const tracks = (await this.getAllPlaylistTracks(params.sourcePlaylistId, params.market)).map((item) => item.track).filter((track): track is SpotifyTrack => Boolean(track));
    if (tracks.length === 0) throw new Error("Source playlist has no available tracks.");

    const targetTracks = clamp(params.targetTracks ?? 30, 5, 100);
    const seedTracks = tracks.slice(0, Math.min(tracks.length, 12));
    const queries = new Set<string>();
    for (const track of seedTracks) {
      const artist = track.artists[0];
      if (artist) queries.add(artist);
      queries.add(track.name + " " + track.artists.join(" "));
    }

    const seen = new Set(tracks.map((track) => track.id));
    const uris: string[] = [];
    for (const query of queries) {
      const results = await this.searchTracks(query, 10, params.market);
      for (const candidate of results) {
        if (seen.has(candidate.id)) continue;
        seen.add(candidate.id);
        uris.push(candidate.uri);
        if (uris.length >= targetTracks) break;
      }
      if (uris.length >= targetTracks) break;
    }

    const me = await this.me();
    const playlist = await this.createPlaylist(me.id, {
      name: params.name ?? "Like " + (source.name ?? params.sourcePlaylistId) + " - DJAI",
      description: "Created from text-search similarity to playlist " + params.sourcePlaylistId + " with DJAI.",
      public: params.makePublic ?? false
    });
    for (const chunk of chunkArray(uris, 100)) await this.addTracksToPlaylist(playlist.id, chunk);
    return { playlist, addedTracks: uris.length, sourceTracks: tracks.length };
  }

  private async getAccessToken(): Promise<string> {
    const token = this.token ?? (await readToken(this.config.tokenPath));
    this.token = token;
    if (token.expires_at > Date.now() + 60000) return token.access_token;
    if (!token.refresh_token) throw new Error("Spotify token expired and no refresh token is available. Run npm run auth again.");
    const refreshed = await this.refreshToken(token.refresh_token);
    this.token = refreshed;
    await writeToken(this.config.tokenPath, refreshed);
    return refreshed.access_token;
  }

  private async refreshToken(refreshToken: string): Promise<StoredToken> {
    const response = await fetch("https://accounts.spotify.com/api/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: this.config.clientId }) });
    if (!response.ok) throw new Error("Spotify token refresh failed: " + response.status + " " + (await response.text()));
    const token = (await response.json()) as { access_token: string; refresh_token?: string; token_type: string; scope: string; expires_in: number };
    return { access_token: token.access_token, refresh_token: token.refresh_token ?? refreshToken, token_type: token.token_type, scope: token.scope, expires_at: Date.now() + token.expires_in * 1000 };
  }

  private async request<T = unknown>(path: string, options: { method?: string; body?: unknown; allowNoContent?: boolean } = {}): Promise<T> {
    const token = await this.getAccessToken();
    const response = await fetch("https://api.spotify.com/v1" + path, { method: options.method ?? "GET", headers: { authorization: "Bearer " + token, ...(options.body ? { "content-type": "application/json" } : {}) }, body: options.body ? JSON.stringify(options.body) : undefined });
    if (response.status === 204 && options.allowNoContent) return { ok: true } as T;
    if (!response.ok) {
      let detail = await response.text();
      try {
        const parsed = JSON.parse(detail) as { error?: { message?: string } };
        detail = parsed.error?.message ?? detail;
      } catch {
        // Keep raw response text.
      }
      if (response.status === 403 && detail.toLowerCase().includes("scope")) {
        throw new Error("Spotify API error 403: " + detail + ". Reauthorize with: rm ~/.djai/token.json && npm run auth, then restart your MCP client.");
      }
      throw new Error("Spotify API error " + response.status + ": " + detail);
    }

    const raw = await response.text();
    if (!raw.trim()) return { ok: true } as T;

    try {
      return JSON.parse(raw) as T;
    } catch (error) {
      if (options.allowNoContent) return { ok: true } as T;
      throw new Error("Spotify API returned non-JSON response: " + raw.slice(0, 200));
    }
  }
}

function toPlaylistSummary(playlist: RawPlaylist): SpotifyPlaylistSummary {
  return { id: playlist.id, uri: playlist.uri, name: playlist.name, description: playlist.description ?? "", public: playlist.public, collaborative: playlist.collaborative, owner: playlist.owner?.display_name ?? playlist.owner?.id ?? "unknown", tracks_total: playlist.tracks?.total ?? playlist.items?.total ?? 0, external_url: playlist.external_urls?.spotify ?? "" };
}

function toPlaylistTrack(item: RawPlaylistItem): SpotifyPlaylistTrack {
  const track = item.track ?? item.item ?? null;
  return { added_at: item.added_at, added_by_id: item.added_by?.id, is_local: item.is_local, track: track && (!track.type || track.type === "track") ? toTrack(track) : null };
}

function toTrack(track: RawTrack): SpotifyTrack {
  return { id: track.id ?? track.uri, uri: track.uri, name: track.name, artists: track.artists.map((artist) => artist.name), album: track.album.name, duration_ms: track.duration_ms, external_url: track.external_urls?.spotify ?? "" };
}

function toArtist(artist: RawArtist): SpotifyArtist {
  return { id: artist.id, uri: artist.uri, name: artist.name, genres: artist.genres ?? [], popularity: artist.popularity, followers_total: artist.followers?.total, external_url: artist.external_urls?.spotify ?? "" };
}

function normalizeText(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function csvCell(value: string): string {
  return "\"" + value.replace(/"/g, "\"\"") + "\"";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}
