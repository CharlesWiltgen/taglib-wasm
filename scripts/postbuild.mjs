#!/usr/bin/env node

/**
 * Post-build script to copy runtime files to dist directory
 */

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
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

// Patch the shipped glue for Deno (and JSR's publish-time wasm import unfurl).
// The same patcher the wasm build applies to build/taglib-wrapper.js, pointed
// at the copy that ships to npm and JSR — sharing it is what keeps dist/ from
// drifting from build/. Hard failure on purpose: a half-patched glue is broken
// in every environment (taglib-2z1b, and the 2.3.2 verify-jsr failure).
console.log(
  "\n🔧 Applying Deno compatibility patches to dist/taglib-wrapper.js...",
);
{
  const { execFileSync } = await import("node:child_process");
  execFileSync(
    process.execPath,
    ["scripts/fix-deno-compat.js", "dist/taglib-wrapper.js"],
    { cwd: rootDir, stdio: "inherit" },
  );
}

// A stale-build/ reference check lived here; it printed findings but never
// failed a build (taglib-fmxa). scripts/check-dist-resolution.mjs now fails on
// that class — a relative reference into build/, which the package does not
// ship — for the whole emitted tree.

console.log("\n✨ Post-build complete!");
