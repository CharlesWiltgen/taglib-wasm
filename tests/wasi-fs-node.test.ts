/**
 * @fileoverview `seekSync` contract for the Node/Bun filesystem provider.
 *
 * Regression coverage for taglib-tl17.1 (see CHANGELOG): a seek that is
 * rejected must leave the cursor untouched. The provider used to store the
 * computed offset *before* validating it, so a rejected seek left the cursor
 * negative and the guest's next read handed that negative position to
 * `node:fs`, which threw `ERR_OUT_OF_RANGE` out of the host where the guest
 * should have seen `EINVAL`.
 *
 * The Deno-gated `tests/wasi-fs-provider.test.ts` cannot catch this: it runs
 * the same shared suite under Deno, whose own `seekSync` already validates
 * before moving, and it only asserts that the seek throws.
 */

import { afterAll, describe, expect, it } from "vite-plus/test";
import { cleanupTempFiles, createTempFile } from "./test-utils.ts";
import { createNodeFsProvider } from "../src/runtime/wasi-fs-node.ts";
import { FileOperationError } from "../src/errors/classes.ts";

afterAll(cleanupTempFiles);

const CONTENT = new TextEncoder().encode("abcdef");

/** Opens a fresh 6-byte file and leaves the cursor at the end (6). */
async function openWrittenFile() {
  const fs = await createNodeFsProvider();
  const path = await createTempFile();
  const handle = fs.openSync(path, { read: true, write: true });
  handle.writeSync(CONTENT);
  return handle;
}

describe("createNodeFsProvider seekSync", () => {
  it("keeps the cursor after a rejected SEEK_END", async () => {
    const handle = await openWrittenFile();
    try {
      // 6 bytes file, so 6 + (-100) is negative.
      expect(() => handle.seekSync(-100, 2)).toThrow(FileOperationError);
      expect(handle.seekSync(0, 1)).toBe(6);
      // The end of the file: a real read returns null. Pre-fix the cursor was
      // -94 here and this call threw RangeError from node:fs.
      expect(handle.readSync(new Uint8Array(4))).toBeNull();
    } finally {
      handle.close();
    }
  });

  it("keeps the cursor after a rejected SEEK_CUR", async () => {
    const handle = await openWrittenFile();
    try {
      expect(handle.seekSync(2, 0)).toBe(2);
      expect(() => handle.seekSync(-100, 1)).toThrow(FileOperationError);
      // Pre-fix the cursor was -98 here.
      expect(handle.seekSync(0, 1)).toBe(2);
      const buf = new Uint8Array(2);
      expect(handle.readSync(buf)).toBe(2);
      expect(new TextDecoder().decode(buf)).toBe("cd");
    } finally {
      handle.close();
    }
  });

  it("keeps the cursor after a rejected SEEK_SET", async () => {
    const handle = await openWrittenFile();
    try {
      expect(handle.seekSync(4, 0)).toBe(4);
      expect(() => handle.seekSync(-5, 0)).toThrow(FileOperationError);
      // Pre-fix the cursor was -5 here.
      expect(handle.seekSync(0, 1)).toBe(4);
      const buf = new Uint8Array(2);
      expect(handle.readSync(buf)).toBe(2);
      expect(new TextDecoder().decode(buf)).toBe("ef");
    } finally {
      handle.close();
    }
  });
});
