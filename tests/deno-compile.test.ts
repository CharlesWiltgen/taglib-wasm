/**
 * @fileoverview Deno-side tests for the `deno compile` embedding helpers.
 *
 * Restores the coverage that `8c54cfd` removed from
 * tests/offline-support.test.ts when it dropped the deno-compile API from that
 * Vitest file (which keeps its Emscripten loader cases).
 *
 * Deno-only: Vitest's config excludes this file and `pnpm run test:deno` owns it.
 * Dependency-free (`Deno.test` + the local assert helpers) since the retired
 * deno.json import map is gone.
 */

import { assertEquals, assertExists, assertRejects } from "./deno-assert.ts";
import {
  initializeForDenoCompile,
  isDenoCompiled,
  prepareWasmForEmbedding,
  WASM_EMBED_SEARCH_PATHS,
} from "../src/deno-compile.ts";

Deno.test("isDenoCompiled detects the development environment", () => {
  assertEquals(isDenoCompiled(), false);
});

Deno.test("initializeForDenoCompile initializes in development mode", async () => {
  // Not a compiled binary, so this falls back to local Emscripten init.
  const taglib = await initializeForDenoCompile();
  assertExists(taglib);

  // Verify it works end to end.
  const testFile = await Deno.readFile(
    new URL("./test-files/mp3/kiss-snippet.mp3", import.meta.url),
  );
  const file = await taglib.open(testFile);
  assertExists(file.tag());
  file.dispose();
});

Deno.test("prepareWasmForEmbedding prefers build/ over gitignored dist/", () => {
  // In a repo checkout both exist, but only build/ is committed — dist/ is
  // gitignored scratch refreshed solely by the npm chain, so a months-old copy
  // there must not shadow a freshly built binary. Published packages have no
  // build/, so resolution falls through to dist/ unchanged.
  const buildIndex = WASM_EMBED_SEARCH_PATHS.findIndex((p) =>
    p.includes("build/"),
  );
  const distIndex = WASM_EMBED_SEARCH_PATHS.findIndex((p) =>
    p.startsWith("../dist/"),
  );
  assertEquals(buildIndex >= 0 && buildIndex < distIndex, true);
});

Deno.test("prepareWasmForEmbedding creates the WASM file", async () => {
  const tempDir = await Deno.makeTempDir();
  const outputPath = `${tempDir}/test-taglib.wasm`;

  try {
    await prepareWasmForEmbedding(outputPath);

    const stat = await Deno.stat(outputPath);
    assertExists(stat);
    assertEquals(stat.isFile, true);

    // Verify it is a valid WASM file (starts with the WASM magic number).
    const data = await Deno.readFile(outputPath);
    const magic = new Uint8Array([0x00, 0x61, 0x73, 0x6d]); // \0asm
    assertEquals(data[0], magic[0]);
    assertEquals(data[1], magic[1]);
    assertEquals(data[2], magic[2]);
    assertEquals(data[3], magic[3]);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("prepareWasmForEmbedding rejects an unwritable output path", async () => {
  // The WASM resolves from the module-relative build/ path, but the output
  // path cannot be created, so the helper must surface a typed failure rather
  // than swallow it.
  await assertRejects(
    () => prepareWasmForEmbedding("/invalid/path/taglib.wasm"),
    "Failed to prepare WASM for embedding",
  );
});
