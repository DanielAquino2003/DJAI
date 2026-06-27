import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import "dotenv/config";

export const DEFAULT_REDIRECT_URI = "http://127.0.0.1:8765/callback";
export const DJAI_CONFIG_PATH = process.env.DJAI_CONFIG_PATH ?? join(homedir(), ".djai", "config.json");

export type AppConfig = {
  clientId: string;
  redirectUri: string;
  tokenPath: string;
  configPath: string;
};

export type UserConfig = {
  spotifyClientId?: string;
  spotifyRedirectUri?: string;
  tokenPath?: string;
};

export function readUserConfig(): UserConfig {
  try {
    return JSON.parse(readFileSync(DJAI_CONFIG_PATH, "utf8")) as UserConfig;
  } catch {
    return {};
  }
}

export function getConfig(): AppConfig {
  return resolveConfig(process.env, readUserConfig(), homedir(), DJAI_CONFIG_PATH);
}

export function resolveConfig(
  env: NodeJS.ProcessEnv,
  userConfig: UserConfig,
  homeDirectory: string,
  configPath: string
): AppConfig {
  const clientId = env.SPOTIFY_CLIENT_ID ?? userConfig.spotifyClientId;

  if (!clientId) {
    throw new Error(
      "Missing Spotify client ID. Run djai-auth and paste your Spotify app Client ID, or set SPOTIFY_CLIENT_ID."
    );
  }

  return {
    clientId,
    redirectUri: env.SPOTIFY_REDIRECT_URI ?? userConfig.spotifyRedirectUri ?? DEFAULT_REDIRECT_URI,
    tokenPath:
      env.DJAI_TOKEN_PATH ??
      env.SPO_MCP_TOKEN_PATH ??
      userConfig.tokenPath ??
      join(homeDirectory, ".djai", "token.json"),
    configPath
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
