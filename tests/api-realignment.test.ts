/**
 * @fileoverview Tests for API realignment: renamed functions, edit(), fluent setters
 */

import { describe, expect, it } from "vite-plus/test";
import { expectDefined, expectRejects } from "./_assert-helpers.ts";
import { TagLib } from "../src/taglib.ts";
import { TEST_FILES, withTempFile } from "./test-utils.ts";
import { readFileData } from "../src/utils/file.ts";
import { setBufferMode } from "../src/simple/index.ts";
import type { PictureType } from "../src/types.ts";

// Force Emscripten backend for Simple API calls
setBufferMode(true);

describe("API Realignment", () => {
  describe("Renamed Simple API Functions", () => {
    it("readFormat detects audio formats", async () => {
      const { readFormat } = await import("../src/simple/index.ts");

      expect(await readFormat(TEST_FILES.mp3)).toStrictEqual("MP3");
      expect(await readFormat(TEST_FILES.flac)).toStrictEqual("FLAC");
      expect(await readFormat(TEST_FILES.ogg)).toStrictEqual("OGG");
    });

    it("readCoverArt reads primary cover art", async () => {
      const { readCoverArt, applyCoverArt } = await import(
        "../src/simple/index.ts"
      );
      const { RED_PNG } = await import("./test-utils.ts");

      const buffer = await readFileData(TEST_FILES.mp3);

      const noCover = await readCoverArt(buffer);
      expect(noCover).toStrictEqual(undefined);

      const withArt = await applyCoverArt(buffer, RED_PNG, "image/png");
      const cover = await readCoverArt(withArt);
      expectDefined(cover);
      expect(cover!.length).toStrictEqual(RED_PNG.length);
    });

    it("applyCoverArt sets primary cover art", async () => {
      const { applyCoverArt, readCoverArt } = await import(
        "../src/simple/index.ts"
      );
      const { RED_PNG } = await import("./test-utils.ts");

      const buffer = await readFileData(TEST_FILES.mp3);
      const result = await applyCoverArt(buffer, RED_PNG, "image/png");
      expect(result.length > buffer.length).toBeTruthy();

      const cover = await readCoverArt(result);
      expectDefined(cover);
    });

    it("readPictureMetadata returns metadata without data", async () => {
      const { readPictureMetadata, applyPictures } = await import(
        "../src/simple/index.ts"
      );
      const { RED_PNG } = await import("./test-utils.ts");

      const buffer = await readFileData(TEST_FILES.mp3);
      const withPic = await applyPictures(buffer, [
        {
          mimeType: "image/png",
          data: RED_PNG,
          type: "FrontCover" as PictureType,
          description: "Cover",
        },
      ]);

      const metadata = await readPictureMetadata(withPic);
      expect(metadata.length).toStrictEqual(1);
      expect(metadata[0].mimeType).toStrictEqual("image/png");
      expect(metadata[0].size).toStrictEqual(RED_PNG.length);
    });
  });

  describe("taglib.edit() - Callback-Scoped Write", () => {
    it("edit(buffer, fn) applies tags and returns modified Uint8Array", async () => {
      const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });
      const buffer = await readFileData(TEST_FILES.mp3);

      const result = await taglib.edit(buffer, (file) => {
        file.tag().setTitle("Edited Title").setArtist("Edited Artist");
      });

      // With overload signatures, result is typed as Uint8Array (not void | Uint8Array)
      const verifyFile = await taglib.open(result);
      const tags = verifyFile.tag();
      expect(tags.title).toStrictEqual("Edited Title");
      expect(tags.artist).toStrictEqual("Edited Artist");
      verifyFile.dispose();
    });

    it("edit(path, fn) writes to disk and returns void", async () => {
      const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });
      const sourceData = await readFileData(TEST_FILES.mp3);

      await withTempFile("test.mp3", sourceData, async (path) => {
        const result = await taglib.edit(path, (file) => {
          file.tag().setTitle("Disk Edit").setYear(2026);
        });

        expect(result, "Should return void for path input").toStrictEqual(
          undefined,
        );

        const verifyFile = await taglib.open(path);
        const tags = verifyFile.tag();
        expect(tags.title).toStrictEqual("Disk Edit");
        expect(tags.year).toStrictEqual(2026);
        verifyFile.dispose();
      });
    });

    it("edit() supports async callbacks", async () => {
      const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });
      const buffer = await readFileData(TEST_FILES.flac);

      const result = await taglib.edit(buffer, async (file) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        file.tag().setTitle("Async Edit");
      });

      const verifyFile = await taglib.open(result);
      expect(verifyFile.tag().title).toStrictEqual("Async Edit");
      verifyFile.dispose();
    });

    it("edit() disposes file even when callback throws", async () => {
      const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });
      const buffer = await readFileData(TEST_FILES.mp3);

      await expectRejects(
        () =>
          taglib.edit(buffer, () => {
            throw new Error("Callback error");
          }),
        Error,
        "Callback error",
      );

      // Should not leak — verify we can still open files
      const file = await taglib.open(buffer);
      expect(file.isValid()).toBeTruthy();
      file.dispose();
    });
  });

  describe("Fluent MutableTag Setters", () => {
    it("MutableTag setters return the tag for chaining", async () => {
      const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });
      const buffer = await readFileData(TEST_FILES.mp3);
      const file = await taglib.open(buffer);

      const tag = file.tag();
      const result = tag
        .setTitle("Fluent Title")
        .setArtist("Fluent Artist")
        .setAlbum("Fluent Album")
        .setYear(2026)
        .setTrack(7)
        .setGenre("Electronic")
        .setComment("Fluent comment");

      expect(result).toStrictEqual(tag);

      const updated = file.tag();
      expect(updated.title).toStrictEqual("Fluent Title");
      expect(updated.artist).toStrictEqual("Fluent Artist");
      expect(updated.album).toStrictEqual("Fluent Album");
      expect(updated.year).toStrictEqual(2026);
      expect(updated.track).toStrictEqual(7);
      expect(updated.genre).toStrictEqual("Electronic");
      expect(updated.comment).toStrictEqual("Fluent comment");

      file.dispose();
    });

    it("fluent setters work inside edit() callback", async () => {
      const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });
      const buffer = await readFileData(TEST_FILES.flac);

      const result = await taglib.edit(buffer, (file) => {
        file.tag()
          .setTitle("Chained in Edit")
          .setArtist("Chain Artist")
          .setYear(2026);
      });

      const verifyFile = await taglib.open(result);
      const tags = verifyFile.tag();
      expect(tags.title).toStrictEqual("Chained in Edit");
      expect(tags.artist).toStrictEqual("Chain Artist");
      expect(tags.year).toStrictEqual(2026);
      verifyFile.dispose();
    });
  });
});
