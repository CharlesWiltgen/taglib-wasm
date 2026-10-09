/**
 * @fileoverview Tests for multi-value Tag string fields (zm5).
 * Tag string fields (title, artist, album, comment, genre) always return string[].
 * Write functions accept both string and string[] via TagInput.
 */

import { describe, expect, it } from "vite-plus/test";
import { readFile } from "node:fs/promises";
import { expectDefined } from "./_assert-helpers.ts";
import {
  applyTags,
  clearTags,
  getTagLib,
  readTags,
  setBufferMode,
} from "../src/simple/index.ts";
import { TagLib } from "../src/taglib.ts";
import type { Tag, TagInput } from "../src/types.ts";
import { FIXTURE_PATH } from "./shared-fixtures.ts";

setBufferMode(true);

describe("readTags multi-value", () => {
  it("should return string[] for title, artist, album, comment, genre", async () => {
    const tags = await readTags(FIXTURE_PATH.mp3);

    expectDefined(tags.title);
    expect(Array.isArray(tags.title)).toStrictEqual(true);

    expectDefined(tags.artist);
    expect(Array.isArray(tags.artist)).toStrictEqual(true);

    expectDefined(tags.album);
    expect(Array.isArray(tags.album)).toStrictEqual(true);
  });

  it("should return number for year and track (unchanged)", async () => {
    const tags = await readTags(FIXTURE_PATH.mp3);

    if (tags.year !== undefined) {
      expect(typeof tags.year).toStrictEqual("number");
    }
    if (tags.track !== undefined) {
      expect(typeof tags.track).toStrictEqual("number");
    }
  });

  it("should wrap single-value files in arrays", async () => {
    const tags = await readTags(FIXTURE_PATH.mp3);

    expectDefined(tags.title);
    expect(tags.title).toStrictEqual(["Kiss"]);

    expectDefined(tags.artist);
    expect(tags.artist).toStrictEqual(["Prince"]);
  });

  it("should return arrays across all formats", async () => {
    for (
      const format of ["mp3", "flac", "ogg", "m4a", "wav"] as const
    ) {
      const tags = await readTags(FIXTURE_PATH[format]);
      expectDefined(tags.title, `${format}: title missing`);
      expect(Array.isArray(tags.title), `${format}: title should be an array`)
        .toStrictEqual(true);
    }
  });
});

describe("applyTags with TagInput", () => {
  it("should accept single strings", async () => {
    const original = new Uint8Array(await readFile(FIXTURE_PATH.mp3));
    const input: Partial<TagInput> = { title: "New Title" };

    const modified = await applyTags(new Uint8Array(original), input);
    expectDefined(modified);

    const tags = await readTags(modified);
    expect(tags.title).toStrictEqual(["New Title"]);
  });

  it("should accept string arrays", async () => {
    const original = new Uint8Array(await readFile(FIXTURE_PATH.flac));
    const input: Partial<TagInput> = {
      artist: ["Artist One", "Artist Two"],
    };

    const modified = await applyTags(new Uint8Array(original), input);
    expectDefined(modified);

    const tags = await readTags(modified);
    expect(tags.artist).toStrictEqual(["Artist One", "Artist Two"]);
  });

  it("should clear field when writing empty array", async () => {
    const original = new Uint8Array(await readFile(FIXTURE_PATH.flac));
    const modified = await applyTags(new Uint8Array(original), {
      artist: [],
    });
    const tags = await readTags(modified);

    const isEmpty = (val: string[] | undefined) =>
      val === undefined || val.length === 0 || val.every((s) => s === "");
    expect(isEmpty(tags.artist)).toStrictEqual(true);
  });

  it("should roundtrip many values in a single field", async () => {
    const original = new Uint8Array(await readFile(FIXTURE_PATH.flac));
    const artists = Array.from({ length: 20 }, (_, i) => `Artist ${i + 1}`);
    const modified = await applyTags(new Uint8Array(original), {
      artist: artists,
    });
    const tags = await readTags(modified);
    expect(tags.artist).toStrictEqual(artists);
  });

  it("should handle mixed string and array fields", async () => {
    const original = new Uint8Array(await readFile(FIXTURE_PATH.mp3));
    const input: Partial<TagInput> = {
      title: "Single Title",
      genre: ["Rock", "Pop"],
      year: 2025,
    };

    const modified = await applyTags(new Uint8Array(original), input);
    const tags = await readTags(modified);

    expect(tags.title).toStrictEqual(["Single Title"]);
    expect(tags.genre).toStrictEqual(["Rock", "Pop"]);
    expect(tags.year).toStrictEqual(2025);
  });
});

