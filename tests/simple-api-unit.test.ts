import { afterAll, describe, expect, it } from "vite-plus/test";
import { copyFile, readFile, rm } from "node:fs/promises";
import { expectDefined, expectRejects } from "./_assert-helpers.ts";
import { cleanupTempFiles, createTempFile } from "./test-utils.ts";
import {
  addPicture,
  applyCoverArt,
  applyPictures,
  applyTags,
  applyTagsToFile,
  clearPictures,
  clearTags,
  findPictureByType,
  getTagLib,
  isValidAudioFile,
  readCoverArt,
  readFormat,
  readMetadata,
  readMetadataBatch,
  readPictureMetadata,
  readPictures,
  readProperties,
  readPropertiesBatch,
  readTags,
  readTagsBatch,
  replacePictureByType,
  setBufferMode,
} from "../src/simple/index.ts";
import { FileOperationError } from "../src/errors.ts";
import type { Picture, PictureType } from "../src/types.ts";
import { readFileData } from "../src/utils/file.ts";
import { FIXTURE_PATH } from "./shared-fixtures.ts";
import { TEST_PICTURES } from "./test-utils.ts";

// Force Emscripten backend
setBufferMode(true);

afterAll(cleanupTempFiles);

describe("isValidAudioFile", () => {
  it("should return true for valid audio files", async () => {
    expect(await isValidAudioFile(FIXTURE_PATH.mp3)).toStrictEqual(true);
    expect(await isValidAudioFile(FIXTURE_PATH.flac)).toStrictEqual(true);
    expect(await isValidAudioFile(FIXTURE_PATH.ogg)).toStrictEqual(true);
  });

  it("should return false for invalid data", async () => {
    expect(await isValidAudioFile(new Uint8Array([0, 0, 0, 0]))).toStrictEqual(
      false,
    );
  });

  it("should return false for non-existent path", async () => {
    expect(await isValidAudioFile("/nonexistent/file.mp3")).toStrictEqual(
      false,
    );
  });
});

describe("clearTags", () => {
  it("should return buffer with tags cleared", async () => {
    const original = new Uint8Array(await readFile(FIXTURE_PATH.mp3));
    const cleared = await clearTags(new Uint8Array(original));

    expect(cleared instanceof Uint8Array).toStrictEqual(true);
    expect(cleared.length > 0).toStrictEqual(true);

    // Read back and verify tags are empty
    const tags = await readTags(cleared);
    expect(
      tags.title === undefined || tags.title.length === 0 ||
        tags.title.every((s) => s === ""),
    ).toStrictEqual(true);
  });
});

describe("readProperties", () => {
  it("should return audio properties for all formats", async () => {
    const paths = Object.values(FIXTURE_PATH);

    for (const file of paths) {
      const props = await readProperties(file);
      expectDefined(props);
      expect(typeof props.duration).toStrictEqual("number");
      expect(typeof props.bitrate).toStrictEqual("number");
      expect(typeof props.sampleRate).toStrictEqual("number");
      expect(typeof props.channels).toStrictEqual("number");
    }
  });
});

describe("readPictures", () => {
  it("should return array of pictures from file with cover art", async () => {
    const mp3 = new Uint8Array(await readFile(FIXTURE_PATH.mp3));
    const pictures = await readPictures(new Uint8Array(mp3));
    expect(Array.isArray(pictures)).toStrictEqual(true);
  });
});

describe("clearPictures", () => {
  it("should return buffer with pictures removed", async () => {
    const original = new Uint8Array(await readFile(FIXTURE_PATH.mp3));
    const cleared = await clearPictures(new Uint8Array(original));
    expect(cleared instanceof Uint8Array).toStrictEqual(true);
    expect(cleared.length > 0).toStrictEqual(true);

    const pictures = await readPictures(cleared);
    expect(pictures.length).toStrictEqual(0);
  });
});

