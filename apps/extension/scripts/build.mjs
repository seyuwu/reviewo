import * as esbuild from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const extensionRoot = join(currentDirectory, "..");
const publicDirectory = join(extensionRoot, "public");
const distDirectory = join(extensionRoot, "dist");
const watchMode = process.argv.includes("--watch");
const apiBaseUrl = process.env.EXTENSION_API_BASE_URL ?? "http://localhost:3000";

const buildOptions = {
  bundle: true,
  define: {
    __EXTENSION_API_BASE_URL__: JSON.stringify(apiBaseUrl)
  },
  entryPoints: {
    background: join(extensionRoot, "src/background/index.ts"),
    content: join(extensionRoot, "src/content/index.ts"),
    popup: join(extensionRoot, "src/popup/index.ts")
  },
  format: "esm",
  logLevel: "info",
  outdir: distDirectory,
  platform: "browser",
  sourcemap: true,
  target: "es2022"
};

function copyStaticAssets() {
  mkdirSync(distDirectory, { recursive: true });

  const staticFiles = ["manifest.json", "popup.html", "popup.css"];

  for (const fileName of staticFiles) {
    copyFileSync(join(publicDirectory, fileName), join(distDirectory, fileName));
  }
}

async function runBuild() {
  await esbuild.build(buildOptions);
  copyStaticAssets();
}

async function runWatch() {
  const context = await esbuild.context({
    ...buildOptions,
    plugins: [
      {
        name: "copy-static-assets",
        setup(build) {
          build.onEnd(() => {
            copyStaticAssets();
          });
        }
      }
    ]
  });

  copyStaticAssets();
  await context.watch();

  console.info("Reviewo extension build is watching for changes.");
}

if (watchMode) {
  await runWatch();
} else {
  await runBuild();
}
