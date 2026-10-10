import { assertEquals } from "jsr:@std/assert@^1.0.19";
import { describe, it } from "jsr:@std/testing@^1.0.20/bdd";
import { isDenoCompiled } from "../src/runtime/deno-detect.ts";

describe("isDenoCompiled", () => {
  it("returns false in regular Deno runtime", () => {
    assertEquals(isDenoCompiled(), false);
  });

  it("checks Deno.mainModule for deno-compile:// prefix", () => {
    assertEquals(Deno.mainModule.includes("deno-compile://"), false);
  });
});
