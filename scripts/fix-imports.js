#!/usr/bin/env node

/**
 * Post-emit specifier fixes for dist/.
 *
 * Two emitters write dist/, each leaving source-shaped specifiers behind:
 *
 * - vp pack (the `.js` tree) preserves the paths as written in source, e.g.
 *   `import("../../build/taglib-wrapper.js")` and
 *   `new URL("../../build/taglib-wasi.wasm", import.meta.url)`. Those `build/`
 *   paths do not exist under dist/; they are rewritten to the co-located copy
 *   that build:copy-wasm places at the dist/ root, relative to the file depth.
 *
 * - tsc --emitDeclarationOnly (the `.d.ts` tree) preserves the `.ts` specifiers
 *   the sources import with (allowImportingTsExtensions); they are rewritten to
 *   the emitted `.js` files so the published declarations resolve.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";

function fixImportsInFile(filePath) {
  const original = readFileSync(filePath, "utf8");
  let content = original;

  if (filePath.endsWith(".d.ts")) {
    // tsc declaration emit keeps the `.ts` specifiers written in source, in all
    // three statement forms (`from "./x.ts"`, `export … from "./x.ts"`,
    // `import("./x.ts")`). The declaration tree holds only those `.ts` relative
    // specifiers, so a single `.ts` → `.js` rewrite is the whole job.
    content = content.replace(
      /(from\s+|import\(\s*)(["'])(\.[^"']+)\.ts\2/g,
      (_match, prefix, quote, specifier) =>
        `${prefix}${quote}${specifier}.js${quote}`,
    );
  } else {
    // vp pack's unbundled `.js` tree keeps `build/taglib-wrapper.js` and
    // `build/taglib-*.wasm` references; point them at the dist/ root copies.
    const distRoot = "dist";
    const relFromDist = relative(distRoot, dirname(filePath));
    const depth = relFromDist === "" ? 0 : relFromDist.split("/").length;
    const wrapperRelPath =
      (depth === 0 ? "./" : "../".repeat(depth)) + "taglib-wrapper.js";

    content = content.replace(
      /import\(["'][^"']*(?:build|dist)\/taglib-wrapper\.js["']\)/g,
      `import("${wrapperRelPath}")`,
    );

    // Fix wasm binary paths: strip "build/" so they resolve to dist/ root
    const wasiWasmRelPath =
      (depth === 0 ? "./" : "../".repeat(depth)) + "taglib-wasi.wasm";
    const emscriptenWasmRelPath =
      (depth === 0 ? "./" : "../".repeat(depth)) + "taglib-web.wasm";
    content = content.replace(
      /new\s+URL\(\s*["'][^"']*build\/taglib-wasi\.wasm["']/g,
      `new URL("${wasiWasmRelPath}"`,
    );
    content = content.replace(
      /new\s+URL\(\s*["'][^"']*build\/taglib-web\.wasm["']/g,
      `new URL("${emscriptenWasmRelPath}"`,
    );
    content = content.replace(
      /resolveWasmPath\(\s*["'][^"']*build\/taglib-wasi\.wasm["']/g,
      `resolveWasmPath("${wasiWasmRelPath}"`,
    );
  }

  if (content !== original) {
    writeFileSync(filePath, content);
    console.log(`    ✓ Fixed imports in ${filePath}`);
  }
}

function processDirectory(dir) {
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      processDirectory(fullPath);
    } else if (extname(entry) === ".js" || entry.endsWith(".d.ts")) {
      fixImportsInFile(fullPath);
    }
  }
}

console.log("🔧 Fixing import statements in dist...");
processDirectory("dist");
console.log("✨ Import fix complete!");
