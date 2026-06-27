import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readToken, writeToken } from "../src/token-store.js";

test("writeToken creates parent directory and stores readable token JSON", async () => {
  const dir = await mkdtemp(join(tmpdir(), "djai-token-"));
  const tokenPath = join(dir, "nested", "token.json");
  const token = {
    access_token: "access",
    refresh_token: "refresh",
    token_type: "Bearer",
    scope: "playlist-read-private user-read-private",
    expires_at: Date.now() + 3600_000
  };

  await writeToken(tokenPath, token);

  assert.deepEqual(await readToken(tokenPath), token);
});

test("writeToken stores config material with owner-only permissions on POSIX", async () => {
  if (process.platform === "win32") return;

  const dir = await mkdtemp(join(tmpdir(), "djai-token-mode-"));
  const tokenPath = join(dir, "token.json");

  await writeToken(tokenPath, {
    access_token: "access",
    token_type: "Bearer",
    scope: "",
    expires_at: Date.now() + 3600_000
  });

  const mode = (await stat(tokenPath)).mode & 0o777;
  assert.equal(mode, 0o600);
});

test("readToken explains how to recover when token file cannot be read", async () => {
  const dir = await mkdtemp(join(tmpdir(), "djai-missing-token-"));
  const tokenPath = join(dir, "missing.json");

  await assert.rejects(() => readToken(tokenPath), {
    message: /Could not read Spotify token.*Run npm run auth first/
  });
});
