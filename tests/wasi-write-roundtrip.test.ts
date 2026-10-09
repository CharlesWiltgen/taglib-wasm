/**
 * @fileoverview WASI write roundtrip tests for all formats.
 *
 * The existing wasi-host.test.ts only tests write for FLAC.
 * This file extends coverage to all formats with varied tag data.
 */

import {
  type afterAll,
  type beforeAll,
  describe,
  expect,
  it,
} from "vite-plus/test";
import { copyFile, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadWasiHost } from "../src/runtime/wasi-host-loader.ts";
import {
  fileExists,
  FORMAT_FILES,
  readTagsViaPath,
  writeTagsWasi,
} from "./wasi-test-helpers.ts";
import { type FORMATS, TEST_FILES_DIR_PATH } from "./shared-fixtures.ts";
import type { ExtendedTag } from "../src/types.ts";

type RawTag = Record<string, unknown>;

const WASM_PATH = resolve(process.cwd(), "dist/wasi/taglib-wasi.wasm");
const HAS_WASM = fileExists(WASM_PATH);

describe.skipIf(!HAS_WASM)("WASI Write Roundtrip - All Formats", () => {
  for (const [format, paths] of Object.entries(FORMAT_FILES)) {
    it(`should write and read back tags (${format})`, async () => {
      const tempDir = await mkdtemp(join(tmpdir(), "taglib-"));
      const ext = paths.real.split(".").pop()!;
      const destFile = `roundtrip.${ext}`;
      const srcPath = resolve(TEST_FILES_DIR_PATH, paths.real);
      const destPath = resolve(tempDir, destFile);
      await copyFile(srcPath, destPath);

      try {
        using wasi = await loadWasiHost({
          wasmPath: WASM_PATH,
          preopens: { "/tmp": tempDir },
        });

        writeTagsWasi(wasi, `/tmp/${destFile}`, {
          title: `Written ${format}`,
          artist: "Roundtrip Artist",
          album: "Roundtrip Album",
        } as unknown as ExtendedTag);

        using wasi2 = await loadWasiHost({
          wasmPath: WASM_PATH,
          preopens: { "/tmp": tempDir },
        });

        const tags = readTagsViaPath(
          wasi2,
          `/tmp/${destFile}`,
        ) as unknown as RawTag;
        expect(tags.title).toStrictEqual(`Written ${format}`);
        expect(tags.artist).toStrictEqual("Roundtrip Artist");
        expect(tags.album).toStrictEqual("Roundtrip Album");
      } finally {
        await rm(tempDir, { recursive: true }).catch(() => {});
      }
    });

    it(`should preserve audio data after write (${format})`, async () => {
      const tempDir = await mkdtemp(join(tmpdir(), "taglib-"));
      const ext = paths.real.split(".").pop()!;
      const destFile = `preserve.${ext}`;
      const srcPath = resolve(TEST_FILES_DIR_PATH, paths.real);
      const destPath = resolve(tempDir, destFile);
      await copyFile(srcPath, destPath);

      try {
        const sizeBefore = (await stat(destPath)).size;

        using wasi = await loadWasiHost({
          wasmPath: WASM_PATH,
          preopens: { "/tmp": tempDir },
        });

        writeTagsWasi(wasi, `/tmp/${destFile}`, {
          title: "Size Check",
        } as unknown as ExtendedTag);

        const sizeAfter = (await stat(destPath)).size;
        expect(
          sizeAfter,
          `${format}: file should not be empty after write`,
        ).toBeGreaterThan(0);
        // Size should be in reasonable range (tag overhead varies)
        const ratio = sizeAfter / sizeBefore;
        expect(
          ratio > 0.5 && ratio < 3.0,
          `${format}: size ratio ${ratio.toFixed(2)} unreasonable`,
        ).toStrictEqual(true);
      } finally {
        await rm(tempDir, { recursive: true }).catch(() => {});
      }
    });
  }

  it("should write unicode tags via path", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "taglib-"));
    const srcPath = resolve(TEST_FILES_DIR_PATH, "flac/kiss-snippet.flac");
    const destPath = resolve(tempDir, "unicode.flac");
    await copyFile(srcPath, destPath);

    try {
      using wasi = await loadWasiHost({
        wasmPath: WASM_PATH,
        preopens: { "/tmp": tempDir },
      });

      writeTagsWasi(wasi, "/tmp/unicode.flac", {
        title: "日本語タイトル",
        artist: "Артист",
        album: "专辑",
        comment: "🎵🎸",
      } as unknown as ExtendedTag);

      using wasi2 = await loadWasiHost({
        wasmPath: WASM_PATH,
        preopens: { "/tmp": tempDir },
      });

      const tags = readTagsViaPath(
        wasi2,
        "/tmp/unicode.flac",
      ) as unknown as RawTag;
      expect(tags.title).toStrictEqual("日本語タイトル");
      expect(tags.artist).toStrictEqual("Артист");
      expect(tags.album).toStrictEqual("专辑");
      expect(tags.comment).toStrictEqual("🎵🎸");
    } finally {
      await rm(tempDir, { recursive: true }).catch(() => {});
    }
  });

  it("should overwrite tags on second write", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "taglib-"));
    const srcPath = resolve(TEST_FILES_DIR_PATH, "mp3/kiss-snippet.mp3");
    const destPath = resolve(tempDir, "overwrite.mp3");
    await copyFile(srcPath, destPath);

    try {
      // First write
      using wasi1 = await loadWasiHost({
        wasmPath: WASM_PATH,
        preopens: { "/tmp": tempDir },
      });
      writeTagsWasi(wasi1, "/tmp/overwrite.mp3", {
        title: "First Write",
      } as unknown as ExtendedTag);

      // Second write
      using wasi2 = await loadWasiHost({
        wasmPath: WASM_PATH,
        preopens: { "/tmp": tempDir },
      });
      writeTagsWasi(wasi2, "/tmp/overwrite.mp3", {
        title: "Second Write",
      } as unknown as ExtendedTag);

      // Verify
      using wasi3 = await loadWasiHost({
        wasmPath: WASM_PATH,
        preopens: { "/tmp": tempDir },
      });
      const tags = readTagsViaPath(
        wasi3,
        "/tmp/overwrite.mp3",
      ) as unknown as RawTag;
      expect(tags.title).toStrictEqual("Second Write");
    } finally {
      await rm(tempDir, { recursive: true }).catch(() => {});
    }
  });
});

