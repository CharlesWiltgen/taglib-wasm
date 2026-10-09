/**
 * @fileoverview Parameterized basic tag tests across both backends.
 */

import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import {
  type BackendAdapter,
  extForFormat,
  forEachBackend,
  readFixture,
} from "./backend-adapter.ts";
import { EXPECTED_KISS_TAGS, type Format, FORMATS } from "./shared-fixtures.ts";

forEachBackend("Basic Tags", (adapter: BackendAdapter) => {
  beforeAll(async () => {
    await adapter.init();
  });

  afterAll(async () => {
    await adapter.dispose();
  });

  for (const format of FORMATS) {
    it(`should read tags from ${format}`, async () => {
      const buffer = await readFixture(format);
      const tags = await adapter.readTags(buffer, extForFormat(format));

      expect(tags.title, `${format}: title missing`).not.toBeNull();
      expect(tags.title, `${format}: title missing`).toBeDefined();
      // Per-format expectations: the fixtures are not uniform (see
      // EXPECTED_KISS_TAGS), so artist/album are asserted per format too
      // rather than decaying into an unused constant.
      expect(tags.title).toStrictEqual(EXPECTED_KISS_TAGS[format].title);
      expect(tags.artist).toStrictEqual(EXPECTED_KISS_TAGS[format].artist);
      expect(tags.album).toStrictEqual(EXPECTED_KISS_TAGS[format].album);
    });
  }

  for (const format of FORMATS) {
    it(`should write and read back tags (${format})`, async () => {
      const buffer = await readFixture(format);
      const newTags = {
        title: "Test Title",
        artist: "Test Artist",
        album: "Test Album",
      };

      const modified = await adapter.writeTags(
        buffer,
        newTags,
        extForFormat(format),
      );
      expect(modified, `${format}: writeTags returned null`).not.toBeNull();
      expect(modified, `${format}: writeTags returned null`).toBeDefined();

      const readBack = await adapter.readTags(
        modified!,
        extForFormat(format),
      );
      expect(readBack.title).toStrictEqual("Test Title");
      expect(readBack.artist).toStrictEqual("Test Artist");
      expect(readBack.album).toStrictEqual("Test Album");
    });
  }

  it("should overwrite existing tags with new values", async () => {
    const buffer = await readFixture("mp3");
    const modified = await adapter.writeTags(
      buffer,
      { title: "Replaced", artist: "New Artist", album: "New Album" },
      "mp3",
    );
    expect(modified).not.toBeNull();
    expect(modified).toBeDefined();

    const readBack = await adapter.readTags(modified!, "mp3");
    expect(readBack.title).toStrictEqual("Replaced");
    expect(readBack.artist).toStrictEqual("New Artist");
    expect(readBack.album).toStrictEqual("New Album");
  });

  it("should handle unicode tags", async () => {
    const buffer = await readFixture("flac");
    const unicodeTags = {
      title: "日本語タイトル",
      artist: "Артист",
      album: "专辑",
    };

    const modified = await adapter.writeTags(
      buffer,
      unicodeTags,
      "flac",
    );
    expect(modified).not.toBeNull();
    expect(modified).toBeDefined();

    const readBack = await adapter.readTags(modified!, "flac");
    expect(readBack.title).toStrictEqual(unicodeTags.title);
    expect(readBack.artist).toStrictEqual(unicodeTags.artist);
    expect(readBack.album).toStrictEqual(unicodeTags.album);
  });
});
