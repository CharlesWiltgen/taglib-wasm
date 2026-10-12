/**
 * Tests for Smart Partial Loading functionality
 */

import { afterAll, describe, expect, it } from "vite-plus/test";
import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { expectDefined } from "./_assert-helpers.ts";
import { cleanupTempFiles, createTempFile } from "./test-utils.ts";
import { TagLib } from "../src/taglib.ts";
import { join } from "node:path";

const TEST_FILES_DIR = join(process.cwd(), "tests/test-files");

afterAll(cleanupTempFiles);

/**
 * The fixture's audio carrying an ID3v2.3 tag of `frameCount` TXXX frames, each
 * `payloadSize` bytes, so the tag overruns any header window smaller than their
 * total. Spread over several frames rather than one huge one because a single
 * value above 1 MB hits the msgpack decoder's string cap on WASI, which is a
 * different limit than the one under test. Sizes follow ID3v2.3: the tag header
 * is syncsafe (7 bits per byte), frame headers are plain 32-bit big-endian.
 */
function oversizedTagMp3(payloadSize: number, frameCount: number): Uint8Array {
  const src = new Uint8Array(
    readFileSync(join(TEST_FILES_DIR, "mp3/kiss-snippet.mp3")),
  );
  let audioStart = 0;
  if (String.fromCharCode(...src.slice(0, 3)) === "ID3") {
    audioStart =
      10 + ((src[6]! << 21) | (src[7]! << 14) | (src[8]! << 7) | src[9]!);
  }
  const audio = src.slice(audioStart);

  const frames: Uint8Array[] = [];
  for (let i = 0; i < frameCount; i++) {
    const payload = new Uint8Array(payloadSize);
    // encoding byte, then a unique description so the frames stay distinct
    const desc = new TextEncoder().encode(`PAD${i}\0`);
    payload.set(desc, 1);
    payload.fill(0x41, 1 + desc.length);
    const frame = new Uint8Array(10 + payload.length);
    frame.set(new TextEncoder().encode("TXXX"), 0);
    frame[4] = (payload.length >>> 24) & 0xff;
    frame[5] = (payload.length >>> 16) & 0xff;
    frame[6] = (payload.length >>> 8) & 0xff;
    frame[7] = payload.length & 0xff;
    frame.set(payload, 10);
    frames.push(frame);
  }

  const tagSize = frames.reduce((n, f) => n + f.length, 0);
  const header = new Uint8Array(10);
  header.set(new TextEncoder().encode("ID3"), 0);
  header[3] = 3;
  header[6] = (tagSize >>> 21) & 0x7f;
  header[7] = (tagSize >>> 14) & 0x7f;
  header[8] = (tagSize >>> 7) & 0x7f;
  header[9] = tagSize & 0x7f;

  const parts = [header, ...frames, audio];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

describe("Partial Loading", () => {
  it("should load file with partial option", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });
    const filePath = join(TEST_FILES_DIR, "mp3/kiss-snippet.mp3");
    const file = await taglib.open(filePath, { partial: true });

    const tag = file.tag();
    expectDefined(tag.title);
    expectDefined(tag.artist);

    file.dispose();
  });

  it("should use default sizes when not specified", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });
    const filePath = join(TEST_FILES_DIR, "mp3/kiss-snippet.mp3");
    const file = await taglib.open(filePath, { partial: true });

    const tag = file.tag();
    expectDefined(tag);

    file.dispose();
  });

  it("should work with File objects in browser-like environment", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });
    const fileData = new Uint8Array(
      await readFile(join(TEST_FILES_DIR, "mp3/kiss-snippet.mp3")),
    );
    const file = {
      size: fileData.byteLength,
      slice: (start: number, end: number) => ({
        arrayBuffer: async () => fileData.slice(start, end).buffer,
      }),
    };

    const audioFile = await taglib.open(fileData);
    expectDefined(audioFile.tag());
    audioFile.dispose();
  });

  it("should fallback to full loading for small files", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });
    const filePath = join(TEST_FILES_DIR, "wav/kiss-snippet.wav");
    const file = await taglib.open(filePath, {
      partial: true,
      maxHeaderSize: 1024 * 1024,
      maxFooterSize: 128 * 1024,
    });

    const tag = file.tag();
    expectDefined(tag);

    file.dispose();
  });

  it("should handle save with partial loading", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });
    const filePath = join(TEST_FILES_DIR, "mp3/kiss-snippet.mp3");
    // A temp path, not a fixture-dir one: this file exists only between the
    // write and the rm, and folder-api scans tests/test-files concurrently
    // (taglib-otze).
    const outputPath = await createTempFile(".mp3");

    const file = await taglib.open(filePath, { partial: true });

    const tag = file.tag();
    const originalTitle = tag.title;
    tag.setTitle("Partial Load Test");
    tag.setArtist("Test Artist");

    await file.saveToFile(outputPath);
    file.dispose();

    const savedFile = await taglib.open(outputPath);
    const savedTag = savedFile.tag();
    expect(savedTag.title).toStrictEqual("Partial Load Test");
    expect(savedTag.artist).toStrictEqual("Test Artist");
    savedFile.dispose();

    await rm(outputPath);
  });

  it("should preserve audio data when saving partially loaded file", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });
    const filePath = join(TEST_FILES_DIR, "mp3/kiss-snippet.mp3");
    const outputPath = await createTempFile(".mp3");

    const originalData = new Uint8Array(await readFile(filePath));
    const originalSize = originalData.byteLength;

    const file = await taglib.open(filePath, { partial: true });
    file.tag().setTitle("Size Test");
    await file.saveToFile(outputPath);
    file.dispose();

    const savedData = new Uint8Array(await readFile(outputPath));
    const savedSize = savedData.byteLength;

    const sizeDiff = Math.abs(savedSize - originalSize);
    expect(
      sizeDiff < 10240,
      `File size changed too much: ${sizeDiff} bytes`,
    ).toBeTruthy();

    await rm(outputPath);
  });

  it("should throw error when calling save() on partially loaded file", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });
    const filePath = join(TEST_FILES_DIR, "mp3/kiss-snippet.mp3");
    const file = await taglib.open(filePath, {
      partial: true,
      maxHeaderSize: 10 * 1024,
      maxFooterSize: 5 * 1024,
    });

    try {
      file.save();
      expect(false, "Should have thrown error").toBeTruthy();
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      expect(
        error.message.includes("Cannot save partially loaded file directly"),
      ).toBeTruthy();
    }

    file.dispose();
  });

  it("should work with custom header/footer sizes", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });
    const filePath = join(TEST_FILES_DIR, "flac/kiss-snippet.flac");
    const file = await taglib.open(filePath, {
      partial: true,
      maxHeaderSize: 2 * 1024 * 1024,
      maxFooterSize: 256 * 1024,
    });

    const tag = file.tag();
    expectDefined(tag);

    file.dispose();
  });

  // Regression: taglib-upg — the partial-load saveToFile branch dropped chapters
  // and ratings. WASI path-opens never partial-load (they use path-mode), so this
  // is exercised on Emscripten, where partial loading actually engages.
  it("should preserve chapters and ratings set on a partially loaded file (taglib-upg)", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });
    // Isolated copies in the temp dir — never mutate the shared fixture, and
    // never land inside tests/test-files, which folder-api scans concurrently
    // (taglib-otze).
    const src = await createTempFile(".mp3");
    const out = await createTempFile(".mp3");
    await writeFile(
      src,
      new Uint8Array(
        await readFile(join(TEST_FILES_DIR, "mp3/kiss-snippet.mp3")),
      ),
    );
    try {
      const file = await taglib.open(src, {
        partial: true,
        maxHeaderSize: 10 * 1024,
        maxFooterSize: 5 * 1024,
      });
      file.setChapters([{ startTimeMs: 0, title: "Intro", id: "ch1" }]);
      file.setRatings([{ rating: 0.8, email: "a@b.c", counter: 3 }]);
      await file.saveToFile(out);
      file.dispose();

      const reopened = await taglib.open(new Uint8Array(await readFile(out)));
      try {
        expect(reopened.getChapters().length, "chapters dropped").toStrictEqual(
          1,
        );
        expect(reopened.getRatings().length, "ratings dropped").toStrictEqual(
          1,
        );
      } finally {
        reopened.dispose();
      }
    } finally {
      await rm(src).catch(() => {});
      await rm(out).catch(() => {});
    }
  });

  // Regression: taglib-d14 — the partial-load reconstruct MERGES the editing
  // handle's text PropertyMap over the full reload, so a property the user
  // DELETED was silently re-added from the reload. The fix snapshots the header
  // keys at load and subtracts user-deleted keys from the merge, so a deletion
  // persists while untouched tags are still preserved. Emscripten-only (WASI
  // path-opens are full loads).
  it("propagates a text-property deletion on a partial load, preserving other tags (taglib-d14)", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });
    const src = await createTempFile(".mp3");
    const out = await createTempFile(".mp3");
    await writeFile(
      src,
      new Uint8Array(
        await readFile(join(TEST_FILES_DIR, "mp3/kiss-snippet.mp3")),
      ),
    );
    try {
      // Seed exactly three text props on the full file (replace wipes the rest).
      const seed = await taglib.open(src);
      seed.setProperties({
        title: ["Keep Title"],
        artist: ["Keep Artist"],
        albumArtist: ["Delete Me"],
      });
      seed.save();
      await writeFile(src, seed.getFileBuffer());
      seed.dispose();

      // Partial-load, then delete only albumArtist via a replace that omits it.
      const file = await taglib.open(src, {
        partial: true,
        maxHeaderSize: 10 * 1024,
        maxFooterSize: 5 * 1024,
      });
      expect(
        file.properties().albumArtist,
        "precondition: albumArtist present in partial header",
      ).toStrictEqual(["Delete Me"]);
      const props = file.properties();
      delete props.albumArtist;
      file.setProperties(props);
      await file.saveToFile(out);
      file.dispose();

      const reopened = await taglib.open(new Uint8Array(await readFile(out)));
      const result = {
        albumArtist: reopened.properties().albumArtist,
        title: reopened.properties().title,
        artist: reopened.properties().artist,
      };
      reopened.dispose();

      expect(result).toStrictEqual({
        albumArtist: undefined,
        title: ["Keep Title"],
        artist: ["Keep Artist"],
      });
    } finally {
      await rm(src).catch(() => {});
      await rm(out).catch(() => {});
    }
  });

  // Partial loading concatenates the file's first maxHeaderSize bytes with its
  // last maxFooterSize bytes and discards the middle. When the metadata is
  // bigger than the header window that cuts the tag mid-structure and splices
  // unrelated footer bytes onto the cut, so TagLib parses whatever lands there.
  // Measured on a real library before the fix: 18 of 40 large MP3s read back
  // DIFFERENT metadata this way, silently — and the malformed image also tripped
  // the double free in taglib-f5hp, trapping the whole module.
  //
  // A partial read must therefore agree with a full read, always. The check is
  // "same answer either way" rather than a fixed expectation, so it holds
  // whichever path the loader picks.
  for (const backend of ["wasi", "emscripten"] as const) {
    it(`agrees with a full load when metadata exceeds the header window [${backend}]`, async () => {
      const taglib = await TagLib.initialize({ forceWasmType: backend });
      const path = await createTempFile(".mp3");
      try {
        // Built by hand rather than written through the library, so the fixture
        // does not depend on the write path this test is not exercising: the
        // fixture's audio behind one oversized TXXX frame that pushes the
        // ID3v2 tag past the 1 MB header window.
        await writeFile(path, oversizedTagMp3(400_000, 4));
        const size = (await stat(path)).size;
        expect(
          size > 1024 * 1024 + 128 * 1024,
          `fixture must exceed the partial-load threshold, got ${size}`,
        ).toBeTruthy();

        // A path input on WASI returns from taglib-class.ts:99-127 BEFORE
        // partial loading is considered, so opening by path here compared a
        // full read against a full read and could not fail. A File input takes
        // the same loadAudioData branch on both backends, so it actually
        // exercises the gate under test.
        const source =
          backend === "wasi"
            ? new File([new Uint8Array(await readFile(path))], "oversized.mp3")
            : path;
        const readWith = async (options?: { partial: boolean }) => {
          const f = await taglib.open(source, options);
          try {
            return JSON.stringify(f.properties());
          } finally {
            f.dispose();
          }
        };

        expect(
          await readWith(),
          `${backend}: the default (partial) read disagrees with a full read`,
        ).toStrictEqual(await readWith({ partial: false }));
      } finally {
        await rm(path).catch(() => {});
      }
    });
  }
});
