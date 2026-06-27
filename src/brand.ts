export const DJAI_BANNER = String.raw`
 ____       _     _    ___ 
|  _ \     | |   / \  |_ _|
| | | | _  | |  / _ \  | | 
| |_| || |_| | / ___ \ | | 
|____/  \___/ /_/   \_\___|
`;

export const DJAI_SUMMARY =
  "Spotify MCP server for AI agents: playback, playlists, search, and prompt-based music curation.";

export function renderBrandHeader(): string {
  return [DJAI_BANNER, DJAI_SUMMARY].join("\n");
}

export function renderPostinstallMessage(): string {
  return [
    renderBrandHeader(),
    "",
    "DJAI is ready.",
    "",
    "Get started:",
    "  npx --package @daniel-aquino/djai djai-auth",
    "  npx --package @daniel-aquino/djai djai setup codex",
    "",
    "Docs: https://www.npmjs.com/package/@daniel-aquino/djai"
  ].join("\n");
}
