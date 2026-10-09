/**
 * @fileoverview Comprehensive tests for picture/cover art functionality
 * Combines tests from test-pictures.ts and test-cover-art-helpers.ts
 */

import { describe, expect, it } from "vite-plus/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { expectDefined } from "./_assert-helpers.ts";
import { TagLib } from "../src/taglib.ts";
import { readFileData } from "../src/utils/file.ts";
import {
  addPicture,
  applyCoverArt,
  applyPictures,
  clearPictures,
  findPictureByType,
  readCoverArt,
  readPictureMetadata,
  readPictures,
  replacePictureByType,
  setBufferMode,
} from "../src/simple/index.ts";
import {
  copyCoverArt,
  exportAllPictures,
  exportCoverArt,
  importCoverArt,
  loadPictureFromFile,
  savePictureToFile,
} from "../src/file-utils/index.ts";
import { dataURLToPicture, pictureToDataURL } from "../src/web-utils/index.ts";
import {
  BLUE_JPEG,
  cleanupTestImages,
  createTestImages,
  RED_PNG,
  TEST_FILES,
  TEST_PICTURES,
} from "./test-utils.ts";
import type { PictureType } from "../src/types.ts";

// Force Emscripten backend for Simple API calls
setBufferMode(true);

describe("Core Picture API", () => {
  it("reads pictures from files", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });

    const mp3File = await taglib.open(TEST_FILES.mp3);
    const mp3Pictures = mp3File.getPictures();
    expect(
      mp3Pictures.length,
      "MP3 should have no pictures initially",
    ).toStrictEqual(0);
    mp3File.dispose();

    const flacFile = await taglib.open(TEST_FILES.flac);
    const flacPictures = flacFile.getPictures();
    expect(
      flacPictures.length,
      "FLAC should have no pictures initially",
    ).toStrictEqual(0);
    flacFile.dispose();

    const mp4File = await taglib.open(TEST_FILES.m4a);
    const mp4Pictures = mp4File.getPictures();
    expect(
      mp4Pictures.length,
      "MP4 should have no pictures initially",
    ).toStrictEqual(0);
    mp4File.dispose();
  });

  it("adds and retrieves pictures", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });

    // Test with MP3
    {
      const buffer = await readFileData(TEST_FILES.mp3);
      const file = await taglib.open(buffer);

      file.addPicture(TEST_PICTURES.frontCover);
      file.save();

      const pictures = file.getPictures();
      expect(
        pictures.length,
        "Should have 1 picture after adding",
      ).toStrictEqual(1);
      expect(pictures[0].mimeType).toStrictEqual("image/png");
      expect(pictures[0].type).toStrictEqual("FrontCover");
      expect(pictures[0].description).toStrictEqual("Front cover");
      expect(pictures[0].data.length).toStrictEqual(RED_PNG.length);

      file.dispose();
    }

    // Test with FLAC
    {
      const buffer = await readFileData(TEST_FILES.flac);
      const file = await taglib.open(buffer);

      const pictures = [TEST_PICTURES.frontCover, TEST_PICTURES.backCover];

      file.setPictures(pictures);
      file.save();

      const retrievedPics = file.getPictures();
      expect(retrievedPics.length, "Should have 2 pictures").toStrictEqual(2);
      expect(retrievedPics[0].type).toStrictEqual("FrontCover");
      expect(retrievedPics[1].type).toStrictEqual("BackCover");

      file.dispose();
    }

    // Test with MP4
    {
      const buffer = await readFileData(TEST_FILES.m4a);
      const file = await taglib.open(buffer);

      file.setPictures([TEST_PICTURES.backCover]);
      file.save();
      const saved = file.getFileBuffer();
      file.dispose();

      // Reopen before asserting type: within one session the backends answer
      // differently for staged writes (WASI reads its cache, Emscripten the
      // live object). The file truth — MP4 covr carries no picture type, so
      // every picture reads back as FrontCover — is what must agree.
      const reopened = await taglib.open(saved);
      const pictures = reopened.getPictures();
      reopened.dispose();
      expect(pictures.length, "Should have 1 picture").toStrictEqual(1);
      expect(pictures[0].type).toStrictEqual("FrontCover");
      expect(pictures[0].mimeType).toStrictEqual("image/jpeg");
      expect(pictures[0].data.length).toStrictEqual(BLUE_JPEG.length);
    }
  });

  it("removes pictures", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });
    const buffer = await readFileData(TEST_FILES.mp3);
    const file = await taglib.open(buffer);

    file.addPicture(TEST_PICTURES.frontCover);
    file.save();

    expect(file.getPictures().length, "Should have 1 picture").toStrictEqual(1);

    file.removePictures();
    file.save();

    expect(
      file.getPictures().length,
      "Should have no pictures after removal",
    ).toStrictEqual(0);

    file.dispose();
  });

  it("handles different picture types", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });
    const buffer = await readFileData(TEST_FILES.flac);
    const file = await taglib.open(buffer);

    const pictureTypes = [
      { type: "FrontCover" as const, desc: "Front" },
      { type: "BackCover" as const, desc: "Back" },
      { type: "LeafletPage" as const, desc: "Leaflet" },
      { type: "Artist" as const, desc: "Artist photo" },
      { type: "BandLogo" as const, desc: "Logo" },
    ];

    const pictures = pictureTypes.map((pt) => ({
      mimeType: "image/png",
      data: RED_PNG,
      type: pt.type,
      description: pt.desc,
    }));

    file.setPictures(pictures);
    file.save();

    const retrieved = file.getPictures();
    expect(retrieved.length, "Should have all pictures").toStrictEqual(
      pictures.length,
    );

    for (let i = 0; i < pictures.length; i++) {
      expect(retrieved[i].type).toStrictEqual(pictures[i].type);
      expect(retrieved[i].description).toStrictEqual(pictures[i].description);
    }

    file.dispose();
  });
});

