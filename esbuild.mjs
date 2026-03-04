import * as esbuild from "esbuild";
import * as fs from "fs";
import * as path from "path";

const isWatch = process.argv.includes("--watch");

// Build extension (Node.js, CommonJS)
const extensionConfig = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node18",
  sourcemap: true,
  minify: !isWatch,
};

// Build webview (browser, IIFE)
const webviewConfig = {
  entryPoints: ["webview/main.ts"],
  bundle: true,
  outfile: "dist/webview/main.js",
  format: "iife",
  platform: "browser",
  target: "es2022",
  sourcemap: true,
  minify: !isWatch,
};

// Copy static webview assets
function copyWebviewAssets() {
  const distWebview = "dist/webview";
  if (!fs.existsSync(distWebview)) {
    fs.mkdirSync(distWebview, { recursive: true });
  }
  for (const file of ["index.html", "styles.css"]) {
    const src = path.join("webview", file);
    const dest = path.join(distWebview, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    }
  }
}

async function build() {
  if (isWatch) {
    const extCtx = await esbuild.context(extensionConfig);
    const webCtx = await esbuild.context(webviewConfig);
    await extCtx.watch();
    await webCtx.watch();
    copyWebviewAssets();
    console.log("Watching for changes...");
  } else {
    await esbuild.build(extensionConfig);
    await esbuild.build(webviewConfig);
    copyWebviewAssets();
    console.log("Build complete.");
  }
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
