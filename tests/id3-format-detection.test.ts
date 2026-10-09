/**
 * @fileoverview Regression tests for GitHub #21: FLAC detected as MP3.
 *
 * When reading from buffers, TagLib's FileRef content sniffing checks
 * MPEG::File::isSupported() first, which matches any stream starting
 * with an ID3v2 header — even non-MP3 formats like FLAC and TTA.
 *
 * The fix uses magic-byte detection to skip ID3v2 headers and identify
 * the actual audio format before constructing format-specific File objects.
 */

import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { type BackendAdapter, forEachBackend } from "./backend-adapter.ts";
import { FIXTURE_PATH } from "./shared-fixtures.ts";

forEachBackend(
  "ID3v2 Format Detection (GitHub #21)",
  (adapter: BackendAdapter) => {
    beforeAll(async () => {
      await adapter.init();
    });

    afterAll(async () => {
      await adapter.dispose();
    });

    it("should detect FLAC buffer as FLAC, not MP3", async () => {
      const buffer = new Uint8Array(await readFile(FIXTURE_PATH.flac));
      expect(
        buffer[0] === 0x66 && buffer[1] === 0x4C,
        "test fixture should start with fLaC magic",
      ).toStrictEqual( // "fL"
        true,
      );
      const format = await adapter.readFormat(buffer, "flac");
      expect(format).toStrictEqual("FLAC");
    });

    it("should detect ID3v2-prefixed TTA as TTA, not MP3", async () => {
      const buffer = new Uint8Array(await readFile(FIXTURE_PATH.tta));
      expect(
        buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33,
        "test fixture should start with ID3v2 header",
      ).toStrictEqual( // "ID3"
        true,
      );
      const format = await adapter.readFormat(buffer, "tta");
      expect(format, "TTA with ID3v2 prefix must not be detected as MP3").not
        .toStrictEqual("MP3");
      expect(format).toStrictEqual("TTA");
    });

    it("should detect synthetic ID3v2-prefixed FLAC as FLAC", async () => {
      const flac = new Uint8Array(await readFile(FIXTURE_PATH.flac));

      // Build a minimal ID3v2.3 header (10 bytes, no frames, size=0)
      const id3Header = new Uint8Array([
        0x49,
        0x44,
        0x33, // "ID3"
        0x03,
        0x00, // version 2.3, no flags
        0x00, // flags
        0x00,
        0x00,
        0x00,
        0x00, // syncsafe size = 0
      ]);

      const prefixed = new Uint8Array(id3Header.length + flac.length);
      prefixed.set(id3Header);
      prefixed.set(flac, id3Header.length);

      const format = await adapter.readFormat(prefixed, "flac");
      expect(format, "FLAC with ID3v2 prefix must be detected as FLAC")
        .toStrictEqual("FLAC");
    });

    it("should still detect plain MP3 as MP3", async () => {
      const buffer = new Uint8Array(await readFile(FIXTURE_PATH.mp3));
      const format = await adapter.readFormat(buffer, "mp3");
      expect(format).toStrictEqual("MP3");
    });
  },
);
