#!/usr/bin/env node

/**
 * Fix Deno compatibility issues in the generated taglib-wrapper.js
 * This script patches the Emscripten-generated code to properly handle Deno environment
 */

const { readFileSync, writeFileSync } = require("fs");
const { join } = require("path");

const wrapperPath = join(__dirname, "../build/taglib-wrapper.js");

console.log("🔧 Applying Deno compatibility fixes to taglib-wrapper.js...");

let content = readFileSync(wrapperPath, "utf8");
let modified = false;

// Fix 1: Add ENVIRONMENT_IS_DENO detection
// Find where ENVIRONMENT_IS_NODE is defined and add Deno detection
const nodeDetectionPattern =
  /(var ENVIRONMENT_IS_NODE=typeof process=="object"&&process\.versions\?\.node&&process\.type!="renderer")/;
const newNodeDetection =
  `var ENVIRONMENT_IS_DENO=typeof Deno!=="undefined";$1&&!ENVIRONMENT_IS_DENO`;

if (nodeDetectionPattern.test(content)) {
  content = content.replace(nodeDetectionPattern, newNodeDetection);
  modified = true;
  console.log("  ✓ Added Deno environment detection");
}

// Fix 2: Fix the Node.js module loading block
// Find the if(ENVIRONMENT_IS_NODE) block that loads modules
const nodeModulePattern =
  /if\(ENVIRONMENT_IS_NODE\)\{const\{createRequire\}=await import\("module"\);var require=createRequire\(import\.meta\.url\)\}/;
const newNodeModule =
  `if(ENVIRONMENT_IS_NODE&&!ENVIRONMENT_IS_DENO){const{createRequire}=await import("module");var require=createRequire(import.meta.url)}`;

if (nodeModulePattern.test(content)) {
  content = content.replace(nodeModulePattern, newNodeModule);
  modified = true;
  console.log("  ✓ Fixed Node.js module loading");
}

// Fix 3: Add Deno file reading support
// Find the readAsync/readBinary setup and add Deno support
const fileReadPattern = /var readAsync,readBinary;if\(ENVIRONMENT_IS_NODE\)\{/;
const newFileRead =
  `var readAsync,readBinary;if(ENVIRONMENT_IS_DENO){readBinary=async filename=>{if(filename instanceof URL||filename.startsWith("http")){const resp=await fetch(filename);return new Uint8Array(await resp.arrayBuffer())}else{return await Deno.readFile(filename)}};readAsync=readBinary}else if(ENVIRONMENT_IS_NODE){`;

if (fileReadPattern.test(content)) {
  content = content.replace(fileReadPattern, newFileRead);
  modified = true;
  console.log("  ✓ Added Deno file reading support");
}

// Fix 4: Update WebAssembly instantiation checks
// Replace !ENVIRONMENT_IS_NODE with (!ENVIRONMENT_IS_NODE||ENVIRONMENT_IS_DENO)
const wasmInstantiatePattern = /!ENVIRONMENT_IS_NODE/g;
const newWasmInstantiate = "(!ENVIRONMENT_IS_NODE||ENVIRONMENT_IS_DENO)";

const matches = content.match(wasmInstantiatePattern);
if (matches && matches.length > 0) {
  content = content.replace(wasmInstantiatePattern, newWasmInstantiate);
  modified = true;
  console.log(
    `  ✓ Fixed WebAssembly instantiation checks (${matches.length} occurrences)`,
  );
}

// Removed findWasmBinary and createWasm patches - not needed for JSR distribution

if (modified) {
  writeFileSync(wrapperPath, content);
  console.log("\n✅ Deno compatibility fixes applied successfully!");
} else {
  console.log("\n⚠️  No changes needed - file may already be patched");
}
