import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_REDIRECT_URI, resolveConfig, SPOTIFY_SCOPES } from "../src/config.js";

test("resolveConfig prefers environment values over saved config", () => {
  const config = resolveConfig(
    {
      SPOTIFY_CLIENT_ID: "env-client",
      SPOTIFY_REDIRECT_URI: "http://localhost:9999/callback",
      DJAI_TOKEN_PATH: "/tmp/env-token.json"
    },
    {
      spotifyClientId: "saved-client",
      spotifyRedirectUri: "http://localhost:1111/callback",
      tokenPath: "/tmp/saved-token.json"
    },
    "/home/tester",
    "/home/tester/.djai/config.json"
  );

  assert.equal(config.clientId, "env-client");
  assert.equal(config.redirectUri, "http://localhost:9999/callback");
  assert.equal(config.tokenPath, "/tmp/env-token.json");
  assert.equal(config.configPath, "/home/tester/.djai/config.json");
});

test("resolveConfig supports saved config and defaults", () => {
  const config = resolveConfig(
    {},
    { spotifyClientId: "saved-client" },
    "/home/tester",
    "/home/tester/.djai/config.json"
  );

  assert.equal(config.clientId, "saved-client");
  assert.equal(config.redirectUri, DEFAULT_REDIRECT_URI);
  assert.equal(config.tokenPath, "/home/tester/.djai/token.json");
});

test("resolveConfig keeps legacy SPO_MCP_TOKEN_PATH as fallback", () => {
  const config = resolveConfig(
    { SPO_MCP_TOKEN_PATH: "/tmp/legacy-token.json" },
    { spotifyClientId: "saved-client", tokenPath: "/tmp/saved-token.json" },
    "/home/tester",
    "/home/tester/.djai/config.json"
  );

  assert.equal(config.tokenPath, "/tmp/legacy-token.json");
});

test("resolveConfig fails clearly when the Spotify client id is missing", () => {
  assert.throws(
    () => resolveConfig({}, {}, "/home/tester", "/home/tester/.djai/config.json"),
    /Missing Spotify client ID/
  );
});

test("required Spotify scopes include auth, library, playlist, taste, and playback access", () => {
  assert.deepEqual(
    [...SPOTIFY_SCOPES].sort(),
    [
      "playlist-modify-private",
      "playlist-modify-public",
      "playlist-read-collaborative",
      "playlist-read-private",
      "user-follow-read",
      "user-library-modify",
      "user-library-read",
      "user-modify-playback-state",
      "user-read-currently-playing",
      "user-read-playback-state",
      "user-read-private",
      "user-read-recently-played",
      "user-top-read"
    ].sort()
  );
});