describe("Simple API Cover Art", () => {
  it("readCoverArt and applyCoverArt roundtrip", async () => {
    const testFile = TEST_FILES.mp3;

    const noCover = await readCoverArt(testFile);
    expect(noCover, "Should return undefined when no cover art").toStrictEqual(
      undefined,
    );

    const modifiedBuffer = await applyCoverArt(testFile, RED_PNG, "image/png");
    expectDefined(modifiedBuffer, "Should return modified buffer");

    const coverData = await readCoverArt(modifiedBuffer);
    expectDefined(coverData, "Should return cover art data");
    expect(coverData.length, "Cover art size should match").toStrictEqual(
      RED_PNG.length,
    );
    expect(coverData, "Cover art data should match").toStrictEqual(RED_PNG);

    const pictures = await readPictures(modifiedBuffer);
    pictures.push(TEST_PICTURES.backCover);

    const bufferWithTwo = await applyPictures(modifiedBuffer, pictures);

    const frontCover = await readCoverArt(bufferWithTwo);
    expect(
      frontCover,
      "Should return front cover when multiple pictures",
    ).toStrictEqual(RED_PNG);
  });

  it("picture functions", async () => {
    const testFile = TEST_FILES.mp3;

    const initialPics = await readPictures(testFile);
    expect(
      initialPics.length,
      "Should have no pictures initially",
    ).toStrictEqual(0);

    const pictures = [TEST_PICTURES.frontCover];

    const modifiedBuffer = await applyPictures(testFile, pictures);
    expectDefined(modifiedBuffer, "Should return modified buffer");

    const afterApply = await readPictures(modifiedBuffer);
    expect(
      afterApply.length,
      "Should have 1 picture after apply",
    ).toStrictEqual(1);
    expect(afterApply[0].description).toStrictEqual("Front cover");

    const bufferWithTwo = await addPicture(
      modifiedBuffer,
      TEST_PICTURES.backCover,
    );
    const afterAdd = await readPictures(bufferWithTwo);
    expect(afterAdd.length, "Should have 2 pictures after add").toStrictEqual(
      2,
    );

    const clearedBuffer = await clearPictures(bufferWithTwo);
    const afterClear = await readPictures(clearedBuffer);
    expect(
      afterClear.length,
      "Should have no pictures after clear",
    ).toStrictEqual(0);
  });

  it("findPictureByType", async () => {
    const pictures = [
      TEST_PICTURES.frontCover,
      TEST_PICTURES.backCover,
      {
        mimeType: "image/png",
        data: RED_PNG,
        type: "Artist" as PictureType,
        description: "Artist",
      },
    ];

    const frontCover = findPictureByType(pictures, "FrontCover");
    expectDefined(frontCover);
    expect(frontCover.description).toStrictEqual("Front cover");

    const backCover = findPictureByType(pictures, "BackCover");
    expectDefined(backCover);
    expect(backCover.description).toStrictEqual("Back cover");

    const notFound = findPictureByType(pictures, "BandLogo");
    expect(
      notFound,
      "Should return undefined when type not found",
    ).toStrictEqual(undefined);
  });

  it("replacePictureByType", async () => {
    const testFile = TEST_FILES.flac;

    const initialPictures = [TEST_PICTURES.frontCover, TEST_PICTURES.backCover];

    const bufferWithPics = await applyPictures(testFile, initialPictures);

    const newFrontCover = {
      mimeType: "image/jpeg",
      data: BLUE_JPEG,
      type: "FrontCover" as PictureType,
      description: "New front",
    };

    const modifiedBuffer = await replacePictureByType(
      bufferWithPics,
      newFrontCover,
    );

    const pictures = await readPictures(modifiedBuffer);
    expect(pictures.length, "Should still have 2 pictures").toStrictEqual(2);

    const frontCover = findPictureByType(pictures, "FrontCover");
    expectDefined(frontCover);
    expect(frontCover.description).toStrictEqual("New front");
    expect(frontCover.data).toStrictEqual(BLUE_JPEG);

    const backCover = findPictureByType(pictures, "BackCover");
    expectDefined(backCover);
    expect(
      backCover.description,
      "Back cover should be unchanged",
    ).toStrictEqual("Back cover");
  });

  it("readPictureMetadata", async () => {
    const testFile = TEST_FILES.flac;

    const pictures = [
      TEST_PICTURES.frontCover,
      {
        mimeType: "image/jpeg",
        data: BLUE_JPEG,
        type: "Artist" as PictureType,
        description: "Band photo",
      },
    ];

    const bufferWithPics = await applyPictures(testFile, pictures);

    const metadata = await readPictureMetadata(bufferWithPics);
    expect(metadata.length).toStrictEqual(2);

    expect(metadata[0].type).toStrictEqual("FrontCover");
    expect(metadata[0].mimeType).toStrictEqual("image/png");
    expect(metadata[0].description).toStrictEqual("Front cover");
    expect(metadata[0].size).toStrictEqual(RED_PNG.length);

    expect(metadata[1].type).toStrictEqual("Artist");
    expect(metadata[1].mimeType).toStrictEqual("image/jpeg");
    expect(metadata[1].description).toStrictEqual("Band photo");
    expect(metadata[1].size).toStrictEqual(BLUE_JPEG.length);
  });
});

