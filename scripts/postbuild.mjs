#!/usr/bin/env node

/**
 * Post-build script to copy runtime files to dist directory
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

// Ensure dist directory exists
const distDir = join(rootDir, "dist");
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

// Runtime glue and wasm files to copy from build/ to dist/
const wasmFiles = [
  "taglib-wrapper.js",
  "taglib-wrapper.d.ts",
  "taglib-web.wasm",
  "taglib-wasi.wasm",
];

console.log("📦 Copying runtime files to dist...");

// Copy WASM files
console.log("\n  🔧 WASM runtime files:");
wasmFiles.forEach((file) => {
  const src = join(rootDir, "build", file);
  const dest = join(distDir, file);

  if (existsSync(src)) {
    copyFileSync(src, dest);
    console.log(`    ✓ ${file}`);
  } else {
    console.error(`    ✗ ${file} (not found)`);
  }
});

// Fix the specifiers the emitters leave behind in dist/
console.log("\n🔧 Fixing import specifiers for the built bundle...");
{
  const { execFileSync } = await import("node:child_process");
  // Hard failure on purpose: fix-imports.js rewrites the build/-relative
  // glue/wasm paths in the emitted .js tree and the .ts specifiers in the
  // emitted .d.ts tree. A swallowed error here ships dist/ with unfixed import
  // paths while the build reports success.
  execFileSync(process.execPath, ["scripts/fix-imports.js"], {
    cwd: rootDir,
    stdio: "inherit",
  });
}

// Verify no stale build/ wasm references remain
console.log("\n🔍 Verifying wasm path resolution...");
const { readFileSync } = await import("node:fs");
const wasmLoaders = [
  "dist/runtime/unified-loader/module-loading.js",
  "dist/runtime/wasi-host-loader.js",
  "dist/runtime/module-loader.js",
];
let wasmPathsOk = true;
for (const file of wasmLoaders) {
  const fullPath = join(rootDir, file);
  if (!existsSync(fullPath)) continue;
  const src = readFileSync(fullPath, "utf8");
  if (
    src.includes("build/taglib-wasi.wasm") ||
    src.includes("build/taglib-web.wasm")
  ) {
    console.error(`  ✗ ${file} still contains build/ wasm references`);
    wasmPathsOk = false;
  }
}
if (wasmPathsOk) {
  console.log("  ✓ All wasm paths resolve correctly");
}

console.log("\n✨ Post-build complete!");
