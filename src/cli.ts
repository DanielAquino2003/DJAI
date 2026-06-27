#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);

function usage() {
  console.error("DJAI\n\nUsage:\n  djai                 Start the MCP server over stdio\n  djai setup codex     Add DJAI to ~/.codex/config.toml\n  djai help            Show this help\n\nAuth:\n  djai-auth            Configure Spotify OAuth");
}

async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

export function upsertCodexConfig(existing: string): string {
  const block = [
    "[mcp_servers.djai]",
    'command = "npx"',
    'args = ["-y", "djai"]',
    "startup_timeout_sec = 10",
    "tool_timeout_sec = 120",
    ""
  ].join("\n");

  const tablePattern = /^\[mcp_servers\.djai\]\n(?:^(?!\[)[^\n]*\n?)*/m;
  if (tablePattern.test(existing)) return existing.replace(tablePattern, block);

  const trimmed = existing.trimEnd();
  return trimmed ? trimmed + "\n\n" + block : block;
}

async function setupCodex() {
  const configPath = join(homedir(), ".codex", "config.toml");
  const existing = await readText(configPath);
  const next = upsertCodexConfig(existing);
  await mkdir(dirname(configPath), { recursive: true, mode: 0o700 });
  await writeFile(configPath, next, { mode: 0o600 });
  console.error("DJAI MCP server added to " + configPath);
  console.error("Restart Codex, then run /mcp and check for djai.");
}

async function main() {
  if (args.length === 0) {
    await import("./server.js");
    return;
  }

  if (args[0] === "help" || args[0] === "--help" || args[0] === "-h") {
    usage();
    return;
  }

  if (args[0] === "setup" && args[1] === "codex") {
    await setupCodex();
    return;
  }

  console.error("Unknown command: " + args.join(" "));
  usage();
  process.exit(1);
}

function isDirectRun(entryPoint: string | undefined): boolean {
  if (!entryPoint) return false;
  return realpathSync(entryPoint) === realpathSync(fileURLToPath(import.meta.url));
}

if (isDirectRun(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