describe("readPictureMetadata", () => {
  it("should return metadata without data payload", async () => {
    const mp3 = new Uint8Array(await readFile(FIXTURE_PATH.mp3));
    const metadata = await readPictureMetadata(new Uint8Array(mp3));
    expect(Array.isArray(metadata)).toStrictEqual(true);

    for (const m of metadata) {
      expect(typeof m.type).toStrictEqual("string");
      expect(typeof m.mimeType).toStrictEqual("string");
      expect(typeof m.size).toStrictEqual("number");
    }
  });
});

describe("findPictureByType", () => {
  it("should find picture by PictureType string", () => {
    const pictures: Picture[] = [
      {
        mimeType: "image/jpeg",
        data: new Uint8Array([1]),
        type: "FrontCover" as PictureType,
      },
      {
        mimeType: "image/png",
        data: new Uint8Array([2]),
        type: "BackCover" as PictureType,
      },
    ];

    const front = findPictureByType(pictures, "FrontCover");
    expectDefined(front);
    expect(front!.type).toStrictEqual("FrontCover");
  });

  it("should find picture by PictureType value", () => {
    const pictures: Picture[] = [
      {
        mimeType: "image/jpeg",
        data: new Uint8Array([1]),
        type: "FrontCover" as PictureType,
      },
      {
        mimeType: "image/png",
        data: new Uint8Array([2]),
        type: "BackCover" as PictureType,
      },
    ];

    const back = findPictureByType(pictures, "BackCover");
    expectDefined(back);
    expect(back!.type).toStrictEqual("BackCover");
  });

  it("should return null when type not found", () => {
    const pictures: Picture[] = [
      {
        mimeType: "image/jpeg",
        data: new Uint8Array([1]),
        type: "FrontCover" as PictureType,
      },
    ];

    expect(findPictureByType(pictures, "BackCover")).toStrictEqual(undefined);
  });

  it("should return undefined for empty array", () => {
    expect(findPictureByType([], "FrontCover")).toStrictEqual(undefined);
  });
});

describe("readTagsBatch", () => {
  it("should read tags from multiple files", async () => {
    const files = [
      FIXTURE_PATH.mp3,
      FIXTURE_PATH.flac,
      FIXTURE_PATH.ogg,
    ];

    const result = await readTagsBatch(files);
    expect(result.items.length).toStrictEqual(3);
    expect(result.items.every((item) => item.status === "ok")).toStrictEqual(
      true,
    );
    expect(typeof result.duration).toStrictEqual("number");
  });

  it("should handle errors with continueOnError", async () => {
    const files = [
      FIXTURE_PATH.mp3,
      "/nonexistent/file.mp3",
    ];

    const result = await readTagsBatch(files, { continueOnError: true });
    expect(result.items.length).toStrictEqual(2);
    expect(result.items[0].status).toStrictEqual("ok");
    expect(result.items[0].path).toStrictEqual(FIXTURE_PATH.mp3);
    expect(result.items[1].status).toStrictEqual("error");
    expect(result.items[1].path).toStrictEqual("/nonexistent/file.mp3");
  });

  it("should call onProgress callback", async () => {
    const files = [FIXTURE_PATH.mp3];
    const progressCalls: Array<{ processed: number; total: number }> = [];

    await readTagsBatch(files, {
      onProgress: (processed, total) => {
        progressCalls.push({ processed, total });
      },
    });

    expect(progressCalls.length).toStrictEqual(1);
    expect(progressCalls[0]).toStrictEqual({ processed: 1, total: 1 });
  });

  it("should respect concurrency option", async () => {
    const files = [
      FIXTURE_PATH.mp3,
      FIXTURE_PATH.flac,
      FIXTURE_PATH.ogg,
      FIXTURE_PATH.m4a,
    ];

    const result = await readTagsBatch(files, { concurrency: 2 });
    expect(result.items.length).toStrictEqual(4);
    expect(result.items.every((item) => item.status === "ok")).toStrictEqual(
      true,
    );
  });
});

