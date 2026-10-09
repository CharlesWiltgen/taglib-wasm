import { afterAll, describe, expect, it } from "vite-plus/test";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expectDefined, expectRejects } from "./_assert-helpers.ts";
import {
  copyCoverArt,
  exportCoverArt,
  findCoverArtFiles,
  importPictureWithType,
  loadPictureFromFile,
  savePictureToFile,
} from "../src/file-utils/index.ts";
import {
  applyPictures,
  readPictures,
  setBufferMode,
} from "../src/simple/index.ts";
import type { PictureType } from "../src/types.ts";
import { FIXTURE_PATH } from "./shared-fixtures.ts";

setBufferMode(true);
const TEMP_DIR = await mkdtemp(join(tmpdir(), "taglib-"));

afterAll(async () => {
  await rm(TEMP_DIR, { recursive: true });
});

describe("loadPictureFromFile", () => {
  it("should load JPEG as Picture with correct MIME type", async () => {
    // Create a fake image file
    const imagePath = `${TEMP_DIR}/test-cover.jpg`;
    const fakeImageData = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4]);
    await writeFile(imagePath, fakeImageData);

    const pic = await loadPictureFromFile(imagePath);
    expect(pic.mimeType).toStrictEqual("image/jpeg");
    expect(pic.data).toStrictEqual(fakeImageData);
    expect(pic.type).toStrictEqual("FrontCover");
    expect(pic.description).toStrictEqual("test-cover.jpg");
  });

  it("should detect PNG MIME type", async () => {
    const imagePath = `${TEMP_DIR}/test-cover.png`;
    await writeFile(imagePath, new Uint8Array([0x89, 0x50, 0x4E, 0x47]));

    const pic = await loadPictureFromFile(imagePath);
    expect(pic.mimeType).toStrictEqual("image/png");
  });

  it("should detect WebP MIME type", async () => {
    const imagePath = `${TEMP_DIR}/test-cover.webp`;
    await writeFile(imagePath, new Uint8Array([1, 2, 3]));

    const pic = await loadPictureFromFile(imagePath);
    expect(pic.mimeType).toStrictEqual("image/webp");
  });

  it("should accept custom type and description", async () => {
    const imagePath = `${TEMP_DIR}/test-back.jpg`;
    await writeFile(imagePath, new Uint8Array([1, 2, 3]));

    const pic = await loadPictureFromFile(imagePath, "BackCover", {
      description: "Back Cover Art",
    });
    expect(pic.type).toStrictEqual("BackCover");
    expect(pic.description).toStrictEqual("Back Cover Art");
  });

  it("should accept Lyricist type", async () => {
    const imagePath = `${TEMP_DIR}/test-numeric.jpg`;
    await writeFile(imagePath, new Uint8Array([1, 2, 3]));

    const pic = await loadPictureFromFile(imagePath, "Lyricist");
    expect(pic.type).toStrictEqual("Lyricist");
  });

  it("should accept custom MIME type override", async () => {
    const imagePath = `${TEMP_DIR}/test-custom.bin`;
    await writeFile(imagePath, new Uint8Array([1, 2, 3]));

    const pic = await loadPictureFromFile(imagePath, "FrontCover", {
      mimeType: "image/bmp",
    });
    expect(pic.mimeType).toStrictEqual("image/bmp");
  });

  it("should default to image/jpeg for unknown extension", async () => {
    const imagePath = `${TEMP_DIR}/test-unknown.xyz`;
    await writeFile(imagePath, new Uint8Array([1, 2, 3]));

    const pic = await loadPictureFromFile(imagePath);
    expect(pic.mimeType).toStrictEqual("image/jpeg");
  });
});

describe("savePictureToFile", () => {
  it("should write picture data to file", async () => {
    const imagePath = `${TEMP_DIR}/saved-picture.jpg`;
    const pictureData = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 10, 20, 30]);

    await savePictureToFile(
      {
        mimeType: "image/jpeg",
        data: pictureData,
        type: "FrontCover" as PictureType,
      },
      imagePath,
    );

    const readBack = new Uint8Array(await readFile(imagePath));
    expect(new Uint8Array(readBack)).toStrictEqual(pictureData);
  });
});

