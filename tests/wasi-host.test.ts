/**
 * @fileoverview Tests for in-process WASI host filesystem access
 *
 * Tests that TagLib can read/write audio files via path using the WASI host
 * (real filesystem syscalls) instead of loading entire files into buffers.
 */

import { describe, expect, it } from "vite-plus/test";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { expectDefined, expectRejects } from "./_assert-helpers.ts";
import { join, resolve } from "node:path";
import { loadWasiHost } from "../src/runtime/wasi-host-loader.ts";
import { WasmArena, type WasmExports } from "../src/runtime/wasi-memory.ts";
import { decodeTagData } from "../src/msgpack/decoder.ts";
import { encodeTagData } from "../src/msgpack/encoder.ts";
import type { ExtendedTag } from "../src/types.ts";

type RawTag = Record<string, unknown>;
import {
  fileExists,
  FORMAT_FILES,
  readTagsViaBuffer,
  readTagsViaPath,
  writeTagsWasi,
} from "./wasi-test-helpers.ts";
import { readTagsFromWasm } from "../src/runtime/wasi-adapter/wasm-io.ts";

const PROJECT_ROOT = resolve(process.cwd());
const TEST_FILES_DIR = resolve(PROJECT_ROOT, "tests/test-files");
const WASM_PATH = resolve(PROJECT_ROOT, "dist/wasi/taglib-wasi.wasm");

const HAS_WASM = fileExists(WASM_PATH);

