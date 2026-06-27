import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const distDirectory = join(currentDirectory, "..", "dist");

const requiredFiles = [
  "manifest.json",
  "background.js",
  "content.js",
  "popup.html",
  "popup.js",
  "popup.css"
];

for (const fileName of requiredFiles) {
  await access(join(distDirectory, fileName));
}

console.log("Extension build artifacts are present.");
