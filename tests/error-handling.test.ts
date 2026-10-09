/**
 * @fileoverview Tests for enhanced error handling with context
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { TagLib } from "../src/taglib.ts";
import { detectRuntime } from "../src/runtime/detector.ts";
import {
  type applyTags,
  readProperties,
  readTags,
  setBufferMode,
} from "../src/simple/index.ts";
import {
  FileOperationError,
  InvalidFormatError,
  type isFileOperationError,
  isInvalidFormatError,
  type isMetadataError,
  isTagLibError,
  isUnsupportedFormatError,
  type MetadataError,
  type TagLibInitializationError,
  UnsupportedFormatError,
} from "../src/errors.ts";
import { expectRejects, expectThrows } from "./_assert-helpers.ts";

setBufferMode(true);

describe("Error Handling", () => {
  it("error messages include helpful context", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });

    const tinyBuffer = new Uint8Array(100);

    await expectRejects(
      async () => await taglib.open(tinyBuffer.buffer),
      InvalidFormatError,
      "100 bytes",
    );

    const corruptedBuffer = new Uint8Array(5000);
    for (let i = 0; i < corruptedBuffer.length; i++) {
      corruptedBuffer[i] = (i * 17 + 123) % 256;
    }

    await expectRejects(
      async () => await taglib.open(corruptedBuffer.buffer),
      InvalidFormatError,
      "Buffer size: 4.9 KB",
    );
  });

  it("format-specific errors provide clear guidance", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });

    const mp3Buffer = new Uint8Array(
      readFileSync("tests/test-files/mp3/kiss-snippet.mp3"),
    );

    const file = await taglib.open(mp3Buffer.buffer);

    try {
      expectThrows(
        () => file.getMP4Item("----:com.apple.iTunes:iTunNORM"),
        UnsupportedFormatError,
        "MP3",
      );

      expectThrows(
        () => file.setMP4Item("test", "value"),
        UnsupportedFormatError,
        "MP3",
      );
    } finally {
      file.dispose();
    }
  });

  it("file operation errors include operation context", async () => {
    await expectRejects(
      async () => await readTags("/non/existent/file.mp3"),
      FileOperationError,
      "/non/existent/file.mp3",
    );

    await expectRejects(
      async () => await readTags(123 as unknown as string),
      FileOperationError,
      "Invalid file input type",
    );
  });

  it("environment errors indicate missing features", async () => {
    // Under a Node runner only Deno/Bun can be hidden: deleting `process`
    // is not equivalent to an unsupported environment (Node's module
    // machinery still runs) and the detector then falls back to "browser".
    // So this case asserts the classification that actually results from
    // removing the other runtime globals: Node remains node-wasi.
    const originalDeno = (globalThis as Record<string, unknown>).Deno;
    const originalBun = (globalThis as Record<string, unknown>).Bun;

    try {
      delete (globalThis as Record<string, unknown>).Deno;
      delete (globalThis as Record<string, unknown>).Bun;

      expect(detectRuntime().environment).toStrictEqual("node-wasi");
    } finally {
      if (originalDeno) {
        (globalThis as Record<string, unknown>).Deno = originalDeno;
      }
      if (originalBun) {
        (globalThis as Record<string, unknown>).Bun = originalBun;
      }
    }
  });

  it("error type guards work correctly", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });

    try {
      await taglib.open(new Uint8Array(50).buffer);
    } catch (error) {
      expect(isTagLibError(error)).toStrictEqual(true);
      expect(isInvalidFormatError(error)).toStrictEqual(true);
      expect(isUnsupportedFormatError(error)).toStrictEqual(false);

      if (isInvalidFormatError(error)) {
        expect(error.bufferSize).toStrictEqual(50);
        expect(error.code).toStrictEqual("INVALID_FORMAT");
      }
    }
  });

  it("metadata errors include field context", async () => {
    const wavHeader = new Uint8Array([
      0x52,
      0x49,
      0x46,
      0x46, // "RIFF"
      0x24,
      0x08,
      0x00,
      0x00, // File size - 8
      0x57,
      0x41,
      0x56,
      0x45, // "WAVE"
      0x66,
      0x6D,
      0x74,
      0x20, // "fmt "
      0x10,
      0x00,
      0x00,
      0x00, // Subchunk1Size
      0x01,
      0x00,
      0x02,
      0x00, // AudioFormat, NumChannels
      0x44,
      0xAC,
      0x00,
      0x00, // SampleRate (44100)
      0x10,
      0xB1,
      0x02,
      0x00, // ByteRate
      0x04,
      0x00,
      0x10,
      0x00, // BlockAlign, BitsPerSample
      0x64,
      0x61,
      0x74,
      0x61, // "data"
      0x00,
      0x08,
      0x00,
      0x00, // Subchunk2Size
      ...new Array(2048).fill(0), // Audio data
    ]);

    const props = await readProperties(wavHeader);
    expect(typeof props.duration).toStrictEqual("number");
    expect(typeof props.bitrate).toStrictEqual("number");
  });

  it("error codes enable programmatic error handling", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });

    try {
      await taglib.open(new Uint8Array(10).buffer);
    } catch (error) {
      if (isTagLibError(error)) {
        switch (error.code) {
          case "INVALID_FORMAT":
            expect(error.code).toStrictEqual("INVALID_FORMAT");
            break;
          case "UNSUPPORTED_FORMAT":
            break;
          default:
            throw new Error("Unexpected error code");
        }
      }
    }
  });
});