describe.skipIf(!HAS_WASM)("WASI Host - In-Process Filesystem", () => {
  it("should load wasi module with preopens", async () => {
    using wasi = await loadWasiHost({
      wasmPath: WASM_PATH,
      preopens: { "/test": TEST_FILES_DIR },
    });

    expectDefined(wasi);
    expect(typeof wasi.tl_version()).toStrictEqual("string");
    expect(wasi.tl_version().length).toBeGreaterThan(0);
  });

  for (const [format, paths] of Object.entries(FORMAT_FILES)) {
    it(`should read tags from file path (${format})`, async () => {
      using wasi = await loadWasiHost({
        wasmPath: WASM_PATH,
        preopens: { "/test": TEST_FILES_DIR },
      });

      const tags = readTagsViaPath(wasi, paths.virtual) as unknown as RawTag;
      expectDefined(tags.title, `${format}: title should exist`);
      expect(tags.title).toStrictEqual("Kiss");
    });

    it(`should read tags from buffer (${format})`, async () => {
      using wasi = await loadWasiHost({
        wasmPath: WASM_PATH,
        preopens: { "/test": TEST_FILES_DIR },
      });

      const fileData = new Uint8Array(
        await readFile(resolve(TEST_FILES_DIR, paths.real)),
      );
      const tags = readTagsViaBuffer(wasi, fileData) as unknown as RawTag;
      expect(tags.title).toStrictEqual("Kiss");
    });

    it(`should produce same tags from path and buffer (${format})`, async () => {
      using wasi = await loadWasiHost({
        wasmPath: WASM_PATH,
        preopens: { "/test": TEST_FILES_DIR },
      });

      const fileData = new Uint8Array(
        await readFile(resolve(TEST_FILES_DIR, paths.real)),
      );
      const pathTags = readTagsViaPath(wasi, paths.virtual);
      const bufTags = readTagsViaBuffer(wasi, fileData);

      expect(pathTags).toStrictEqual(bufTags);
    });
  }

  it("should return error for non-existent path", async () => {
    using wasi = await loadWasiHost({
      wasmPath: WASM_PATH,
      preopens: { "/test": TEST_FILES_DIR },
    });

    using arena = new WasmArena(wasi as WasmExports);
    const pathAlloc = arena.allocString("/test/nonexistent.mp3");
    const outSizePtr = arena.allocUint32();

    const resultPtr = wasi.tl_read_tags(pathAlloc.ptr, 0, 0, outSizePtr.ptr);

    expect(resultPtr, "Should return NULL for missing file").toStrictEqual(0);
  });

  it("should reject paths outside preopens", async () => {
    using wasi = await loadWasiHost({
      wasmPath: WASM_PATH,
      preopens: { "/test": TEST_FILES_DIR },
    });

    using arena = new WasmArena(wasi as WasmExports);
    const pathAlloc = arena.allocString("/etc/passwd");
    const outSizePtr = arena.allocUint32();

    const resultPtr = wasi.tl_read_tags(pathAlloc.ptr, 0, 0, outSizePtr.ptr);

    expect(resultPtr, "Should reject paths outside preopens").toStrictEqual(0);
  });

  it("should write tags via path and read them back", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "taglib-"));
    const srcPath = resolve(TEST_FILES_DIR, "flac/kiss-snippet.flac");
    const destPath = resolve(tempDir, "test-write.flac");
    await copyFile(srcPath, destPath);

    try {
      using wasi = await loadWasiHost({
        wasmPath: WASM_PATH,
        preopens: { "/tmp": tempDir },
      });

      // Write new tags
      {
        using arena = new WasmArena(wasi as WasmExports);
        const pathAlloc = arena.allocString("/tmp/test-write.flac");
        const tags = { title: "New Title" } as unknown as ExtendedTag;
        const tagBytes = encodeTagData(tags);
        const tagBuf = arena.allocBuffer(tagBytes);
        const outSizePtr = arena.allocUint32();

        const result = wasi.tl_write_tags(
          pathAlloc.ptr,
          0,
          0,
          tagBuf.ptr,
          tagBuf.size,
          0,
          outSizePtr.ptr,
        );
        expect(result, "Write should succeed (return 0)").toStrictEqual(0);
      }

      // Re-instantiate to read back (fresh file handles)
      using wasi2 = await loadWasiHost({
        wasmPath: WASM_PATH,
        preopens: { "/tmp": tempDir },
      });

      // Read tags back and verify
      {
        using arena = new WasmArena(wasi2 as WasmExports);
        const pathAlloc = arena.allocString("/tmp/test-write.flac");
        const outSizePtr = arena.allocUint32();

        const resultPtr = wasi2.tl_read_tags(
          pathAlloc.ptr,
          0,
          0,
          outSizePtr.ptr,
        );
        expect(
          resultPtr,
          "Read-back should return valid pointer",
        ).toBeGreaterThan(0);

        const outSize = outSizePtr.readUint32();
        const u8 = new Uint8Array(wasi2.memory.buffer);
        const readTags = decodeTagData(
          new Uint8Array(u8.slice(resultPtr, resultPtr + outSize)),
        ) as unknown as RawTag;
        expect(readTags.title).toStrictEqual("New Title");
      }
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });

  it("should roundtrip extended fields via Simple API", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "taglib-"));
    const srcPath = resolve(TEST_FILES_DIR, "flac/kiss-snippet.flac");
    const destPath = resolve(tempDir, "extended-roundtrip.flac");
    await copyFile(srcPath, destPath);

    try {
      using wasi = await loadWasiHost({
        wasmPath: WASM_PATH,
        preopens: { "/tmp": tempDir },
      });

      const extendedTags = {
        title: "Roundtrip Test",
        albumArtist: "Various Artists",
        composer: "Test Composer",
        discNumber: 2,
        bpm: 128,
        acoustidFingerprint: "AQADtNQYhYkYRcg",
        musicbrainzTrackId: "abc-123-def",
        replayGainTrackGain: "-6.54 dB",
        titleSort: "Roundtrip Test, The",
        artistSort: "Artist, The",
      } as unknown as ExtendedTag;

      writeTagsWasi(wasi, "/tmp/extended-roundtrip.flac", extendedTags);

      using wasi2 = await loadWasiHost({
        wasmPath: WASM_PATH,
        preopens: { "/tmp": tempDir },
      });

      const readBack = readTagsViaPath(
        wasi2,
        "/tmp/extended-roundtrip.flac",
      ) as unknown as RawTag;
      expect(readBack.title).toStrictEqual("Roundtrip Test");
      expect(readBack.albumArtist).toStrictEqual("Various Artists");
      expect(readBack.composer).toStrictEqual("Test Composer");
      // Raw wire values are strings since taglib-qpl — the msgpack boundary
      // carries the property text verbatim so "03"/"3/12" survive, and the
      // numeric narrowing happens above it in mapPropertiesToExtendedTag.
      expect(readBack.discNumber).toStrictEqual("2");
      expect(readBack.bpm).toStrictEqual("128");
      expect(readBack.acoustidFingerprint).toStrictEqual("AQADtNQYhYkYRcg");
      expect(readBack.musicbrainzTrackId).toStrictEqual("abc-123-def");
      expect(readBack.replayGainTrackGain).toStrictEqual("-6.54 dB");
      expect(readBack.titleSort).toStrictEqual("Roundtrip Test, The");
      expect(readBack.artistSort).toStrictEqual("Artist, The");
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });

  it("should decode albumArtist from WASI buffer path", async () => {
    using wasi = await loadWasiHost({
      wasmPath: WASM_PATH,
      preopens: { "/test": TEST_FILES_DIR },
    });

    const fileData = new Uint8Array(
      await readFile(resolve(TEST_FILES_DIR, FORMAT_FILES.FLAC.real)),
    );
    const tags = readTagsViaBuffer(wasi, fileData);
    // kiss-snippet files don't have albumArtist set — absent from output
    expect(tags.albumArtist).toStrictEqual(undefined);
  });

  it("should decode composer from WASI buffer path", async () => {
    using wasi = await loadWasiHost({
      wasmPath: WASM_PATH,
      preopens: { "/test": TEST_FILES_DIR },
    });

    const fileData = new Uint8Array(
      await readFile(resolve(TEST_FILES_DIR, FORMAT_FILES.FLAC.real)),
    );
    const tags = readTagsViaBuffer(wasi, fileData);
    expect(tags.composer).toStrictEqual(undefined);
  });

  it("should decode disc number from WASI buffer path", async () => {
    using wasi = await loadWasiHost({
      wasmPath: WASM_PATH,
      preopens: { "/test": TEST_FILES_DIR },
    });

    const fileData = new Uint8Array(
      await readFile(resolve(TEST_FILES_DIR, FORMAT_FILES.FLAC.real)),
    );
    const tags = readTagsViaBuffer(wasi, fileData);
    // disc absent from kiss-snippet files
    expect((tags as Record<string, unknown>).disc).toStrictEqual(undefined);
  });

  it("should decode BPM from WASI buffer path", async () => {
    using wasi = await loadWasiHost({
      wasmPath: WASM_PATH,
      preopens: { "/test": TEST_FILES_DIR },
    });

    const fileData = new Uint8Array(
      await readFile(resolve(TEST_FILES_DIR, FORMAT_FILES.FLAC.real)),
    );
    const tags = readTagsViaBuffer(wasi, fileData);
    expect(tags.bpm).toStrictEqual(undefined);
  });

  it("should map UPPERCASE property keys to camelCase for WASI", async () => {
    using _wasi = await loadWasiHost({
      wasmPath: WASM_PATH,
      preopens: { "/test": TEST_FILES_DIR },
    });

    const { WasiFileHandle } =
      await import("../src/runtime/wasi-adapter/file-handle.ts");
    const handle = new WasiFileHandle(_wasi);
    const fileData = new Uint8Array(
      await readFile(resolve(TEST_FILES_DIR, FORMAT_FILES.FLAC.real)),
    );
    handle.loadFromBuffer(fileData);

    // ALBUMARTIST should map to albumArtist key in decoded data
    const result = handle.getProperty("albumArtist");
    expect(typeof result).toStrictEqual("string");
    handle.destroy();
  });

  it("should throw for invalid wasm path", async () => {
    await expectRejects(
      () =>
        loadWasiHost({
          wasmPath: "/nonexistent/taglib.wasm",
          preopens: {},
        }),
      Error,
    );
  });

  it("readTagsFromWasm should read tags via production code path", async () => {
    using wasi = await loadWasiHost({
      wasmPath: WASM_PATH,
      preopens: { "/test": TEST_FILES_DIR },
    });

    const mp3Path = resolve(TEST_FILES_DIR, FORMAT_FILES.MP3.real);
    const audioData = new Uint8Array(await readFile(mp3Path));
    const msgpackData = readTagsFromWasm(wasi, audioData);
    const tags = decodeTagData(msgpackData) as unknown as RawTag;

    expect(tags.title).toStrictEqual("Kiss");
    expectDefined(tags.artist);
  });

  for (const [format, paths] of Object.entries(FORMAT_FILES)) {
    it(`taglib.open() end-to-end via WASI (${format})`, async () => {
      const { TagLib } = await import("../src/taglib/taglib-class.ts");
      const taglib = await TagLib.initialize({ forceWasmType: "wasi" });
      const filePath = resolve(TEST_FILES_DIR, paths.real);
      const audioData = new Uint8Array(await readFile(filePath));

      const audioFile = await taglib.open(audioData);
      try {
        expect(audioFile.isValid()).toStrictEqual(true);
        const tag = audioFile.tag();
        expect(tag.title).toStrictEqual("Kiss");
      } finally {
        audioFile.dispose();
      }
    });
  }

  for (const [format, paths] of Object.entries(FORMAT_FILES)) {
    it(`should return non-zero audio properties via WasiFileHandle (${format})`, async () => {
      using wasi = await loadWasiHost({
        wasmPath: WASM_PATH,
        preopens: { "/test": TEST_FILES_DIR },
      });

      const { WasiFileHandle } =
        await import("../src/runtime/wasi-adapter/file-handle.ts");
      const handle = new WasiFileHandle(wasi);
      const fileData = new Uint8Array(
        await readFile(resolve(TEST_FILES_DIR, paths.real)),
      );
      handle.loadFromBuffer(fileData);

      const props = handle.getAudioProperties();
      expectDefined(props, `${format}: audioProperties should not be null`);
      expect(
        props!.sampleRate,
        `${format}: sampleRate should be > 0`,
      ).toBeGreaterThan(0);
      expect(
        props!.channels,
        `${format}: channels should be > 0`,
      ).toBeGreaterThan(0);
      expect(
        props!.durationMs ?? 0,
        `${format}: durationMs should be > 0`,
      ).toBeGreaterThan(0);

      handle.destroy();
    });
  }

  for (const [format, paths] of Object.entries(FORMAT_FILES)) {
    it(`taglib.open() audioProperties() e2e via WASI (${format})`, async () => {
      const { TagLib } = await import("../src/taglib/taglib-class.ts");
      const taglib = await TagLib.initialize({ forceWasmType: "wasi" });
      const filePath = resolve(TEST_FILES_DIR, paths.real);
      const audioData = new Uint8Array(await readFile(filePath));

      const audioFile = await taglib.open(audioData);
      try {
        const props = audioFile.audioProperties();
        expectDefined(props, `${format}: audioProperties should not be null`);
        expect(
          props!.sampleRate,
          `${format}: sampleRate should be > 0`,
        ).toBeGreaterThan(0);
        expect(
          props!.channels,
          `${format}: channels should be > 0`,
        ).toBeGreaterThan(0);
      } finally {
        audioFile.dispose();
      }
    });
  }

  it("should write tags via buffer and read them back", async () => {
    using wasi = await loadWasiHost({
      wasmPath: WASM_PATH,
      preopens: { "/test": TEST_FILES_DIR },
    });

    const { WasiFileHandle } =
      await import("../src/runtime/wasi-adapter/file-handle.ts");
    const handle = new WasiFileHandle(wasi);
    const fileData = new Uint8Array(
      await readFile(resolve(TEST_FILES_DIR, FORMAT_FILES.FLAC.real)),
    );
    handle.loadFromBuffer(fileData);

    handle.setTagData({ title: "Buffer Write Test" });
    const saved = handle.save();
    expect(saved, "save() should return true for buffer write").toStrictEqual(
      true,
    );

    // Re-read the modified buffer
    const handle2 = new WasiFileHandle(wasi);
    handle2.loadFromBuffer(handle.getBuffer());
    expect(handle2.getTagData().title).toStrictEqual("Buffer Write Test");

    handle2.destroy();
    handle.destroy();
  });

  it("should roundtrip albumArtist via buffer write", async () => {
    using wasi = await loadWasiHost({
      wasmPath: WASM_PATH,
      preopens: { "/test": TEST_FILES_DIR },
    });

    const { WasiFileHandle } =
      await import("../src/runtime/wasi-adapter/file-handle.ts");
    const handle = new WasiFileHandle(wasi);
    const fileData = new Uint8Array(
      await readFile(resolve(TEST_FILES_DIR, FORMAT_FILES.FLAC.real)),
    );
    handle.loadFromBuffer(fileData);

    handle.setProperty("albumArtist", "Test Album Artist");
    const saved = handle.save();
    expect(saved, "save() should succeed").toStrictEqual(true);

    const handle2 = new WasiFileHandle(wasi);
    handle2.loadFromBuffer(handle.getBuffer());
    expect(handle2.getProperty("albumArtist")).toStrictEqual(
      "Test Album Artist",
    );

    handle2.destroy();
    handle.destroy();
  });

  it("should roundtrip extended properties (ACOUSTID_FINGERPRINT) via buffer write", async () => {
    using wasi = await loadWasiHost({
      wasmPath: WASM_PATH,
      preopens: { "/test": TEST_FILES_DIR },
    });

    const { WasiFileHandle } =
      await import("../src/runtime/wasi-adapter/file-handle.ts");
    const handle = new WasiFileHandle(wasi);
    const fileData = new Uint8Array(
      await readFile(resolve(TEST_FILES_DIR, FORMAT_FILES.FLAC.real)),
    );
    handle.loadFromBuffer(fileData);

    handle.setProperty("acoustidFingerprint", "AQADtNQYhYkYRcg");
    const saved = handle.save();
    expect(saved, "save() should succeed").toStrictEqual(true);

    const handle2 = new WasiFileHandle(wasi);
    handle2.loadFromBuffer(handle.getBuffer());
    expect(handle2.getProperty("acoustidFingerprint")).toStrictEqual(
      "AQADtNQYhYkYRcg",
    );

    handle2.destroy();
    handle.destroy();
  });

  it("should return camelCase keys from getProperties()", async () => {
    using wasi = await loadWasiHost({
      wasmPath: WASM_PATH,
      preopens: { "/test": TEST_FILES_DIR },
    });

    const { WasiFileHandle } =
      await import("../src/runtime/wasi-adapter/file-handle.ts");
    const handle = new WasiFileHandle(wasi);
    const fileData = new Uint8Array(
      await readFile(resolve(TEST_FILES_DIR, FORMAT_FILES.FLAC.real)),
    );
    handle.loadFromBuffer(fileData);

    const props = handle.getProperties();
    // WasiFileHandle returns ALL_CAPS keys (translation to camelCase happens in BaseAudioFileImpl)
    expectDefined(props["TITLE"]);
    expect(props["TITLE"]).toStrictEqual(["Kiss"]);
    // camelCase keys should not exist at this layer
    expect("title" in props).toStrictEqual(false);
    expect("artist" in props).toStrictEqual(false);

    handle.destroy();
  });

  it("should not include audio properties in getProperties()", async () => {
    using wasi = await loadWasiHost({
      wasmPath: WASM_PATH,
      preopens: { "/test": TEST_FILES_DIR },
    });

    const { WasiFileHandle } =
      await import("../src/runtime/wasi-adapter/file-handle.ts");
    const handle = new WasiFileHandle(wasi);
    const fileData = new Uint8Array(
      await readFile(resolve(TEST_FILES_DIR, FORMAT_FILES.FLAC.real)),
    );
    handle.loadFromBuffer(fileData);

    const props = handle.getProperties();
    expect("bitrate" in props).toStrictEqual(false);
    expect("sampleRate" in props).toStrictEqual(false);
    expect("channels" in props).toStrictEqual(false);
    expect("length" in props).toStrictEqual(false);
    expect("lengthMs" in props).toStrictEqual(false);

    handle.destroy();
  });

  it("should roundtrip albumArtist via getProperties after buffer write", async () => {
    using wasi = await loadWasiHost({
      wasmPath: WASM_PATH,
      preopens: { "/test": TEST_FILES_DIR },
    });

    const { WasiFileHandle } =
      await import("../src/runtime/wasi-adapter/file-handle.ts");
    const handle = new WasiFileHandle(wasi);
    const fileData = new Uint8Array(
      await readFile(resolve(TEST_FILES_DIR, FORMAT_FILES.FLAC.real)),
    );
    handle.loadFromBuffer(fileData);

    handle.setProperty("ALBUMARTIST", "Various Artists");
    handle.save();

    const handle2 = new WasiFileHandle(wasi);
    handle2.loadFromBuffer(handle.getBuffer());
    const props = handle2.getProperties();
    expect(props["ALBUMARTIST"]).toStrictEqual(["Various Artists"]);

    handle2.destroy();
    handle.destroy();
  });

  it("should produce different bytes after tag modification", async () => {
    using wasi = await loadWasiHost({
      wasmPath: WASM_PATH,
      preopens: { "/test": TEST_FILES_DIR },
    });

    const { WasiFileHandle } =
      await import("../src/runtime/wasi-adapter/file-handle.ts");
    const handle = new WasiFileHandle(wasi);
    const fileData = new Uint8Array(
      await readFile(resolve(TEST_FILES_DIR, FORMAT_FILES.FLAC.real)),
    );
    handle.loadFromBuffer(fileData);

    handle.setTagData({ title: "Completely New Title For Byte Diff" });
    const saved = handle.save();
    expect(saved, "save() should succeed").toStrictEqual(true);

    const outputBuffer = handle.getBuffer();
    const inputAndOutputDiffer =
      fileData.length !== outputBuffer.length ||
      fileData.some((byte, i) => byte !== outputBuffer[i]);
    expect(
      inputAndOutputDiffer,
      "Output buffer should differ from input after tag modification",
    ).toStrictEqual(true);

    handle.destroy();
  });

  it("should roundtrip setProperties() via buffer write", async () => {
    using wasi = await loadWasiHost({
      wasmPath: WASM_PATH,
      preopens: { "/test": TEST_FILES_DIR },
    });

    const { WasiFileHandle } =
      await import("../src/runtime/wasi-adapter/file-handle.ts");
    const handle = new WasiFileHandle(wasi);
    const fileData = new Uint8Array(
      await readFile(resolve(TEST_FILES_DIR, FORMAT_FILES.FLAC.real)),
    );
    handle.loadFromBuffer(fileData);

    handle.setProperties({
      TITLE: ["Properties Title"],
      ARTIST: ["Properties Artist"],
      ALBUMARTIST: ["VA"],
    });
    const saved = handle.save();
    expect(saved, "save() should succeed").toStrictEqual(true);

    const handle2 = new WasiFileHandle(wasi);
    handle2.loadFromBuffer(handle.getBuffer());
    expect(handle2.getTagData().title).toStrictEqual("Properties Title");
    expect(handle2.getTagData().artist).toStrictEqual("Properties Artist");
    expect(handle2.getProperty("ALBUMARTIST")).toStrictEqual("VA");
    const props = handle2.getProperties();
    expect(props["TITLE"]).toStrictEqual(["Properties Title"]);
    expect(props["ALBUMARTIST"]).toStrictEqual(["VA"]);

    handle2.destroy();
    handle.destroy();
  });

  for (const [format, paths] of Object.entries(FORMAT_FILES)) {
    it(`should detect correct format via getFormat() (${format})`, async () => {
      using wasi = await loadWasiHost({
        wasmPath: WASM_PATH,
        preopens: { "/test": TEST_FILES_DIR },
      });

      const { WasiFileHandle } =
        await import("../src/runtime/wasi-adapter/file-handle.ts");
      const handle = new WasiFileHandle(wasi);
      const fileData = new Uint8Array(
        await readFile(resolve(TEST_FILES_DIR, paths.real)),
      );
      handle.loadFromBuffer(fileData);

      const expected: Record<string, string> = {
        FLAC: "FLAC",
        MP3: "MP3",
        WAV: "WAV",
        M4A: "MP4",
        OGG: "OGG",
        OPUS: "OPUS",
        MP4: "MP4",
        OGA: "OGG",
        WV: "WV",
        TTA: "TTA",
        WMA: "ASF",
        MKA: "MATROSKA",
        MKV: "MATROSKA",
        WEBM: "MATROSKA",
      };
      expect(
        handle.getFormat(),
        `${format}: getFormat() should return ${expected[format]}`,
      ).toStrictEqual(expected[format]);

      handle.destroy();
    });
  }

  for (const [format, paths] of Object.entries(FORMAT_FILES)) {
    it(`should return extended audio properties (${format})`, async () => {
      using wasi = await loadWasiHost({
        wasmPath: WASM_PATH,
        preopens: { "/test": TEST_FILES_DIR },
      });

      const { WasiFileHandle } =
        await import("../src/runtime/wasi-adapter/file-handle.ts");
      const handle = new WasiFileHandle(wasi);
      const fileData = new Uint8Array(
        await readFile(resolve(TEST_FILES_DIR, paths.real)),
      );
      handle.loadFromBuffer(fileData);

      const props = handle.getAudioProperties();
      expectDefined(props, `${format}: audioProperties should not be null`);

      const expected: Record<
        string,
        {
          codec: string;
          containerFormat: string;
          isLossless: boolean;
          hasBitsPerSample: boolean;
        }
      > = {
        FLAC: {
          codec: "FLAC",
          containerFormat: "FLAC",
          isLossless: true,
          hasBitsPerSample: true,
        },
        WAV: {
          codec: "PCM",
          containerFormat: "WAV",
          isLossless: true,
          hasBitsPerSample: true,
        },
        MP3: {
          codec: "MP3",
          containerFormat: "MP3",
          isLossless: false,
          hasBitsPerSample: false,
        },
        OGG: {
          codec: "Vorbis",
          containerFormat: "OGG",
          isLossless: false,
          hasBitsPerSample: false,
        },
        M4A: {
          codec: "AAC",
          containerFormat: "MP4",
          isLossless: false,
          hasBitsPerSample: true,
        },
        OPUS: {
          codec: "Opus",
          containerFormat: "OGG",
          isLossless: false,
          hasBitsPerSample: false,
        },
        MP4: {
          codec: "AAC",
          containerFormat: "MP4",
          isLossless: false,
          hasBitsPerSample: true,
        },
        OGA: {
          codec: "Vorbis",
          containerFormat: "OGG",
          isLossless: false,
          hasBitsPerSample: false,
        },
        WV: {
          codec: "WavPack",
          containerFormat: "WavPack",
          isLossless: true,
          hasBitsPerSample: true,
        },
        TTA: {
          codec: "TTA",
          containerFormat: "TTA",
          isLossless: true,
          hasBitsPerSample: true,
        },
        WMA: {
          codec: "WMA",
          containerFormat: "ASF",
          isLossless: false,
          hasBitsPerSample: true,
        },
        MKA: {
          codec: "Opus",
          containerFormat: "Matroska",
          isLossless: false,
          hasBitsPerSample: false,
        },
        MKV: {
          codec: "Opus",
          containerFormat: "Matroska",
          isLossless: false,
          hasBitsPerSample: false,
        },
        WEBM: {
          codec: "Opus",
          containerFormat: "Matroska",
          isLossless: false,
          hasBitsPerSample: false,
        },
      };

      const exp = expected[format];
      expect(props!.codec, `${format}: codec mismatch`).toStrictEqual(
        exp.codec,
      );
      expect(
        props!.containerFormat,
        `${format}: containerFormat mismatch`,
      ).toStrictEqual(exp.containerFormat);
      expect(props!.isLossless, `${format}: isLossless mismatch`).toStrictEqual(
        exp.isLossless,
      );
      if (exp.hasBitsPerSample) {
        expect(
          props!.bitsPerSample,
          `${format}: bitsPerSample should be > 0`,
        ).toBeGreaterThan(0);
      }

      handle.destroy();
    });
  }

  it("should roundtrip pictures via buffer write (FLAC)", async () => {
    using wasi = await loadWasiHost({
      wasmPath: WASM_PATH,
      preopens: { "/test": TEST_FILES_DIR },
    });

    const { WasiFileHandle } =
      await import("../src/runtime/wasi-adapter/file-handle.ts");
    const handle = new WasiFileHandle(wasi);
    const fileData = new Uint8Array(
      await readFile(resolve(TEST_FILES_DIR, FORMAT_FILES.FLAC.real)),
    );
    handle.loadFromBuffer(fileData);

    const smallJpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
    ]);

    handle.setPictures([
      {
        mimeType: "image/jpeg",
        data: smallJpeg,
        type: 3,
        description: "Front Cover",
      },
    ]);
    const saved = handle.save();
    expect(saved, "save() should succeed").toStrictEqual(true);

    const handle2 = new WasiFileHandle(wasi);
    handle2.loadFromBuffer(handle.getBuffer());
    const pics = handle2.getPictures();

    expect(pics.length, "Should have 1 picture").toStrictEqual(1);
    expect(pics[0].mimeType).toStrictEqual("image/jpeg");
    expect(pics[0].type).toStrictEqual(3);
    expect(pics[0].description).toStrictEqual("Front Cover");
    expect(pics[0].data.length).toStrictEqual(smallJpeg.length);

    handle2.destroy();
    handle.destroy();
  });

  it("should clear pictures with setPictures([])", async () => {
    using wasi = await loadWasiHost({
      wasmPath: WASM_PATH,
      preopens: { "/test": TEST_FILES_DIR },
    });

    const { WasiFileHandle } =
      await import("../src/runtime/wasi-adapter/file-handle.ts");

    // First write a picture
    const handle = new WasiFileHandle(wasi);
    const fileData = new Uint8Array(
      await readFile(resolve(TEST_FILES_DIR, FORMAT_FILES.FLAC.real)),
    );
    handle.loadFromBuffer(fileData);

    handle.setPictures([
      {
        mimeType: "image/png",
        data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
        type: 0,
      },
    ]);
    handle.save();

    // Then clear
    const handle2 = new WasiFileHandle(wasi);
    handle2.loadFromBuffer(handle.getBuffer());
    handle2.setPictures([]);
    handle2.save();

    const handle3 = new WasiFileHandle(wasi);
    handle3.loadFromBuffer(handle2.getBuffer());
    expect(
      handle3.getPictures().length,
      "Pictures should be cleared",
    ).toStrictEqual(0);

    handle3.destroy();
    handle2.destroy();
    handle.destroy();
  });

  it("should not include extended audio keys in getProperties()", async () => {
    using wasi = await loadWasiHost({
      wasmPath: WASM_PATH,
      preopens: { "/test": TEST_FILES_DIR },
    });

    const { WasiFileHandle } =
      await import("../src/runtime/wasi-adapter/file-handle.ts");
    const handle = new WasiFileHandle(wasi);
    const fileData = new Uint8Array(
      await readFile(resolve(TEST_FILES_DIR, FORMAT_FILES.FLAC.real)),
    );
    handle.loadFromBuffer(fileData);

    const props = handle.getProperties();
    expect("bitsPerSample" in props).toStrictEqual(false);
    expect("codec" in props).toStrictEqual(false);
    expect("containerFormat" in props).toStrictEqual(false);
    expect("isLossless" in props).toStrictEqual(false);
    expect("pictures" in props).toStrictEqual(false);

    handle.destroy();
  });

  it("should roundtrip ratings via buffer write (FLAC)", async () => {
    using wasi = await loadWasiHost({
      wasmPath: WASM_PATH,
      preopens: { "/test": TEST_FILES_DIR },
    });

    const { WasiFileHandle } =
      await import("../src/runtime/wasi-adapter/file-handle.ts");
    const handle = new WasiFileHandle(wasi);
    const fileData = new Uint8Array(
      await readFile(resolve(TEST_FILES_DIR, FORMAT_FILES.FLAC.real)),
    );
    handle.loadFromBuffer(fileData);

    handle.setRatings([{ rating: 0.8, email: "", counter: 0 }]);
    const saved = handle.save();
    expect(saved, "save() should succeed").toStrictEqual(true);

    const handle2 = new WasiFileHandle(wasi);
    handle2.loadFromBuffer(handle.getBuffer());
    const ratings = handle2.getRatings();

    expect(ratings.length, "Should have 1 rating").toStrictEqual(1);
    // XiphComment stores as string "0.8", parses back to 0.8
    expect(
      Math.abs(ratings[0].rating - 0.8) < 0.01,
      `FLAC rating roundtrip: expected ~0.8, got ${ratings[0].rating}`,
    ).toStrictEqual(true);

    handle2.destroy();
    handle.destroy();
  });

  it("should roundtrip ratings via buffer write (MP3 POPM)", async () => {
    using wasi = await loadWasiHost({
      wasmPath: WASM_PATH,
      preopens: { "/test": TEST_FILES_DIR },
    });

    const { WasiFileHandle } =
      await import("../src/runtime/wasi-adapter/file-handle.ts");
    const handle = new WasiFileHandle(wasi);
    const fileData = new Uint8Array(
      await readFile(resolve(TEST_FILES_DIR, FORMAT_FILES.MP3.real)),
    );
    handle.loadFromBuffer(fileData);

    handle.setRatings([
      {
        rating: 0.8,
        email: "test@example.com",
        counter: 42,
      },
    ]);
    const saved = handle.save();
    expect(saved, "save() should succeed").toStrictEqual(true);

    const handle2 = new WasiFileHandle(wasi);
    handle2.loadFromBuffer(handle.getBuffer());
    const ratings = handle2.getRatings();

    expect(ratings.length, "Should have 1 rating").toStrictEqual(1);
    // POPM: 0.8 * 255 + 0.5 = 204, then 204/255 = 0.8 exactly
    expect(
      Math.abs(ratings[0].rating - 0.8) < 0.01,
      `MP3 rating roundtrip: expected ~0.8, got ${ratings[0].rating}`,
    ).toStrictEqual(true);
    expect(ratings[0].email).toStrictEqual("test@example.com");
    expect(ratings[0].counter).toStrictEqual(42);

    handle2.destroy();
    handle.destroy();
  });

  it("should roundtrip ratings via buffer write (OGG)", async () => {
    using wasi = await loadWasiHost({
      wasmPath: WASM_PATH,
      preopens: { "/test": TEST_FILES_DIR },
    });

    const { WasiFileHandle } =
      await import("../src/runtime/wasi-adapter/file-handle.ts");
    const handle = new WasiFileHandle(wasi);
    const fileData = new Uint8Array(
      await readFile(resolve(TEST_FILES_DIR, FORMAT_FILES.OGG.real)),
    );
    handle.loadFromBuffer(fileData);

    handle.setRatings([{ rating: 0.6 }]);
    expect(handle.save()).toStrictEqual(true);

    const handle2 = new WasiFileHandle(wasi);
    handle2.loadFromBuffer(handle.getBuffer());
    const ratings = handle2.getRatings();
    expect(ratings.length).toStrictEqual(1);
    expect(
      Math.abs(ratings[0].rating - 0.6) < 0.01,
      `OGG rating roundtrip: expected ~0.6, got ${ratings[0].rating}`,
    ).toStrictEqual(true);

    handle2.destroy();
    handle.destroy();
  });

  it("should roundtrip ratings via buffer write (M4A)", async () => {
    using wasi = await loadWasiHost({
      wasmPath: WASM_PATH,
      preopens: { "/test": TEST_FILES_DIR },
    });

    const { WasiFileHandle } =
      await import("../src/runtime/wasi-adapter/file-handle.ts");
    const handle = new WasiFileHandle(wasi);
    const fileData = new Uint8Array(
      await readFile(resolve(TEST_FILES_DIR, FORMAT_FILES.M4A.real)),
    );
    handle.loadFromBuffer(fileData);

    handle.setRatings([{ rating: 0.9 }]);
    expect(handle.save()).toStrictEqual(true);

    const handle2 = new WasiFileHandle(wasi);
    handle2.loadFromBuffer(handle.getBuffer());
    const ratings = handle2.getRatings();
    expect(ratings.length).toStrictEqual(1);
    expect(
      Math.abs(ratings[0].rating - 0.9) < 0.01,
      `M4A rating roundtrip: expected ~0.9, got ${ratings[0].rating}`,
    ).toStrictEqual(true);

    handle2.destroy();
    handle.destroy();
  });

  it("should return empty ratings for files without ratings", async () => {
    using wasi = await loadWasiHost({
      wasmPath: WASM_PATH,
      preopens: { "/test": TEST_FILES_DIR },
    });

    const { WasiFileHandle } =
      await import("../src/runtime/wasi-adapter/file-handle.ts");
    const handle = new WasiFileHandle(wasi);
    const fileData = new Uint8Array(
      await readFile(resolve(TEST_FILES_DIR, FORMAT_FILES.FLAC.real)),
    );
    handle.loadFromBuffer(fileData);

    const ratings = handle.getRatings();
    expect(ratings.length, "Should have no ratings").toStrictEqual(0);

    handle.destroy();
  });

  it("should not include ratings in getProperties()", async () => {
    using wasi = await loadWasiHost({
      wasmPath: WASM_PATH,
      preopens: { "/test": TEST_FILES_DIR },
    });

    const { WasiFileHandle } =
      await import("../src/runtime/wasi-adapter/file-handle.ts");

    // Write a rating first
    const handle = new WasiFileHandle(wasi);
    const fileData = new Uint8Array(
      await readFile(resolve(TEST_FILES_DIR, FORMAT_FILES.FLAC.real)),
    );
    handle.loadFromBuffer(fileData);
    handle.setRatings([{ rating: 0.5 }]);
    handle.save();

    // Read back and check getProperties doesn't include ratings
    const handle2 = new WasiFileHandle(wasi);
    handle2.loadFromBuffer(handle.getBuffer());
    const props = handle2.getProperties();
    expect("ratings" in props).toStrictEqual(false);

    handle2.destroy();
    handle.destroy();
  });

  const SKIP_MULTI_VALUE = new Set(["WMA"]);

  for (const [format, paths] of Object.entries(FORMAT_FILES)) {
    const ext = paths.real.split(".").pop()!;
    it.skipIf(SKIP_MULTI_VALUE.has(format))(
      `should roundtrip multi-value artist via WASI path write (${format})`,
      async () => {
        const tempDir = await mkdtemp(join(tmpdir(), "taglib-"));
        const srcPath = resolve(TEST_FILES_DIR, paths.real);
        const destPath = resolve(tempDir, `multi-value.${ext}`);
        await copyFile(srcPath, destPath);

        try {
          using wasi = await loadWasiHost({
            wasmPath: WASM_PATH,
            preopens: { "/tmp": tempDir },
          });

          const multiValueTags = {
            artist: ["Artist One", "Artist Two"],
            title: "Multi-Value Test",
          } as unknown as ExtendedTag;

          writeTagsWasi(wasi, `/tmp/multi-value.${ext}`, multiValueTags);

          using wasi2 = await loadWasiHost({
            wasmPath: WASM_PATH,
            preopens: { "/tmp": tempDir },
          });

          const readBack = readTagsViaPath(
            wasi2,
            `/tmp/multi-value.${ext}`,
          ) as unknown as RawTag;
          expect(readBack.title).toStrictEqual("Multi-Value Test");
          expect(readBack.artist).toStrictEqual(["Artist One", "Artist Two"]);
        } finally {
          await rm(tempDir, { recursive: true });
        }
      },
    );
  }

  it("should saveToFile() via WASI buffer write path", async () => {
    const { TagLib } = await import("../src/taglib/taglib-class.ts");
    const taglib = await TagLib.initialize({ forceWasmType: "wasi" });

    const fileData = new Uint8Array(
      await readFile(resolve(TEST_FILES_DIR, FORMAT_FILES.FLAC.real)),
    );
    const audioFile = await taglib.open(fileData);

    const tempDir = await mkdtemp(join(tmpdir(), "taglib-"));
    const tempPath = resolve(tempDir, "save-test.flac");
    try {
      audioFile.tag().setTitle("SaveToFile Test");
      await audioFile.saveToFile(tempPath);

      const saved = new Uint8Array(await readFile(tempPath));
      const audioFile2 = await taglib.open(saved);
      try {
        expect(audioFile2.tag().title).toStrictEqual("SaveToFile Test");
      } finally {
        audioFile2.dispose();
      }
    } finally {
      audioFile.dispose();
      await rm(tempDir, { recursive: true });
    }
  });
});
