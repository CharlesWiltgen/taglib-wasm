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
 * `pnpm run postbuild`; the WASI binary is read from build/ and the
 * Emscripten pair from dist/)
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

    const tags = await readTags(workPath);
    if (tags.title?.[0] !== "Dist Smoke") {
      throw new Error(
        `title did not round-trip: ${JSON.stringify(tags.title)}`,
      );
    }
    if (tags.artist?.[0] !== "Prince") {
      throw new Error(
        `unrelated tag was lost: artist ${JSON.stringify(tags.artist)}`,
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
