/**
 * @fileoverview Deno filesystem-provider contract tests.
 *
 * Runs the twelve-case `FileSystemProvider` contract that the Vitest suite
 * (tests/wasi-fs-provider.test.ts) runs against the Node provider, but here
 * against `createDenoFsProvider()` under `deno test` (npm run test:deno).
 *
 * Deno-only: Vitest's config excludes this file. Dependency-free (`Deno.test`
 * + the local assert helpers) since the retired deno.json import map is gone.
 */

import { assertEquals } from "./deno-assert.ts";
import { createDenoFsProvider } from "../src/runtime/wasi-fs-deno.ts";
import type { FileSystemProvider } from "../src/runtime/wasi-fs-provider.ts";

function runProviderTests(
  name: string,
  getProvider: () => Promise<FileSystemProvider>,
) {
  const label = `FileSystemProvider (${name})`;

  Deno.test(`${label}: opens, writes, seeks to start, and reads back`, async () => {
    const fs = await getProvider();
    const path = await Deno.makeTempFile();
    try {
      const handle = fs.openSync(path, { read: true, write: true });
      const data = new TextEncoder().encode("hello");
      const written = handle.writeSync(data);
      assertEquals(written, 5);

      handle.seekSync(0, 0); // SEEK_SET
      const buf = new Uint8Array(5);
      const n = handle.readSync(buf);
      assertEquals(n, 5);
      assertEquals(new TextDecoder().decode(buf), "hello");
      handle.close();
    } finally {
      await Deno.remove(path);
    }
  });

  Deno.test(`${label}: supports SEEK_CUR (whence=1)`, async () => {
    const fs = await getProvider();
    const path = await Deno.makeTempFile();
    try {
      const handle = fs.openSync(path, { read: true, write: true });
      handle.writeSync(new TextEncoder().encode("abcde"));
      handle.seekSync(0, 0);
      handle.seekSync(2, 1); // SEEK_CUR: move 2 from current

      const buf = new Uint8Array(3);
      handle.readSync(buf);
      assertEquals(new TextDecoder().decode(buf), "cde");
      handle.close();
    } finally {
      await Deno.remove(path);
    }
  });

  Deno.test(`${label}: supports SEEK_END (whence=2)`, async () => {
    const fs = await getProvider();
    const path = await Deno.makeTempFile();
    try {
      const handle = fs.openSync(path, { read: true, write: true });
      handle.writeSync(new TextEncoder().encode("abcde"));

      const pos = handle.seekSync(-2, 2); // SEEK_END: 2 before end
      assertEquals(pos, 3);

      const buf = new Uint8Array(2);
      handle.readSync(buf);
      assertEquals(new TextDecoder().decode(buf), "de");
      handle.close();
    } finally {
      await Deno.remove(path);
    }
  });

  Deno.test(`${label}: truncates a file`, async () => {
    const fs = await getProvider();
    const path = await Deno.makeTempFile();
    try {
      const handle = fs.openSync(path, { read: true, write: true });
      handle.writeSync(new TextEncoder().encode("hello world"));
      handle.truncateSync(5);
      handle.seekSync(0, 0);

      const buf = new Uint8Array(10);
      const n = handle.readSync(buf);
      assertEquals(n, 5);
      assertEquals(new TextDecoder().decode(buf.subarray(0, 5)), "hello");
      handle.close();
    } finally {
      await Deno.remove(path);
    }
  });

  Deno.test(`${label}: returns null on EOF read`, async () => {
    const fs = await getProvider();
    const path = await Deno.makeTempFile();
    try {
      const handle = fs.openSync(path, { read: true, write: true });
      // File is empty, reading should return null
      const buf = new Uint8Array(10);
      const n = handle.readSync(buf);
      assertEquals(n, null);
      handle.close();
    } finally {
      await Deno.remove(path);
    }
  });

  Deno.test(`${label}: reads a file as Uint8Array via readFile`, async () => {
    const fs = await getProvider();
    const path = await Deno.makeTempFile();
    try {
      await Deno.writeTextFile(path, "test content");
      const data = await fs.readFile(path);
      assertEquals(new TextDecoder().decode(data), "test content");
    } finally {
      await Deno.remove(path);
    }
  });

  Deno.test(`${label}: identifies not-found errors`, async () => {
    const fs = await getProvider();
    let threw = false;
    try {
      fs.openSync("/nonexistent/path/file.txt", { read: true, write: false });
    } catch (e) {
      threw = true;
      assertEquals(fs.isNotFoundError(e), true);
    }
    assertEquals(threw, true);
  });

  Deno.test(`${label}: does not misidentify other errors as not-found`, async () => {
    const fs = await getProvider();
    assertEquals(fs.isNotFoundError(new Error("generic")), false);
    assertEquals(fs.isNotFoundError(null), false);
  });

  Deno.test(`${label}: creates a file when create option is set`, async () => {
    const fs = await getProvider();
    const dir = await Deno.makeTempDir();
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
      assertEquals(new TextDecoder().decode(buf), "created");
      handle.close();
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  });

  Deno.test(`${label}: creates a file with create-without-truncate`, async () => {
    const fs = await getProvider();
    const dir = await Deno.makeTempDir();
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
      assertEquals(new TextDecoder().decode(buf), "new file");
      handle.close();
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  });

  Deno.test(`${label}: writes after SEEK_END`, async () => {
    const fs = await getProvider();
    const path = await Deno.makeTempFile();
    try {
      const handle = fs.openSync(path, { read: true, write: true });
      handle.writeSync(new TextEncoder().encode("hello"));
      handle.seekSync(0, 2); // SEEK_END
      handle.writeSync(new TextEncoder().encode("!"));
      handle.seekSync(0, 0);
      const buf = new Uint8Array(6);
      handle.readSync(buf);
      assertEquals(new TextDecoder().decode(buf), "hello!");
      handle.close();
    } finally {
      await Deno.remove(path);
    }
  });

  Deno.test(`${label}: throws on negative seek position`, async () => {
    const fs = await getProvider();
    const path = await Deno.makeTempFile();
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
      assertEquals(threw, true);
      handle.close();
    } finally {
      await Deno.remove(path);
    }
  });
}

runProviderTests("Deno", () => Promise.resolve(createDenoFsProvider()));