describe("readPropertiesBatch", () => {
  it("should read properties from multiple files", async () => {
    const files = [
      FIXTURE_PATH.mp3,
      FIXTURE_PATH.flac,
    ];

    const result = await readPropertiesBatch(files);
    expect(result.items.length).toStrictEqual(2);
    expect(result.items.every((item) => item.status === "ok")).toStrictEqual(
      true,
    );

    for (const item of result.items) {
      if (item.status === "ok") {
        expectDefined(item.data);
        expect(typeof item.data!.duration).toStrictEqual("number");
      }
    }
  });
});

describe("readMetadataBatch", () => {
  it("should read both tags and properties in single pass", async () => {
    const files = [
      FIXTURE_PATH.mp3,
      FIXTURE_PATH.flac,
    ];

    const result = await readMetadataBatch(files);
    expect(result.items.length).toStrictEqual(2);

    for (const item of result.items) {
      expect(item.status).toStrictEqual("ok");
      if (item.status === "ok") {
        expectDefined(item.data.tags);
        expectDefined(item.data.properties);
        expect(typeof item.data.hasCoverArt).toStrictEqual("boolean");
      }
    }
  });

  it("should handle errors gracefully", async () => {
    const files = ["/nonexistent/file.mp3"];
    const result = await readMetadataBatch(files, { continueOnError: true });
    expect(result.items.length).toStrictEqual(1);
    expect(result.items[0].status).toStrictEqual("error");
  });

  it("should call onProgress callback", async () => {
    const files = [FIXTURE_PATH.mp3, FIXTURE_PATH.flac];
    const progressCalls: Array<{
      processed: number;
      total: number;
      file: string;
    }> = [];

    await readMetadataBatch(files, {
      onProgress: (processed, total, currentFile) => {
        progressCalls.push({ processed, total, file: currentFile });
      },
    });

    expect(progressCalls.length).toStrictEqual(2);
    expect(progressCalls[0].total).toStrictEqual(2);
    expect(progressCalls[1].total).toStrictEqual(2);
  });

  it("should return empty result for empty input", async () => {
    const result = await readMetadataBatch([]);
    expect(result.items.length).toStrictEqual(0);
    expect(result.duration).toStrictEqual(0);
  });
});

describe("readTagsBatch AbortSignal", () => {
  it("should abort when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    let threw = false;
    try {
      await readTagsBatch([FIXTURE_PATH.mp3], { signal: controller.signal });
    } catch (error) {
      threw = true;
      expect(error instanceof DOMException).toStrictEqual(true);
    }
    expect(threw).toStrictEqual(true);
  });
});

describe("readMetadata", () => {
  it("should return tags, properties, hasCoverArt, and dynamics for a single file", async () => {
    const metadata = await readMetadata(FIXTURE_PATH.mp3);

    expectDefined(metadata.tags);
    expectDefined(metadata.properties);
    expect(typeof metadata.hasCoverArt).toStrictEqual("boolean");
    expect(typeof metadata.properties!.duration).toStrictEqual("number");
    expect(typeof metadata.properties!.bitrate).toStrictEqual("number");
    // dynamics may be undefined if no ReplayGain/Sound Check tags exist
    expect(
      metadata.dynamics === undefined || typeof metadata.dynamics === "object",
    ).toStrictEqual(true);
  });

  it("should return same shape as readMetadataBatch for single file", async () => {
    const single = await readMetadata(FIXTURE_PATH.flac);
    const batch = await readMetadataBatch([FIXTURE_PATH.flac]);

    expect(batch.items.length).toStrictEqual(1);
    expect(batch.items[0].status).toStrictEqual("ok");
    if (batch.items[0].status === "ok") {
      expect(single.tags).toStrictEqual(batch.items[0].data.tags);
      expect(single.properties).toStrictEqual(batch.items[0].data.properties);
      expect(single.hasCoverArt).toStrictEqual(batch.items[0].data.hasCoverArt);
    }
  });

  it("should throw InvalidFormatError for invalid data", async () => {
    let threw = false;
    try {
      await readMetadata(new Uint8Array([0, 0, 0, 0]));
    } catch (error) {
      threw = true;
      expect(error instanceof Error).toStrictEqual(true);
    }
    expect(threw).toStrictEqual(true);
  });
});

