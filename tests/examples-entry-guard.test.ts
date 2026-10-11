/**
 * The examples' entry guard must behave on every supported runtime: Node
 * >= 24.2, Deno and Bun expose `import.meta.main`, while the declared Node
 * floor (24.0/24.1) does not, and an example must not exit silently there
 * (taglib-xh2s.12).
 */

import { describe, expect, it } from "vite-plus/test";
import { fileURLToPath } from "node:url";
import { argvIsMainEntry, isMainModule } from "../examples/common/is-main.ts";

const EXAMPLE_URL = new URL(
  "../examples/common/basic-usage.ts",
  import.meta.url,
).href;

describe("examples entry guard (taglib-xh2s.12)", () => {
  it("uses the native import.meta.main flag where it exists", () => {
    expect(isMainModule({ url: EXAMPLE_URL, main: true })).toStrictEqual(true);
    expect(isMainModule({ url: EXAMPLE_URL, main: false })).toStrictEqual(
      false,
    );
  });

  it("falls back to argv[1] when the flag is absent (Node 24.0/24.1)", () => {
    // argv[1] is the runtime's resolved path; compare against a real one so
    // the case passes on every platform (fileURLToPath, not URL.pathname).
    expect(
      argvIsMainEntry(EXAMPLE_URL, fileURLToPath(EXAMPLE_URL)),
    ).toStrictEqual(true);
    expect(argvIsMainEntry(EXAMPLE_URL, "/somewhere/else.ts")).toStrictEqual(
      false,
    );
    expect(argvIsMainEntry(EXAMPLE_URL, undefined)).toStrictEqual(false);
  });
});
