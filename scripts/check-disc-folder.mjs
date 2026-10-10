#!/usr/bin/env node

/**
 * Guard for the `taglib-wasm/disc-folder` subpath's Wasm-free contract.
 *
 * The subpath is DECLARED dependency-free so clients (tuneup) can import
 * `discFolderInfo` without a wasm runtime. Three independent halves, all of
 * which must hold:
 *
 *   1. Rebuild the entry from the repo's own `pack` config into a scratch
 *      directory and byte-compare it against the artifact shipped in `dist/`.
 *      A divergence would mean this guard polices a parallel build while the
 *      real bundle regressed.
 *   2. Assert the emitted file is self-contained: no import/export-from
 *      specifier and no reference to a wasm binary, the Emscripten glue, or a
 *      `node:` builtin.
 *   3. Walk the entry's relative `.ts` graph in Node and require every visited
 *      module to be in the pure allowlist below. A stray module is the earliest
 *      signal the contract regressed — the bundled-text check only sees what
 *      survived tree-shaking.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHIPPED = "dist/disc-folder.js";

/**
 * The exact pure module graph the `disc-folder` subpath may pull in. Every
 * module here is dependency-free — no wasm loader, no Node builtin, no I/O —
 * which is precisely what lets a client import `discFolderInfo` without a wasm
 * runtime.
 */
const PURE_GRAPH = new Set([
  "src/disc-folder.ts",
  "src/folder-api/album-types.ts",
  "src/folder-api/album-grouping.ts",
  "src/folder-api/album-identity.ts",
  "src/folder-api/album-discs.ts",
  "src/folder-api/album-corroborate.ts",
  "src/folder-api/folder-disc.ts",
  "src/utils/path.ts",
]);

