/**
 * @fileoverview Tests for error type guards and utility functions in errors.ts
 */

import {
  assertEquals,
  assertInstanceOf,
} from "https://deno.land/std@0.210.0/assert/mod.ts";
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
  TagLibError,
  TagLibInitializationError,
  UnsupportedFormatError,
  WorkerError,
} from "../src/errors.ts";

Deno.test("TagLibError - base error class", () => {
  const error = new TagLibError("TEST_CODE", "Test message", { foo: "bar" });

  assertEquals(error.name, "TagLibError");
  assertEquals(error.code, "TEST_CODE");
  assertEquals(error.message, "Test message");
  assertEquals(error.details, { foo: "bar" });
  assertInstanceOf(error, Error);
  assertInstanceOf(error, TagLibError);
});

Deno.test("TagLibInitializationError - initialization errors", () => {
  const error = new TagLibInitializationError("Module failed to load", {
    reason: "network",
  });

  assertEquals(error.name, "TagLibInitializationError");
  assertEquals(error.code, "INITIALIZATION");
  assertEquals(
    error.message,
    "Failed to initialize TagLib Wasm module: Module failed to load",
  );
  assertEquals(error.details, { reason: "network" });
  assertInstanceOf(error, TagLibError);
  assertInstanceOf(error, TagLibInitializationError);
});

Deno.test("InvalidFormatError - format validation errors", () => {
  // Test with buffer size
  const error1 = new InvalidFormatError("File may be corrupted", 500);
  assertEquals(error1.name, "InvalidFormatError");
  assertEquals(error1.code, "INVALID_FORMAT");
  assertEquals(
    error1.message,
    "Invalid audio file format: File may be corrupted. Buffer size: 500 bytes. Audio files must be at least 1KB to contain valid headers.",
  );
  assertEquals(error1.bufferSize, 500);

  // Test with larger buffer
  const error2 = new InvalidFormatError("Unknown format", 2048);
  assertEquals(
    error2.message,
    "Invalid audio file format: Unknown format. Buffer size: 2.0 KB",
  );

  // Test with MB size
  const error3 = new InvalidFormatError("Corrupted header", 5 * 1024 * 1024);
  assertEquals(
    error3.message,
    "Invalid audio file format: Corrupted header. Buffer size: 5.0 MB",
  );

  // Test without buffer size
  const error4 = new InvalidFormatError("Invalid header");
  assertEquals(error4.message, "Invalid audio file format: Invalid header");
  assertEquals(error4.bufferSize, undefined);

  assertInstanceOf(error1, TagLibError);
  assertInstanceOf(error1, InvalidFormatError);
});

Deno.test("UnsupportedFormatError - unsupported format errors", () => {
  const error = new UnsupportedFormatError("WMA");

  assertEquals(error.name, "UnsupportedFormatError");
  assertEquals(error.code, "UNSUPPORTED_FORMAT");
  assertEquals(
    error.message,
    "Unsupported audio format: WMA. Supported formats: MP3, MP4, M4A, FLAC, OGG, WAV",
  );
  assertEquals(error.format, "WMA");
  assertEquals(error.supportedFormats, [
    "MP3",
    "MP4",
    "M4A",
    "FLAC",
    "OGG",
    "WAV",
  ]);

  // Test with custom supported formats
  const error2 = new UnsupportedFormatError("APE", ["MP3", "FLAC"]);
  assertEquals(
    error2.message,
    "Unsupported audio format: APE. Supported formats: MP3, FLAC",
  );

  assertInstanceOf(error, TagLibError);
  assertInstanceOf(error, UnsupportedFormatError);
});

Deno.test("FileOperationError - file operation errors", () => {
  // Test read error with path
  const error1 = new FileOperationError(
    "read",
    "Permission denied",
    "/music/song.mp3",
  );
  assertEquals(error1.name, "FileOperationError");
  assertEquals(error1.code, "FILE_OPERATION");
  assertEquals(
    error1.message,
    "Failed to read file. Path: /music/song.mp3. Permission denied",
  );
  assertEquals(error1.operation, "read");
  assertEquals(error1.path, "/music/song.mp3");

  // Test write error without path
  const error2 = new FileOperationError("write", "Disk full");
  assertEquals(error2.message, "Failed to write file. Disk full");

  // Test save operation
  const error3 = new FileOperationError(
    "save",
    "Network error",
    "/remote/file.mp3",
  );
  assertEquals(
    error3.message,
    "Failed to save file. Path: /remote/file.mp3. Network error",
  );

  assertInstanceOf(error1, TagLibError);
  assertInstanceOf(error1, FileOperationError);
});

