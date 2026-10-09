/**
 * @fileoverview Cross-backend parity tests.
 *
 * Verifies that WASI and Emscripten produce identical results for the
 * shared feature set. This is the most important validation file: if
 * parity tests pass, users can trust that switching backends is safe.
 */

import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { expectDefined } from "./_assert-helpers.ts";
import {
  EmscriptenBackendAdapter,
  extForFormat,
  HAS_EMSCRIPTEN,
  HAS_WASI,
  readFixture,
  WasiBackendAdapter,
} from "./backend-adapter.ts";
import { type Format, FORMATS } from "./shared-fixtures.ts";

// Missing artifacts are a legitimate skip on a fresh clone, but the GitHub
// workflows materialize both (see ci.yml and tests/backend-registration.test.ts):
// ignoring the parity suite there is how the WASI half went dark for months
// (taglib-qivb), so under GITHUB_ACTIONS it must run and fail loudly instead.
// Keyed on GITHUB_ACTIONS rather than CI because other CI systems (and agent
// harnesses) may set CI=true on a checkout without built artifacts.
const IN_CI = process.env.GITHUB_ACTIONS === "true";
const SKIP = (!HAS_WASI || !HAS_EMSCRIPTEN) && !IN_CI;

describe("Cross-Backend Parity", { skip: SKIP }, () => {
  const wasi = new WasiBackendAdapter();
  const emscripten = new EmscriptenBackendAdapter();

  beforeAll(async () => {
    await wasi.init();
    await emscripten.init();
  });

  afterAll(async () => {
    await wasi.dispose();
    await emscripten.dispose();
  });

  for (const format of FORMATS) {
    it(`should produce identical tags for ${format}`, async () => {
      const buffer = await readFixture(format);
      const ext = extForFormat(format);

      const wasiTags = await wasi.readTags(buffer, ext);
      const emTags = await emscripten.readTags(buffer, ext);

      expect(wasiTags.title, `${format}: title mismatch`).toStrictEqual(
        emTags.title,
      );
      expect(wasiTags.artist, `${format}: artist mismatch`).toStrictEqual(
        emTags.artist,
      );
      expect(wasiTags.album, `${format}: album mismatch`).toStrictEqual(
        emTags.album,
      );
      expect(wasiTags.year, `${format}: year mismatch`).toStrictEqual(
        emTags.year,
      );
      expect(wasiTags.track, `${format}: track mismatch`).toStrictEqual(
        emTags.track,
      );
    });

    it(`should produce matching properties for ${format}`, async () => {
      const buffer = await readFixture(format);
      const ext = extForFormat(format);

      const wasiProps = await wasi.readProperties(buffer, ext);
      const emProps = await emscripten.readProperties(buffer, ext);

      expectDefined(wasiProps["title"], `${format}: WASI should have title`);
      expectDefined(
        emProps["title"],
        `${format}: Emscripten should have title`,
      );
      expect(wasiProps["title"], `${format}: title mismatch`).toStrictEqual(
        emProps["title"],
      );
      expect(wasiProps["artist"], `${format}: artist mismatch`).toStrictEqual(
        emProps["artist"],
      );
    });

    it(`should produce matching format for ${format}`, async () => {
      const buffer = await readFixture(format);
      const ext = extForFormat(format);

      const wasiFormat = await wasi.readFormat(buffer, ext);
      const emFormat = await emscripten.readFormat(buffer, ext);

      expect(
        wasiFormat,
        `${format}: format mismatch (wasi=${wasiFormat}, em=${emFormat})`,
      ).toStrictEqual(emFormat);
    });

    it(`should produce matching audio properties for ${format}`, async () => {
      const buffer = await readFixture(format);
      const ext = extForFormat(format);

      const wasiProps = await wasi.readAudioProperties(buffer, ext);
      const emProps = await emscripten.readAudioProperties(buffer, ext);

      expect(
        wasiProps.sampleRate,
        `${format}: sampleRate mismatch`,
      ).toStrictEqual(emProps.sampleRate);
      expect(wasiProps.channels, `${format}: channels mismatch`).toStrictEqual(
        emProps.channels,
      );
      // Bitrate can differ slightly due to encoding differences
      const bitrateDiff = Math.abs(wasiProps.bitrate - emProps.bitrate);
      expect(
        bitrateDiff <= 10,
        `${format}: bitrate difference ${bitrateDiff} > 10 (wasi=${wasiProps.bitrate}, em=${emProps.bitrate})`,
      ).toStrictEqual(true);
      expect(wasiProps.duration, `${format}: duration mismatch`).toStrictEqual(
        emProps.duration,
      );
    });

    it(`should produce matching extended audio properties for ${format}`, async () => {
      const buffer = await readFixture(format);
      const ext = extForFormat(format);

      const wasiProps = await wasi.readExtendedAudioProperties(buffer, ext);
      const emProps = await emscripten.readExtendedAudioProperties(buffer, ext);

      expect(wasiProps.codec, `${format}: codec mismatch`).toStrictEqual(
        emProps.codec,
      );
      expect(
        wasiProps.containerFormat,
        `${format}: containerFormat mismatch`,
      ).toStrictEqual(emProps.containerFormat);
      expect(
        wasiProps.isLossless,
        `${format}: isLossless mismatch`,
      ).toStrictEqual(emProps.isLossless);
      expect(
        wasiProps.bitsPerSample,
        `${format}: bitsPerSample mismatch`,
      ).toStrictEqual(emProps.bitsPerSample);
    });

    it(`should produce matching picture count for ${format}`, async () => {
      const buffer = await readFixture(format);
      const ext = extForFormat(format);

      const wasiCount = await wasi.readPictureCount(buffer, ext);
      const emCount = await emscripten.readPictureCount(buffer, ext);

      expect(
        wasiCount,
        `${format}: picture count mismatch (wasi=${wasiCount}, em=${emCount})`,
      ).toStrictEqual(emCount);
    });

    it(`should produce matching rating count for ${format}`, async () => {
      const buffer = await readFixture(format);
      const ext = extForFormat(format);

      const wasiCount = await wasi.readRatingCount(buffer, ext);
      const emCount = await emscripten.readRatingCount(buffer, ext);

      expect(
        wasiCount,
        `${format}: rating count mismatch (wasi=${wasiCount}, em=${emCount})`,
      ).toStrictEqual(emCount);
    });

    it(`should read WASI-written tags with Emscripten (${format})`, async () => {
      const buffer = await readFixture(format);
      const ext = extForFormat(format);
      const writtenTags = {
        title: "WASI Wrote This",
        artist: "Cross Backend",
        album: "Interop Album",
      };

      const modified = await wasi.writeTags(buffer, writtenTags, ext);
      expectDefined(modified, `${format}: WASI writeTags returned null`);

      const readBack = await emscripten.readTags(modified, ext);
      expect(
        readBack.title,
        `${format}: Emscripten failed to read WASI-written title`,
      ).toStrictEqual(writtenTags.title);
      expect(
        readBack.artist,
        `${format}: Emscripten failed to read WASI-written artist`,
      ).toStrictEqual(writtenTags.artist);
      expect(
        readBack.album,
        `${format}: Emscripten failed to read WASI-written album`,
      ).toStrictEqual(writtenTags.album);
    });

    it(`should read Emscripten-written tags with WASI (${format})`, async () => {
      const buffer = await readFixture(format);
      const ext = extForFormat(format);
      const writtenTags = {
        title: "Emscripten Wrote This",
        artist: "Cross Backend",
        album: "Interop Album",
      };

      const modified = await emscripten.writeTags(buffer, writtenTags, ext);
      expectDefined(modified, `${format}: Emscripten writeTags returned null`);

      const readBack = await wasi.readTags(modified, ext);
      expect(
        readBack.title,
        `${format}: WASI failed to read Emscripten-written title`,
      ).toStrictEqual(writtenTags.title);
      expect(
        readBack.artist,
        `${format}: WASI failed to read Emscripten-written artist`,
      ).toStrictEqual(writtenTags.artist);
      expect(
        readBack.album,
        `${format}: WASI failed to read Emscripten-written album`,
      ).toStrictEqual(writtenTags.album);
    });
  }
});
