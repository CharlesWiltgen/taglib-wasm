/**
 * @fileoverview Benchmark comparing WASI host (path I/O) vs Emscripten (buffer I/O)
 *
 * Quantifies performance difference between:
 * 1. WASI host: Seek-based filesystem I/O via WASI syscalls (reads only headers/tags)
 * 2. Emscripten: Host reads entire file into memory, passes buffer to Wasm
 *
 * Emscripten benchmarks intentionally include host file I/O (readFile) to
 * measure end-to-end cost — the real-world workflow requires loading the full
 * file before passing it to the Wasm module.
 *
 * Run with: npx tsx tests/wasi-vs-emscripten.bench.ts
 */

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadWasiHost } from "../src/runtime/wasi-host-loader.ts";
import { TagLib } from "../src/taglib.ts";
import type { WasiModule } from "../src/runtime/wasmer-sdk-loader/types.ts";
import type { MutableTag } from "../src/taglib/mutable-tag.ts";
import { TEST_FILES } from "./test-utils.ts";
import {
  FORMAT_FILES,
  readTagsViaPath,
  writeTagsWasi,
} from "./wasi-test-helpers.ts";

/** Minimal replacement for Deno.bench: run fn, report best-of-N wall time. */
async function bench(label: string, fn: () => unknown, iterations = 20) {
  let best = Infinity;
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    const result = fn();
    if (result instanceof Promise) await result;
    best = Math.min(best, performance.now() - t0);
  }
  console.log(`${label}: ${best.toFixed(2)}ms (best of ${iterations})`);
}

const PROJECT_ROOT = process.cwd();
const TEST_FILES_DIR = resolve(PROJECT_ROOT, "tests/test-files");
const WASM_PATH = resolve(PROJECT_ROOT, "dist/wasi/taglib-wasi.wasm");

const DEEZER_DIR = "/Volumes/T9 (4TB)/Downloads/Deezer";
const REAL_FLAC_SRC = `${DEEZER_DIR}/Various Artists - 90s Acoustic Hits/Counting Crows - Mr. Jones.flac`;

async function readTagsEmscripten(
  taglib: TagLib,
  buf: Uint8Array,
): Promise<MutableTag> {
  const file = await taglib.open(buf);
  try {
    return file.tag();
  } finally {
    file.dispose();
  }
}

const HAS_WASM = existsSync(WASM_PATH);
const HAS_DEEZER = existsSync(DEEZER_DIR);

if (!HAS_WASM) {
  console.error(
    `❌ bench input missing: ${WASM_PATH}\n` +
      `   Build it with: pnpm run build:wasm:wasi`,
  );
  process.exit(1);
}
if (!HAS_DEEZER) {
  console.warn("Deezer volume not mounted — real-file benchmarks skipped");
}

let wasi: (WasiModule & Disposable) | null = null;
if (HAS_WASM) {
  wasi = await loadWasiHost({
    wasmPath: WASM_PATH,
    preopens: { "/test": TEST_FILES_DIR },
  });
}

let emTagLib: TagLib | null = null;
if (HAS_WASM) {
  emTagLib = await TagLib.initialize({ forceWasmType: "emscripten" });
}

let realTempDir: string | null = null;
let realWasi: (WasiModule & Disposable) | null = null;

if (HAS_WASM && HAS_DEEZER) {
  realTempDir = mkdtempSync(join(tmpdir(), "taglib-bench-"));
  await copyFile(REAL_FLAC_SRC, resolve(realTempDir, "real.flac"));

  realWasi = await loadWasiHost({
    wasmPath: WASM_PATH,
    preopens: { "/real": realTempDir },
  });
}

let writeTempDir: string | null = null;
let writeWasi: (WasiModule & Disposable) | null = null;
const WRITE_FLAC_SRC = resolve(TEST_FILES_DIR, "flac/kiss-snippet.flac");

if (HAS_WASM) {
  writeTempDir = mkdtempSync(join(tmpdir(), "taglib-bench-write-"));
  writeWasi = await loadWasiHost({
    wasmPath: WASM_PATH,
    preopens: { "/tmp": writeTempDir },
  });
}

