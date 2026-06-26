import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export type StoredToken = {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  scope: string;
  expires_at: number;
};

export async function readToken(path: string): Promise<StoredToken> {
  const resolvedPath = await resolveTokenPath(path);
  try {
    const raw = await readFile(resolvedPath, "utf8");
    return JSON.parse(raw) as StoredToken;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read Spotify token at ${resolvedPath}. Run npm run auth first. ${message}`);
  }
}

export async function writeToken(path: string, token: StoredToken): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(token, null, 2), { mode: 0o600 });
}

export async function resolveTokenPath(path: string): Promise<string> {
  try {
    await access(path);
    return path;
  } catch {
    const legacyPath = join(homedir(), ".spo-mcp", "token.json");
    try {
      await access(legacyPath);
      return legacyPath;
    } catch {
      return path;
    }
  }
}
