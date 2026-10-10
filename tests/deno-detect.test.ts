/**
 * @fileoverview Tests for Deno compiled-binary detection.
 *
 * Deno-only: Vitest's config excludes this file and `pnpm run test:deno` owns it.
 * Dependency-free (`Deno.test` + the local assert helpers) since the retired
 * deno.json import map is gone.
 */

import { assertEquals } from "./deno-assert.ts";
import { isDenoCompiled } from "../src/runtime/deno-detect.ts";

Deno.test("isDenoCompiled returns false in regular Deno runtime", () => {
  assertEquals(isDenoCompiled(), false);
});

Deno.test("Deno.mainModule carries no deno-compile:// prefix", () => {
  assertEquals(Deno.mainModule.includes("deno-compile://"), false);
});
