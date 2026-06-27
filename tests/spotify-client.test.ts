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
