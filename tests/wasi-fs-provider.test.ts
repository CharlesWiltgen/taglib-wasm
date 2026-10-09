/**
 * @fileoverview Tests for filesystem provider implementations
 *
 * Verifies the Node provider satisfies the FileSystemProvider contract using
 * real temp files for seek, read, write, and truncate.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vite-plus/test";
import { cleanupTempFiles, createTempFile } from "./test-utils.ts";
import { createNodeFsProvider } from "../src/runtime/wasi-fs-node.ts";
import type { FileSystemProvider } from "../src/runtime/wasi-fs-provider.ts";

afterAll(cleanupTempFiles);

function runProviderTests(
  name: string,
  getProvider: () => Promise<FileSystemProvider>,
) {
  describe(`FileSystemProvider (${name})`, () => {
    it("should open, write, seek to start, and read back", async () => {
      const fs = await getProvider();
      const path = await createTempFile();
      try {
        const handle = fs.openSync(path, { read: true, write: true });
        const data = new TextEncoder().encode("hello");
        const written = handle.writeSync(data);
        expect(written).toStrictEqual(5);

        handle.seekSync(0, 0); // SEEK_SET
        const buf = new Uint8Array(5);
        const n = handle.readSync(buf);
        expect(n).toStrictEqual(5);
        expect(new TextDecoder().decode(buf)).toStrictEqual("hello");
        handle.close();
      } finally {
        await rm(path, { force: true });
      }
    });

    it("should support SEEK_CUR (whence=1)", async () => {
      const fs = await getProvider();
      const path = await createTempFile();
      try {
        const handle = fs.openSync(path, { read: true, write: true });
        handle.writeSync(new TextEncoder().encode("abcde"));
        handle.seekSync(0, 0);
        handle.seekSync(2, 1); // SEEK_CUR: move 2 from current

        const buf = new Uint8Array(3);
        handle.readSync(buf);
        expect(new TextDecoder().decode(buf)).toStrictEqual("cde");
        handle.close();
      } finally {
        await rm(path, { force: true });
      }
    });

    it("should support SEEK_END (whence=2)", async () => {
      const fs = await getProvider();
      const path = await createTempFile();
      try {
        const handle = fs.openSync(path, { read: true, write: true });
        handle.writeSync(new TextEncoder().encode("abcde"));

        const pos = handle.seekSync(-2, 2); // SEEK_END: 2 before end
        expect(pos).toStrictEqual(3);

        const buf = new Uint8Array(2);
        handle.readSync(buf);
        expect(new TextDecoder().decode(buf)).toStrictEqual("de");
        handle.close();
      } finally {
        await rm(path, { force: true });
      }
    });

    it("should truncate file", async () => {
      const fs = await getProvider();
      const path = await createTempFile();
      try {
        const handle = fs.openSync(path, { read: true, write: true });
        handle.writeSync(new TextEncoder().encode("hello world"));
        handle.truncateSync(5);
        handle.seekSync(0, 0);

        const buf = new Uint8Array(10);
        const n = handle.readSync(buf);
        expect(n).toStrictEqual(5);
        expect(new TextDecoder().decode(buf.subarray(0, 5))).toStrictEqual(
          "hello",
        );
        handle.close();
      } finally {
        await rm(path, { force: true });
      }
    });

    it("should return null on EOF read", async () => {
      const fs = await getProvider();
      const path = await createTempFile();
      try {
        const handle = fs.openSync(path, { read: true, write: true });
        // File is empty, reading should return null
        const buf = new Uint8Array(10);
        const n = handle.readSync(buf);
        expect(n).toStrictEqual(null);
        handle.close();
      } finally {
        await rm(path, { force: true });
      }
    });

    it("should read file as Uint8Array via readFile", async () => {
      const fs = await getProvider();
      const path = await createTempFile();
      try {
        await writeFile(path, "test content");
        const data = await fs.readFile(path);
        expect(new TextDecoder().decode(data)).toStrictEqual("test content");
      } finally {
        await rm(path, { force: true });
      }
    });

    it("should identify not-found errors", async () => {
      const fs = await getProvider();
      try {
        fs.openSync("/nonexistent/path/file.txt", { read: true, write: false });
      } catch (e) {
        expect(fs.isNotFoundError(e)).toStrictEqual(true);
      }
    });

    it("should not misidentify other errors as not-found", async () => {
      const fs = await getProvider();
      expect(fs.isNotFoundError(new Error("generic"))).toStrictEqual(false);
      expect(fs.isNotFoundError(null)).toStrictEqual(false);
    });

    it("should create file when create option is set", async () => {
      const fs = await getProvider();
      const dir = await mkdtemp(join(tmpdir(), "taglib-fs-"));
      const path = `${dir}/new-file.txt`;
      try {
        const handle = fs.openSync(path, {
          read: true,
          write: true,
          create: true,
          truncate: true,
        });
        handle.writeSync(new TextEncoder().encode("created"));
        handle.seekSync(0, 0);
        const buf = new Uint8Array(7);
        handle.readSync(buf);
        expect(new TextDecoder().decode(buf)).toStrictEqual("created");
        handle.close();
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it("should create file with create-without-truncate", async () => {
      const fs = await getProvider();
      const dir = await mkdtemp(join(tmpdir(), "taglib-fs-"));
      const path = `${dir}/create-no-trunc.txt`;
      try {
        const handle = fs.openSync(path, {
          read: true,
          write: true,
          create: true,
          truncate: false,
        });
        handle.writeSync(new TextEncoder().encode("new file"));
        handle.seekSync(0, 0);
        const buf = new Uint8Array(8);
        handle.readSync(buf);
        expect(new TextDecoder().decode(buf)).toStrictEqual("new file");
        handle.close();
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it("should write after SEEK_END", async () => {
      const fs = await getProvider();
      const path = await createTempFile();
      try {
        const handle = fs.openSync(path, { read: true, write: true });
        handle.writeSync(new TextEncoder().encode("hello"));
        handle.seekSync(0, 2); // SEEK_END
        handle.writeSync(new TextEncoder().encode("!"));
        handle.seekSync(0, 0);
        const buf = new Uint8Array(6);
        handle.readSync(buf);
        expect(new TextDecoder().decode(buf)).toStrictEqual("hello!");
        handle.close();
      } finally {
        await rm(path, { force: true });
      }
    });

    it("should throw on negative seek position", async () => {
      const fs = await getProvider();
      const path = await createTempFile();
      try {
        const handle = fs.openSync(path, { read: true, write: true });
        handle.writeSync(new TextEncoder().encode("ab"));
        handle.seekSync(0, 0);
        let threw = false;
        try {
          handle.seekSync(-100, 1); // SEEK_CUR: 0 + (-100)
        } catch {
          threw = true;
        }
        expect(threw).toStrictEqual(true);
        handle.close();
      } finally {
        await rm(path, { force: true });
      }
    });
  });
}

runProviderTests("Node", () => createNodeFsProvider());