Deno.test("MetadataError - metadata operation errors", () => {
  // Test read error with field
  const error1 = new MetadataError(
    "read",
    "Invalid field type",
    "CUSTOM_FIELD",
  );
  assertEquals(error1.name, "MetadataError");
  assertEquals(error1.code, "METADATA");
  assertEquals(
    error1.message,
    "Failed to read metadata. Field: CUSTOM_FIELD. Invalid field type",
  );
  assertEquals(error1.operation, "read");
  assertEquals(error1.field, "CUSTOM_FIELD");

  // Test write error without field
  const error2 = new MetadataError("write", "File is read-only");
  assertEquals(error2.message, "Failed to write metadata. File is read-only");

  assertInstanceOf(error1, TagLibError);
  assertInstanceOf(error1, MetadataError);
});

Deno.test("MemoryError - memory allocation errors", () => {
  const error = new MemoryError("Out of memory", {
    requestedSize: 1024 * 1024,
  });

  assertEquals(error.name, "MemoryError");
  assertEquals(error.code, "MEMORY");
  assertEquals(error.message, "Memory allocation failed: Out of memory");
  assertEquals(error.details, { requestedSize: 1024 * 1024 });

  assertInstanceOf(error, TagLibError);
  assertInstanceOf(error, MemoryError);
});

Deno.test("EnvironmentError - environment compatibility errors", () => {
  // Test with required feature
  const error1 = new EnvironmentError(
    "Cloudflare Workers",
    "does not support",
    "filesystem access",
  );
  assertEquals(error1.name, "EnvironmentError");
  assertEquals(
    error1.message,
    "Environment 'Cloudflare Workers' does not support. Required feature: filesystem access.",
  );
  assertEquals(error1.environment, "Cloudflare Workers");
  assertEquals(error1.reason, "does not support");
  assertEquals(error1.requiredFeature, "filesystem access");

  // Test without required feature
  const error2 = new EnvironmentError("Browser", "is not configured properly");
  assertEquals(
    error2.message,
    "Environment 'Browser' is not configured properly.",
  );

  assertInstanceOf(error1, TagLibError);
  assertInstanceOf(error1, EnvironmentError);
});

Deno.test("WorkerError - worker pool errors", () => {
  const error = new WorkerError("Worker initialization timed out", {
    workerId: 123,
  });

  assertEquals(error.name, "WorkerError");
  assertEquals(error.code, "WORKER");
  assertEquals(error.message, "Worker initialization timed out");
  assertEquals(error.details, { workerId: 123 });

  assertInstanceOf(error, TagLibError);
  assertInstanceOf(error, WorkerError);
});

Deno.test("isTagLibError - type guard for base error", () => {
  assertEquals(isTagLibError(new TagLibError("TEST", "message")), true);
  assertEquals(isTagLibError(new TagLibInitializationError("failed")), true);
  assertEquals(isTagLibError(new InvalidFormatError("bad format")), true);
  assertEquals(isTagLibError(new UnsupportedFormatError("WMA")), true);
  assertEquals(isTagLibError(new FileOperationError("read", "failed")), true);
  assertEquals(isTagLibError(new MetadataError("write", "failed")), true);
  assertEquals(isTagLibError(new MemoryError("OOM")), true);
  assertEquals(isTagLibError(new EnvironmentError("test", "failed")), true);
  assertEquals(isTagLibError(new WorkerError("timeout")), true);

  assertEquals(isTagLibError(new Error("regular error")), false);
  assertEquals(isTagLibError("not an error"), false);
  assertEquals(isTagLibError(null), false);
  assertEquals(isTagLibError(undefined), false);
  assertEquals(isTagLibError({}), false);
});

Deno.test("isInvalidFormatError - type guard", () => {
  assertEquals(isInvalidFormatError(new InvalidFormatError("bad")), true);
  assertEquals(isInvalidFormatError(new InvalidFormatError("bad", 100)), true);

  assertEquals(isInvalidFormatError(new TagLibError("TEST", "msg")), false);
  assertEquals(isInvalidFormatError(new UnsupportedFormatError("WMA")), false);
  assertEquals(isInvalidFormatError(new Error("regular")), false);
  assertEquals(isInvalidFormatError("not an error"), false);
});

