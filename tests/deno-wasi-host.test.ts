/**
 * @fileoverview Deno-native test for the WASI host's filesystem provider.
 *
 * Vitest excludes this file (vite.config.ts) and `pnpm run test:deno` owns it.
 * `resolveFs` picks the Deno provider through `isDeno()`, a branch the Node run
 * cannot reach, so this is the only coverage of that selection.
 */

import { assertEquals, assertExists } from "./deno-assert.ts";
import { loadWasiHost } from "../src/runtime/wasi-host-loader.ts";
import { fileUrlToPath } from "../src/utils/path.ts";

Deno.test("loadWasiHost selects the Deno filesystem provider", async () => {
  const wasmPath = fileUrlToPath(
    new URL("../build/taglib-wasi.wasm", import.meta.url),
  );

  using wasi = await loadWasiHost({ wasmPath });

  assertExists(wasi);
  assertEquals(typeof wasi.tl_version(), "string");
});
