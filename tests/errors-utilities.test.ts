/**
 * @fileoverview Tests for error type guards and utility functions in errors.ts
 */

import { describe, expect, it } from "vite-plus/test";
import {
  EnvironmentError,
  FileOperationError,
  InvalidFormatError,
  isEnvironmentError,
  isFileOperationError,
  isInvalidFormatError,
  isMemoryError,
  isMetadataError,
  isTagLibError,
  isUnsupportedFormatError,
  MemoryError,
  MetadataError,
  SUPPORTED_FORMATS,
  TagLibError,
  TagLibInitializationError,
  UnsupportedFormatError,
} from "../src/errors.ts";

describe("Error Classes", () => {
  it("TagLibError - base error class", () => {
    const error = new TagLibError("MEMORY", "Test message", { foo: "bar" });

    expect(error.name).toStrictEqual("TagLibError");
    expect(error.code).toStrictEqual("MEMORY");
    expect(error.message).toStrictEqual("Test message");
    expect(error.details).toStrictEqual({ foo: "bar" });
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(TagLibError);
  });

  it("TagLibInitializationError - initialization errors", () => {
    const error = new TagLibInitializationError("Module failed to load", {
      reason: "network",
    });

    expect(error.name).toStrictEqual("TagLibInitializationError");
    expect(error.code).toStrictEqual("INITIALIZATION");
    expect(error.message).toStrictEqual(
      "Failed to initialize TagLib Wasm module: Module failed to load",
    );
    expect(error.details).toStrictEqual({ reason: "network" });
    expect(error).toBeInstanceOf(TagLibError);
    expect(error).toBeInstanceOf(TagLibInitializationError);
  });

  it("InvalidFormatError - format validation errors", () => {
    const error1 = new InvalidFormatError("File may be corrupted", 500);
    expect(error1.name).toStrictEqual("InvalidFormatError");
    expect(error1.code).toStrictEqual("INVALID_FORMAT");
    expect(error1.message).toStrictEqual(
      "Invalid audio file format: File may be corrupted. Buffer size: 500 bytes. Audio files must be at least 1KB to contain valid headers.",
    );
    expect(error1.bufferSize).toStrictEqual(500);

    const error2 = new InvalidFormatError("Unknown format", 2048);
    expect(error2.message).toStrictEqual(
      "Invalid audio file format: Unknown format. Buffer size: 2.0 KB",
    );

    const error3 = new InvalidFormatError("Corrupted header", 5 * 1024 * 1024);
    expect(error3.message).toStrictEqual(
      "Invalid audio file format: Corrupted header. Buffer size: 5.0 MB",
    );

    const error4 = new InvalidFormatError("Invalid header");
    expect(error4.message).toStrictEqual(
      "Invalid audio file format: Invalid header",
    );
    expect(error4.bufferSize).toStrictEqual(undefined);

    expect(error1).toBeInstanceOf(TagLibError);
    expect(error1).toBeInstanceOf(InvalidFormatError);
  });

  it("UnsupportedFormatError - unsupported format errors", () => {
    const error = new UnsupportedFormatError("WMA");

    expect(error.name).toStrictEqual("UnsupportedFormatError");
    expect(error.code).toStrictEqual("UNSUPPORTED_FORMAT");
    expect(error.format).toStrictEqual("WMA");
    // The default is the public SUPPORTED_FORMATS constant; that constant's
    // own contents are pinned below.
    expect(error.supportedFormats).toStrictEqual(SUPPORTED_FORMATS);
    expect(error.message).toContain("Unsupported audio format: WMA.");
    expect(error.message).toContain(SUPPORTED_FORMATS.join(", "));

    const error2 = new UnsupportedFormatError("APE", ["MP3", "FLAC"]);
    expect(error2.message).toStrictEqual(
      "Unsupported audio format: APE. Supported formats: MP3, FLAC",
    );

    expect(error).toBeInstanceOf(TagLibError);
    expect(error).toBeInstanceOf(UnsupportedFormatError);
  });

  it("SUPPORTED_FORMATS - names every format the library reads", () => {
    // Prose source: README "Supported Formats" (the section corrected in
    // 159e0da), which names MP3/AAC/M4A/MP4/FLAC/OGG (Vorbis, FLAC-in-Ogg,
    // Speex)/WAV plus Opus, APE, MPC, WavPack, TrueAudio, AIFF, WMA and — for
    // the rest — FileType itself (src/types/audio-formats.ts). Every FileType
    // member except "unknown" appears, under either its FileType spelling or
    // the extension alias users' files carry.
    expect(SUPPORTED_FORMATS).toStrictEqual([
      "MP3",
      "AAC",
      "MP4",
      "M4A",
      "FLAC",
      "OGG",
      "OPUS",
      "OggFLAC",
      "SPEEX",
      "WAV",
      "AIFF",
      "ASF",
      "APE",
      "DSF",
      "DSDIFF",
      "WV",
      "MPC",
      "TTA",
      "SHN",
      "MOD",
      "S3M",
      "IT",
      "XM",
      "MATROSKA",
      "MKA",
    ]);
  });

  it("FileOperationError - file operation errors", () => {
    const error1 = new FileOperationError(
      "read",
      "Permission denied",
      "/music/song.mp3",
    );
    expect(error1.name).toStrictEqual("FileOperationError");
    expect(error1.code).toStrictEqual("FILE_OPERATION");
    expect(error1.message).toStrictEqual(
      "Failed to read file. Path: /music/song.mp3. Permission denied",
    );
    expect(error1.operation).toStrictEqual("read");
    expect(error1.path).toStrictEqual("/music/song.mp3");

    const error2 = new FileOperationError("write", "Disk full");
    expect(error2.message).toStrictEqual("Failed to write file. Disk full");

    const error3 = new FileOperationError(
      "save",
      "Network error",
      "/remote/file.mp3",
    );
    expect(error3.message).toStrictEqual(
      "Failed to save file. Path: /remote/file.mp3. Network error",
    );

    expect(error1).toBeInstanceOf(TagLibError);
    expect(error1).toBeInstanceOf(FileOperationError);
  });

  it("MetadataError - metadata operation errors", () => {
    const error1 = new MetadataError(
      "read",
      "Invalid field type",
      "CUSTOM_FIELD",
    );
    expect(error1.name).toStrictEqual("MetadataError");
    expect(error1.code).toStrictEqual("METADATA");
    expect(error1.message).toStrictEqual(
      "Failed to read metadata. Field: CUSTOM_FIELD. Invalid field type",
    );
    expect(error1.operation).toStrictEqual("read");
    expect(error1.field).toStrictEqual("CUSTOM_FIELD");

    const error2 = new MetadataError("write", "File is read-only");
    expect(error2.message).toStrictEqual(
      "Failed to write metadata. File is read-only",
    );

    expect(error1).toBeInstanceOf(TagLibError);
    expect(error1).toBeInstanceOf(MetadataError);
  });

  it("MemoryError - memory allocation errors", () => {
    const error = new MemoryError("Out of memory", {
      requestedSize: 1024 * 1024,
    });

    expect(error.name).toStrictEqual("MemoryError");
    expect(error.code).toStrictEqual("MEMORY");
    expect(error.message).toStrictEqual(
      "Memory allocation failed: Out of memory",
    );
    expect(error.details).toStrictEqual({ requestedSize: 1024 * 1024 });

    expect(error).toBeInstanceOf(TagLibError);
    expect(error).toBeInstanceOf(MemoryError);
  });

  it("EnvironmentError - environment compatibility errors", () => {
    const error1 = new EnvironmentError(
      "Cloudflare Workers",
      "does not support",
      "filesystem access",
    );
    expect(error1.name).toStrictEqual("EnvironmentError");
    expect(error1.message).toStrictEqual(
      "Environment 'Cloudflare Workers' does not support. Required feature: filesystem access.",
    );
    expect(error1.environment).toStrictEqual("Cloudflare Workers");
    expect(error1.reason).toStrictEqual("does not support");
    expect(error1.requiredFeature).toStrictEqual("filesystem access");

    const error2 = new EnvironmentError(
      "Browser",
      "is not configured properly",
    );
    expect(error2.message).toStrictEqual(
      "Environment 'Browser' is not configured properly.",
    );

    expect(error1).toBeInstanceOf(TagLibError);
    expect(error1).toBeInstanceOf(EnvironmentError);
  });
});