// Regression: taglib-0co — readTags() returned only mapPropertiesToExtendedTag(),
// so the structured ExtendedTag fields (pictures/ratings/lyrics/chapters/bext/
// ixml) were declared but never populated; only the AudioFile.getX() methods
// returned them. readTags must now expose the SAME data as those methods.
describe("readTags structured fields (taglib-0co)", () => {
  it("populates pictures/ratings/lyrics/chapters identically to the getX() methods", async () => {
    const taglib = await getTagLib();
    const seed = await taglib.open(await readFileData(FIXTURE_PATH.mp3));
    seed.setRatings([{ rating: 0.8 }]);
    seed.setLyrics([{ text: "first line\nsecond line" }]);
    seed.setChapters([{ startTimeMs: 0, title: "Intro" }]);
    seed.addPicture(TEST_PICTURES.frontCover);
    seed.save();
    const buf = seed.getFileBuffer();
    seed.dispose();

    const tag = await readTags(buf);

    const reopened = await taglib.open(buf);
    const viaMethods = {
      pictures: reopened.getPictures(),
      ratings: reopened.getRatings(),
      lyrics: reopened.getLyrics(),
      chapters: reopened.getChapters(),
    };
    reopened.dispose();

    expect({
      pictures: tag.pictures,
      ratings: tag.ratings,
      lyrics: tag.lyrics,
      chapters: tag.chapters,
    }).toStrictEqual(viaMethods);
  });

  it("populates bext and iXML identically to the getX() methods on WAV", async () => {
    const taglib = await getTagLib();
    const seed = await taglib.open(await readFileData(FIXTURE_PATH.wav));
    seed.setBextData(new Uint8Array(602).fill(7));
    seed.setIxml("<BWFXML><TEST>1</TEST></BWFXML>");
    seed.save();
    const buf = seed.getFileBuffer();
    seed.dispose();

    const tag = await readTags(buf);

    const reopened = await taglib.open(buf);
    const viaMethods = {
      bext: reopened.getBext(),
      bextData: reopened.getBextData(),
      ixml: reopened.getIxml(),
    };
    reopened.dispose();

    expect({ bext: tag.bext, bextData: tag.bextData, ixml: tag.ixml })
      .toStrictEqual(viaMethods);
  });

  it("omits structured fields that are absent", async () => {
    const stripped = await clearTags(await readFileData(FIXTURE_PATH.mp3));
    const tag = await readTags(stripped);
    expect({
      pictures: tag.pictures,
      ratings: tag.ratings,
      lyrics: tag.lyrics,
      chapters: tag.chapters,
    }).toStrictEqual({
      pictures: undefined,
      ratings: undefined,
      lyrics: undefined,
      chapters: undefined,
    });
  });
});

describe("readFormat", () => {
  it("should detect MP3 format", async () => {
    const format = await readFormat(FIXTURE_PATH.mp3);
    expect(format).toStrictEqual("MP3");
  });

  it("should detect FLAC format", async () => {
    const format = await readFormat(FIXTURE_PATH.flac);
    expect(format).toStrictEqual("FLAC");
  });

  it("should detect OGG format", async () => {
    const format = await readFormat(FIXTURE_PATH.ogg);
    expect(format).toStrictEqual("OGG");
  });

  it("should detect M4A format", async () => {
    const format = await readFormat(FIXTURE_PATH.m4a);
    expect(format).toStrictEqual("MP4");
  });

  it("should detect WAV format", async () => {
    const format = await readFormat(FIXTURE_PATH.wav);
    expect(format).toStrictEqual("WAV");
  });

  it("should throw for invalid data", async () => {
    let threw = false;
    try {
      await readFormat(new Uint8Array([0, 0, 0, 0]));
    } catch {
      threw = true;
    }
    expect(threw).toStrictEqual(true);
  });
});

describe("readProperties error handling", () => {
  it("should throw for invalid audio data", async () => {
    let threw = false;
    try {
      await readProperties(new Uint8Array([0, 0, 0, 0]));
    } catch (error) {
      threw = true;
      expect(error instanceof Error).toStrictEqual(true);
    }
    expect(threw).toStrictEqual(true);
  });
});

