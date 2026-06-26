import { homedir } from "node:os";
import { join } from "node:path";
import "dotenv/config";

export const DEFAULT_REDIRECT_URI = "http://127.0.0.1:8765/callback";

export type AppConfig = {
  clientId: string;
  redirectUri: string;
  tokenPath: string;
};

export function getConfig(): AppConfig {
  const clientId = process.env.SPOTIFY_CLIENT_ID;

  if (!clientId) {
    throw new Error("Missing SPOTIFY_CLIENT_ID. Create a Spotify app and export SPOTIFY_CLIENT_ID.");
  }

  return {
    clientId,
    redirectUri: process.env.SPOTIFY_REDIRECT_URI ?? DEFAULT_REDIRECT_URI,
    tokenPath: process.env.DJAI_TOKEN_PATH ?? process.env.SPO_MCP_TOKEN_PATH ?? join(homedir(), ".djai", "token.json")
  };
}

export const SPOTIFY_SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-private",
  "playlist-modify-public",
  "user-library-read",
  "user-library-modify",
  "user-read-recently-played",
  "user-top-read",
  "user-follow-read",
  "user-read-private",
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-modify-playback-state"
];
