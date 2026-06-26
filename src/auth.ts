#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { URL } from "node:url";
import { DEFAULT_REDIRECT_URI, DJAI_CONFIG_PATH, getConfig, readUserConfig, SPOTIFY_SCOPES, UserConfig } from "./config.js";
import { writeToken } from "./token-store.js";

function base64Url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed: { clientId?: string; redirectUri?: string; help?: boolean } = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--client-id") parsed.clientId = args[++index];
    else if (arg.startsWith("--client-id=")) parsed.clientId = arg.slice("--client-id=".length);
    else if (arg === "--redirect-uri") parsed.redirectUri = args[++index];
    else if (arg.startsWith("--redirect-uri=")) parsed.redirectUri = arg.slice("--redirect-uri=".length);
  }
  return parsed;
}

async function saveUserConfig(config: UserConfig) {
  await mkdir(dirname(DJAI_CONFIG_PATH), { recursive: true, mode: 0o700 });
  await writeFile(DJAI_CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
}

async function ensureConfig() {
  const args = parseArgs();
  if (args.help) {
    console.error("DJAI auth\n\nUsage:\n  djai-auth\n  djai-auth --client-id <spotify-client-id>\n  djai-auth --client-id <spotify-client-id> --redirect-uri " + DEFAULT_REDIRECT_URI + "\n\nCreate a Spotify app at https://developer.spotify.com/dashboard and add this redirect URI:\n  " + DEFAULT_REDIRECT_URI);
    process.exit(0);
  }

  const userConfig = readUserConfig();
  const redirectUri = args.redirectUri ?? process.env.SPOTIFY_REDIRECT_URI ?? userConfig.spotifyRedirectUri ?? DEFAULT_REDIRECT_URI;
  const rl = createInterface({ input, output });
  try {
    console.error("DJAI Spotify setup");
    console.error("1. Open https://developer.spotify.com/dashboard");
    console.error("2. Create or open an app");
    console.error("3. Add this Redirect URI exactly:");
    console.error("   " + redirectUri);
    console.error("4. Copy the app Client ID\n");

    const clientId =
      args.clientId ??
      process.env.SPOTIFY_CLIENT_ID ??
      userConfig.spotifyClientId ??
      (await rl.question("Spotify Client ID: ")).trim();

    if (!clientId) throw new Error("Spotify Client ID is required.");

    await saveUserConfig({ ...userConfig, spotifyClientId: clientId, spotifyRedirectUri: redirectUri });
    process.env.SPOTIFY_CLIENT_ID = clientId;
    process.env.SPOTIFY_REDIRECT_URI = redirectUri;
    console.error("Saved DJAI config at " + DJAI_CONFIG_PATH);
  } finally {
    rl.close();
  }
}

async function exchangeCode(params: { clientId: string; redirectUri: string; code: string; verifier: string }) {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: params.clientId,
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: params.redirectUri,
      code_verifier: params.verifier
    })
  });

  if (!response.ok) throw new Error("Spotify token exchange failed: " + response.status + " " + (await response.text()));

  const token = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    token_type: string;
    scope: string;
    expires_in: number;
  };

  return {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    token_type: token.token_type,
    scope: token.scope,
    expires_at: Date.now() + token.expires_in * 1000
  };
}

async function main() {
  await ensureConfig();
  const config = getConfig();
  const verifier = base64Url(randomBytes(64));
  const challenge = base64Url(createHash("sha256").update(verifier).digest());
  const state = base64Url(randomBytes(16));
  const callbackUrl = new URL(config.redirectUri);
  const port = Number(callbackUrl.port || 80);
  const host = callbackUrl.hostname;

  const authUrl = new URL("https://accounts.spotify.com/authorize");
  authUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    scope: SPOTIFY_SCOPES.join(" "),
    redirect_uri: config.redirectUri,
    state,
    code_challenge_method: "S256",
    code_challenge: challenge,
    show_dialog: "true"
  }).toString();

  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", config.redirectUri);
      if (requestUrl.pathname !== callbackUrl.pathname) {
        response.writeHead(404).end("Not found");
        return;
      }

      const error = requestUrl.searchParams.get("error");
      if (error) {
        response.writeHead(400).end("Spotify authorization failed: " + error);
        return;
      }

      if (requestUrl.searchParams.get("state") !== state) {
        response.writeHead(400).end("Invalid OAuth state.");
        return;
      }

      const code = requestUrl.searchParams.get("code");
      if (!code) {
        response.writeHead(400).end("Missing code.");
        return;
      }

      const token = await exchangeCode({ clientId: config.clientId, redirectUri: config.redirectUri, code, verifier });
      await writeToken(config.tokenPath, token);
      response.writeHead(200, { "content-type": "text/plain" }).end("DJAI authorization complete. You can close this tab.");
      server.close();
      console.error("Stored Spotify token at " + config.tokenPath);
      console.error("Next: configure your MCP client to run djai.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      response.writeHead(500).end(message);
      console.error(message);
      server.close();
      process.exitCode = 1;
    }
  });

  server.listen(port, host, () => {
    console.error("\nOpen this URL to authorize DJAI:");
    console.error(authUrl.toString());
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