describe("Type Guards", () => {
  it("isTagLibError - type guard for base error", () => {
    expect(isTagLibError(new TagLibError("MEMORY", "message"))).toStrictEqual(
      true,
    );
    expect(isTagLibError(new TagLibInitializationError("failed")))
      .toStrictEqual(true);
    expect(isTagLibError(new InvalidFormatError("bad format"))).toStrictEqual(
      true,
    );
    expect(isTagLibError(new UnsupportedFormatError("WMA"))).toStrictEqual(
      true,
    );
    expect(isTagLibError(new FileOperationError("read", "failed")))
      .toStrictEqual(true);
    expect(isTagLibError(new MetadataError("write", "failed"))).toStrictEqual(
      true,
    );
    expect(isTagLibError(new MemoryError("OOM"))).toStrictEqual(true);
    expect(isTagLibError(new EnvironmentError("test", "failed"))).toStrictEqual(
      true,
    );
    expect(isTagLibError(new Error("regular error"))).toStrictEqual(false);
    expect(isTagLibError("not an error")).toStrictEqual(false);
    expect(isTagLibError(null)).toStrictEqual(false);
    expect(isTagLibError(undefined)).toStrictEqual(false);
    expect(isTagLibError({})).toStrictEqual(false);
  });

  it("isInvalidFormatError - type guard", () => {
    expect(isInvalidFormatError(new InvalidFormatError("bad"))).toStrictEqual(
      true,
    );
    expect(isInvalidFormatError(new InvalidFormatError("bad", 100)))
      .toStrictEqual(true);

    expect(isInvalidFormatError(new TagLibError("MEMORY", "msg")))
      .toStrictEqual(false);
    expect(isInvalidFormatError(new UnsupportedFormatError("WMA")))
      .toStrictEqual(false);
    expect(isInvalidFormatError(new Error("regular"))).toStrictEqual(false);
    expect(isInvalidFormatError("not an error")).toStrictEqual(false);
  });

  it("isUnsupportedFormatError - type guard", () => {
    expect(isUnsupportedFormatError(new UnsupportedFormatError("WMA")))
      .toStrictEqual(true);
    expect(isUnsupportedFormatError(new UnsupportedFormatError("APE", ["MP3"])))
      .toStrictEqual(true);

    expect(isUnsupportedFormatError(new InvalidFormatError("bad")))
      .toStrictEqual(false);
    expect(isUnsupportedFormatError(new TagLibError("MEMORY", "msg")))
      .toStrictEqual(false);
    expect(isUnsupportedFormatError(new Error("regular"))).toStrictEqual(false);
    expect(isUnsupportedFormatError(null)).toStrictEqual(false);
  });

  it("isFileOperationError - type guard", () => {
    expect(isFileOperationError(new FileOperationError("read", "failed")))
      .toStrictEqual(true);
    expect(isFileOperationError(
      new FileOperationError("write", "failed", "/path"),
    )).toStrictEqual(true);

    expect(isFileOperationError(new TagLibError("MEMORY", "msg")))
      .toStrictEqual(false);
    expect(isFileOperationError(new MetadataError("read", "failed")))
      .toStrictEqual(false);
    expect(isFileOperationError(new Error("regular"))).toStrictEqual(false);
    expect(isFileOperationError(undefined)).toStrictEqual(false);
  });

  it("isMetadataError - type guard", () => {
    expect(isMetadataError(new MetadataError("read", "failed"))).toStrictEqual(
      true,
    );
    expect(isMetadataError(new MetadataError("write", "failed", "FIELD")))
      .toStrictEqual(true);

    expect(isMetadataError(new FileOperationError("read", "failed")))
      .toStrictEqual(false);
    expect(isMetadataError(new TagLibError("MEMORY", "msg"))).toStrictEqual(
      false,
    );
    expect(isMetadataError("not an error")).toStrictEqual(false);
  });

  it("isMemoryError - type guard", () => {
    expect(isMemoryError(new MemoryError("OOM"))).toStrictEqual(true);
    expect(isMemoryError(new MemoryError("allocation failed", { size: 1024 })))
      .toStrictEqual(true);

    expect(isMemoryError(new TagLibError("MEMORY", "msg"))).toStrictEqual(
      false,
    );
    expect(isMemoryError(new Error("regular"))).toStrictEqual(false);
    expect(isMemoryError({})).toStrictEqual(false);
  });

  it("isEnvironmentError - type guard", () => {
    expect(isEnvironmentError(new EnvironmentError("Browser", "unsupported")))
      .toStrictEqual(true);
    expect(isEnvironmentError(new EnvironmentError("Worker", "missing", "fs")))
      .toStrictEqual(true);

    expect(isEnvironmentError(new TagLibError("MEMORY", "msg"))).toStrictEqual(
      false,
    );
    expect(isEnvironmentError(123)).toStrictEqual(false);
  });
});

