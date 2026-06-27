import * as esbuild from "esbuild";
import { copyFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const extensionRoot = join(currentDirectory, "..");
const publicDirectory = join(extensionRoot, "public");
const distDirectory = join(extensionRoot, "dist");
const watchMode = process.argv.includes("--watch");
const apiBaseUrl = process.env.EXTENSION_API_BASE_URL ?? "http://localhost:3000";
const webBaseUrl = process.env.EXTENSION_WEB_BASE_URL ?? "http://localhost:3001";

const sharedBuildOptions = {
  bundle: true,
  define: {
    __EXTENSION_API_BASE_URL__: JSON.stringify(apiBaseUrl),
    __EXTENSION_WEB_BASE_URL__: JSON.stringify(webBaseUrl)
  },
  logLevel: "info",
  outdir: distDirectory,
  platform: "browser",
  sourcemap: true,
  target: "es2022"
};

const moduleEntryPoints = {
  background: join(extensionRoot, "src/background/index.ts"),
  popup: join(extensionRoot, "src/popup/index.ts")
};

const contentEntryPoint = {
  content: join(extensionRoot, "src/content/index.ts")
};

const webAuthContentEntryPoint = {
  "web-auth-content": join(extensionRoot, "src/content/web-auth-index.ts")
};

const historyHookBootstrapEntryPoint = {
  "history-hook-bootstrap": join(extensionRoot, "src/content/history-hook-bootstrap.ts")
};

const contentBuildOptions = {
  ...sharedBuildOptions,
  banner: {
    js: "/* Reviewo content script (classic) */"
  },
  entryPoints: contentEntryPoint,
  format: "iife",
  legalComments: "none",
  sourcemap: false
};

function removeStaleContentSourceMap() {
  const contentSourceMapPath = join(distDirectory, "content.js.map");

  if (existsSync(contentSourceMapPath)) {
    unlinkSync(contentSourceMapPath);
  }
}

function copyStaticAssets() {
  mkdirSync(distDirectory, { recursive: true });

  const staticFiles = ["manifest.json", "popup.html", "popup.css"];

  for (const fileName of staticFiles) {
    copyFileSync(join(publicDirectory, fileName), join(distDirectory, fileName));
  }
}

async function runBuild() {
  await esbuild.build({
    ...sharedBuildOptions,
    entryPoints: moduleEntryPoints,
    format: "esm"
  });
  await esbuild.build(contentBuildOptions);
  await esbuild.build({
    ...contentBuildOptions,
    entryPoints: webAuthContentEntryPoint
  });
  await esbuild.build({
    ...contentBuildOptions,
    entryPoints: historyHookBootstrapEntryPoint
  });
  removeStaleContentSourceMap();
  copyStaticAssets();
}

async function runWatch() {
  const copyStaticAssetsPlugin = {
    name: "copy-static-assets",
    setup(build) {
      build.onEnd(() => {
        copyStaticAssets();
      });
    }
  };

  const moduleContext = await esbuild.context({
    ...sharedBuildOptions,
    entryPoints: moduleEntryPoints,
    format: "esm",
    plugins: [copyStaticAssetsPlugin]
  });

  const contentContext = await esbuild.context({
    ...contentBuildOptions,
    plugins: [
      copyStaticAssetsPlugin,
      {
        name: "remove-stale-content-source-map",
        setup(build) {
          build.onEnd(() => {
            removeStaleContentSourceMap();
          });
        }
      }
    ]
  });

  const webAuthContentContext = await esbuild.context({
    ...contentBuildOptions,
    entryPoints: webAuthContentEntryPoint,
    plugins: [copyStaticAssetsPlugin]
  });

  const historyHookContext = await esbuild.context({
    ...contentBuildOptions,
    entryPoints: historyHookBootstrapEntryPoint,
    plugins: [copyStaticAssetsPlugin]
  });

  copyStaticAssets();
  await Promise.all([
    moduleContext.watch(),
    contentContext.watch(),
    webAuthContentContext.watch(),
    historyHookContext.watch()
  ]);

  console.info("Reviewo extension build is watching for changes.");
}

if (watchMode) {
  await runWatch();
} else {
  await runBuild();
}