describe.skipIf(!HAS_WASM)(
  "WASI COMPILATION boolean contract (taglib-c9b)",
  () => {
    it("round-trips the COMPILATION boolean as '1'/'0' (not bool/'true')", async () => {
      const tempDir = await mkdtemp(join(tmpdir(), "taglib-"));
      const destPath = resolve(tempDir, "compilation.flac");
      await copyFile(
        resolve(TEST_FILES_DIR_PATH, "flac/kiss-snippet.flac"),
        destPath,
      );

      try {
        // Write true: the typed input encodes as an mpack bool; C++ writes "1".
        using wasi1 = await loadWasiHost({
          wasmPath: WASM_PATH,
          preopens: { "/tmp": tempDir },
        });
        writeTagsWasi(wasi1, "/tmp/compilation.flac", {
          compilation: true,
        } as unknown as ExtendedTag);

        // Read back: the raw surface must carry the canonical "1" string, not
        // the mpack bool (which the pre-fix binary surfaced as JS true and the
        // property map as "true").
        using wasi2 = await loadWasiHost({
          wasmPath: WASM_PATH,
          preopens: { "/tmp": tempDir },
        });
        const tagsTrue = readTagsViaPath(
          wasi2,
          "/tmp/compilation.flac",
        ) as unknown as RawTag;
        expect(tagsTrue.compilation).toStrictEqual("1");

        // Write false, read back "0".
        writeTagsWasi(wasi2, "/tmp/compilation.flac", {
          compilation: false,
        } as unknown as ExtendedTag);
        const tagsFalse = readTagsViaPath(
          wasi2,
          "/tmp/compilation.flac",
        ) as unknown as RawTag;
        expect(tagsFalse.compilation).toStrictEqual("0");
      } finally {
        await rm(tempDir, { recursive: true }).catch(() => {});
      }
    });
  },
);
