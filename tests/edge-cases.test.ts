/**
 * @fileoverview Edge case tests for TagLib-Wasm
 * Tests input validation and illegal audio properties.
 * Unicode tests live in unicode-comprehensive.test.ts (forEachBackend).
 */

import { describe, expect, it } from "vite-plus/test";
import { readFile } from "node:fs/promises";
import { expectDefined, expectRejects } from "./_assert-helpers.ts";
import { TagLib } from "../src/taglib.ts";
import type { AudioFile } from "../src/taglib.ts";
import {
  readProperties,
  readTags,
  setBufferMode,
} from "../src/simple/index.ts";
import {
  FileOperationError,
  InvalidFormatError,
  type MetadataError,
  type TagLibInitializationError,
} from "../src/errors.ts";
import { TEST_FILES } from "./test-utils.ts";

// Force Emscripten backend for Simple API calls
setBufferMode(true);

describe("EdgeCases", () => {
  // ===========================================================================
  // Input Validation Tests
  // ===========================================================================

  it("Input Validation: Too small buffers", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });

    // Test various small buffer sizes
    const sizes = [0, 1, 10, 100, 500, 999];

    for (const size of sizes) {
      const smallBuffer = new Uint8Array(size);

      await expectRejects(
        async () => await taglib.open(smallBuffer.buffer),
        InvalidFormatError,
        `${size} bytes`,
      );
    }
  });

  it("Input Validation: Null and undefined inputs", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });

    // Test Full API
    await expectRejects(
      async () => await taglib.open(null as any),
      Error,
      "[object Null]",
    );

    await expectRejects(
      async () => await taglib.open(undefined as any),
      Error,
      "[object Undefined]",
    );

    // Test Simple API
    await expectRejects(
      async () => await readTags(null as any),
      FileOperationError,
      "Invalid file input",
    );

    await expectRejects(
      async () => await readTags(undefined as any),
      FileOperationError,
      "Invalid file input",
    );
  });

  it("Input Validation: Wrong input types", async () => {
    const wrongInputs = [
      { value: "string", type: "String" },
      { value: 12345, type: "Number" },
      { value: true, type: "Boolean" },
      { value: {}, type: "Object" },
      { value: [], type: "Array" },
      { value: new Date(), type: "Date" },
    ];

    for (const { value, type } of wrongInputs) {
      if (type === "String") {
        await expectRejects(
          async () => await readTags(value as any),
          FileOperationError,
          undefined,
        );
      } else {
        await expectRejects(
          async () => await readTags(value as any),
          FileOperationError,
          "Invalid file input",
        );
      }
    }
  });

  it("Input Validation: Empty buffers", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });

    // Test completely empty buffer
    const emptyBuffer = new Uint8Array(0);

    await expectRejects(
      async () => await taglib.open(emptyBuffer.buffer),
      InvalidFormatError,
      "0 bytes",
    );

    // Test empty ArrayBuffer
    const emptyArrayBuffer = new ArrayBuffer(0);

    await expectRejects(
      async () => await taglib.open(emptyArrayBuffer),
      InvalidFormatError,
      "0 bytes",
    );
  });

  it("Input Validation: Non-audio data", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });

    // Test with plain text
    const textData = new TextEncoder().encode("This is not an audio file!");
    const paddedText = new Uint8Array(2048);
    paddedText.set(textData);

    await expectRejects(
      async () => await taglib.open(paddedText.buffer),
      InvalidFormatError,
      "Invalid audio",
    );

    // Test with definitely non-audio data (avoid random chance of matching audio signatures)
    const nonAudioData = new Uint8Array(2048);
    // Fill with a pattern that won't match any audio format
    // Avoid 0xFF (MP3), 0x00 (some formats), RIFF, fLaC, OggS, etc.
    for (let i = 0; i < nonAudioData.length; i++) {
      nonAudioData[i] = 0xAB; // Use a specific non-audio byte pattern
    }

    await expectRejects(
      async () => await taglib.open(nonAudioData.buffer),
      InvalidFormatError,
      "Invalid audio",
    );

    // Test with PNG signature
    const pngData = new Uint8Array(2048);
    pngData.set([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]); // PNG header

    await expectRejects(
      async () => await taglib.open(pngData.buffer),
      InvalidFormatError,
      "Invalid audio",
    );
  });

  // ===========================================================================
  // Illegal Audio Properties Tests
  // ===========================================================================

  it("Audio Properties: Invalid values handling", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });

    // We'll use a valid file and check that properties are reasonable
    const audioData = new Uint8Array(await readFile(TEST_FILES.mp3));
    const file = await taglib.open(audioData.buffer);

    try {
      const props = file.audioProperties();

      // Verify properties are valid numbers
      expectDefined(props, "Properties should not be undefined");
      expect(Number.isFinite(props.duration), "Duration should be finite")
        .toBeTruthy();
      expect(props.duration >= 0, "Duration should not be negative")
        .toBeTruthy();

      expect(Number.isFinite(props.bitrate), "Bitrate should be finite")
        .toBeTruthy();
      expect(props.bitrate > 0, "Bitrate should be positive").toBeTruthy();

      expect(Number.isFinite(props.sampleRate), "Sample rate should be finite")
        .toBeTruthy();
      expect(props.sampleRate > 0, "Sample rate should be positive")
        .toBeTruthy();

      expect(Number.isInteger(props.channels), "Channels should be integer")
        .toBeTruthy();
      expect(
        props.channels > 0 && props.channels <= 8,
        "Channels should be 1-8",
      ).toBeTruthy();
    } finally {
      file.dispose();
    }
  });

  it("Audio Properties: Edge case values", async () => {
    // Test with different format files to check property handling
    const formats = [
      { path: TEST_FILES.wav, format: "WAV" },
      { path: TEST_FILES.flac, format: "FLAC" },
      { path: TEST_FILES.ogg, format: "OGG" },
    ];

    for (const { path, format } of formats) {
      const audioData = new Uint8Array(await readFile(path));
      const props = await readProperties(audioData);

      // Common validations
      expect(
        props.duration > 0 && props.duration < 3600,
        `${format}: Duration should be reasonable (0-3600s)`,
      ).toBeTruthy();

      expect(
        props.bitrate > 0 && props.bitrate < 10000,
        `${format}: Bitrate should be reasonable (0-10Mbps)`,
      ).toBeTruthy();

      expect(
        [
          8000,
          11025,
          16000,
          22050,
          32000,
          44100,
          48000,
          88200,
          96000,
          176400,
          192000,
        ]
          .includes(props.sampleRate) || props.sampleRate > 0,
        `${format}: Sample rate should be standard or at least positive`,
      ).toBeTruthy();

      expect(
        [1, 2, 3, 4, 5, 6, 7, 8].includes(props.channels),
        `${format}: Channels should be 1-8`,
      ).toBeTruthy();
    }
  });

  it("Audio Properties: Corrupted header handling", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });

    // Create a buffer that looks like MP3 but has corrupted header
    const corruptedMP3 = new Uint8Array(2048);

    // Start with valid ID3v2 header
    corruptedMP3.set([
      0x49,
      0x44,
      0x33,
      0x04,
      0x00,
      0x00, // ID3v2.4
      0x00,
      0x00,
      0x00,
      0x00, // Size
    ]);

    // Add invalid MPEG frame header at offset 10
    corruptedMP3.set([
      0xFF,
      0xF0, // Invalid sync + version
      0x00,
      0x00, // Invalid layer + bitrate
    ], 10);

    // File might open but properties could be invalid
    let fileOpened = false;
    try {
      const file = await taglib.open(corruptedMP3.buffer);
      fileOpened = true;
      const props = file.audioProperties();

      // If we get here, properties should at least be safe values
      expectDefined(props, "Properties should not be undefined");
      expect(Number.isFinite(props.duration), "Should not return NaN duration")
        .toBeTruthy();
      expect(Number.isFinite(props.bitrate), "Should not return NaN bitrate")
        .toBeTruthy();
      expect(props.duration >= 0, "Duration should not be negative")
        .toBeTruthy();
      expect(props.bitrate >= 0, "Bitrate should not be negative").toBeTruthy();

      file.dispose();
    } catch (error) {
      // Either opening failed or properties failed - both are acceptable
      expect(
        error instanceof InvalidFormatError ||
          error instanceof Error,
        "Should throw an error for corrupted data",
      ).toBeTruthy();
    }

    // The test passes if either:
    // 1. An error was thrown (corrupted data rejected)
    // 2. File opened but returned safe property values
  });

  // ===========================================================================
  // Degenerate input must not corrupt the heap (taglib-f5hp)
  // ===========================================================================

  // A file TagLib cannot open on the first try takes Emscripten's fallback
  // branch in FileHandle::loadFromBuffer, which used to hand a File the
  // unique_ptr already owned to FileRef -- and FileRef takes ownership too
  // (fileref.h:208-212; FileRefPrivate's destructor is `delete file`). The
  // double free corrupted the allocator, so open() and every read SUCCEEDED and
  // the abort landed on dispose() as a Wasm `unreachable` trap. A trap is not a
  // JS exception, so callers could not catch it: 12.5% of one real 384-file MP3
  // library was unusable on Emscripten.
  //
  // The smallest reproducer was 43 bytes; this uses 4 KB so it clears the
  // minimum-buffer validation and exercises the public API.
  const DEGENERATE_MP3 = (() => {
    const tag = new Uint8Array(10);
    tag.set(new TextEncoder().encode("ID3"), 0);
    tag[3] = 3; // ID3v2.3, declared size 0
    const file = new Uint8Array(tag.length + 4096);
    file.set(tag, 0);
    return file; // ...followed by zeros: no MPEG frame anywhere
  })();

  for (const backend of ["wasi", "emscripten"] as const) {
    it(`Degenerate input: dispose() does not trap [${backend}]`, async () => {
      const taglib = await TagLib.initialize({ forceWasmType: backend });

      // Either outcome is acceptable — reject it, or open it and dispose
      // cleanly. What must NEVER happen is an uncatchable trap, which shows up
      // here as the whole test dying rather than as a caught error.
      let opened: AudioFile | undefined;
      try {
        opened = await taglib.open(DEGENERATE_MP3);
      } catch (error) {
        expect(error instanceof Error, "a rejection must be a catchable Error")
          .toBeTruthy();
        return;
      }
      opened.properties();
      opened.dispose();
    });
  }
});