Deno.test("isUnsupportedFormatError - type guard", () => {
  assertEquals(
    isUnsupportedFormatError(new UnsupportedFormatError("WMA")),
    true,
  );
  assertEquals(
    isUnsupportedFormatError(new UnsupportedFormatError("APE", ["MP3"])),
    true,
  );

  assertEquals(isUnsupportedFormatError(new InvalidFormatError("bad")), false);
  assertEquals(isUnsupportedFormatError(new TagLibError("TEST", "msg")), false);
  assertEquals(isUnsupportedFormatError(new Error("regular")), false);
  assertEquals(isUnsupportedFormatError(null), false);
});

Deno.test("isFileOperationError - type guard", () => {
  assertEquals(
    isFileOperationError(new FileOperationError("read", "failed")),
    true,
  );
  assertEquals(
    isFileOperationError(new FileOperationError("write", "failed", "/path")),
    true,
  );

  assertEquals(isFileOperationError(new TagLibError("TEST", "msg")), false);
  assertEquals(
    isFileOperationError(new MetadataError("read", "failed")),
    false,
  );
  assertEquals(isFileOperationError(new Error("regular")), false);
  assertEquals(isFileOperationError(undefined), false);
});

Deno.test("isMetadataError - type guard", () => {
  assertEquals(isMetadataError(new MetadataError("read", "failed")), true);
  assertEquals(
    isMetadataError(new MetadataError("write", "failed", "FIELD")),
    true,
  );

  assertEquals(
    isMetadataError(new FileOperationError("read", "failed")),
    false,
  );
  assertEquals(isMetadataError(new TagLibError("TEST", "msg")), false);
  assertEquals(isMetadataError("not an error"), false);
});

Deno.test("isMemoryError - type guard", () => {
  assertEquals(isMemoryError(new MemoryError("OOM")), true);
  assertEquals(
    isMemoryError(new MemoryError("allocation failed", { size: 1024 })),
    true,
  );

  assertEquals(isMemoryError(new TagLibError("TEST", "msg")), false);
  assertEquals(isMemoryError(new Error("regular")), false);
  assertEquals(isMemoryError({}), false);
});

Deno.test("isEnvironmentError - type guard", () => {
  assertEquals(
    isEnvironmentError(new EnvironmentError("Browser", "unsupported")),
    true,
  );
  assertEquals(
    isEnvironmentError(new EnvironmentError("Worker", "missing", "fs")),
    true,
  );

  assertEquals(isEnvironmentError(new TagLibError("TEST", "msg")), false);
  assertEquals(isEnvironmentError(new WorkerError("failed")), false);
  assertEquals(isEnvironmentError(123), false);
});

Deno.test("formatFileSize helper - human readable sizes", () => {
  // Test the formatFileSize function indirectly through InvalidFormatError

  // Bytes
  const error1 = new InvalidFormatError("test", 100);
  assertEquals(error1.message.includes("100 bytes"), true);

  const error2 = new InvalidFormatError("test", 1023);
  assertEquals(error2.message.includes("1023 bytes"), true);

  // KB
  const error3 = new InvalidFormatError("test", 1024);
  assertEquals(error3.message.includes("1.0 KB"), true);

  const error4 = new InvalidFormatError("test", 1536);
  assertEquals(error4.message.includes("1.5 KB"), true);

  const error5 = new InvalidFormatError("test", 1024 * 1024 - 1);
  assertEquals(error5.message.includes("1024.0 KB"), true);

  // MB
  const error6 = new InvalidFormatError("test", 1024 * 1024);
  assertEquals(error6.message.includes("1.0 MB"), true);

  const error7 = new InvalidFormatError("test", 1.5 * 1024 * 1024);
  assertEquals(error7.message.includes("1.5 MB"), true);

  const error8 = new InvalidFormatError("test", 10.25 * 1024 * 1024);
  assertEquals(error8.message.includes("10.3 MB"), true);
});

Deno.test("Error inheritance chain", () => {
  // Verify all errors inherit from TagLibError and Error
  const errors = [
    new TagLibInitializationError("test"),
    new InvalidFormatError("test"),
    new UnsupportedFormatError("test"),
    new FileOperationError("read", "test"),
    new MetadataError("read", "test"),
    new MemoryError("test"),
    new EnvironmentError("test", "reason"),
    new WorkerError("test"),
  ];

  for (const error of errors) {
    assertInstanceOf(error, Error, `${error.name} should be instanceof Error`);
    assertInstanceOf(
      error,
      TagLibError,
      `${error.name} should be instanceof TagLibError`,
    );
    assertEquals(
      typeof error.message,
      "string",
      `${error.name} should have message`,
    );
    assertEquals(typeof error.code, "string", `${error.name} should have code`);
    assertEquals(typeof error.name, "string", `${error.name} should have name`);
  }
});
