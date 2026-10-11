/**
 * @fileoverview Simple-API backend pinning for test suites (taglib-sz1n).
 *
 * Kept out of test-utils.ts so that shared utility stays free of a test
 * framework import — it is also loaded by the tsx bench.
 */

import { expect } from "vite-plus/test";
import { getTagLib, setBufferMode } from "../src/simple/index.ts";

/** TagLib.module is private (src/taglib/taglib-class.ts:58); a test needs the loaded backend's identity. `isWasi` is WASI-only — the emscripten module omits it (tests/unified-api.test.ts:182). */
type TagLibWithModule = { module: { isWasi?: boolean } };

/**
 * Pin the Simple API's backend for a suite, and prove it took effect.
 *
 * `setBufferMode` clears a lazily-created singleton, so a call at describe
 * scope is applied at collection time and the LAST one wins for the whole file
 * — a `[wasi]` suite written that way silently runs on emscripten and passes
 * vacuously (taglib-sz1n). Call this from the suite's `beforeAll`; the
 * assertion keeps the suite honest about the backend its name claims.
 */
export async function useSimpleBackend(bufferMode: boolean): Promise<void> {
  setBufferMode(bufferMode);
  const taglib = (await getTagLib()) as unknown as TagLibWithModule;
  expect(taglib.module.isWasi ?? false).toStrictEqual(!bufferMode);
}
