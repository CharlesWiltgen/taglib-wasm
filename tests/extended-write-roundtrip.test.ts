/**
 * @fileoverview Roundtrip tests for extended PropertyMap field writes via WASI.
 *
 * Verifies that albumArtist, composer, discNumber, bpm, MusicBrainz IDs,
 * ReplayGain, AcoustID, and other extended fields survive a write-read
 * roundtrip through the WASI C++ shim.
 *
 * NOTE: `readTagsViaPath` reads the RAW msgpack wire data, not the typed
 * `readTags()` API. Since taglib-qpl every text property crosses that wire as
 * the string TagLib holds — including the former FIELD_NUMERIC keys
 * (trackNumber, totalTracks, discNumber, totalDiscs, bpm) — so "03" and "3/12"
 * survive instead of collapsing to 3. Numeric narrowing happens above this
 * layer, in `mapPropertiesToExtendedTag`, so `readTags().bpm` is still 128 while
 * the wire says "128". Expectations here are therefore strings by design; the
 * typed surface is asserted in `property-raw-values.test.ts`.
 */

import { describe, expect, it } from "vite-plus/test";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadWasiHost } from "../src/runtime/wasi-host-loader.ts";
import {
  fileExists,
  readTagsViaPath,
  writeTagsWasi,
} from "./wasi-test-helpers.ts";
import { TEST_FILES_DIR_PATH } from "./shared-fixtures.ts";

const WASM_PATH = resolve(process.cwd(), "dist/wasi/taglib-wasi.wasm");
const HAS_WASM = fileExists(WASM_PATH);

async function roundtrip(
  srcFile: string,
  destFile: string,
  tags: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const tempDir = await mkdtemp(join(tmpdir(), "taglib-"));
  const srcPath = resolve(TEST_FILES_DIR_PATH, srcFile);
  const destPath = resolve(tempDir, destFile);
  await copyFile(srcPath, destPath);

  try {
    using wasi = await loadWasiHost({
      wasmPath: WASM_PATH,
      preopens: { "/tmp": tempDir },
    });
    writeTagsWasi(wasi, `/tmp/${destFile}`, tags);

    using wasi2 = await loadWasiHost({
      wasmPath: WASM_PATH,
      preopens: { "/tmp": tempDir },
    });
    return readTagsViaPath(wasi2, `/tmp/${destFile}`) as Record<
      string,
      unknown
    >;
  } finally {
    await rm(tempDir, { recursive: true }).catch(() => {});
  }
}

