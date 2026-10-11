/**
 * @fileoverview Simple-API write contract (taglib-chrs): the byte-returning
 * writers take a PATH as an input, never as a write target — `applyTagsToFile`
 * and the batch writers are the disk surfaces. The WASI path-mode branch broke
 * that: the handle kept the path, so `save()` reached `writeTagsToWasmPath` and
 * rewrote the caller's file while the call promised only "the modified buffer".
 *
 * All four writers (`applyTags`, `clearTags`, and the picture writers) share
 * one helper, `withAudioFileSave`, so the contract is pinned here through two
 * of them rather than once per name.
 *
 * The emscripten instance is a BASELINE, not a guard: open() reads a path into
 * the module there, so save() never reaches the host filesystem. The [wasi]
 * instance is the one that can fail on the defect.
 */

import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyTags,
  applyTagsToFile,
  clearTags,
  getTagLib,
  readTags,
  setBufferMode,
} from "../src/simple/index.ts";
import { FIXTURE_PATH } from "./shared-fixtures.ts";

/** TagLib.module is private (src/taglib/taglib-class.ts:58); a test needs the loaded backend's identity. `isWasi` is WASI-only — the emscripten module omits it entirely (tests/unified-api.test.ts:182). */
type TagLibWithModule = { module: { isWasi?: boolean } };

/**
 * `setBufferMode` clears a lazily-created singleton, so a call at describe
 * scope is applied at collection time and the LAST one wins for both suites —
 * a describe-scope toggle silently runs the [wasi] suite on emscripten (the
 * trap taglib-1zn1's cousins keep finding). beforeAll applies it where it
 * takes effect, and the assertion keeps the suite honest about its backend.
 */
async function useBackend(bufferMode: boolean): Promise<void> {
  setBufferMode(bufferMode);
  const taglib = (await getTagLib()) as unknown as TagLibWithModule;
  expect(taglib.module.isWasi ?? false).toStrictEqual(!bufferMode);
}

const tempDirs: string[] = [];

async function tempCopy(ext: "mp3" | "flac"): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "taglib-chrs-"));
  tempDirs.push(dir);
  const path = join(dir, `song.${ext}`);
  await writeFile(path, new Uint8Array(await readFile(FIXTURE_PATH[ext])));
  return path;
}

afterAll(async () => {
  await Promise.all(
    tempDirs.map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

function runScenarios() {
  it("applyTags(path) returns the tagged bytes and leaves the file byte-identical", async () => {
    const path = await tempCopy("mp3");
    const before = new Uint8Array(await readFile(path));

    const returned = await applyTags(path, { genre: "Probe Genre" });

    // The defect this pins: the path-mode handle wrote the tagged bytes to the
    // source instead of only returning them.
    expect(new Uint8Array(await readFile(path))).toStrictEqual(before);
    // The tagged bytes are the return value, not lost.
    expect(returned).not.toStrictEqual(before);
    expect((await readTags(returned)).genre).toStrictEqual(["Probe Genre"]);
  });

  it("clearTags(path) returns the stripped bytes and leaves the file byte-identical", async () => {
    const path = await tempCopy("flac");
    const before = new Uint8Array(await readFile(path));

    const returned = await clearTags(path);

    expect(new Uint8Array(await readFile(path))).toStrictEqual(before);
    expect(returned).not.toStrictEqual(before);
    expect((await readTags(returned)).title).toStrictEqual(undefined);
  });

  it("applyTagsToFile(path) is the surface that writes in place", async () => {
    const path = await tempCopy("mp3");
    const before = new Uint8Array(await readFile(path));

    await applyTagsToFile(path, { genre: "Probe Genre" });

    expect(new Uint8Array(await readFile(path))).not.toStrictEqual(before);
    expect((await readTags(path)).genre).toStrictEqual(["Probe Genre"]);
  });
}

describe("Simple-API write contract [wasi]", () => {
  beforeAll(() => useBackend(false));
  runScenarios();
});

describe("Simple-API write contract [emscripten] (baseline)", () => {
  beforeAll(() => useBackend(true));
  runScenarios();
});