describe("exportCoverArt", () => {
  it("should throw when no cover art found", async () => {
    // Create an MP3 with no cover art
    const original = new Uint8Array(await readFile(FIXTURE_PATH.mp3));
    const noCoverBuffer = await (async () => {
      const { applyPictures } = await import("../src/simple/index.ts");
      return applyPictures(new Uint8Array(original), []);
    })();
    const noCoverPath = `${TEMP_DIR}/no-cover.mp3`;
    await writeFile(noCoverPath, noCoverBuffer);

    await expectRejects(
      () => exportCoverArt(noCoverPath, `${TEMP_DIR}/out.jpg`),
      Error,
      "No cover art found",
    );
  });
});

describe("findCoverArtFiles", () => {
  it("should return empty when no cover files exist", async () => {
    const emptyDir = `${TEMP_DIR}/empty-music-dir`;
    await mkdir(emptyDir, { recursive: true });
    const fakePath = `${emptyDir}/track.mp3`;
    await writeFile(fakePath, new Uint8Array([1]));

    const result = await findCoverArtFiles(fakePath);
    expect(result.front).toStrictEqual(undefined);
    expect(result.back).toStrictEqual(undefined);
    expect(result.folder).toStrictEqual(undefined);
  });

  it("should find cover.jpg in same directory", async () => {
    const musicDir = `${TEMP_DIR}/music-with-cover`;
    await mkdir(musicDir, { recursive: true });
    await writeFile(`${musicDir}/track.mp3`, new Uint8Array([1]));
    await writeFile(`${musicDir}/cover.jpg`, new Uint8Array([0xFF, 0xD8]));

    const result = await findCoverArtFiles(`${musicDir}/track.mp3`);
    expect(result.front).toStrictEqual(`${musicDir}/cover.jpg`);
  });

  it("should find folder.png", async () => {
    const musicDir = `${TEMP_DIR}/music-with-folder`;
    await mkdir(musicDir, { recursive: true });
    await writeFile(`${musicDir}/track.mp3`, new Uint8Array([1]));
    await writeFile(
      `${musicDir}/folder.png`,
      new Uint8Array([0x89, 0x50]),
    );

    const result = await findCoverArtFiles(`${musicDir}/track.mp3`);
    expect(result.folder).toStrictEqual(`${musicDir}/folder.png`);
  });
});

describe("copyCoverArt", () => {
  it("should throw when source has no cover art", async () => {
    const original = new Uint8Array(await readFile(FIXTURE_PATH.mp3));
    const noCover = await applyPictures(new Uint8Array(original), []);
    const srcPath = `${TEMP_DIR}/src-no-cover.mp3`;
    const tgtPath = `${TEMP_DIR}/tgt-no-cover.mp3`;
    await writeFile(srcPath, noCover);
    await writeFile(tgtPath, noCover);

    await expectRejects(
      () => copyCoverArt(srcPath, tgtPath),
      Error,
      "No cover art found",
    );
  });

  it("should throw copyAll when source has no pictures", async () => {
    const original = new Uint8Array(await readFile(FIXTURE_PATH.mp3));
    const noCover = await applyPictures(new Uint8Array(original), []);
    const srcPath = `${TEMP_DIR}/src-no-pics.mp3`;
    const tgtPath = `${TEMP_DIR}/tgt-no-pics.mp3`;
    await writeFile(srcPath, noCover);
    await writeFile(tgtPath, noCover);

    await expectRejects(
      () => copyCoverArt(srcPath, tgtPath, { copyAll: true }),
      Error,
      "No pictures found",
    );
  });
});

describe("importPictureWithType", () => {
  it("should import a picture with specific type into an audio file", async () => {
    const tempAudio = `${TEMP_DIR}/import-test.mp3`;
    const tempImage = `${TEMP_DIR}/test-import.jpg`;

    await copyFile(FIXTURE_PATH.mp3, tempAudio);
    await writeFile(
      tempImage,
      new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]),
    );

    await importPictureWithType(tempAudio, tempImage, "BackCover", {
      description: "Test back cover",
    });

    const pictures = await readPictures(tempAudio);
    const backCovers = pictures.filter((p) => p.type === "BackCover");
    expectDefined(backCovers[0]);
    expect(backCovers[0].mimeType).toStrictEqual("image/jpeg");
  });
});
