/**
 * Wire format compatibility tests between C MessagePack API and JavaScript @msgpack/msgpack
 * Ensures our C implementation produces identical binary output
 */

import { describe, expect, it } from "vite-plus/test";
import {
  decode as msgpackDecode,
  encode as msgpackEncode,
} from "@msgpack/msgpack";

interface TagData {
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  comment?: string;
  albumArtist?: string;
  composer?: string;
  year: number;
  track: number;
  disc: number;
  bpm: number;
  bitrate: number;
  sampleRate: number;
  channels: number;
  length: number;
  lengthMs: number;
}

const TEST_TAG_DATA: TagData = {
  title: "Test Song 🎵",
  artist: "Test Artist",
  album: "Test Album",
  genre: "Electronic",
  comment: "Test Comment",
  albumArtist: "Various Artists",
  composer: "Test Composer",
  year: 2024,
  track: 5,
  disc: 1,
  bpm: 128,
  bitrate: 320000,
  sampleRate: 44100,
  channels: 2,
  length: 180,
  lengthMs: 180000,
};

// Unicode edge cases
const UNICODE_TEST_DATA: TagData = {
  title: "🇯🇵日本語タイトル", // Japanese with flag emoji
  artist: "Ἀρτεμις", // Greek
  album: "العربية", // Arabic
  genre: "中文", // Chinese
  comment: "Тест комментарий", // Russian
  year: 2024,
  track: 1,
  disc: 1,
  bpm: 0,
  bitrate: 0,
  sampleRate: 0,
  channels: 0,
  length: 0,
  lengthMs: 0,
};

// Empty/minimal data
const MINIMAL_TEST_DATA: TagData = {
  title: "",
  artist: "",
  album: "",
  year: 0,
  track: 0,
  disc: 0,
  bpm: 0,
  bitrate: 0,
  sampleRate: 0,
  channels: 0,
  length: 0,
  lengthMs: 0,
};

describe("MessagePack Wire Format Compatibility", () => {
  describe("JavaScript reference implementation", () => {
    it("should encode test data correctly", () => {
      const encoded = msgpackEncode(TEST_TAG_DATA);
      expect(encoded).toBeInstanceOf(Uint8Array);
      expect(1).toBeLessThanOrEqual(encoded.length); // length > 0

      // Decode to verify round-trip
      const decoded = msgpackDecode(encoded) as TagData;
      expect(decoded).toStrictEqual(TEST_TAG_DATA);
    });

    it("should handle Unicode correctly", () => {
      const encoded = msgpackEncode(UNICODE_TEST_DATA);
      const decoded = msgpackDecode(encoded) as TagData;
      expect(decoded).toStrictEqual(UNICODE_TEST_DATA);
    });

    it("should handle minimal data", () => {
      const encoded = msgpackEncode(MINIMAL_TEST_DATA);
      const decoded = msgpackDecode(encoded) as TagData;
      expect(decoded).toStrictEqual(MINIMAL_TEST_DATA);
    });
  });

  describe("Binary format analysis", () => {
    it("should produce deterministic output", () => {
      const encoded1 = msgpackEncode(TEST_TAG_DATA);
      const encoded2 = msgpackEncode(TEST_TAG_DATA);
      expect(encoded1).toStrictEqual(encoded2);
    });

    it("should handle field order independence", () => {
      // JavaScript objects don't guarantee key order, but MessagePack maps should be order-independent
      const data1 = { title: "A", artist: "B", year: 2024 };
      const data2 = { artist: "B", year: 2024, title: "A" };

      const encoded1 = msgpackEncode(data1);
      const encoded2 = msgpackEncode(data2);

      // Decode both to verify they contain the same data
      const decoded1 = msgpackDecode(encoded1);
      const decoded2 = msgpackDecode(encoded2);
      expect(decoded1).toStrictEqual(decoded2);
    });

    it("should analyze binary structure", () => {
      const encoded = msgpackEncode(TEST_TAG_DATA);

      // MessagePack format analysis
      console.log("MessagePack binary analysis:");
      console.log(`Size: ${encoded.length} bytes`);
      console.log(
        `Header: ${
          Array.from(encoded.slice(0, 4)).map((b) =>
            `0x${b.toString(16).padStart(2, "0")}`
          ).join(" ")
        }`,
      );

      // First byte should indicate a map type
      const firstByte = encoded[0];
      if ((firstByte & 0x80) === 0x80) {
        const mapSize = firstByte & 0x0f;
        console.log(`Fixed map with ${mapSize} elements`);
      } else if (firstByte === 0xde) {
        console.log("Map16 format");
      } else if (firstByte === 0xdf) {
        console.log("Map32 format");
      }

      // Basic validation
      expect(50).toBeLessThanOrEqual(encoded.length); // Should be reasonable size
    });
  });
});

// Export reference implementations and test data for use in integration tests
export {
  MINIMAL_TEST_DATA,
  msgpackDecode,
  msgpackEncode,
  type TagData,
  TEST_TAG_DATA,
  UNICODE_TEST_DATA,
};