describe("clearTags", () => {
  it("should clear all string fields", async () => {
    const original = new Uint8Array(await readFile(FIXTURE_PATH.mp3));
    const cleared = await clearTags(new Uint8Array(original));
    const tags = await readTags(cleared);

    const isEmpty = (val: string[] | undefined) =>
      val === undefined || val.length === 0 ||
      val.every((s) => s === "");

    expect(isEmpty(tags.title)).toStrictEqual(true);
    expect(isEmpty(tags.artist)).toStrictEqual(true);
    expect(isEmpty(tags.album)).toStrictEqual(true);
  });
});

describe("applyTags with extended fields", () => {
  it("should roundtrip extended string fields via simple API", async () => {
    const original = new Uint8Array(await readFile(FIXTURE_PATH.flac));
    const modified = await applyTags(new Uint8Array(original), {
      albumArtist: "Various Artists",
      composer: ["Bach", "Handel"],
      conductor: "Karajan",
    });

    const taglib = await getTagLib();
    using audioFile = await taglib.open(modified);
    const props = audioFile.properties();
    expect(props.albumArtist).toStrictEqual(["Various Artists"]);
    expect(props.composer).toStrictEqual(["Bach", "Handel"]);
    expect(props.conductor).toStrictEqual(["Karajan"]);
  });

  it("should roundtrip extended numeric and boolean fields via simple API", async () => {
    const original = new Uint8Array(await readFile(FIXTURE_PATH.flac));
    const modified = await applyTags(new Uint8Array(original), {
      bpm: 128,
      discNumber: 2,
      totalTracks: 12,
      totalDiscs: 3,
      compilation: true,
    });

    const taglib = await getTagLib();
    using audioFile = await taglib.open(modified);
    const props = audioFile.properties();
    expect(props.bpm).toStrictEqual(["128"]);
    expect(props.discNumber).toStrictEqual(["2"]);
    expect(props.totalTracks).toStrictEqual(["12"]);
    expect(props.totalDiscs).toStrictEqual(["3"]);
    expect(props.compilation).toStrictEqual(["1"]);
  });

  it("should roundtrip compilation false via simple API", async () => {
    const original = new Uint8Array(await readFile(FIXTURE_PATH.flac));
    const modified = await applyTags(new Uint8Array(original), {
      compilation: false,
    });

    const taglib = await getTagLib();
    using audioFile = await taglib.open(modified);
    const props = audioFile.properties();
    expect(props.compilation).toStrictEqual(["0"]);
  });

  it("should roundtrip MusicBrainz and ReplayGain fields via simple API", async () => {
    const original = new Uint8Array(await readFile(FIXTURE_PATH.flac));
    const modified = await applyTags(new Uint8Array(original), {
      musicbrainzTrackId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      replayGainTrackGain: "-6.54 dB",
    });

    const taglib = await getTagLib();
    using audioFile = await taglib.open(modified);
    const props = audioFile.properties();
    expect(props.musicbrainzTrackId).toStrictEqual([
      "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    ]);
    expect(props.replayGainTrackGain).toStrictEqual(["-6.54 dB"]);
  });

  it("should not drop extended fields when mixed with basic fields", async () => {
    const original = new Uint8Array(await readFile(FIXTURE_PATH.flac));
    const modified = await applyTags(new Uint8Array(original), {
      title: "Test Title",
      artist: "Test Artist",
      albumArtist: "Album Artist",
      bpm: 140,
      year: 2025,
    });

    const tags = await readTags(modified);
    expect(tags.title).toStrictEqual(["Test Title"]);
    expect(tags.artist).toStrictEqual(["Test Artist"]);
    expect(tags.year).toStrictEqual(2025);

    const taglib = await getTagLib();
    using audioFile = await taglib.open(modified);
    const props = audioFile.properties();
    expect(props.albumArtist).toStrictEqual(["Album Artist"]);
    expect(props.bpm).toStrictEqual(["140"]);
  });
});

const BACKENDS = ["wasi", "emscripten"] as const;

// Formats whose multi-value genre must round-trip in EXACT order. wma is
// covered by a write-side rotation compensation for TagLib's ASF render
// (taglib-ilrg): the render splits a multi-value attribute across the
// Extended Content Description and Metadata Library objects, which parse
// back as a left rotation; the shim applies the inverse on write. If a
// TagLib bump ever fixes the render, the wma instances here go red and the
// compensation must be removed.
const ORDER_PRESERVING_FORMATS = [
  "mp3",
  "m4a",
  "flac",
  "ogg",
  "opus",
  "wv",
  "tta",
  "wav",
  "mka",
  "wma",
] as const;

describe("multi-genre round-trip per format (parity)", () => {
  for (const backend of BACKENDS) {
    for (const format of ORDER_PRESERVING_FORMATS) {
      it(`[${backend}] ${format}: genre ["Pop","Rock"] round-trips in order`, async () => {
        const tl = await TagLib.initialize({ forceWasmType: backend });
        const src = new Uint8Array(await readFile(FIXTURE_PATH[format]));
        const file = await tl.open(new Uint8Array(src));
        file.setProperties({ genre: ["Pop", "Rock"] });
        file.save();
        const buf = file.getFileBuffer();
        file.dispose();

        // Read with the OTHER backend so the WASI same-handle cache can
        // never echo un-persisted state.
        const tlR = await TagLib.initialize({
          forceWasmType: backend === "wasi" ? "emscripten" : "wasi",
        });
        const reopened = await tlR.open(buf);
        const props = reopened.properties() as Record<string, string[]>;
        reopened.dispose();
        expect(props.genre).toStrictEqual(["Pop", "Rock"]);
      });
    }
  }
});

describe("ASF multi-value rotation compensation (taglib-ilrg)", () => {
  for (const backend of BACKENDS) {
    it(`[${backend}] wma 3-value genre round-trips in exact order`, async () => {
      const tl = await TagLib.initialize({ forceWasmType: backend });
      const src = new Uint8Array(await readFile(FIXTURE_PATH.wma));
      const file = await tl.open(new Uint8Array(src));
      file.setProperties({ genre: ["Pop", "Rock", "Jazz"] });
      file.save();
      const buf = file.getFileBuffer();
      file.dispose();

      const tlR = await TagLib.initialize({
        forceWasmType: backend === "wasi" ? "emscripten" : "wasi",
      });
      const reopened = await tlR.open(buf);
      const props = reopened.properties() as Record<string, string[]>;
      reopened.dispose();
      // TagLib's ASF render+parse left-rotates multi-value attributes by one
      // ([A,B,C] -> [B,C,A]); the write-side compensation must restore the
      // exact order. A naive reversal would give [A,C,B] here.
      expect(props.genre).toStrictEqual(["Pop", "Rock", "Jazz"]);
    });

    it(`[${backend}] wma no-op save keeps multi-value order stable`, async () => {
      const tl = await TagLib.initialize({ forceWasmType: backend });
      const src = new Uint8Array(await readFile(FIXTURE_PATH.wma));
      const file = await tl.open(new Uint8Array(src));
      file.setProperties({ genre: ["Pop", "Rock"] });
      file.save();
      const once = file.getFileBuffer();
      file.dispose();

      const tl2 = await TagLib.initialize({
        forceWasmType: backend === "wasi" ? "emscripten" : "wasi",
      });
      const second = await tl2.open(once);
      second.save(); // no-op: no property changed
      const twice = second.getFileBuffer();
      second.dispose();

      const tl3 = await TagLib.initialize({
        forceWasmType: backend === "wasi" ? "emscripten" : "wasi",
      });
      const third = await tl3.open(twice);
      const props = third.properties() as Record<string, string[]>;
      third.dispose();
      expect(props.genre).toStrictEqual(["Pop", "Rock"]);
    });
  }
});

describe("embedded-null single-string multi-value (taglib-ktfn)", () => {
  it("'Pop\\0Rock' via setProperty writes byte-identical TCON on both backends and reads back both values", async () => {
    const written: Uint8Array[] = [];
    for (const backend of BACKENDS) {
      const tl = await TagLib.initialize({ forceWasmType: backend });
      const src = new Uint8Array(await readFile(FIXTURE_PATH.mp3));
      const file = await tl.open(new Uint8Array(src));
      file.setProperty("genre", "Pop\u0000Rock");
      file.save();
      const buf = file.getFileBuffer();
      const tcon = file.getId3v2Frames("TCON");
      const body = tcon.length === 1
        ? new Uint8Array(tcon[0].data)
        : new Uint8Array(0);
      file.dispose();
      written.push(body);
      expect(
        new TextDecoder().decode(body),
        `${backend} truncated the value after the embedded null`,
      ).toStrictEqual("\u0003Pop\u0000Rock");
      // The saved file must read back BOTH values (cross-backend read).
      const tlR = await TagLib.initialize({
        forceWasmType: backend === "wasi" ? "emscripten" : "wasi",
      });
      const reopened = await tlR.open(buf);
      const props = reopened.properties() as Record<string, string[]>;
      reopened.dispose();
      expect(props.genre).toStrictEqual(["Pop", "Rock"]);
    }
    expect(
      written[0],
      "backends produced different TCON bytes for the same input",
    ).toStrictEqual(written[1]);
  });
});
