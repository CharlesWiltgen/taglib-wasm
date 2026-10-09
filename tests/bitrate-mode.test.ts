import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { TagLib } from "../src/taglib.ts";

const FIXTURE_DIR = join("tests", "test-files", "mp3", "bitrate-mode");

async function readBitrateMode(filename: string): Promise<string | undefined> {
  const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });
  const buffer = new Uint8Array(await readFile(join(FIXTURE_DIR, filename)));
  const file = await taglib.open(buffer);
  try {
    const props = file.audioProperties();
    return props?.bitrateMode;
  } finally {
    file.dispose();
  }
}

it("bitrateMode: CBR LAME file -> 'CBR'", async () => {
  expect(await readBitrateMode("cbr-lame.mp3")).toStrictEqual("CBR");
});

it("bitrateMode: VBR LAME file -> 'VBR'", async () => {
  expect(await readBitrateMode("vbr-lame.mp3")).toStrictEqual("VBR");
});

it("bitrateMode: ABR LAME file -> 'ABR'", async () => {
  expect(await readBitrateMode("abr-lame.mp3")).toStrictEqual("ABR");
});

it("bitrateMode: VBRI file -> 'VBR'", async () => {
  expect(await readBitrateMode("vbri.mp3")).toStrictEqual("VBR");
});

it("bitrateMode: no-Xing file -> undefined", async () => {
  expect(await readBitrateMode("no-xing.mp3")).toStrictEqual(undefined);
});

// Regression pin: kiss-snippet.mp3 lives at tests/test-files/mp3/ (one level up
// from the bitrate-mode fixtures). Measured against the implementation.
it("bitrateMode: kiss-snippet.mp3 regression -> 'VBR'", async () => {
  const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });
  const buffer = new Uint8Array(
    await readFile(join("tests", "test-files", "mp3", "kiss-snippet.mp3")),
  );
  const file = await taglib.open(buffer);
  try {
    const props = file.audioProperties();
    expect(props?.bitrateMode).toStrictEqual("VBR");
  } finally {
    file.dispose();
  }
});
