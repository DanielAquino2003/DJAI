import test from "node:test";
import assert from "node:assert/strict";
import { upsertCodexConfig } from "../src/cli.js";

const expectedBlock = [
  "[mcp_servers.djai]",
  'command = "npx"',
  'args = ["-y", "djai"]',
  "startup_timeout_sec = 10",
  "tool_timeout_sec = 120",
  ""
].join("\n");

test("upsertCodexConfig creates the DJAI MCP block in an empty config", () => {
  assert.equal(upsertCodexConfig(""), expectedBlock);
});

test("upsertCodexConfig appends the DJAI MCP block without deleting existing config", () => {
  const existing = "[profile.default]\nmodel = \"gpt-5\"\n";
  assert.equal(upsertCodexConfig(existing), existing.trimEnd() + "\n\n" + expectedBlock);
});

test("upsertCodexConfig replaces an existing DJAI MCP block idempotently", () => {
  const existing = [
    "[profile.default]",
    'model = "gpt-5"',
    "",
    "[mcp_servers.djai]",
    'command = "node"',
    'args = ["dist/server.js"]',
    "",
    "[mcp_servers.other]",
    'command = "other"',
    ""
  ].join("\n");

  const next = upsertCodexConfig(existing);

  assert.match(next, /\[profile\.default\]/);
  assert.match(next, /\[mcp_servers\.other\]/);
  assert.equal((next.match(/\[mcp_servers\.djai\]/g) ?? []).length, 1);
  assert.match(next, /args = \["-y", "djai"\]/);
});
