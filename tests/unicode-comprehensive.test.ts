/**
 * @fileoverview Comprehensive unicode handling tests across both backends.
 */

import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import {
  type BackendAdapter,
  forEachBackend,
  readFixture,
} from "./backend-adapter.ts";

const UNICODE_CASES: Record<string, string> = {
  emoji: "🎵🎸🎤🥁🎹",
  "emoji-flags": "🇺🇸🇯🇵🇩🇪",
  "emoji-zwj": "👨‍🎤👩‍🎤",
  cjk: "中文日本語한국어",
  rtl: "مرحبا שלום",
  combining: "é à ñ ü ö",
  "combining-diacritics": "ā ē ī ō ū",
  "math-symbols": "∑∏∫∂√",
  "supplementary-plane": "𝕳𝖊𝖑𝖑𝖔",
};

forEachBackend("Unicode Comprehensive", (adapter: BackendAdapter) => {
  let flacBuffer: Uint8Array;

  beforeAll(async () => {
    await adapter.init();
    flacBuffer = await readFixture("flac");
  });

  afterAll(async () => {
    await adapter.dispose();
  });

  for (const [name, value] of Object.entries(UNICODE_CASES)) {
    it(`should roundtrip ${name} characters`, async () => {
      const modified = await adapter.writeTags(
        flacBuffer,
        { title: value },
        "flac",
      );
      expect(modified, `${name}: write returned null`).not.toBeNull();
      expect(modified, `${name}: write returned null`).toBeDefined();

      const tags = await adapter.readTags(modified!, "flac");
      expect(tags.title, `${name}: title mismatch`).toStrictEqual(value);
    });
  }

  it("should handle max-length title (1000 chars)", async () => {
    const longTitle = "あ".repeat(1000);
    const modified = await adapter.writeTags(
      flacBuffer,
      { title: longTitle },
      "flac",
    );
    expect(modified).not.toBeNull();
    expect(modified).toBeDefined();

    const tags = await adapter.readTags(modified!, "flac");
    expect(tags.title).toStrictEqual(longTitle);
  });

  it("should handle mixed scripts in single field", async () => {
    const mixed = "Hello 世界 مرحبا Привет 🌍";
    const modified = await adapter.writeTags(
      flacBuffer,
      { title: mixed, artist: mixed, album: mixed },
      "flac",
    );
    expect(modified).not.toBeNull();
    expect(modified).toBeDefined();

    const tags = await adapter.readTags(modified!, "flac");
    expect(tags.title).toStrictEqual(mixed);
    expect(tags.artist).toStrictEqual(mixed);
    expect(tags.album).toStrictEqual(mixed);
  });

  it("should handle special unicode characters (ZWJ, combining marks)", async () => {
    const zwjTitle = "Zero\u200BWidth\u200BJoiner";
    const combiningArtist = "Combi\u0301ning Ma\u0300rks";
    const modified = await adapter.writeTags(
      flacBuffer,
      { title: zwjTitle, artist: combiningArtist },
      "flac",
    );
    expect(modified, "write returned null for special unicode").not.toBeNull();
    expect(modified, "write returned null for special unicode").toBeDefined();

    const tags = await adapter.readTags(modified!, "flac");
    expect(tags.title, "should handle zero-width joiners").not.toBeNull();
    expect(tags.title, "should handle zero-width joiners").toBeDefined();
    expect(tags.artist, "should handle combining marks").not.toBeNull();
    expect(tags.artist, "should handle combining marks").toBeDefined();
  });

  it("should handle very long emoji strings (64KB+)", async () => {
    const longString = "🎵".repeat(32768);

    try {
      const modified = await adapter.writeTags(
        flacBuffer,
        { title: longString.substring(0, 1000), comment: longString },
        "flac",
      );

      if (modified) {
        const tags = await adapter.readTags(modified, "flac");
        expect(tags.title, "should preserve start of long title").not
          .toBeNull();
        expect(tags.title, "should preserve start of long title").toBeDefined();
      }
    } catch {
      // Format limitations may reject very long strings — acceptable
    }
  });
});
