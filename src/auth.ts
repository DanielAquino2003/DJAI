#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { URL } from "node:url";
import { getConfig, SPOTIFY_SCOPES } from "./config.js";
import { writeToken } from "./token-store.js";

function base64Url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function exchangeCode(params: {
  clientId: string;
  redirectUri: string;
  code: string;
  verifier: string;
}) {
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

  if (!response.ok) {
    throw new Error(`Spotify token exchange failed: ${response.status} ${await response.text()}`);
  }

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
        response.writeHead(400).end(`Spotify authorization failed: ${error}`);
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

      const token = await exchangeCode({
        clientId: config.clientId,
        redirectUri: config.redirectUri,
        code,
        verifier
      });

      await writeToken(config.tokenPath, token);
      response.writeHead(200, { "content-type": "text/plain" }).end("Spotify authorization complete. You can close this tab.");
      server.close();
      console.error(`Stored Spotify token at ${config.tokenPath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      response.writeHead(500).end(message);
      console.error(message);
      server.close();
      process.exitCode = 1;
    }
  });

  server.listen(port, host, () => {
    console.error("Open this URL to authorize DJAI:");
    console.error(authUrl.toString());
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
