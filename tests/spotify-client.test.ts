import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeToken } from "../src/token-store.js";

type FetchCall = {
  url: string;
  init?: RequestInit;
};

async function withSpotifyClient(
  handler: (calls: FetchCall[]) => Promise<void>,
  responses: Response[]
) {
  const dir = await mkdtemp(join(tmpdir(), "djai-spotify-"));
  const tokenPath = join(dir, "token.json");
  await writeToken(tokenPath, {
    access_token: "access-token",
    refresh_token: "refresh-token",
    token_type: "Bearer",
    scope: "playlist-read-private user-read-private",
    expires_at: Date.now() + 3600_000
  });

  process.env.SPOTIFY_CLIENT_ID = "client-id";
  process.env.DJAI_TOKEN_PATH = tokenPath;

  const calls: FetchCall[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const response = responses.shift();
    if (!response) throw new Error("Unexpected fetch call to " + String(input));
    return response;
  }) as typeof fetch;

  try {
    await handler(calls);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.SPOTIFY_CLIENT_ID;
    delete process.env.DJAI_TOKEN_PATH;
  }
}

test("SpotifyClient sends bearer auth and maps device responses", async () => {
  await withSpotifyClient(
    async (calls) => {
      const { SpotifyClient } = await import("../src/spotify.js");
      const client = new SpotifyClient();
      const devices = await client.devices();

      assert.deepEqual(devices, { devices: [] });
      assert.equal(calls[0]?.url, "https://api.spotify.com/v1/me/player/devices");
      assert.equal((calls[0]?.init?.headers as Record<string, string>).authorization, "Bearer access-token");
    },
    [Response.json({ devices: [] })]
  );
});

test("SpotifyClient creates playlists through the current-user endpoint", async () => {
  await withSpotifyClient(
    async (calls) => {
      const { SpotifyClient } = await import("../src/spotify.js");
      const client = new SpotifyClient();
      const playlist = await client.createPlaylist("legacy-user-id", {
        name: "Workout",
        description: "Training tracks",
        public: false
      });

      assert.deepEqual(playlist, { id: "playlist-id", uri: "spotify:playlist:playlist-id" });
      assert.equal(calls[0]?.url, "https://api.spotify.com/v1/me/playlists");
      assert.equal(calls[0]?.init?.method, "POST");
      assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
        name: "Workout",
        description: "Training tracks",
        public: false
      });
    },
    [Response.json({ id: "playlist-id", uri: "spotify:playlist:playlist-id" }, { status: 201 })]
  );
});

test("SpotifyClient adds playlist tracks through the items endpoint", async () => {
  await withSpotifyClient(
    async (calls) => {
      const { SpotifyClient } = await import("../src/spotify.js");
      const client = new SpotifyClient();
      const result = await client.addTracksToPlaylist("playlist-id", ["spotify:track:123"]);

      assert.deepEqual(result, { snapshot_id: "snapshot" });
      assert.equal(calls[0]?.url, "https://api.spotify.com/v1/playlists/playlist-id/items");
      assert.equal(calls[0]?.init?.method, "POST");
      assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { uris: ["spotify:track:123"] });
    },
    [Response.json({ snapshot_id: "snapshot" }, { status: 201 })]
  );
});

test("SpotifyClient reads playlist tracks through the items endpoint", async () => {
  await withSpotifyClient(
    async (calls) => {
      const { SpotifyClient } = await import("../src/spotify.js");
      const client = new SpotifyClient();
      const page = await client.getPlaylistTracks("playlist-id", { limit: 10, offset: 0, market: "ES" });

      assert.equal(page.total, 1);
      assert.equal(page.items[0]?.track?.name, "Track Name");
      assert.equal(calls[0]?.url, "https://api.spotify.com/v1/playlists/playlist-id/items?limit=10&offset=0&market=ES");
    },
    [Response.json({
      href: "",
      limit: 10,
      next: null,
      offset: 0,
      previous: null,
      total: 1,
      items: [{
        added_at: "2026-01-01T00:00:00Z",
        added_by: { id: "user" },
        is_local: false,
        item: {
          id: "track-id",
          type: "track",
          uri: "spotify:track:track-id",
          name: "Track Name",
          artists: [{ name: "Artist" }],
          album: { name: "Album" },
          duration_ms: 180000,
          external_urls: { spotify: "https://open.spotify.com/track/track-id" }
        }
      }]
    })]
  );
});