describe("File Utils", () => {
  it("exportCoverArt and importCoverArt", async () => {
    const { red: redPath, tempDir } = await createTestImages();

    try {
      const testFile = TEST_FILES.mp3;
      const tempAudioPath = `${tempDir}/test.mp3`;

      const audioData = await readFileData(testFile);
      await writeFile(tempAudioPath, audioData);

      await importCoverArt(tempAudioPath, redPath);

      const exportPath = `${tempDir}/exported-cover.png`;
      await exportCoverArt(tempAudioPath, exportPath);

      const exportedData = new Uint8Array(await readFile(exportPath));
      expect(exportedData.length).toStrictEqual(RED_PNG.length);
      expect(exportedData).toStrictEqual(RED_PNG);
    } finally {
      await cleanupTestImages(tempDir);
    }
  });

  it("exportAllPictures", async () => {
    const { tempDir } = await createTestImages();

    try {
      const testFile = TEST_FILES.flac;
      const outputDir = `${tempDir}/artwork/`;
      await mkdir(outputDir);

      const pictures = [TEST_PICTURES.frontCover, TEST_PICTURES.backCover];

      const bufferWithPics = await applyPictures(testFile, pictures);

      const tempFilePath = `${tempDir}/temp-with-pics.flac`;
      await writeFile(tempFilePath, bufferWithPics);

      const exported = await exportAllPictures(tempFilePath, outputDir);
      expect(exported.length).toStrictEqual(2);

      expect(exported[0].includes("front-cover")).toBeTruthy();
      expect(exported[1].includes("back-cover")).toBeTruthy();

      const file1 = new Uint8Array(await readFile(exported[0]));
      const file2 = new Uint8Array(await readFile(exported[1]));
      expect(file1.length).toStrictEqual(RED_PNG.length);
      expect(file2.length).toStrictEqual(BLUE_JPEG.length);

      const customExported = await exportAllPictures(tempFilePath, outputDir, {
        nameFormat: (pic, index) =>
          `custom-${index}.${pic.mimeType.split("/")[1]}`,
      });

      expect(customExported[0].includes("custom-0")).toBeTruthy();
      expect(customExported[1].includes("custom-1")).toBeTruthy();
    } finally {
      await cleanupTestImages(tempDir);
    }
  });

  it("copyCoverArt", async () => {
    const { tempDir } = await createTestImages();

    try {
      const sourceFile = TEST_FILES.mp3;
      const targetFile = TEST_FILES.flac;

      const tempSourcePath = `${tempDir}/source.mp3`;
      const tempTargetPath = `${tempDir}/target.flac`;

      await writeFile(tempSourcePath, await readFileData(sourceFile));
      await writeFile(tempTargetPath, await readFileData(targetFile));

      await importCoverArt(tempSourcePath, `${tempDir}/red.png`);

      await copyCoverArt(tempSourcePath, tempTargetPath);

      const targetCover = await readCoverArt(tempTargetPath);
      expectDefined(targetCover);
      expect(targetCover).toStrictEqual(RED_PNG);
    } finally {
      await cleanupTestImages(tempDir);
    }
  });

  it("loadPictureFromFile and savePictureToFile", async () => {
    const { red: redPath, tempDir } = await createTestImages();

    try {
      const picture = await loadPictureFromFile(redPath, "FrontCover", {
        description: "Test cover",
      });

      expect(picture.mimeType).toStrictEqual("image/png");
      expect(picture.type).toStrictEqual("FrontCover");
      expect(picture.description).toStrictEqual("Test cover");
      expect(picture.data).toStrictEqual(RED_PNG);

      const savePath = `${tempDir}/saved.png`;
      await savePictureToFile(picture, savePath);

      const savedData = new Uint8Array(await readFile(savePath));
      expect(savedData).toStrictEqual(RED_PNG);
    } finally {
      await cleanupTestImages(tempDir);
    }
  });
});

