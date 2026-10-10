/**
 * Deno leg of the published-package probe.
 *
 * Driven by scripts/verify-published.mjs, which installs the version into a
 * temp directory and runs this file FROM THAT DIRECTORY. Every specifier is
 * bare, so it resolves through the installed package's `exports` map — under
 * Deno's resolver, not Node's.
 *
 * Why a second runtime: Deno reaches code Node never does (the Deno WASI
 * filesystem provider) and resolves the shipped Wasm from the emitted file
 * layout, a path that an installed package previously could not satisfy for
 * `prepareWasmForEmbedding()` — a break no Node-side check could see, because
 * the failure is a missing file relative to the emitted module.
 *
 * Env:
 *   TAGLIB_FIXTURE  absolute path to an audio file to read (required)
 *   TAGLIB_EXPECT   JSON: { format, title, codec } (required)
 *
 * Exit: 0 all checks passed · 1 a check failed · 2 environment/usage.
 */

import { fileURLToPath } from "node:url";

// The Deno globals this probe uses, declared locally: scripts/ belongs to no
// tsconfig project, so nothing ambient applies here (src/global.d.ts covers
// src/). Deno's runtime supplies the real ones.
declare const Deno: {
  env: { get(key: string): string | undefined };
  readFile(path: string | URL): Promise<Uint8Array>;
  exit(code: number): never;
};

const fixture = Deno.env.get("TAGLIB_FIXTURE");
const expected = JSON.parse(Deno.env.get("TAGLIB_EXPECT") ?? "{}");

if (!fixture || !expected.title) {
  console.error("TAGLIB_FIXTURE and TAGLIB_EXPECT must be set");
  Deno.exit(2);
}

const failures: string[] = [];
const step = (name: string, ok: boolean, detail?: string) => {
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
};

// 1. A path-mode read through the Simple API — the Deno filesystem provider.
try {
  const { readTags } = await import("taglib-wasm/simple");
  const tags = await readTags(fixture);
  step(
    'import "taglib-wasm/simple" + readTags(path)',
    tags.title?.[0] === expected.title,
    `title -> ${JSON.stringify(tags.title?.[0])}`,
  );
} catch (error) {
  step('import "taglib-wasm/simple" + readTags(path)', false, String(error));
}

// 2. The deno-compile helper must find the Wasm the package ships, from the
//    installed layout. This is the check that fails when the emitted module
//    depth and the resolver's relative paths disagree.
try {
  const { prepareWasmForEmbedding } = await import("taglib-wasm");
  const out = fileURLToPath(new URL("./wasm-copy.wasm", import.meta.url));
  await prepareWasmForEmbedding(out);
  const bytes = await Deno.readFile(out);
  const isWasm =
    bytes[0] === 0 &&
    bytes[1] === 0x61 &&
    bytes[2] === 0x73 &&
    bytes[3] === 0x6d;
  step(
    'import "taglib-wasm" + prepareWasmForEmbedding()',
    isWasm && bytes.length > 100_000,
    `${bytes.length} bytes, magic ${isWasm ? "ok" : "wrong"}`,
  );
} catch (error) {
  step(
    'import "taglib-wasm" + prepareWasmForEmbedding()',
    false,
    String(error),
  );
}

// 3. The Wasm-free subpath, under Deno's resolver.
try {
  const { discFolderInfo } = await import("taglib-wasm/disc-folder");
  step('import "taglib-wasm/disc-folder"', discFolderInfo("CD1")?.number === 1);
} catch (error) {
  step('import "taglib-wasm/disc-folder"', false, String(error));
}

if (failures.length > 0) {
  console.error(
    `\n✗ ${failures.length} check(s) failed: ${failures.join(", ")}`,
  );
  Deno.exit(1);
}
Deno.exit(0);
