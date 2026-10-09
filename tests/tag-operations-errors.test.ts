import { describe, expect, it } from "vite-plus/test";
import { readFile } from "node:fs/promises";
import { expectRejects } from "./_assert-helpers.ts";
import {
  applyTags,
  applyTagsToFile,
  clearTags,
  readFormat,
  readTags,
  setBufferMode,
} from "../src/simple/index.ts";
import { TagLib } from "../src/taglib.ts";
import { FileOperationError, InvalidFormatError } from "../src/errors.ts";
import { FIXTURE_PATH } from "./shared-fixtures.ts";

setBufferMode(true);

function makeCorruptedBuffer(size = 5000): Uint8Array {
  const buf = new Uint8Array(size);
  for (let i = 0; i < buf.length; i++) {
    buf[i] = (i * 17 + 123) % 256;
  }
  return buf;
}

describe("readTags error paths", () => {
  it("should throw InvalidFormatError for corrupted buffer", async () => {
    await expectRejects(
      () => readTags(makeCorruptedBuffer()),
      InvalidFormatError,
    );
  });

  it("should throw InvalidFormatError for tiny buffer", async () => {
    await expectRejects(() => readTags(new Uint8Array(10)), InvalidFormatError);
  });
});

describe("applyTags", () => {
  it("should throw InvalidFormatError for corrupted buffer", async () => {
    await expectRejects(
      () => applyTags(makeCorruptedBuffer(), { title: "Test" }),
      InvalidFormatError,
    );
  });

  it("should return a valid buffer when applying tags to valid file", async () => {
    const original = new Uint8Array(await readFile(FIXTURE_PATH.mp3));
    const result = await applyTags(new Uint8Array(original), {
      title: "Modified Title",
    });
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length > 0).toBeTruthy();
  });
});

describe("applyTagsToFile error paths", () => {
  it("should throw FileOperationError when given a buffer instead of path", async () => {
    const buffer = new Uint8Array(100);
    await expectRejects( // deno-lint-ignore no-explicit-any
      () => applyTagsToFile(buffer as any, { title: "Test" }),
      FileOperationError,
      "requires a file path string",
    );
  });

  it("should throw FileOperationError when given an ArrayBuffer instead of path", async () => {
    const buffer = new ArrayBuffer(100);
    await expectRejects( // deno-lint-ignore no-explicit-any
      () => applyTagsToFile(buffer as any, { title: "Test" }),
      FileOperationError,
      "requires a file path string",
    );
  });
});

describe("clearTags", () => {
  for (const format of ["flac", "mp3", "ogg"] as const) {
    it(`should clear extended fields and pictures for ${format.toUpperCase()}`, async () => {
      const original = new Uint8Array(await readFile(FIXTURE_PATH[format]));

      const withExtended = await applyTags(new Uint8Array(original), {
        title: "Test Title",
        artist: "Test Artist",
        albumArtist: "Various Artists",
        composer: "Test Composer",
        musicbrainzTrackId: "abc-123",
        replayGainTrackGain: "-6.54 dB",
      });

      const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });
      const withPicture = await taglib.edit(withExtended, (file) => {
        file.addPicture({
          mimeType: "image/png",
          data: new Uint8Array([0x89, 0x50, 0x4E, 0x47]),
          type: "FrontCover",
        });
      });

      const cleared = await clearTags(withPicture);

      const verifyFile = await taglib.open(cleared);
      try {
        expect(verifyFile.tag().title).toStrictEqual("");
        expect(verifyFile.tag().artist).toStrictEqual("");
        expect(verifyFile.getProperty("albumArtist")?.[0]).toStrictEqual(
          undefined,
        );
        expect(verifyFile.getProperty("composer")?.[0]).toStrictEqual(
          undefined,
        );
        expect(verifyFile.getProperty("musicbrainzTrackId")?.[0]).toStrictEqual(
          undefined,
        );
        expect(verifyFile.getProperty("replayGainTrackGain")?.[0])
          .toStrictEqual(undefined);
        expect(verifyFile.getPictures().length).toStrictEqual(0);
      } finally {
        verifyFile.dispose();
      }
    });
  }
});

describe("readTags extended fields", () => {
  it("should return extended fields from readTags", async () => {
    const original = new Uint8Array(await readFile(FIXTURE_PATH.flac));
    const withExtended = await applyTags(new Uint8Array(original), {
      title: "Test Title",
      albumArtist: "Various Artists",
      composer: "Test Composer",
      discNumber: 2,
      totalTracks: 12,
      bpm: 128,
      compilation: true,
      musicbrainzTrackId: "abc-123",
      replayGainTrackGain: "-6.54 dB",
    });

    const tags = await readTags(withExtended);
    expect(tags.title).toStrictEqual(["Test Title"]);
    expect(tags.albumArtist).toStrictEqual(["Various Artists"]);
    expect(tags.composer).toStrictEqual(["Test Composer"]);
    expect(tags.discNumber).toStrictEqual(2);
    expect(tags.totalTracks).toStrictEqual(12);
    expect(tags.bpm).toStrictEqual(128);
    expect(tags.compilation).toStrictEqual(true);
    expect(tags.musicbrainzTrackId).toStrictEqual(["abc-123"]);
    expect(tags.replayGainTrackGain).toStrictEqual(["-6.54 dB"]);
  });
});

describe("readFormat edge cases", () => {
  it("should throw InvalidFormatError for corrupted buffer", async () => {
    await expectRejects(
      () => readFormat(makeCorruptedBuffer()),
      InvalidFormatError,
    );
  });

  it("should detect MP3 format for known MP3 file", async () => {
    const format = await readFormat(FIXTURE_PATH.mp3);
    expect(format).toStrictEqual("MP3");
  });
});
