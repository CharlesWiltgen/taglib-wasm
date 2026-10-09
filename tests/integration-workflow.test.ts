/**
 * @fileoverview Integration workflow tests simulating real user scenarios.
 */

import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { expectDefined } from "./_assert-helpers.ts";
import {
  type BackendAdapter,
  extForFormat,
  forEachBackend,
  readFixture,
} from "./backend-adapter.ts";
import { type Format, FORMATS } from "./shared-fixtures.ts";

forEachBackend("Integration Workflows", (adapter: BackendAdapter) => {
  beforeAll(async () => {
    await adapter.init();
  });

  afterAll(async () => {
    await adapter.dispose();
  });

  it("library scan: read tags from all formats", async () => {
    const results: Record<string, string> = {};

    for (const format of FORMATS) {
      const buffer = await readFixture(format);
      const tags = await adapter.readTags(buffer, extForFormat(format));
      results[format] = tags.title;
    }

    expect(Object.keys(results).length).toStrictEqual(FORMATS.length);
    for (const format of FORMATS) {
      expect(results[format], `${format}: wrong title`).toStrictEqual("Kiss");
    }
  });

  it("tag editor: read → modify → save → verify", async () => {
    const buffer = await readFixture("mp3");

    // Read original
    const original = await adapter.readTags(buffer, "mp3");
    expect(original.title).toStrictEqual("Kiss");

    // Modify
    const modified = await adapter.writeTags(
      buffer,
      {
        title: "Modified Kiss",
        artist: "Modified Artist",
        year: 2026,
      },
      "mp3",
    );
    expectDefined(modified);

    // Verify persistence
    const readBack = await adapter.readTags(modified, "mp3");
    expect(readBack.title).toStrictEqual("Modified Kiss");
    expect(readBack.artist).toStrictEqual("Modified Artist");
    expect(readBack.year).toStrictEqual(2026);
  });

  it("batch processing: process all formats sequentially", async () => {
    const processed: string[] = [];

    for (const format of FORMATS) {
      const buffer = await readFixture(format);
      const tags = await adapter.readTags(buffer, extForFormat(format));
      const props = await adapter.readAudioProperties(
        buffer,
        extForFormat(format),
      );

      expectDefined(tags.title);
      expect(props.sampleRate).toBeGreaterThan(0);
      processed.push(format);
    }

    expect(processed.length).toStrictEqual(FORMATS.length);
  });

  it("format converter metadata: read from one format, write to another", async () => {
    // Read tags from MP3
    const mp3Buffer = await readFixture("mp3");
    const mp3Tags = await adapter.readTags(mp3Buffer, "mp3");

    // Write those tags to FLAC
    const flacBuffer = await readFixture("flac");
    const modified = await adapter.writeTags(
      flacBuffer,
      {
        title: mp3Tags.title,
        artist: mp3Tags.artist,
        album: mp3Tags.album,
      },
      "flac",
    );
    expectDefined(modified);

    // Verify the FLAC file has the MP3's metadata
    const flacTags = await adapter.readTags(modified, "flac");
    expect(flacTags.title).toStrictEqual(mp3Tags.title);
    expect(flacTags.artist).toStrictEqual(mp3Tags.artist);
    expect(flacTags.album).toStrictEqual(mp3Tags.album);
  });
});
