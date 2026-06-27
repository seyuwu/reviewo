import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const distDirectory = join(currentDirectory, "..", "dist");

const requiredFiles = [
  "manifest.json",
  "background.js",
  "content.js",
  "history-hook-bootstrap.js",
  "web-auth-content.js",
  "popup.html",
  "popup.js",
  "popup.css"
];

for (const fileName of requiredFiles) {
  await access(join(distDirectory, fileName));
}

const contentScriptSource = await readFile(join(distDirectory, "content.js"), "utf8");
const historyHookBootstrapSource = await readFile(
  join(distDirectory, "history-hook-bootstrap.js"),
  "utf8"
);

const webAuthContentScriptSource = await readFile(join(distDirectory, "web-auth-content.js"), "utf8");

const bundledContentScripts = [
  ["content.js", contentScriptSource],
  ["history-hook-bootstrap.js", historyHookBootstrapSource],
  ["web-auth-content.js", webAuthContentScriptSource]
];

for (const [fileName, source] of bundledContentScripts) {

  if (/\bexport\b/.test(source)) {
    throw new Error(`${fileName} must not contain ES module exports (content scripts run as classic scripts).`);
  }

  if (!source.includes('"use strict";') || !source.includes("(() => {")) {
    throw new Error(`${fileName} must be bundled as an IIFE for Chrome content script injection.`);
  }
}

if (contentScriptSource.includes("sourceMappingURL=content.js.map")) {
  throw new Error("content.js must not ship a source map reference.");
}

console.log("Extension build artifacts are present.");
