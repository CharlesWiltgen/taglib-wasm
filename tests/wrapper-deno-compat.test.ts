/**
 * Guards the Deno compatibility patches applied to Emscripten's generated glue.
 *
 * The patches are regexes over machine-generated JavaScript, so they stop
 * matching whenever emcc changes its output shape — and a partial application
 * is worse than none: the instantiation patch inserts references to
 * `ENVIRONMENT_IS_DENO` that only the detection patch defines (taglib-2z1b).
 *
 * Resurrected with the JSR restore. The 2.3.2 wrapper shipped UNPATCHED, which
 * broke every JSR consumer: under Deno the unpatched glue takes its Node branch
 * and calls `createRequire(import.meta.url)` with an `https://` URL, which
 * throws ("The argument 'filename' must be a file URL object, file URL string,
 * or absolute path string"). Loaded from disk the same glue works, so only
 * verify-jsr — importing the published package from jsr.io — could see it.
 *
 * The committed-wrapper assertions are read-only; the patcher itself is
 * exercised on throwaway fixtures under build/ (gitignored).
 */

import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PATCHER = fileURLToPath(
  new URL("../scripts/fix-deno-compat.js", import.meta.url),
);
const WRAPPER = fileURLToPath(
  new URL("../build/taglib-wrapper.js", import.meta.url),
);

/** Every patch the patcher applies, in order. */
const PATCH_NAMES = [
  "deno-environment-detection",
  "node-module-loading",
  "deno-file-reading",
  "wasm-instantiation-checks",
  "jsr-import-unfurl-alias",
];

/** Glue carrying ONLY the instantiation check: the shape that used to apply
 * one patch of five and take the build down with it. */
const PARTIAL = `if(!ENVIRONMENT_IS_NODE){throw new Error("x")}`;

/** Full glue, minified the way a release (-O3) build emits it. */
const MINIFIED = [
  `var ENVIRONMENT_IS_WEB=typeof window=="object";`,
  `var ENVIRONMENT_IS_NODE=globalThis.process?.versions?.node&&globalThis.process?.type!="renderer";`,
  `if(ENVIRONMENT_IS_NODE){const{createRequire}=await import("node:module");var require=createRequire(import.meta.url)}`,
  `var readAsync,readBinary;if(ENVIRONMENT_IS_NODE){readBinary=f=>{return 1}}`,
  `if(!ENVIRONMENT_IS_NODE){throw new Error("x")}`,
  `var imports={a:wasmImports};`,
].join("\n");

/** The same glue as a debug (-g2) build emits it — a `//` comment and an
 * `@suppress{duplicate}` annotation inside the createRequire block, and a
 * QUOTED import key. */
const UNMINIFIED = [
  `var ENVIRONMENT_IS_WEB = typeof window == "object";`,
  `var ENVIRONMENT_IS_NODE = globalThis.process?.versions?.node && globalThis.process?.type != "renderer";`,
  `if (ENVIRONMENT_IS_NODE) {`,
  `  // We need to use \`createRequire()\` to construct the require()\` function.`,
  `  const {createRequire} = await import("node:module");`,
  `  /** @suppress{duplicate} */ var require = createRequire(import.meta.url);`,
  `}`,
  `var readAsync, readBinary;\nif (ENVIRONMENT_IS_NODE) { readBinary = f => { return 1 } }`,
  `if (!ENVIRONMENT_IS_NODE) { throw new Error("x") }`,
  `  var imports = {\n    "a": wasmImports\n  };`,
].join("\n");

let fixtureSeq = 0;

/** Run the patcher on a fixture under build/ (gitignored), returning the
 * fixture path and the spawn result; the caller cleans up. */
function runOnFixture(source: string) {
  const fixture = `build/.deno-compat-test-${process.pid}-${fixtureSeq++}.js`;
  const absolute = fileURLToPath(new URL(`../${fixture}`, import.meta.url));
  writeFileSync(absolute, source);
  const result = spawnSync(process.execPath, [PATCHER, fixture], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return { absolute, result };
}

describe("fix-deno-compat", () => {
  it("the committed wrapper carries every patch", () => {
    // Read-only: this is the guard that would have caught 2.3.2, whose wrapper
    // was rebuilt unpatched and shipped to JSR that way.
    const wrapper = readFileSync(WRAPPER, "utf8");
    expect(wrapper).toContain("var ENVIRONMENT_IS_DENO=typeof Deno");
    expect(wrapper).toContain(
      'if(ENVIRONMENT_IS_NODE){const{createRequire}=await import("module")',
    );
    expect(wrapper).toContain("if(ENVIRONMENT_IS_DENO){readBinary=async");
    expect(wrapper).toContain("(!ENVIRONMENT_IS_NODE||ENVIRONMENT_IS_DENO)");
    // The JSR unfurl alias: bare key (the build guard greps it) plus the
    // "./"-prefixed twin deno publish rewrites the wasm to import.
    expect(wrapper).toMatch(/var imports=\{[A-Za-z_$][\w$]*:wasmImports/);
    expect(wrapper).toMatch(/var imports=\{[^}]*"\.\/[^"]*":wasmImports/);
  });

  it.each([
    ["minified", MINIFIED],
    ["unminified", UNMINIFIED],
  ])("applies every patch to %s glue", (_shape, source) => {
    const { absolute, result } = runOnFixture(source);
    try {
      expect(result.status, result.stderr).toStrictEqual(0);
      for (const name of PATCH_NAMES) expect(result.stdout).toContain(name);
      const patched = readFileSync(absolute, "utf8");
      expect(patched).toMatch(/var\s+ENVIRONMENT_IS_DENO\s*=/);
      expect(patched).toMatch(/var imports=\{[A-Za-z_$][\w$]*:wasmImports/);
      expect(patched).toContain('"./a":wasmImports');
    } finally {
      rmSync(absolute, { force: true });
    }
  });

  it("refuses a partial glue and names every missing patch", () => {
    const { absolute, result } = runOnFixture(PARTIAL);
    try {
      expect(result.status).toStrictEqual(1);
      expect(result.stderr).toContain("did not apply");
      for (const name of PATCH_NAMES.filter(
        (n) => n !== "wasm-instantiation-checks",
      )) {
        expect(result.stderr).toContain(name);
      }
      // Do NOT write: half-patched glue is broken in every environment.
      expect(readFileSync(absolute, "utf8")).toStrictEqual(PARTIAL);
    } finally {
      rmSync(absolute, { force: true });
    }
  });
});
