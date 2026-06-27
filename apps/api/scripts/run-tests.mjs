import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const apiRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const distRoot = join(apiRoot, "dist");

function collectTestFiles(directory) {
  const entries = readdirSync(directory);
  const files = [];

  for (const entry of entries) {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      files.push(...collectTestFiles(fullPath));
      continue;
    }

    if (entry.endsWith(".test.js")) {
      files.push(fullPath);
    }
  }

  return files;
}

const testFiles = collectTestFiles(distRoot);

if (testFiles.length === 0) {
  console.error("No compiled API test files found under dist/");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...testFiles], {
  cwd: apiRoot,
  stdio: "inherit"
});

process.exit(result.status ?? 1);