describe("Utilities", () => {
  it("formatFileSize helper - human readable sizes", () => {
    const error1 = new InvalidFormatError("test", 100);
    expect(error1.message.includes("100 bytes")).toStrictEqual(true);

    const error2 = new InvalidFormatError("test", 1023);
    expect(error2.message.includes("1023 bytes")).toStrictEqual(true);

    const error3 = new InvalidFormatError("test", 1024);
    expect(error3.message.includes("1.0 KB")).toStrictEqual(true);

    const error4 = new InvalidFormatError("test", 1536);
    expect(error4.message.includes("1.5 KB")).toStrictEqual(true);

    const error5 = new InvalidFormatError("test", 1024 * 1024 - 1);
    expect(error5.message.includes("1024.0 KB")).toStrictEqual(true);

    const error6 = new InvalidFormatError("test", 1024 * 1024);
    expect(error6.message.includes("1.0 MB")).toStrictEqual(true);

    const error7 = new InvalidFormatError("test", 1.5 * 1024 * 1024);
    expect(error7.message.includes("1.5 MB")).toStrictEqual(true);

    const error8 = new InvalidFormatError("test", 10.25 * 1024 * 1024);
    expect(error8.message.includes("10.3 MB")).toStrictEqual(true);
  });

  it("Error inheritance chain", () => {
    const errors = [
      new TagLibInitializationError("test"),
      new InvalidFormatError("test"),
      new UnsupportedFormatError("test"),
      new FileOperationError("read", "test"),
      new MetadataError("read", "test"),
      new MemoryError("test"),
      new EnvironmentError("test", "reason"),
    ];

    for (const error of errors) {
      expect(error, `${error.name} should be instanceof Error`).toBeInstanceOf(
        Error,
      );
      expect(error, `${error.name} should be instanceof TagLibError`)
        .toBeInstanceOf(TagLibError);
      expect(typeof error.message, `${error.name} should have message`)
        .toStrictEqual("string");
      expect(typeof error.code, `${error.name} should have code`).toStrictEqual(
        "string",
      );
      expect(typeof error.name, `${error.name} should have name`).toStrictEqual(
        "string",
      );
    }
  });
});
