#!/usr/bin/env node

/**
 * Guard for the emitted `dist/` tree's internal resolution.
 *
 * `dist` mirrors `src` one-for-one: the Node entry points are thin
 * re-export shims over it, and each file keeps the source-shaped specifier the
 * author wrote. A specifier that no longer resolves on disk is a runtime
 * `ERR_MODULE_NOT_FOUND` for any consumer, and no other gate walks the emitted
 * tree to catch it.
 *
 * This walker reads every emitted `.js` file, extracts every reference form
 * that can name a relative path (`from "…"`, a side-effect `import "…"`,
 * `import("…")` and `new URL("…", import.meta.url)`), skips bare and `node:`
 * specifiers, and requires each one to resolve as `spec`, `spec + ".js"` or
 * `spec + "/index.js"`. A surviving `.ts` specifier is reported too: nothing may
 * import TypeScript from the published tree.
 *
 * Usage: node scripts/check-dist-resolution.mjs [dir]   (default: dist)
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(process.argv[2] ?? "dist");

if (!existsSync(root)) {
  console.error(`dist tree not found: ${root}`);
  console.error(
    "Build it first: pnpm run build:copy-wasm && pnpm run build:ts && pnpm run postbuild",
  );
  process.exit(2);
}

/**
 * References that are known not to resolve inside this tree, each with the
 * reason it is allowed. This is a named allowlist, never a blanket skip: a
 * reference is exempt only when both its file (relative to the tree root) and
 * its specifier match an entry exactly.
 *
 * The entries: `module-loader-browser.ts` is compiled into the Node tree
 * by the per-file `js` pack config even though it is only ever reached from the
 * browser bundles, where the wasm sits beside the bundle and `./taglib-web.wasm`
 * is correct. In the Node tree the same specifier points at a file that was
 * never emitted. The condition is pre-existing — the esbuild-built tree fails
 * identically — so it is recorded here rather than fixed by moving the source.
 *
 * `module-loader.ts`'s `./taglib-web.wasm` is the Deno-compile branch's
 * best-effort probe for a wasm embedded with `deno compile --include`, which
 * lands beside the *entry* module (`Deno.mainModule`), not this one. It runs
 * inside a try/catch that falls through to the next strategy, so it can never
 * break loading; the wasm is deliberately not part of the Node tree.
 */
const KNOWN_UNRESOLVED = [
  {
    file: "runtime/module-loader-browser.js",
    spec: "./taglib-web.wasm",
    reason:
      "browser-only loader; the wasm sits beside the browser bundle, not in the Node tree",
  },
  {
    file: "runtime/module-loader.js",
    spec: "./taglib-web.wasm",
    reason:
      "Deno-compile embed probe (import.meta.url fallback) inside a try/catch; the embedded wasm lands beside the entry module, never in the Node tree",
  },
];

const FROM_RE = /\bfrom\s*["']([^"']+)["']/g;
const SIDE_RE = /\bimport\s*["']([^"']+)["']/g;
const DYN_RE = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
const URL_RE =
  /new\s+URL\s*\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g;

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry.endsWith(".js")) files.push(full);
  }
})(root);

function resolveTarget(fromFile, spec) {
  const base = dirname(fromFile);
  const candidates = [resolve(base, spec)];
  if (!/\.[a-z]+$/i.test(spec)) {
    candidates.push(
      resolve(base, `${spec}.js`),
      resolve(base, spec, "index.js"),
    );
  }
  return candidates.some((candidate) => existsSync(candidate));
}

function exempt(file, spec) {
  return KNOWN_UNRESOLVED.some(
    (entry) => entry.file === file && entry.spec === spec,
  );
}

let references = 0;
let exempted = 0;
const exemptedFiles = new Set();
const problems = [];

for (const file of files) {
  const rel = relative(root, file);
  const source = readFileSync(file, "utf8");
  for (const [re, kind] of [
    [FROM_RE, "specifier"],
    [SIDE_RE, "specifier"],
    [DYN_RE, "specifier"],
    [URL_RE, "asset"],
  ]) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(source)) !== null) {
      const spec = match[1];
      if (!spec.startsWith(".")) continue;
      references++;
      if (exempt(rel, spec)) {
        exempted++;
        exemptedFiles.add(rel);
        continue;
      }
      if (spec.endsWith(".ts")) {
        problems.push(`${rel}: surviving .ts ${kind} "${spec}"`);
        continue;
      }
      if (!resolveTarget(file, spec)) {
        problems.push(`${rel}: ${kind} "${spec}" does not resolve`);
      }
    }
  }
}

console.log(
  `walked ${files.length} .js files, ${references} relative references, ` +
    `${exempted} skipped by the pre-existing exception ` +
    `(${exemptedFiles.size} file${exemptedFiles.size === 1 ? "" : "s"})`,
);

for (const entry of KNOWN_UNRESOLVED) {
  if (exemptedFiles.has(entry.file)) {
    console.log(`  exempt ${entry.file} → "${entry.spec}" (${entry.reason})`);
  }
}

if (problems.length > 0) {
  console.error(`UNRESOLVED (${problems.length}):`);
  for (const problem of problems) console.error(`  ${problem}`);
  if (problems.some((problem) => /build\//.test(problem))) {
    console.error(
      "Hint: a reference into a build/ path only resolves after `pnpm run " +
        "postbuild` materializes the runtime files at the dist/ root and " +
        "applies the depth-relative rewrite. Run `pnpm run postbuild` first.",
    );
  }
  process.exit(1);
}

console.log("OK: every relative specifier and import.meta.url asset resolves");