test("SpotifyClient clamps search track limit to Spotify's accepted maximum", async () => {
  await withSpotifyClient(
    async (calls) => {
      const { SpotifyClient } = await import("../src/spotify.js");
      const client = new SpotifyClient();
      await client.searchTracks("workout", 50, "ES");

      assert.equal(calls[0]?.url, "https://api.spotify.com/v1/search?q=workout&type=track&limit=10&market=ES");
    },
    [Response.json({ tracks: { items: [] } })]
  );
});

test("SpotifyClient removes duplicate playlist tracks by replacing items with unique URIs", async () => {
  await withSpotifyClient(
    async (calls) => {
      const { SpotifyClient } = await import("../src/spotify.js");
      const client = new SpotifyClient();
      const result = await client.removeDuplicatePlaylistTracks("playlist-id", "ES");

      assert.deepEqual(result, { removed: 1, kept: 2, duplicateUris: ["spotify:track:a"] });
      assert.equal(calls[0]?.url, "https://api.spotify.com/v1/playlists/playlist-id/items?limit=100&offset=0&market=ES");
      assert.equal(calls[1]?.url, "https://api.spotify.com/v1/playlists/playlist-id/items");
      assert.equal(calls[1]?.init?.method, "PUT");
      assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), { uris: ["spotify:track:a", "spotify:track:b"] });
    },
    [Response.json({
      href: "",
      limit: 100,
      next: null,
      offset: 0,
      previous: null,
      total: 3,
      items: [
        { added_at: null, item: { id: "a", uri: "spotify:track:a", name: "A", artists: [{ name: "Artist" }], album: { name: "Album" }, duration_ms: 1 } },
        { added_at: null, item: { id: "b", uri: "spotify:track:b", name: "B", artists: [{ name: "Artist" }], album: { name: "Album" }, duration_ms: 1 } },
        { added_at: null, item: { id: "a", uri: "spotify:track:a", name: "A", artists: [{ name: "Artist" }], album: { name: "Album" }, duration_ms: 1 } }
      ]
    }), Response.json({ snapshot_id: "snapshot" })]
  );
});

test("SpotifyClient saves tracks through the current library endpoint", async () => {
  await withSpotifyClient(
    async (calls) => {
      const { SpotifyClient } = await import("../src/spotify.js");
      const client = new SpotifyClient();
      const result = await client.saveTracks(["track-id", "spotify:track:other-id"]);

      assert.deepEqual(result, { ok: true });
      assert.equal(calls[0]?.url, "https://api.spotify.com/v1/me/library?uris=spotify%3Atrack%3Atrack-id%2Cspotify%3Atrack%3Aother-id");
      assert.equal(calls[0]?.init?.method, "PUT");
    },
    [new Response(null, { status: 204 })]
  );
});

test("SpotifyClient returns ok for empty successful playback responses", async () => {
  await withSpotifyClient(
    async () => {
      const { SpotifyClient } = await import("../src/spotify.js");
      const client = new SpotifyClient();

      assert.deepEqual(await client.play({ uris: ["spotify:track:123"] }), { ok: true });
    },
    [new Response(null, { status: 204 })]
  );
});

test("SpotifyClient returns ok for non-JSON playback success responses", async () => {
  await withSpotifyClient(
    async () => {
      const { SpotifyClient } = await import("../src/spotify.js");
      const client = new SpotifyClient();

      assert.deepEqual(await client.play({ contextUri: "spotify:playlist:123" }), { ok: true });
    },
    [new Response("OK", { status: 200 })]
  );
});

test("SpotifyClient gives reauthorization guidance for missing scopes", async () => {
  await withSpotifyClient(
    async () => {
      const { SpotifyClient } = await import("../src/spotify.js");
      const client = new SpotifyClient();

      await assert.rejects(() => client.devices(), /Reauthorize with: rm ~\/\.djai\/token\.json && npm run auth/);
    },
    [Response.json({ error: { message: "Insufficient client scope" } }, { status: 403 })]
  );
});