describe("Web Utils", () => {
  it("pictureToDataURL and dataURLToPicture", () => {
    const picture = TEST_PICTURES.frontCover;

    const dataURL = pictureToDataURL(picture);
    expect(dataURL.startsWith("data:image/png;base64,")).toBeTruthy();

    const converted = dataURLToPicture(dataURL, "BackCover", "Converted");
    expect(converted.mimeType).toStrictEqual("image/png");
    expect(converted.type).toStrictEqual("BackCover");
    expect(converted.description).toStrictEqual("Converted");
    expect(converted.data.length).toStrictEqual(RED_PNG.length);

    expect(converted.data).toStrictEqual(RED_PNG);
  });
});

// Regression/parity: taglib-1dr — setPictures (full replace) was only covered
// via the public API on Emscripten (this file) and at the WasiFileHandle level
// on WASI. Verify the public AudioFile.setPictures replaces and round-trips
// through save on BOTH backends.
describe("setPictures cross-backend parity (taglib-1dr)", () => {
  for (const backend of ["wasi", "emscripten"] as const) {
    it(`[${backend}] setPictures replaces and round-trips through save`, async () => {
      const tl = await TagLib.initialize({ forceWasmType: backend });
      const seed = await tl.open(await readFileData(TEST_FILES.flac));
      seed.setPictures([TEST_PICTURES.frontCover, TEST_PICTURES.backCover]);
      seed.save();
      const two = seed.getFileBuffer();
      seed.dispose();

      const a = await tl.open(two);
      const picsA = a.getPictures();
      a.dispose();

      // Replace the two pictures with a single one; the originals must be gone.
      const file = await tl.open(two);
      file.setPictures([TEST_PICTURES.backCover]);
      file.save();
      const one = file.getFileBuffer();
      file.dispose();

      const b = await tl.open(one);
      const picsB = b.getPictures();
      b.dispose();

      expect(
        {
          count2: picsA.length,
          types2: picsA.map((p) => p.type),
          frontData: picsA.find((p) => p.type === "FrontCover")?.data.length,
          backData: picsA.find((p) => p.type === "BackCover")?.data.length,
          count1: picsB.length,
          type1: picsB[0]?.type,
          data1: picsB[0]?.data.length,
        },
        `${backend}: setPictures must replace and round-trip through save`,
      ).toStrictEqual({
        count2: 2,
        types2: ["FrontCover", "BackCover"],
        frontData: RED_PNG.length,
        backData: BLUE_JPEG.length,
        count1: 1,
        type1: "BackCover",
        data1: BLUE_JPEG.length,
      });
    });
  }
});

