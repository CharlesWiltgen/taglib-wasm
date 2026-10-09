/**
 * @fileoverview Tests for MessagePack integration
 *
 * Tests MessagePack encoding/decoding functionality for audio metadata,
 * performance comparisons, and integration with the C API data format.
 */

import { describe, expect, it } from "vite-plus/test";
import { expectDefined } from "./_assert-helpers.ts";
import {
  compareEncodingEfficiency,
  decodeAudioProperties,
  decodeMessagePackAuto,
  decodePicture,
  decodeTagData,
  encodeAudioProperties,
  encodePicture,
  encodeTagData,
  getMessagePackInfo,
  isValidMessagePack,
  MessagePackUtils,
} from "../src/msgpack/index.ts";
import type {
  AudioProperties,
  ExtendedTag,
  Picture,
  PictureType,
} from "../src/types.ts";

// Test data — raw msgpack codec layer uses single strings (not arrays)
const sampleTagData = {
  title: "Test Song",
  artist: "Test Artist",
  album: "Test Album",
  date: 2025,
  trackNumber: 5,
  genre: "Rock",
  albumArtist: "Various Artists",
  composer: "Test Composer",
} as unknown as ExtendedTag;

const sampleAudioProperties: AudioProperties = {
  duration: 180.5,
  bitrate: 320,
  sampleRate: 44100,
  channels: 2,
  bitsPerSample: 16,
  codec: "MP3",
  containerFormat: "MP3",
  isLossless: false,
};

const samplePicture: Picture = {
  mimeType: "image/jpeg",
  data: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]),
  type: "FrontCover" as PictureType, // Front cover
  description: "Album cover",
};