describe("readCoverArt", () => {
  it("should return cover art data from file with pictures", async () => {
    const mp3 = new Uint8Array(await readFile(FIXTURE_PATH.mp3));
    const coverArt = await readCoverArt(new Uint8Array(mp3));
    // May or may not have pictures, but should not throw
    if (coverArt) {
      expect(coverArt instanceof Uint8Array).toStrictEqual(true);
      expect(coverArt.length > 0).toStrictEqual(true);
    }
  });

  it("should return undefined for file with no pictures", async () => {
    const mp3 = new Uint8Array(await readFile(FIXTURE_PATH.mp3));
    const cleared = await clearPictures(new Uint8Array(mp3));
    const coverArt = await readCoverArt(cleared);
    expect(coverArt).toStrictEqual(undefined);
  });

  it("should fall back to first picture when no FrontCover exists", async () => {
    const mp3 = new Uint8Array(await readFile(FIXTURE_PATH.mp3));
    // Set only a BackCover (no FrontCover)
    const backCoverOnly: Picture[] = [
      {
        mimeType: "image/png",
        data: new Uint8Array([0x89, 0x50, 0x4E, 0x47]),
        type: "BackCover" as PictureType,
      },
    ];
    const withBackCover = await applyPictures(
      new Uint8Array(mp3),
      backCoverOnly,
    );
    const coverArt = await readCoverArt(withBackCover);
    expectDefined(coverArt);
    expect(coverArt!.length).toStrictEqual(4);
  });
});

describe("applyCoverArt", () => {
  it("should embed a front cover image and return modified buffer", async () => {
    const mp3 = new Uint8Array(await readFile(FIXTURE_PATH.mp3));
    const fakeImage = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]);
    const result = await applyCoverArt(
      new Uint8Array(mp3),
      fakeImage,
      "image/jpeg",
    );
    expect(result instanceof Uint8Array).toStrictEqual(true);
    expect(result.length > 0).toStrictEqual(true);

    const pictures = await readPictures(result);
    expect(pictures.length).toStrictEqual(1);
    expect(pictures[0].type).toStrictEqual("FrontCover");
  });
});

describe("applyPictures", () => {
  it("should replace all pictures with provided set", async () => {
    const mp3 = new Uint8Array(await readFile(FIXTURE_PATH.mp3));
    const newPictures: Picture[] = [
      {
        mimeType: "image/png",
        data: new Uint8Array([0x89, 0x50, 0x4E, 0x47]),
        type: "BackCover" as PictureType,
      },
    ];
    const result = await applyPictures(new Uint8Array(mp3), newPictures);
    const pictures = await readPictures(result);
    expect(pictures.length).toStrictEqual(1);
    expect(pictures[0].type).toStrictEqual("BackCover");
  });
});

describe("addPicture", () => {
  it("should append a picture to existing pictures", async () => {
    const mp3 = new Uint8Array(await readFile(FIXTURE_PATH.mp3));
    const cleared = await clearPictures(new Uint8Array(mp3));
    const picture: Picture = {
      mimeType: "image/jpeg",
      data: new Uint8Array([0xFF, 0xD8]),
      type: "FrontCover" as PictureType,
    };
    const result = await addPicture(cleared, picture);
    const pictures = await readPictures(result);
    expect(pictures.length >= 1).toStrictEqual(true);
  });
});

describe("replacePictureByType", () => {
  it("should replace picture of matching type", async () => {
    const mp3 = new Uint8Array(await readFile(FIXTURE_PATH.mp3));
    // First add a front cover
    const withCover = await applyCoverArt(
      new Uint8Array(mp3),
      new Uint8Array([0xFF, 0xD8]),
      "image/jpeg",
    );
    // Replace the front cover
    const newPicture: Picture = {
      mimeType: "image/png",
      data: new Uint8Array([0x89, 0x50]),
      type: "FrontCover" as PictureType,
    };
    const result = await replacePictureByType(withCover, newPicture);
    const pictures = await readPictures(result);
    const frontCovers = pictures.filter((p) => p.type === "FrontCover");
    expect(frontCovers.length).toStrictEqual(1);
    expect(frontCovers[0].mimeType).toStrictEqual("image/png");
  });
});

