/**
 * @fileoverview Deno-native tests for the Deno PlatformIO provider.
 *
 * Vitest excludes this file (vite.config.ts) and `pnpm run test:deno` owns it.
 * `createDenoIO` is unreachable from the Node run, so without this file its
 * lines count as uncovered new code in the SonarCloud scan even though the
 * provider ships on Deno.
 */

import { assertEquals, assertExists } from "./deno-assert.ts";
import { createPlatformIOFor } from "../src/runtime/platform-io.ts";

const io = createPlatformIOFor("deno-wasi");

Deno.test("Deno PlatformIO writes, stats, and reads a file", async () => {
  const path = await Deno.makeTempFile();
  try {
    const data = new TextEncoder().encode("hello deno");
    await io.writeFile(path, data);

    assertEquals((await io.stat(path)).size, data.byteLength);
    assertEquals(
      new TextDecoder().decode(await io.readFile(path)),
      "hello deno",
    );
  } finally {
    await Deno.remove(path);
  }
});

Deno.test("Deno PlatformIO lists directory entries with their kinds", async () => {
  const dir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(`${dir}/file.txt`, "x");
    await Deno.mkdir(`${dir}/sub`);

    const entries: {
      name: string;
      isDirectory: boolean;
      isFile: boolean;
    }[] = [];
    for await (const entry of io.readDir(dir)) entries.push(entry);
    entries.sort((a, b) => a.name.localeCompare(b.name));

    assertEquals(entries.length, 2);
    assertEquals(entries[0].name, "file.txt");
    assertEquals(entries[0].isDirectory, false);
    assertEquals(entries[0].isFile, true);
    assertEquals(entries[1].name, "sub");
    assertEquals(entries[1].isDirectory, true);
    assertEquals(entries[1].isFile, false);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("Deno PlatformIO readPartial returns a whole small file", async () => {
  const path = await Deno.makeTempFile();
  try {
    const data = new TextEncoder().encode("0123456789");
    await io.writeFile(path, data);
    const readPartial = io.readPartial;
    assertExists(readPartial);

    // Windows overlap after clamping (8 + 8 > the 10 B file), so the
    // whole-file shortcut is the only correct path.
    const part = await readPartial(path, 8, 8);

    assertEquals(new TextDecoder().decode(part), "0123456789");
  } finally {
    await Deno.remove(path);
  }
});

Deno.test("Deno PlatformIO readPartial splices header and footer", async () => {
  const path = await Deno.makeTempFile();
  try {
    const data = new Uint8Array(100);
    for (let i = 0; i < data.length; i++) data[i] = i;
    await io.writeFile(path, data);
    const readPartial = io.readPartial;
    assertExists(readPartial);

    // The 100 B file is larger than the two 10 B windows, so the provider
    // must seek to the footer instead of returning the whole file.
    const part = await readPartial(path, 10, 10);

    assertEquals(part.byteLength, 20);
    for (let i = 0; i < 10; i++) {
      assertEquals(part[i], data[i]);
      assertEquals(part[10 + i], data[90 + i]);
    }
  } finally {
    await Deno.remove(path);
  }
});