describe("MessagePack", () => {
  it("encodeTagData - encodes tag data to MessagePack", () => {
    const encoded = encodeTagData(sampleTagData);

    expect(encoded instanceof Uint8Array).toStrictEqual(true);
    expect(encoded.length > 0).toStrictEqual(true);
    expect(isValidMessagePack(encoded)).toStrictEqual(true);
  });

  it("decodeTagData - decodes MessagePack tag data", () => {
    const encoded = encodeTagData(sampleTagData);
    const decoded = decodeTagData(encoded) as Record<string, unknown>;
    const expected = sampleTagData as unknown as Record<string, unknown>;

    expect(decoded.title).toStrictEqual(expected.title);
    expect(decoded.artist).toStrictEqual(expected.artist);
    expect(decoded.album).toStrictEqual(expected.album);
    expect(decoded.date).toStrictEqual(expected.date);
    expect(decoded.trackNumber).toStrictEqual(expected.trackNumber);
  });

  it("encodeAudioProperties - encodes audio properties to MessagePack", () => {
    const encoded = encodeAudioProperties(sampleAudioProperties);

    expect(encoded instanceof Uint8Array).toStrictEqual(true);
    expect(encoded.length > 0).toStrictEqual(true);
    expect(isValidMessagePack(encoded)).toStrictEqual(true);
  });

  it("decodeAudioProperties - decodes MessagePack audio properties", () => {
    const encoded = encodeAudioProperties(sampleAudioProperties);
    const decoded = decodeAudioProperties(encoded);

    expect(decoded.duration).toStrictEqual(sampleAudioProperties.duration);
    expect(decoded.bitrate).toStrictEqual(sampleAudioProperties.bitrate);
    expect(decoded.sampleRate).toStrictEqual(sampleAudioProperties.sampleRate);
    expect(decoded.channels).toStrictEqual(sampleAudioProperties.channels);
    expect(decoded.codec).toStrictEqual(sampleAudioProperties.codec);
  });

  it("encodePicture - encodes picture data to MessagePack", () => {
    const encoded = encodePicture(samplePicture);

    expect(encoded instanceof Uint8Array).toStrictEqual(true);
    expect(encoded.length > 0).toStrictEqual(true);
    expect(isValidMessagePack(encoded)).toStrictEqual(true);
  });

  it("decodePicture - decodes MessagePack picture data", () => {
    const encoded = encodePicture(samplePicture);
    const decoded = decodePicture(encoded);

    expect(decoded.mimeType).toStrictEqual(samplePicture.mimeType);
    expect(decoded.type).toStrictEqual(samplePicture.type);
    expect(decoded.description).toStrictEqual(samplePicture.description);
    expect(decoded.data instanceof Uint8Array).toStrictEqual(true);
    expect(decoded.data.length).toStrictEqual(samplePicture.data.length);
  });

  it("decodeMessagePackAuto - automatically detects data type", () => {
    const encodedTag = encodeTagData(sampleTagData);
    const decodedTag = decodeMessagePackAuto(encodedTag);
    expect(typeof decodedTag).toStrictEqual("object");
    expect((decodedTag as ExtendedTag).title).toStrictEqual(
      sampleTagData.title,
    );

    const encodedAudio = encodeAudioProperties(sampleAudioProperties);
    const decodedAudio = decodeMessagePackAuto(encodedAudio);
    expect(typeof decodedAudio).toStrictEqual("object");
    expect((decodedAudio as AudioProperties).bitrate).toStrictEqual(
      sampleAudioProperties.bitrate,
    );
  });

  it("isValidMessagePack - validates MessagePack data", () => {
    const validData = encodeTagData(sampleTagData);
    expect(isValidMessagePack(validData)).toStrictEqual(true);

    const invalidData = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    expect(isValidMessagePack(invalidData)).toStrictEqual(false);

    const emptyData = new Uint8Array(0);
    expect(isValidMessagePack(emptyData)).toStrictEqual(false);
  });

  it("getMessagePackInfo - provides data information", () => {
    const encoded = encodeTagData(sampleTagData);
    const info = getMessagePackInfo(encoded);

    expect(info.isValid).toStrictEqual(true);
    expect(info.approximateSize).toStrictEqual(encoded.length);
    expect(info.type).toStrictEqual("map"); // Tag data is object/map
  });

  it("compareEncodingEfficiency - compares MessagePack vs JSON", () => {
    const comparison = compareEncodingEfficiency(sampleTagData);

    expect(comparison.messagePackSize > 0).toStrictEqual(true);
    expect(comparison.jsonSize > 0).toStrictEqual(true);
    expect(comparison.sizeReduction >= 0).toStrictEqual(true);
    expect(comparison.speedImprovement).toStrictEqual(10);
  });

  it("MessagePackUtils.decode - smart decode functionality", () => {
    const encodedTag = encodeTagData(sampleTagData);
    const decoded = MessagePackUtils.decode(encodedTag);

    expect(typeof decoded).toStrictEqual("object");
    expect((decoded as ExtendedTag).title).toStrictEqual(sampleTagData.title);
  });

  it("MessagePackUtils.safeDecodeTagData - safe decoding with error handling", () => {
    const validEncoded = encodeTagData(sampleTagData);
    const validDecoded = MessagePackUtils.safeDecodeTagData(validEncoded);
    expect(validDecoded?.title).toStrictEqual(sampleTagData.title);

    const invalidData = new Uint8Array([0x00, 0x01, 0x02]);
    const invalidDecoded = MessagePackUtils.safeDecodeTagData(invalidData);
    expect(invalidDecoded).toStrictEqual(null);
  });

  it("MessagePackUtils.getPerformanceComparison - performance metrics", () => {
    const metrics = MessagePackUtils.getPerformanceComparison(sampleTagData);

    expect(typeof metrics.messagePackSize).toStrictEqual("number");
    expect(typeof metrics.jsonSize).toStrictEqual("number");
    expect(typeof metrics.sizeReduction).toStrictEqual("number");
    expect(metrics.estimatedSpeedImprovement).toStrictEqual(10);
    expect(metrics.messagePackSize > 0).toStrictEqual(true);
    expect(metrics.jsonSize > 0).toStrictEqual(true);
  });

  it("MessagePackUtils.toJson - convert MessagePack to JSON", () => {
    const encoded = encodeTagData(sampleTagData);
    const jsonString = MessagePackUtils.toJson(encoded);

    expect(typeof jsonString).toStrictEqual("string");
    const parsed = JSON.parse(jsonString);
    expect(parsed.title).toStrictEqual(sampleTagData.title);
    expect(parsed.artist).toStrictEqual(sampleTagData.artist);
  });

  it("MessagePackUtils.fromJson - convert JSON to MessagePack", () => {
    const jsonString = JSON.stringify(sampleTagData);
    const encoded = MessagePackUtils.fromJson(jsonString);

    expect(encoded instanceof Uint8Array).toStrictEqual(true);
    expect(isValidMessagePack(encoded)).toStrictEqual(true);

    const decoded = decodeTagData(encoded);
    expect(decoded.title).toStrictEqual(sampleTagData.title);
  });

  it("MessagePackUtils.batchDecode - batch processing", () => {
    const encoded1 = encodeTagData(sampleTagData);
    const encoded2 = encodeAudioProperties(sampleAudioProperties);
    const invalidData = new Uint8Array([0x00, 0x01]);

    const results = MessagePackUtils.batchDecode([
      encoded1,
      encoded2,
      invalidData,
    ]);

    expect(results.length).toStrictEqual(3);
    expect(results[0].success).toStrictEqual(true);
    expect(results[1].success).toStrictEqual(true);
    expect(results[2].success).toStrictEqual(false);
    expectDefined(results[0].data);
    expectDefined(results[1].data);
    expectDefined(results[2].error);
  });

  it("MessagePackUtils.isTagLibCompatible - compatibility check", () => {
    expect(MessagePackUtils.isTagLibCompatible(sampleTagData)).toStrictEqual(
      true,
    );
    expect(
      MessagePackUtils.isTagLibCompatible(sampleAudioProperties),
    ).toStrictEqual(true);
    expect(MessagePackUtils.isTagLibCompatible(samplePicture)).toStrictEqual(
      true,
    );
    expect(
      MessagePackUtils.isTagLibCompatible({ random: "data" }),
    ).toStrictEqual(false);
    expect(MessagePackUtils.isTagLibCompatible("string")).toStrictEqual(false);
    expect(MessagePackUtils.isTagLibCompatible(null)).toStrictEqual(false);
  });

  it("round-trip - encode then decode preserves data", () => {
    const testCases = [sampleTagData, sampleAudioProperties, samplePicture];

    for (const testData of testCases) {
      const encoded = encodeTagData(testData as ExtendedTag);
      const decoded = decodeTagData(encoded);

      for (const [key, value] of Object.entries(testData)) {
        if (value !== undefined) {
          expect((decoded as any)[key]).toStrictEqual(value);
        }
      }
    }
  });

  it("handles special values", () => {
    const specialData = {
      title: "Test",
      date: 0, // Zero value
      trackNumber: undefined, // Undefined (should be omitted)
      comment: "", // Empty string (should be omitted)
      genre: null as any, // Null value
      albumArtist: "Valid Artist",
    } as unknown as ExtendedTag;

    const encoded = encodeTagData(specialData);
    const decoded = decodeTagData(encoded) as Record<string, unknown>;

    expect(decoded.title).toStrictEqual("Test");
    expect(decoded.date).toStrictEqual(0); // Zero should be preserved
    expect(decoded.albumArtist).toStrictEqual("Valid Artist");
    expect("trackNumber" in decoded).toStrictEqual(false); // Undefined should be omitted
    expect("comment" in decoded).toStrictEqual(false); // Empty string should be omitted
  });

  it("handles large binary data", () => {
    const largePicture: Picture = {
      ...samplePicture,
      data: new Uint8Array(1024 * 1024), // 1MB of data
    };

    for (let i = 0; i < largePicture.data.length; i++) {
      largePicture.data[i] = i % 256;
    }

    const encoded = encodePicture(largePicture);
    const decoded = decodePicture(encoded);

    expect(decoded.data.length).toStrictEqual(largePicture.data.length);
    expect(decoded.data[0]).toStrictEqual(0);
    expect(decoded.data[255]).toStrictEqual(255);
    expect(decoded.data[256]).toStrictEqual(0); // Pattern should repeat
  });

  it("performance comparison is reasonable", () => {
    const comparison = compareEncodingEfficiency(sampleTagData);

    expect(comparison.messagePackSize <= comparison.jsonSize).toStrictEqual(
      true,
    );
    expect(comparison.sizeReduction >= 0).toStrictEqual(true);
    expect(comparison.sizeReduction <= 90).toStrictEqual(true);
  });
});