describe("applyTags", () => {
  it("should apply tag changes and return modified buffer", async () => {
    const mp3 = new Uint8Array(await readFile(FIXTURE_PATH.mp3));
    const result = await applyTags(new Uint8Array(mp3), {
      title: "New Title",
      artist: "New Artist",
    });
    expect(result instanceof Uint8Array).toStrictEqual(true);

    const tags = await readTags(result);
    expect(tags.title?.[0]).toStrictEqual("New Title");
    expect(tags.artist?.[0]).toStrictEqual("New Artist");
  });
});

describe("applyTagsToFile", () => {
  it("should write tags to a file on disk", async () => {
    const tempFile = await createTempFile(".mp3");
    try {
      await copyFile(FIXTURE_PATH.mp3, tempFile);
      await applyTagsToFile(tempFile, {
        title: "Written Title",
        artist: "Written Artist",
      });

      const tags = await readTags(tempFile);
      expect(tags.title?.[0]).toStrictEqual("Written Title");
      expect(tags.artist?.[0]).toStrictEqual("Written Artist");
    } finally {
      await rm(tempFile);
    }
  });
});

describe("readMetadata with dynamics", () => {
  it("should extract ReplayGain dynamics when present", async () => {
    // Write ReplayGain properties to a temp file, then read them back
    const taglib = await getTagLib();
    const mp3 = new Uint8Array(await readFile(FIXTURE_PATH.mp3));
    const audioFile = await taglib.open(new Uint8Array(mp3));
    try {
      audioFile.setProperty("replayGainTrackGain", "-6.5 dB");
      audioFile.setProperty("replayGainTrackPeak", "0.98765");
      audioFile.save();
      const buffer = audioFile.getFileBuffer();

      const metadata = await readMetadata(buffer);
      expectDefined(metadata.dynamics);
      expect(metadata.dynamics!.replayGainTrackGain).toStrictEqual("-6.5 dB");
      expect(metadata.dynamics!.replayGainTrackPeak).toStrictEqual("0.98765");
    } finally {
      audioFile.dispose();
    }
  });

  it("should extract all ReplayGain fields", async () => {
    const taglib = await getTagLib();
    const flac = new Uint8Array(await readFile(FIXTURE_PATH.flac));
    const audioFile = await taglib.open(new Uint8Array(flac));
    try {
      audioFile.setProperty("replayGainTrackGain", "-3.2 dB");
      audioFile.setProperty("replayGainTrackPeak", "0.95");
      audioFile.setProperty("replayGainAlbumGain", "-2.1 dB");
      audioFile.setProperty("replayGainAlbumPeak", "0.99");
      audioFile.save();
      const buffer = audioFile.getFileBuffer();

      const metadata = await readMetadata(buffer);
      expectDefined(metadata.dynamics);
      expect(metadata.dynamics!.replayGainAlbumGain).toStrictEqual("-2.1 dB");
      expect(metadata.dynamics!.replayGainAlbumPeak).toStrictEqual("0.99");
    } finally {
      audioFile.dispose();
    }
  });
});

describe("readFileData", () => {
  it("should handle ArrayBuffer input", async () => {
    const mp3 = new Uint8Array(await readFile(FIXTURE_PATH.mp3));
    const arrayBuffer = mp3.buffer.slice(
      mp3.byteOffset,
      mp3.byteOffset + mp3.byteLength,
    );
    const result = await readFileData(arrayBuffer);
    expect(result instanceof Uint8Array).toStrictEqual(true);
    expect(result.length).toStrictEqual(mp3.length);
  });

  it("should handle Uint8Array input directly", async () => {
    const data = new Uint8Array([1, 2, 3]);
    const result = await readFileData(data);
    expect(result).toStrictEqual(data);
  });

  it("should handle string path input", async () => {
    const result = await readFileData(FIXTURE_PATH.mp3);
    expect(result instanceof Uint8Array).toStrictEqual(true);
    expect(result.length > 0).toStrictEqual(true);
  });
});