// Regression/parity: taglib-cvr — an MP4 covr atom has no per-atom picture
// type, and TagLib's MP4::Tag::complexProperties("PICTURE") omits the
// "pictureType" key entirely. The Emscripten backend always reported covr as
// type 3 (FrontCover); the WASI backend encoded the missing key as 0 ("Other"),
// so a write(FrontCover) -> save -> reopen round-trip read back "Other".
// Both backends must agree: covr == album art == FrontCover.
describe("MP4 covr picture-type parity (taglib-cvr)", () => {
  for (const backend of ["wasi", "emscripten"] as const) {
    it(`[${backend}] single covr reads back as FrontCover after save+reopen`, async () => {
      const tl = await TagLib.initialize({ forceWasmType: backend });
      const seed = await tl.open(await readFileData(TEST_FILES.m4a));
      seed.setPictures([TEST_PICTURES.frontCover]);
      seed.save();
      const buffer = seed.getFileBuffer();
      seed.dispose();

      const file = await tl.open(buffer);
      const pics = file.getPictures();
      file.dispose();

      expect(
        {
          count: pics.length,
          type: pics[0]?.type,
          mimeType: pics[0]?.mimeType,
          dataLength: pics[0]?.data.length,
        },
        `${backend}: m4a covr must map to FrontCover on read`,
      ).toStrictEqual({
        count: 1,
        type: "FrontCover",
        mimeType: "image/png",
        dataLength: RED_PNG.length,
      });
    });

    it(`[${backend}] every covr in a multi-atom file reads as FrontCover`, async () => {
      const tl = await TagLib.initialize({ forceWasmType: backend });
      const seed = await tl.open(await readFileData(TEST_FILES.m4a));
      // MP4 has no picture type field: both atoms are covr, so both must read
      // back as FrontCover — no BackCover/Media representation exists in m4a.
      seed.setPictures([TEST_PICTURES.frontCover, TEST_PICTURES.backCover]);
      seed.save();
      const buffer = seed.getFileBuffer();
      seed.dispose();

      const file = await tl.open(buffer);
      const pics = file.getPictures();
      file.dispose();

      expect(
        {
          count: pics.length,
          types: pics.map((p) => p.type),
          dataLengths: pics.map((p) => p.data.length),
        },
        `${backend}: all m4a covr atoms must map to FrontCover on read`,
      ).toStrictEqual({
        count: 2,
        types: ["FrontCover", "FrontCover"],
        dataLengths: [RED_PNG.length, BLUE_JPEG.length],
      });
    });
  }
});
