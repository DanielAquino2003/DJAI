#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderPostinstallMessage } from "./brand.js";

export { renderPostinstallMessage } from "./brand.js";

function shouldPrint(): boolean {
  return !process.env.CI && process.env.DJAI_NO_POSTINSTALL !== "1";
}

function isDirectRun(entryPoint: string | undefined): boolean {
  if (!entryPoint) return false;
  return realpathSync(entryPoint) === realpathSync(fileURLToPath(import.meta.url));
}

if (isDirectRun(process.argv[1]) && shouldPrint()) {
  console.error(renderPostinstallMessage());
}
