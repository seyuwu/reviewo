import { spawn } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const srcRoot = join(apiRoot, "src");
const pollIntervalMs = Number(process.env.TSC_WATCH_POLL_INTERVAL_MS ?? "1000");

let building = false;
let pendingRebuild = false;
let serverProcess = null;

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: apiRoot,
      env: process.env,
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}`));
    });
  });
}

async function collectTypeScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "generated") {
        continue;
      }

      files.push(...(await collectTypeScriptFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

async function snapshotSourceFiles() {
  const files = await collectTypeScriptFiles(srcRoot);
  const snapshot = new Map();

  for (const filePath of files) {
    snapshot.set(filePath, (await stat(filePath)).mtimeMs);
  }

  return snapshot;
}

function hasSnapshotChanged(previous, next) {
  if (previous.size !== next.size) {
    return true;
  }

  for (const [filePath, modifiedAt] of next) {
    if (previous.get(filePath) !== modifiedAt) {
      return true;
    }
  }

  return false;
}

function stopServer() {
  if (!serverProcess) {
    return;
  }

  const processToStop = serverProcess;
  serverProcess = null;

  try {
    processToStop.kill("SIGKILL");
  } catch {
    // Process may already be gone.
  }
}

function startServer() {
  stopServer();

  serverProcess = spawn("node", ["dist/main.js"], {
    cwd: apiRoot,
    env: process.env,
    stdio: "inherit"
  });

  serverProcess.on("exit", () => {
    serverProcess = null;
  });
}

async function rebuild() {
  if (building) {
    pendingRebuild = true;
    return;
  }

  building = true;

  try {
    await run("corepack", ["pnpm", "exec", "tsc", "-p", "tsconfig.json"]);
    startServer();
  } catch (error) {
    console.error("[dev-watch] build failed:", error instanceof Error ? error.message : error);
    stopServer();
  }

  building = false;

  if (pendingRebuild) {
    pendingRebuild = false;
    await rebuild();
  }
}

async function watchSourceFiles(previousSnapshot) {
  const nextSnapshot = await snapshotSourceFiles();

  if (hasSnapshotChanged(previousSnapshot, nextSnapshot)) {
    await rebuild();
    return nextSnapshot;
  }

  return previousSnapshot;
}

process.on("SIGINT", () => {
  stopServer();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopServer();
  process.exit(0);
});

await run("corepack", ["pnpm", "db:generate"]);

let snapshot = await snapshotSourceFiles();
await rebuild();

setInterval(() => {
  void watchSourceFiles(snapshot).then((nextSnapshot) => {
    snapshot = nextSnapshot;
  });
}, pollIntervalMs);