describe("readPropertiesBatch error handling", () => {
  it("should report errors for invalid files", async () => {
    const files = [
      FIXTURE_PATH.mp3,
      "/nonexistent/file.mp3",
    ];
    const result = await readPropertiesBatch(files, { continueOnError: true });
    expect(result.items.length).toStrictEqual(2);
    expect(result.items[0].status).toStrictEqual("ok");
    expect(result.items[1].status).toStrictEqual("error");
  });
});

describe("applyTagsToFile error handling", () => {
  it("should throw FileOperationError for non-string input", async () => {
    await expectRejects(
      () =>
        applyTagsToFile(new Uint8Array([1]) as unknown as string, {
          title: "test",
        }),
      FileOperationError,
      "applyTagsToFile requires a file path string",
    );
  });
});

describe("readTagsBatch with buffer input", () => {
  it("should handle buffer inputs in batch", async () => {
    const mp3 = new Uint8Array(await readFile(FIXTURE_PATH.mp3));
    const result = await readTagsBatch([new Uint8Array(mp3)]);
    expect(result.items.length).toStrictEqual(1);
    expect(result.items[0].status).toStrictEqual("ok");
    // Buffer input should use generated file name
    expect(result.items[0].path).toStrictEqual("buffer-0");
  });
});

describe("readTagsBatch with NamedAudioInput", () => {
  it("should use name from NamedAudioInput for path", async () => {
    const mp3 = new Uint8Array(await readFile(FIXTURE_PATH.mp3));
    const result = await readTagsBatch([
      { name: "my-song.mp3", data: new Uint8Array(mp3) },
    ]);
    expect(result.items.length).toStrictEqual(1);
    expect(result.items[0].status).toStrictEqual("ok");
    expect(result.items[0].path).toStrictEqual("my-song.mp3");
  });

  it("should use File.name for File input path", async () => {
    const mp3 = new Uint8Array(await readFile(FIXTURE_PATH.mp3));
    const file = new File([mp3], "from-file-api.mp3", { type: "audio/mpeg" });
    const result = await readTagsBatch([file]);
    expect(result.items.length).toStrictEqual(1);
    expect(result.items[0].status).toStrictEqual("ok");
    expect(result.items[0].path).toStrictEqual("from-file-api.mp3");
  });

  it("should use buffer-N fallback for unnamed buffers", async () => {
    const mp3 = new Uint8Array(await readFile(FIXTURE_PATH.mp3));
    const result = await readTagsBatch([
      new Uint8Array(mp3),
      new Uint8Array(mp3),
    ]);
    expect(result.items[0].path).toStrictEqual("buffer-0");
    expect(result.items[1].path).toStrictEqual("buffer-1");
  });
});

describe("readTagsBatch without continueOnError", () => {
  it("should throw on error when continueOnError is false", async () => {
    await expectRejects(() =>
      readTagsBatch(["/nonexistent/file.mp3"], {
        continueOnError: false,
      }), Error);
  });
});

describe("readMetadata with Sound Check", () => {
  it("should extract Apple Sound Check dynamics when ITUNNORM is set", async () => {
    const taglib = await getTagLib();
    const mp3 = new Uint8Array(await readFile(FIXTURE_PATH.mp3));
    const audioFile = await taglib.open(new Uint8Array(mp3));
    try {
      audioFile.setProperty(
        "itunNorm",
        " 00001234 00001234 00002345 00002345 00000000 00000000 00001234 00001234 00000000 00000000",
      );
      audioFile.save();
      const buffer = audioFile.getFileBuffer();

      const metadata = await readMetadata(buffer);
      expectDefined(metadata.dynamics);
      expectDefined(metadata.dynamics!.appleSoundCheck);
    } finally {
      audioFile.dispose();
    }
  });
});

describe("setBufferMode", () => {
  it("should toggle buffer mode", () => {
    setBufferMode(true);
    setBufferMode(false);
    setBufferMode(true); // restore for other tests
  });
});
