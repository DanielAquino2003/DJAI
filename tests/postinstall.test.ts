import test from "node:test";
import assert from "node:assert/strict";
import { renderPostinstallMessage } from "../src/brand.js";

test("renderPostinstallMessage includes the DJAI banner and setup commands", () => {
  const message = renderPostinstallMessage();

  assert.match(message, /____/);
  assert.match(message, /DJAI is ready/);
  assert.match(message, /Spotify MCP server for AI agents/);
  assert.match(message, /djai-auth/);
  assert.match(message, /djai setup codex/);
});