/** Text that must not survive into the self-contained bundle. */
const FORBIDDEN_IN_OUTPUT = [
  [/\bfrom\s*["']/, "an import/export … from specifier"],
  [/\bimport\s*\(/, "a dynamic import()"],
  [/taglib-[\w.-]*\.wasm/, "a taglib wasm binary reference"],
  [/taglib-wrapper/, "an Emscripten glue reference"],
  [/\bnode:/, "a node: builtin reference"],
];

const failures = [];

function report(label, detail) {
  console.log(`  ok   ${label} — ${detail}`);
}

function fail(label, detail) {
  failures.push(`${label}: ${detail}`);
  console.error(`  FAIL ${label} — ${detail}`);
}

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

/** True for `type { … }` where every binding is a `type` name. */
function isAllTypeBindings(clause) {
  const text = clause.trim();
  const braced = /^\{([\s\S]*)\}$/.exec(text);
  if (!braced) return false;
  const items = braced[1]
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 && items.every((item) => /^type\s/.test(item));
}

/**
 * Module specifiers that carry runtime weight. Type-only imports/exports are
 * erased at build time, so they add nothing to the emitted graph.
 */
function runtimeSpecifiers(source) {
  const code = stripComments(source);
  const specifiers = [];

  const fromRe =
    /\b(import|export)((?:[ \t]+type)?)[ \t]+([^;]*?)\bfrom[ \t]*["']([^"']+)["']/g;
  for (const match of code.matchAll(fromRe)) {
    const typeKeyword = match[2].trim() === "type";
    if (typeKeyword || isAllTypeBindings(match[3])) continue;
    specifiers.push(match[4]);
  }

  const sideEffectRe = /\bimport[ \t]+["']([^"']+)["']/g;
  for (const match of code.matchAll(sideEffectRe)) specifiers.push(match[1]);

  const dynamicRe = /\bimport[ \t]*\([ \t]*["']([^"']+)["'][ \t]*\)/g;
  for (const match of code.matchAll(dynamicRe)) specifiers.push(match[1]);

  return specifiers;
}

/** Follow `disc-folder.ts`'s relative `.ts` graph; return visited + problems. */
function walkPureGraph() {
  const visited = new Set();
  const problems = [];
  const pending = ["src/disc-folder.ts"];
  while (pending.length > 0) {
    const modulePath = pending.pop();
    if (visited.has(modulePath)) continue;
    visited.add(modulePath);

    let source;
    try {
      source = readFileSync(join(rootDir, modulePath), "utf8");
    } catch {
      problems.push(`${modulePath} is unreadable`);
      continue;
    }

    for (const specifier of runtimeSpecifiers(source)) {
      if (!specifier.startsWith(".")) {
        problems.push(`${modulePath} imports non-relative "${specifier}"`);
        continue;
      }
      if (!specifier.endsWith(".ts")) {
        problems.push(`${modulePath} imports non-.ts "${specifier}"`);
        continue;
      }
      pending.push(
        posix.normalize(posix.join(posix.dirname(modulePath), specifier)),
      );
    }
  }
  return { visited, problems };
}

// ---------------------------------------------------------------------------
// Half 1 — rebuild from the pack config and byte-compare with the shipped file.
// ---------------------------------------------------------------------------
console.log(`disc-folder guard (${SHIPPED})`);

const scratch = mkdtempSync(join(tmpdir(), "disc-folder-guard-"));
let rebuilt = null;
try {
  execFileSync("npx", ["vp", "pack", "-F", "disc-folder", "-d", scratch], {
    cwd: rootDir,
    stdio: ["ignore", "pipe", "pipe"],
  });
  rebuilt = readFileSync(join(scratch, "disc-folder.js"));
} catch (error) {
  const stderr = error.stderr?.toString().trim();
  fail(
    "half 1 rebuild",
    `vp pack -F disc-folder failed${stderr ? `\n${stderr}` : `: ${error.message}`}`,
  );
}

if (rebuilt !== null) {
  try {
    const shipped = readFileSync(join(rootDir, SHIPPED));
    if (Buffer.compare(rebuilt, shipped) === 0) {
      report(
        "half 1 rebuild+compare",
        `${rebuilt.length} B, byte-identical to ${SHIPPED}`,
      );
    } else {
      fail(
        "half 1 rebuild+compare",
        `rebuilt ${rebuilt.length} B diverges from ${SHIPPED} (${shipped.length} B)`,
      );
    }
  } catch {
    fail("half 1 rebuild+compare", `${SHIPPED} does not exist — build first`);
  }
}

// ---------------------------------------------------------------------------
// Half 2 — the emitted file must be self-contained.
// ---------------------------------------------------------------------------
if (rebuilt !== null) {
  const text = rebuilt.toString("utf8");
  const found = FORBIDDEN_IN_OUTPUT.filter(([pattern]) =>
    pattern.test(text),
  ).map(([, what]) => what);
  if (found.length === 0) {
    report(
      "half 2 emitted-file properties",
      "no specifiers, wasm, glue, or node: text",
    );
  } else {
    fail("half 2 emitted-file properties", `found ${found.join(", ")}`);
  }
} else {
  fail("half 2 emitted-file properties", "skipped: rebuild failed");
}

// ---------------------------------------------------------------------------
// Half 3 — the source graph must stay inside the pure allowlist.
// ---------------------------------------------------------------------------
const { visited, problems } = walkPureGraph();
const strays = [...visited].filter((modulePath) => !PURE_GRAPH.has(modulePath));
if (strays.length === 0 && problems.length === 0) {
  report(
    "half 3 source-graph purity",
    `${visited.size} modules, all in the pure allowlist`,
  );
} else {
  for (const stray of strays) {
    fail("half 3 source-graph purity", `stray module reached: ${stray}`);
  }
  for (const problem of problems) {
    fail("half 3 source-graph purity", problem);
  }
}

rmSync(scratch, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(`\ndisc-folder guard FAILED (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("\ndisc-folder guard: Wasm-free contract holds");
