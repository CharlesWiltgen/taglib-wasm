/**
 * @fileoverview Tests for WASI path-based I/O
 *
 * Verifies that the WASI backend reads/writes audio files directly via
 * filesystem syscalls instead of loading entire files into memory.
 */

import { describe, expect, it } from "vite-plus/test";
import { copyFile, rm } from "node:fs/promises";
import { expectDefined } from "./_assert-helpers.ts";
import { resolve } from "node:path";
import { TagLib } from "../index.ts";
import { applyTagsToFile, readTags } from "../simple.ts";
import { loadWasiHost } from "../src/runtime/wasi-host-loader.ts";
import {
  readTagsFromWasmPath,
  writeTagsToWasmPath,
} from "../src/runtime/wasi-adapter/wasm-io.ts";
import { supportsExnref } from "../src/runtime/detector.ts";
import type { ExtendedTag } from "../src/types.ts";

const TEST_FILES_DIR = resolve("tests/test-files");
const WASM_PATH = resolve("build/taglib-wasi.wasm");
const WASI_AVAILABLE = supportsExnref();

describe.skipIf(!WASI_AVAILABLE)("WASI path-based I/O", () => {
  describe("readTagsFromWasmPath", () => {
    it("reads tags from MP3 via path", async () => {
      using wasi = await loadWasiHost({
        wasmPath: WASM_PATH,
        preopens: { "/test": TEST_FILES_DIR },
      });
      const result = readTagsFromWasmPath(wasi, "/test/mp3/kiss-snippet.mp3");
      expectDefined(result);
      expect(result.length > 0).toStrictEqual(true);
    });

    it("reads tags from M4A via path", async () => {
      using wasi = await loadWasiHost({
        wasmPath: WASM_PATH,
        preopens: { "/test": TEST_FILES_DIR },
      });
      const result = readTagsFromWasmPath(wasi, "/test/mp4/kiss-snippet.m4a");
      expectDefined(result);
    });

    it("throws on nonexistent file", async () => {
      using wasi = await loadWasiHost({
        wasmPath: WASM_PATH,
        preopens: { "/test": TEST_FILES_DIR },
      });
      let threw = false;
      try {
        readTagsFromWasmPath(wasi, "/test/nonexistent.mp3");
      } catch (e) {
        threw = true;
        expect((e as Error).message.includes("/test/nonexistent.mp3"))
          .toStrictEqual(true);
      }
      expect(threw).toStrictEqual(true);
    });
  });

  describe("writeTagsToWasmPath", () => {
    it("writes tags and re-reads via path", async () => {
      const tmpPath = resolve(TEST_FILES_DIR, "../path-write-test.mp3");
      try {
        await copyFile(
          resolve(TEST_FILES_DIR, "mp3/kiss-snippet.mp3"),
          tmpPath,
        );
        using wasi = await loadWasiHost({
          wasmPath: WASM_PATH,
          preopens: { "/tmp": resolve(TEST_FILES_DIR, "..") },
        });

        const tags: ExtendedTag = {
          title: ["Written Via Path"],
          artist: ["WASI Test"],
        };
        writeTagsToWasmPath(wasi, "/tmp/path-write-test.mp3", tags);

        const result = readTagsFromWasmPath(
          wasi,
          "/tmp/path-write-test.mp3",
        );
        expectDefined(result);
      } finally {
        try {
          await rm(tmpPath);
        } catch { /* cleanup */ }
      }
    });
  });

  describe("TagLib.open path mode", () => {
    it("opens file by path and reads tags", async () => {
      const taglib = await TagLib.initialize();
      const mp3Path = resolve(TEST_FILES_DIR, "mp3/kiss-snippet.mp3");
      using file = await taglib.open(mp3Path);
      expect(file.tag().title).toStrictEqual("Kiss");
      expect(file.tag().artist).toStrictEqual("Prince");
    });

    it("opens file by relative path", async () => {
      const taglib = await TagLib.initialize();
      const absPath = resolve(TEST_FILES_DIR, "mp3/kiss-snippet.mp3");
      const relPath = absPath.slice(process.cwd().length + 1);
      using file = await taglib.open(relPath);
      expect(file.tag().title).toStrictEqual("Kiss");
    });

    it("returns correct audio properties", async () => {
      const taglib = await TagLib.initialize();
      const mp3Path = resolve(TEST_FILES_DIR, "mp3/kiss-snippet.mp3");
      using file = await taglib.open(mp3Path);
      const props = file.audioProperties();
      expectDefined(props);
      expectDefined(props!.duration);
      expectDefined(props!.bitrate);
      expectDefined(props!.sampleRate);
    });

    it("save() writes in-place for path-opened files", async () => {
      const tmpPath = resolve(TEST_FILES_DIR, "../path-save-test.mp3");
      try {
        await copyFile(
          resolve(TEST_FILES_DIR, "mp3/kiss-snippet.mp3"),
          tmpPath,
        );
        const taglib = await TagLib.initialize();
        {
          using file = await taglib.open(tmpPath);
          file.tag().setTitle("Path Save");
          expect(file.save()).toStrictEqual(true);
        }
        {
          using file = await taglib.open(tmpPath);
          expect(file.tag().title).toStrictEqual("Path Save");
        }
      } finally {
        try {
          await rm(tmpPath);
        } catch { /* cleanup */ }
      }
    });
  });

  describe("Simple API with path mode", () => {
    it("readTags works with file paths", async () => {
      const mp3Path = resolve(TEST_FILES_DIR, "mp3/kiss-snippet.mp3");
      const tags = await readTags(mp3Path);
      expect(tags.title?.[0]).toStrictEqual("Kiss");
      expect(tags.artist?.[0]).toStrictEqual("Prince");
    });

    it("applyTagsToFile writes and persists", async () => {
      const tmpPath = resolve(TEST_FILES_DIR, "../simple-path-test.mp3");
      try {
        await copyFile(
          resolve(TEST_FILES_DIR, "mp3/kiss-snippet.mp3"),
          tmpPath,
        );
        await applyTagsToFile(tmpPath, {
          title: "Simple Path Write",
          artist: "Test",
        });
        const tags = await readTags(tmpPath);
        expect(tags.title?.[0]).toStrictEqual("Simple Path Write");
        expect(tags.artist?.[0]).toStrictEqual("Test");
      } finally {
        try {
          await rm(tmpPath);
        } catch { /* cleanup */ }
      }
    });
  });
});
