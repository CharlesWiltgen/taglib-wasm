/**
 * @fileoverview Tests for offline support: the Emscripten loader's
 * `wasmBinary` / `wasmUrl` options and the `TagLib.initialize` entry points.
 */

import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vite-plus/test";
import { loadTagLibModule } from "../index.ts";
import { createTagLib, TagLib } from "../src/taglib.ts";
import { expectDefined, expectRejects } from "./_assert-helpers.ts";

// Check if Emscripten build is available and functional
let emscriptenAvailable = false;
try {
  const wasmPath = new URL("../build/taglib-web.wasm", import.meta.url);
  const wasmBinary = await readFile(wasmPath);
  const module = await loadTagLibModule({
    wasmBinary,
    forceWasmType: "emscripten",
  });
  emscriptenAvailable = module != null;
} catch {
  // Emscripten build not available or stale
}

describe("OfflineSupport", () => {
  it(
    "loadTagLibModule with wasmBinary option",
    { skip: !emscriptenAvailable },
    async () => {
      const wasmPath = new URL("../build/taglib-web.wasm", import.meta.url);
      const wasmBinary = await readFile(wasmPath);
      const module = await loadTagLibModule({
        wasmBinary,
        forceWasmType: "emscripten",
      });
      expectDefined(module);
      const taglib = await createTagLib(module);
      expectDefined(taglib);
      const testFile = await readFile(
        new URL("./test-files/mp3/kiss-snippet.mp3", import.meta.url),
      );
      const file = await taglib.open(testFile);
      expectDefined(file);
      file.dispose();
    },
  );

  it(
    "loadTagLibModule with custom wasmUrl",
    { skip: !emscriptenAvailable },
    async () => {
      const wasmUrl = new URL("../build/taglib-web.wasm", import.meta.url).href;
      const module = await loadTagLibModule({
        wasmUrl,
        forceWasmType: "emscripten",
      });
      expectDefined(module);
      const taglib = await createTagLib(module);
      expectDefined(taglib);
      const testFile = await readFile(
        new URL("./test-files/mp3/kiss-snippet.mp3", import.meta.url),
      );
      const file = await taglib.open(testFile);
      expectDefined(file);
      file.dispose();
    },
  );

  it(
    // Regression guard for the Emscripten INCOMING_MODULE_JS_API allow-list.
    // Invalid Wasm magic bytes make instantiation reject ONLY if the glue honors
    // the provided wasmBinary. If a toolchain/flag regression drops wasmBinary from
    // INCOMING_MODULE_JS_API (as Emscripten 6.0.2 does by default), the loader
    // silently falls back to the on-disk .wasm and resolves successfully — flipping
    // this expected rejection into a failure. See build/build-wasm.sh.
    "loadTagLibModule honors provided wasmBinary (not silently dropped)",
    { skip: !emscriptenAvailable },
    async () => {
      // Valid Wasm MAGIC, deliberately invalid VERSION. The magic must be real
      // so this gets past loadTagLibModule's own pre-flight check and actually
      // reaches the Emscripten glue — that glue honoring wasmBinary is the only
      // thing under test here. Feeding all-zero bytes would be rejected by the
      // pre-flight instead, and the test would pass even if the glue silently
      // fell back to the on-disk .wasm, which is precisely the regression it
      // exists to catch.
      //
      // Emscripten reports the compile failure on its own, asynchronously,
      // after the returned promise settles — so this case prints to the console
      // during a suite run. That output is expected and cannot be suppressed
      // without weakening the guard.
      const wrongVersionWasm = new Uint8Array([
        0x00,
        0x61,
        0x73,
        0x6d, // "\0asm"
        0xff,
        0xff,
        0xff,
        0xff, // not version 1
      ]);
      await expectRejects(
        () =>
          loadTagLibModule({
            wasmBinary: wrongVersionWasm,
            forceWasmType: "emscripten",
          }),
        Error,
      );
    },
  );

  it("loadTagLibModule rejects a non-Wasm buffer with a typed error", async () => {
    const err = await expectRejects(
      () =>
        loadTagLibModule({
          wasmBinary: new Uint8Array([0x00, 0x00, 0x00, 0x00]),
          forceWasmType: "emscripten",
        }),
      Error,
    );
    // Must name the problem rather than surfacing an Emscripten abort.
    expect(
      err.message.includes("not a WebAssembly module"),
      `unhelpful error for a non-Wasm buffer: ${err.message}`,
    ).toStrictEqual(true);
  });

  it(
    "TagLib.initialize with wasmBinary",
    { skip: !emscriptenAvailable },
    async () => {
      const wasmPath = new URL("../build/taglib-web.wasm", import.meta.url);
      const wasmBinary = await readFile(wasmPath);
      const taglib = await TagLib.initialize({
        wasmBinary,
        forceWasmType: "emscripten",
      });
      expectDefined(taglib);
      const testFile = await readFile(
        new URL("./test-files/mp3/kiss-snippet.mp3", import.meta.url),
      );
      const file = await taglib.open(testFile);
      expect(file.tag().title).toStrictEqual("Kiss");
      file.dispose();
    },
  );

  it(
    "TagLib.initialize with custom wasmUrl",
    { skip: !emscriptenAvailable },
    async () => {
      const wasmUrl = new URL("../build/taglib-web.wasm", import.meta.url).href;
      const taglib = await TagLib.initialize({ wasmUrl });
      expectDefined(taglib);
      const testFile = await readFile(
        new URL("./test-files/mp3/kiss-snippet.mp3", import.meta.url),
      );
      const file = await taglib.open(testFile);
      expectDefined(file.tag());
      file.dispose();
    },
  );

  // The Deno-compile surface (initializeForDenoCompile, isDenoCompiled,
  // prepareWasmForEmbedding, WASM_EMBED_SEARCH_PATHS) was removed in 3.0.0 —
  // see docs/superpowers/specs/2026-10-09-deno-to-viteplus-migration-design.md §5.
  // The Emscripten loader coverage above is unconditional.
});
