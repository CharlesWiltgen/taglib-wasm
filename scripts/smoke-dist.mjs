#!/usr/bin/env node
/**
 * dist smoke test: exercises the emitted dist/ tree — the artifact the npm
 * package actually ships — instead of the TypeScript sources every other test
 * imports. A bundler, lowering or postbuild regression that only affects the
 * shipped tree could otherwise pass the entire suite (taglib-ola2).
 *
 * Both backends run the same scenario end to end: import dist/index.js,
 * initialize, write a tag to a temp copy of a fixture through the public API,
 * read it back, and check an unrelated tag survived.
 *
 * Usage: node scripts/smoke-dist.mjs   (run after `pnpm run build:js` and
 * `pnpm run postbuild`: both wasm artifacts are then read from dist/ — the
 * WASI module from dist/taglib-wasi.wasm, the Emscripten module from
 * dist/taglib-web.wasm and dist/taglib-wrapper.js)
 */

import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = join(rootDir, "tests/test-files/mp3/kiss-snippet.mp3");
const { TagLib, readTags } = await import(
  pathToFileURL(join(rootDir, "dist/index.js")).href
);

const failures = [];

for (const backend of ["wasi", "emscripten"]) {
  const scratch = mkdtempSync(join(tmpdir(), `smoke-dist-${backend}-`));
  const workPath = join(scratch, "kiss-snippet.mp3");
  try {
    copyFileSync(FIXTURE, workPath);

    const taglib = await TagLib.initialize({ forceWasmType: backend });
    await taglib.updateFile(workPath, { title: "Dist Smoke" });

    // Read back through the forced instance: the simple API caches one
    // auto-detected module (src/simple/config.ts), so readTags() alone would
    // always read with the first iteration's backend (review finding).
    const reopened = await taglib.open(workPath);
    try {
      const title = reopened.tag().title;
      const artist = reopened.tag().artist;
      if (title !== "Dist Smoke") {
        throw new Error(`title did not round-trip: ${JSON.stringify(title)}`);
      }
      if (artist !== "Prince") {
        throw new Error(
          `unrelated tag was lost: artist ${JSON.stringify(artist)}`,
        );
      }
    } finally {
      reopened.dispose();
    }

    // The simple-API surface is covered too, on the auto-detected backend.
    const tags = await readTags(workPath);
    if (tags.title?.[0] !== "Dist Smoke") {
      throw new Error(
        `simple read did not see the write: ${JSON.stringify(tags.title)}`,
      );
    }
    console.log(`ok   dist smoke [${backend}] read + write round-trip`);
  } catch (error) {
    failures.push(
      `[${backend}] ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL dist smoke ${failure}`);
  process.exit(1);
}
console.log("dist smoke passed on both backends");