describe.skipIf(!HAS_WASM)("Extended PropertyMap Write Roundtrip", () => {
  it("should roundtrip albumArtist", async () => {
    const result = await roundtrip(
      "flac/kiss-snippet.flac",
      "test.flac",
      { albumArtist: "Various Artists" },
    );
    expect(result.albumArtist).toStrictEqual("Various Artists");
  });

  it("should roundtrip composer", async () => {
    const result = await roundtrip(
      "flac/kiss-snippet.flac",
      "test.flac",
      { composer: "Johann Sebastian Bach" },
    );
    expect(result.composer).toStrictEqual("Johann Sebastian Bach");
  });

  it("should roundtrip discNumber", async () => {
    const result = await roundtrip(
      "flac/kiss-snippet.flac",
      "test.flac",
      { discNumber: 2 },
    );
    expect(result.discNumber).toStrictEqual("2");
  });

  it("should roundtrip bpm", async () => {
    const result = await roundtrip(
      "flac/kiss-snippet.flac",
      "test.flac",
      { bpm: 128 },
    );
    expect(result.bpm).toStrictEqual("128");
  });

  it("should roundtrip all extended fields together", async () => {
    const tags = {
      title: "Extended Test",
      artist: "Test Artist",
      album: "Test Album",
      albumArtist: "Various Artists",
      composer: "Bach",
      discNumber: 3,
      bpm: 140,
    };

    const result = await roundtrip(
      "flac/kiss-snippet.flac",
      "test.flac",
      tags,
    );

    expect(result.title).toStrictEqual("Extended Test");
    expect(result.artist).toStrictEqual("Test Artist");
    expect(result.album).toStrictEqual("Test Album");
    expect(result.albumArtist).toStrictEqual("Various Artists");
    expect(result.composer).toStrictEqual("Bach");
    expect(result.discNumber).toStrictEqual("3");
    expect(result.bpm).toStrictEqual("140");
  });

  it("should roundtrip MusicBrainz track ID", async () => {
    const trackId = "f4c1359b-b187-4b9b-c0b0-d2cf735398a1";
    const result = await roundtrip(
      "flac/kiss-snippet.flac",
      "test.flac",
      { musicbrainzTrackId: trackId },
    );
    expect(result.musicbrainzTrackId).toStrictEqual(trackId);
  });

  it("should roundtrip MusicBrainz release ID", async () => {
    const releaseId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const result = await roundtrip(
      "flac/kiss-snippet.flac",
      "test.flac",
      { musicbrainzReleaseId: releaseId },
    );
    expect(result.musicbrainzReleaseId).toStrictEqual(releaseId);
  });

  it("should roundtrip MusicBrainz artist ID", async () => {
    const artistId = "deadbeef-cafe-babe-dead-beefcafebabe";
    const result = await roundtrip(
      "flac/kiss-snippet.flac",
      "test.flac",
      { musicbrainzArtistId: artistId },
    );
    expect(result.musicbrainzArtistId).toStrictEqual(artistId);
  });

  it("should roundtrip multiple MusicBrainz IDs together", async () => {
    const tags = {
      musicbrainzTrackId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      musicbrainzReleaseId: "11111111-2222-3333-4444-555555555555",
      musicbrainzArtistId: "66666666-7777-8888-9999-000000000000",
    };

    const result = await roundtrip(
      "flac/kiss-snippet.flac",
      "test.flac",
      tags,
    );

    expect(result.musicbrainzTrackId).toStrictEqual(tags.musicbrainzTrackId);
    expect(result.musicbrainzReleaseId).toStrictEqual(
      tags.musicbrainzReleaseId,
    );
    expect(result.musicbrainzArtistId).toStrictEqual(tags.musicbrainzArtistId);
  });

  for (
    const [format, file] of [
      ["MP3", "mp3/kiss-snippet.mp3"],
      ["FLAC", "flac/kiss-snippet.flac"],
      ["OGG", "ogg/kiss-snippet.ogg"],
      ["M4A", "mp4/kiss-snippet.m4a"],
    ] as const
  ) {
    it(`should roundtrip extended fields in ${format}`, async () => {
      const ext = file.split(".").pop()!;
      const tags = {
        albumArtist: "Cross-Format Artist",
        composer: "Cross-Format Composer",
        discNumber: 1,
        bpm: 96,
      };

      const result = await roundtrip(file, `test.${ext}`, tags);

      expect(result.albumArtist).toStrictEqual("Cross-Format Artist");
      expect(result.composer).toStrictEqual("Cross-Format Composer");
      expect(result.discNumber).toStrictEqual("1");
      expect(result.bpm).toStrictEqual("96");
    });
  }

  it("should roundtrip ReplayGain track gain", async () => {
    const result = await roundtrip(
      "flac/kiss-snippet.flac",
      "test.flac",
      { replayGainTrackGain: "-6.54 dB" },
    );
    expect(result.replayGainTrackGain).toStrictEqual("-6.54 dB");
  });

  it("should roundtrip ReplayGain album gain", async () => {
    const result = await roundtrip(
      "flac/kiss-snippet.flac",
      "test.flac",
      { replayGainAlbumGain: "-8.21 dB" },
    );
    expect(result.replayGainAlbumGain).toStrictEqual("-8.21 dB");
  });

  it("should roundtrip ReplayGain peak values", async () => {
    const tags = {
      replayGainTrackPeak: "0.988312",
      replayGainAlbumPeak: "1.000000",
    };
    const result = await roundtrip(
      "flac/kiss-snippet.flac",
      "test.flac",
      tags,
    );
    expect(result.replayGainTrackPeak).toStrictEqual(tags.replayGainTrackPeak);
    expect(result.replayGainAlbumPeak).toStrictEqual(tags.replayGainAlbumPeak);
  });

  it("should roundtrip AcoustID fields", async () => {
    const tags = {
      acoustidId: "abcdef12-3456-7890-abcd-ef1234567890",
    };
    const result = await roundtrip(
      "flac/kiss-snippet.flac",
      "test.flac",
      tags,
    );
    expect(result.acoustidId).toStrictEqual(tags.acoustidId);
  });

  it("should roundtrip MusicBrainz release group ID", async () => {
    const result = await roundtrip(
      "flac/kiss-snippet.flac",
      "test.flac",
      { musicbrainzReleaseGroupId: "12345678-abcd-ef01-2345-678901234567" },
    );
    expect(result.musicbrainzReleaseGroupId).toStrictEqual(
      "12345678-abcd-ef01-2345-678901234567",
    );
  });

  it("should roundtrip conductor", async () => {
    const result = await roundtrip(
      "flac/kiss-snippet.flac",
      "test.flac",
      { conductor: "Herbert von Karajan" },
    );
    expect(result.conductor).toStrictEqual("Herbert von Karajan");
  });

  it("should roundtrip copyright", async () => {
    const result = await roundtrip(
      "flac/kiss-snippet.flac",
      "test.flac",
      { copyright: "2025 Test Records" },
    );
    expect(result.copyright).toStrictEqual("2025 Test Records");
  });

  it("should roundtrip ISRC", async () => {
    const result = await roundtrip(
      "flac/kiss-snippet.flac",
      "test.flac",
      { isrc: "USRC17607839" },
    );
    expect(result.isrc).toStrictEqual("USRC17607839");
  });

  it("should roundtrip sort fields", async () => {
    const tags = {
      titleSort: "Song, The",
      artistSort: "Beatles, The",
      albumSort: "White Album, The",
    };
    const result = await roundtrip(
      "flac/kiss-snippet.flac",
      "test.flac",
      tags,
    );
    expect(result.titleSort).toStrictEqual(tags.titleSort);
    expect(result.artistSort).toStrictEqual(tags.artistSort);
    expect(result.albumSort).toStrictEqual(tags.albumSort);
  });

  it("should roundtrip totalTracks and totalDiscs", async () => {
    const result = await roundtrip(
      "flac/kiss-snippet.flac",
      "test.flac",
      { totalTracks: 12, totalDiscs: 2 },
    );
    expect(result.totalTracks).toStrictEqual("12");
    expect(result.totalDiscs).toStrictEqual("2");
  });

  for (
    const [format, file] of [
      ["MP3", "mp3/kiss-snippet.mp3"],
      ["FLAC", "flac/kiss-snippet.flac"],
      ["OGG", "ogg/kiss-snippet.ogg"],
      ["M4A", "mp4/kiss-snippet.m4a"],
    ] as const
  ) {
    it(`should roundtrip multi-value extended fields in ${format}`, async () => {
      const ext = file.split(".").pop()!;
      const tags = {
        albumArtist: ["Artist A", "Artist B"],
        composer: ["Bach", "Handel"],
        conductor: ["Karajan", "Bernstein"],
        lyricist: ["Lyricist A", "Lyricist B"],
      };

      const result = await roundtrip(file, `test.${ext}`, tags);

      expect(result.albumArtist).toStrictEqual(tags.albumArtist);
      expect(result.composer).toStrictEqual(tags.composer);
      expect(result.conductor).toStrictEqual(tags.conductor);
      expect(result.lyricist).toStrictEqual(tags.lyricist);
    });
  }

  it("should roundtrip all metadata fields together", async () => {
    const tags = {
      title: "Comprehensive Test",
      artist: "Test Artist",
      album: "Test Album",
      albumArtist: "Album Artist",
      composer: "Composer",
      conductor: "Conductor",
      copyright: "2025 Records",
      discNumber: 2,
      totalDiscs: 3,
      track: 5,
      totalTracks: 15,
      bpm: 120,
      isrc: "USRC17607839",
      titleSort: "Comprehensive Test, A",
      artistSort: "Artist, Test",
      albumSort: "Album, Test",
      replayGainTrackGain: "-5.00 dB",
      replayGainTrackPeak: "0.95",
      musicbrainzTrackId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      musicbrainzReleaseId: "11111111-2222-3333-4444-555555555555",
      musicbrainzArtistId: "66666666-7777-8888-9999-000000000000",
      musicbrainzReleaseGroupId: "77777777-8888-9999-aaaa-bbbbbbbbbbbb",
    };

    const result = await roundtrip(
      "flac/kiss-snippet.flac",
      "test.flac",
      tags,
    );

    expect(result.title).toStrictEqual(tags.title);
    expect(result.artist).toStrictEqual(tags.artist);
    expect(result.album).toStrictEqual(tags.album);
    expect(result.albumArtist).toStrictEqual(tags.albumArtist);
    expect(result.composer).toStrictEqual(tags.composer);
    expect(result.conductor).toStrictEqual(tags.conductor);
    expect(result.copyright).toStrictEqual(tags.copyright);
    expect(result.discNumber).toStrictEqual(String(tags.discNumber));
    expect(result.totalDiscs).toStrictEqual(String(tags.totalDiscs));
    expect(result.track).toStrictEqual(tags.track);
    expect(result.totalTracks).toStrictEqual(String(tags.totalTracks));
    expect(result.bpm).toStrictEqual(String(tags.bpm));
    expect(result.isrc).toStrictEqual(tags.isrc);
    expect(result.titleSort).toStrictEqual(tags.titleSort);
    expect(result.artistSort).toStrictEqual(tags.artistSort);
    expect(result.albumSort).toStrictEqual(tags.albumSort);
    expect(result.replayGainTrackGain).toStrictEqual(tags.replayGainTrackGain);
    expect(result.replayGainTrackPeak).toStrictEqual(tags.replayGainTrackPeak);
    expect(result.musicbrainzTrackId).toStrictEqual(tags.musicbrainzTrackId);
    expect(result.musicbrainzReleaseId).toStrictEqual(
      tags.musicbrainzReleaseId,
    );
    expect(result.musicbrainzArtistId).toStrictEqual(tags.musicbrainzArtistId);
    expect(result.musicbrainzReleaseGroupId).toStrictEqual(
      tags.musicbrainzReleaseGroupId,
    );
  });
});
