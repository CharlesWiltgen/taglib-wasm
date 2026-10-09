/**
 * @fileoverview CI guard: both wasm backends must be present and loadable.
 *
 * Several parity suites gate themselves on artifact existence
 * (`HAS_WASI` / `HAS_EMSCRIPTEN` in tests/backend-adapter.ts) and ignore
 * themselves when one is missing. Locally that is a legitimate skip — a fresh
 * clone has no built artifacts — but in CI every workflow materializes both,
 * so a missing artifact there is a wiring bug. A silently-ignored parity suite
 * is exactly how the WASI half of every `forEachBackend` test went dark for
 * months (taglib-qivb: the OS-matrix jobs never copied the committed WASI
 * binary into dist/wasi/, so CI was green while asserting one backend).
 *
 * This test therefore runs ONLY in CI, and fails loudly there. It also proves
 * each backend *loads* (not merely that a file exists), by driving the adapters
 * themselves — so a corrupt or mismatched artifact cannot hide behind
 * `fileExists`.
 */

import { readFile } from "node:fs/promises";
import { expect, it } from "vite-plus/test";
import { getAdapters, HAS_EMSCRIPTEN, HAS_WASI } from "./backend-adapter.ts";
import { FIXTURE_PATH } from "./shared-fixtures.ts";

// GITHUB_ACTIONS, not CI: these artifacts are guaranteed by this repo's
// workflows, whereas other CI systems (and agent harnesses) may set CI=true on
// a checkout where dist/wasi/ was never materialized.
const inCI = process.env.GITHUB_ACTIONS === "true";

it(
  "CI: both wasm backends are present and loadable",
  { skip: !inCI },
  async () => {
    expect(
      HAS_WASI,
      "dist/wasi/taglib-wasi.wasm is missing — check the 'Materialize the " +
        "committed WASI binary for parity tests' step in ci.yml; without it " +
        "every forEachBackend parity test silently runs Emscripten-only",
    ).toBeTruthy();
    expect(
      HAS_EMSCRIPTEN,
      "build/taglib-wrapper.js is missing — the Emscripten backend cannot load",
    ).toBeTruthy();
    expect(
      getAdapters()
        .map((adapter) => adapter.kind)
        .sort(),
    ).toStrictEqual(["emscripten", "wasi"]);

    const buffer = new Uint8Array(await readFile(FIXTURE_PATH.mp3));
    // Load through the adapters, not TagLib.initialize: the adapters read the
    // very artifacts asserted above (dist/wasi/taglib-wasi.wasm and the
    // wrapper), whereas forceWasmType resolves build/*.wasm — so a corrupt
    // dist artifact could otherwise satisfy every assertion here.
    for (const adapter of getAdapters()) {
      await adapter.init();
      try {
        const tags = await adapter.readTags(buffer, "mp3");
        expect(
          tags.title,
          `${adapter.kind} loaded but could not read the fixture`,
        ).toStrictEqual("Kiss");
      } finally {
        await adapter.dispose();
      }
    }
  },
);
