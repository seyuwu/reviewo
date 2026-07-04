import * as esbuild from "esbuild";
import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, watch, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const extensionRoot = join(currentDirectory, "..");
const publicDirectory = join(extensionRoot, "public");
const distDirectory = join(extensionRoot, "dist");
const watchMode = process.argv.includes("--watch");
const isStoreBuild = process.argv.includes("--store");
const isProductionBuild = process.env.NODE_ENV === "production" || isStoreBuild;
const apiBaseUrl =
  process.env.EXTENSION_API_BASE_URL ??
  (isStoreBuild ? "https://api.opinia.ru" : "http://localhost:3000");
const webBaseUrl =
  process.env.EXTENSION_WEB_BASE_URL ?? (isStoreBuild ? "https://opinia.ru" : "http://localhost:3001");

validateProductionUrl("EXTENSION_API_BASE_URL", apiBaseUrl);
validateProductionUrl("EXTENSION_WEB_BASE_URL", webBaseUrl);

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

  copyPopupHtml();
  copyFileSync(join(publicDirectory, "popup.css"), join(distDirectory, "popup.css"));

  writeManifest();
}

function copyPopupHtml() {
  const html = readFileSync(join(publicDirectory, "popup.html"), "utf8");
  const cssVersion = Date.now().toString(36);
  const patchedHtml = html.replace(/href="popup\.css(?:\?[^"]*)?"/, `href="popup.css?v=${cssVersion}"`);

  writeFileSync(join(distDirectory, "popup.html"), patchedHtml);
}

function watchStaticAssets() {
  for (const fileName of ["popup.html", "popup.css"]) {
    watch(join(publicDirectory, fileName), () => {
      copyStaticAssets();
      console.info(`Reviewo extension copied ${fileName}`);
    });
  }
}

function writeManifest() {
  const manifestPath = join(publicDirectory, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  if (isProductionBuild) {
    const webMatch = `${new URL(webBaseUrl).origin}/*`;
    const apiMatch = `${new URL(apiBaseUrl).origin}/*`;

    manifest.name = "Opinia";
    manifest.host_permissions = [apiMatch];
    manifest.content_scripts = manifest.content_scripts.map((script) => {
      if (script.js?.includes("web-auth-content.js")) {
        return {
          ...script,
          matches: [webMatch]
        };
      }

      return {
        ...script,
        exclude_matches: [webMatch]
      };
    });
  } else {
    manifest.name = "Opinia (Dev)";
  }

  writeFileSync(join(distDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

function logBuildSummary() {
  const mode = isProductionBuild ? "PRODUCTION (Chrome Web Store)" : "DEVELOPMENT (local unpacked)";
  const manifestName = isProductionBuild ? "Opinia" : "Opinia (Dev)";

  console.info(
    [
      "",
      `Opinia extension build: ${mode}`,
      `  manifest name: ${manifestName}`,
      `  API: ${apiBaseUrl}`,
      `  Web: ${webBaseUrl}`,
      `  output: ${distDirectory}`,
      isProductionBuild
        ? "  Load this build only for Store upload — not for local dev."
        : "  Load unpacked from dist in chrome://extensions. Disable the Store version while developing.",
      ""
    ].join("\n")
  );
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
  logBuildSummary();
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
  logBuildSummary();
  watchStaticAssets();
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

function validateProductionUrl(name, value) {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  if (!isHttpsOrLocalhost(value)) {
    throw new Error(`${name} must use HTTPS in production`);
  }
}

function isHttpsOrLocalhost(value) {
  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" ||
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "::1"
    );
  } catch {
    return false;
  }
}