process.on("exit", () => {
  wasi?.[Symbol.dispose]();
  realWasi?.[Symbol.dispose]();
  writeWasi?.[Symbol.dispose]();
  for (const dir of [realTempDir, writeTempDir]) {
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

// --- Per-format benchmarks (data-driven) ---
for (const [format, paths] of Object.entries(FORMAT_FILES)) {
  const group = `read-${format.toLowerCase()}`;
  await bench(`${group} :: WASI host (path I/O)`, () => {
    readTagsViaPath(wasi!, paths.virtual);
  });
  // Emscripten needs the host to load the file itself. Resolve each
  // FORMAT_FILES entry's repo-relative `real` path — FORMAT_FILES covers
  // wv/tta/wma/oga/opus/mp4, which test-utils.ts's TEST_FILES does not — and
  // skip only a fixture that is genuinely absent.
  const emscriptenPath = resolve(TEST_FILES_DIR, paths.real);
  if (!existsSync(emscriptenPath)) {
    console.log(`${group} :: Emscripten (buffer I/O): skipped (no fixture)`);
    continue;
  }
  await bench(`${group} :: Emscripten (buffer I/O)`, async () => {
    const buf = await readFile(emscriptenPath);
    await readTagsEmscripten(emTagLib!, buf);
  });
}

// --- Aggregate benchmarks ---

await bench("read-all-formats :: WASI host (path I/O)", () => {
  for (const paths of Object.values(FORMAT_FILES)) {
    readTagsViaPath(wasi!, paths.virtual);
  }
});

await bench("read-all-formats :: Emscripten (buffer I/O)", async () => {
  for (const file of Object.values(TEST_FILES)) {
    const buf = await readFile(resolve(PROJECT_ROOT, file));
    await readTagsEmscripten(emTagLib!, buf);
  }
});

// --- Write roundtrip ---

await bench("write-roundtrip :: WASI host (path I/O)", async () => {
  const dest = resolve(writeTempDir!, "bench-write.flac");
  await copyFile(WRITE_FLAC_SRC, dest);
  writeTagsWasi(writeWasi!, "/tmp/bench-write.flac", {
    title: ["Bench Title"],
  });
  readTagsViaPath(writeWasi!, "/tmp/bench-write.flac");
});

await bench("write-roundtrip :: Emscripten (buffer I/O)", async () => {
  const buf = await readFile(WRITE_FLAC_SRC);
  const file = await emTagLib!.open(buf);
  try {
    const tag = file.tag();
    tag.setTitle("Bench Title");
    file.save();
    const modified = file.getFileBuffer();
    const tmpPath = resolve(writeTempDir!, "bench-write-em.flac");
    await writeFile(tmpPath, modified);
    const readBack = await readFile(tmpPath);
    await readTagsEmscripten(emTagLib!, readBack);
  } finally {
    file.dispose();
  }
});

// --- Batch scanning ---

await bench("batch-10 :: WASI host (path I/O)", () => {
  for (let i = 0; i < 10; i++) {
    readTagsViaPath(wasi!, "/test/flac/kiss-snippet.flac");
  }
});

await bench("batch-10 :: Emscripten (buffer I/O)", async () => {
  for (let i = 0; i < 10; i++) {
    const buf = await readFile(resolve(PROJECT_ROOT, TEST_FILES.flac));
    await readTagsEmscripten(emTagLib!, buf);
  }
});

// --- Real-world FLAC (~33MB) ---

if (HAS_DEEZER) {
  await bench("read-real-flac :: WASI host (path I/O)", () => {
    readTagsViaPath(realWasi!, "/real/real.flac");
  });

  await bench("read-real-flac :: Emscripten (buffer I/O)", async () => {
    const buf = await readFile(resolve(realTempDir!, "real.flac"));
    await readTagsEmscripten(emTagLib!, buf);
  });
} else {
  console.log("read-real-flac :: skipped (Deezer volume not mounted)");
}
