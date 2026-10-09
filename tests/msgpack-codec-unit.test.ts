import { describe, expect, it } from "vite-plus/test";
import { expectThrows } from "./_assert-helpers.ts";
import { encode } from "@msgpack/msgpack";
import {
  canEncodeToMessagePack,
  compareEncodingEfficiency,
  encodeAudioProperties,
  encodeBatchTagData,
  encodeFastTagData,
  encodeMessagePack,
  encodeMessagePackCompact,
  encodeMessagePackStream,
  encodePicture,
  encodePictureArray,
  encodePropertyMap,
  encodeTagData,
  estimateMessagePackSize,
} from "../src/msgpack/encoder.ts";
import {
  decodeAudioProperties,
  decodeFastTagData,
  decodeMessagePack,
  decodeMessagePackAuto,
  decodePicture,
  decodePictureArray,
  decodePropertyMap,
  decodeTagData,
  getMessagePackInfo,
  isValidMessagePack,
} from "../src/msgpack/decoder.ts";
import { MessagePackUtils } from "../src/msgpack/utils.ts";
import type {
  AudioProperties,
  ExtendedTag,
  Picture,
  PictureType,
} from "../src/types.ts";

describe("encodeTagData", () => {
  it("should encode basic tag fields to msgpack", () => {
    const tag = {
      title: "Test",
      artist: "Artist",
      year: 2025,
    } as unknown as ExtendedTag;
    const result = encodeTagData(tag);
    expect(result instanceof Uint8Array).toStrictEqual(true);
    expect(result.length > 0).toStrictEqual(true);
  });

  it("should strip undefined and empty string fields", () => {
    const tag = {
      title: "Title",
      artist: "",
      album: undefined,
    } as unknown as ExtendedTag;
    const encoded = encodeTagData(tag);
    const decoded = decodeTagData(encoded) as Record<string, unknown>;
    expect(decoded.title).toStrictEqual("Title");
    expect(decoded.artist).toStrictEqual(undefined);
    expect(decoded.album).toStrictEqual(undefined);
  });

  it("should preserve null values", () => {
    const tag = { title: "T", comment: null } as unknown as ExtendedTag;
    const encoded = encodeTagData(tag);
    const decoded = decodeTagData(encoded) as Record<string, unknown>;
    expect(decoded.comment).toStrictEqual(null);
  });

  it("should pass through pictures key without remapping", () => {
    const tag = {
      title: "T",
      pictures: [{ mimeType: "image/jpeg", data: new Uint8Array([1]) }],
    } as unknown as ExtendedTag;
    const encoded = encodeTagData(tag);
    const decoded = decodeTagData(encoded) as Record<string, unknown>;
    expect(decoded.title).toStrictEqual("T");
    expect(Array.isArray(decoded.pictures)).toStrictEqual(true);
  });
});

describe("decodeTagData", () => {
  it("should decode msgpack to tag data", () => {
    const tag = {
      title: "Song",
      artist: "Band",
      trackNumber: 3,
    } as unknown as ExtendedTag;
    const encoded = encodeTagData(tag);
    const decoded = decodeTagData(encoded) as Record<string, unknown>;
    expect(decoded.title).toStrictEqual("Song");
    expect(decoded.artist).toStrictEqual("Band");
    expect(decoded.trackNumber).toStrictEqual(3);
  });

  it("should throw on invalid data", () => {
    expectThrows(
      () => decodeTagData(new Uint8Array([0xff, 0xff, 0xff])),
      Error,
      "Failed to decode",
    );
  });
});

describe("encodeAudioProperties", () => {
  it("should encode audio properties", () => {
    const props: AudioProperties = {
      duration: 180,
      bitrate: 320,
      sampleRate: 44100,
      channels: 2,
      bitsPerSample: 16,
      codec: "MP3",
      containerFormat: "MP3",
      isLossless: false,
    };
    const encoded = encodeAudioProperties(props);
    const decoded = decodeAudioProperties(encoded);
    expect(decoded.duration).toStrictEqual(180);
    expect(decoded.bitrate).toStrictEqual(320);
    expect(decoded.sampleRate).toStrictEqual(44100);
    expect(decoded.channels).toStrictEqual(2);
  });
});

describe("decodeAudioProperties length migration", () => {
  it("should migrate length to duration when duration is absent", () => {
    const oldFormat = encode({
      length: 240,
      bitrate: 320,
      sampleRate: 44100,
      channels: 2,
    });
    const decoded = decodeAudioProperties(oldFormat);
    expect(decoded.duration).toStrictEqual(240);
    expect(
      (decoded as unknown as Record<string, unknown>).length,
    ).toStrictEqual(undefined);
  });

  it("should keep duration when both length and duration exist", () => {
    const bothPresent = encode({
      length: 100,
      duration: 200,
      bitrate: 320,
      sampleRate: 44100,
      channels: 2,
    });
    const decoded = decodeAudioProperties(bothPresent);
    expect(decoded.duration).toStrictEqual(200);
  });
});

describe("decodeAudioProperties", () => {
  it("should throw on invalid data", () => {
    expectThrows(
      () => decodeAudioProperties(new Uint8Array([0xff, 0xff])),
      Error,
      "Failed to decode",
    );
  });
});

describe("encodePropertyMap / decodePropertyMap", () => {
  it("should roundtrip property map", () => {
    const propMap = { TITLE: ["Test Song"], ARTIST: ["Band"] };
    const encoded = encodePropertyMap(propMap);
    const decoded = decodePropertyMap(encoded);
    expect(decoded.TITLE).toStrictEqual(["Test Song"]);
    expect(decoded.ARTIST).toStrictEqual(["Band"]);
  });

  it("should handle empty property map", () => {
    const encoded = encodePropertyMap({});
    const decoded = decodePropertyMap(encoded);
    expect(Object.keys(decoded).length).toStrictEqual(0);
  });

  it("should throw on invalid decode", () => {
    expectThrows(
      () => decodePropertyMap(new Uint8Array([0xff, 0xff])),
      Error,
      "Failed to decode",
    );
  });
});

describe("encodePicture / decodePicture", () => {
  it("should roundtrip picture data", () => {
    const pic: Picture = {
      mimeType: "image/jpeg",
      data: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
      type: "FrontCover" as PictureType,
      description: "Front Cover",
    };
    const encoded = encodePicture(pic);
    const decoded = decodePicture(encoded);
    expect(decoded.mimeType).toStrictEqual("image/jpeg");
    expect(decoded.type).toStrictEqual("FrontCover");
    expect(decoded.description).toStrictEqual("Front Cover");
    expect(new Uint8Array(decoded.data)).toStrictEqual(pic.data);
  });

  it("should throw on invalid decode", () => {
    expectThrows(
      () => decodePicture(new Uint8Array([0xff, 0xff])),
      Error,
      "Failed to decode",
    );
  });
});

describe("encodePictureArray / decodePictureArray", () => {
  it("should roundtrip picture array", () => {
    const pics: Picture[] = [
      {
        mimeType: "image/jpeg",
        data: new Uint8Array([1, 2]),
        type: "FrontCover" as PictureType,
      },
      {
        mimeType: "image/png",
        data: new Uint8Array([3, 4]),
        type: "BackCover" as PictureType,
      },
    ];
    const encoded = encodePictureArray(pics);
    const decoded = decodePictureArray(encoded);
    expect(decoded.length).toStrictEqual(2);
    expect(decoded[0].mimeType).toStrictEqual("image/jpeg");
    expect(decoded[1].mimeType).toStrictEqual("image/png");
  });

  it("should throw on invalid decode", () => {
    expectThrows(
      () => decodePictureArray(new Uint8Array([0xff, 0xff])),
      Error,
      "Failed to decode",
    );
  });
});

describe("encodeMessagePack / decodeMessagePack", () => {
  it("should roundtrip generic data", () => {
    const data = { key: "value", nested: { a: 1 } };
    const encoded = encodeMessagePack(data);
    const decoded = decodeMessagePack<typeof data>(encoded);
    expect(decoded.key).toStrictEqual("value");
    expect(decoded.nested.a).toStrictEqual(1);
  });

  it("should accept custom options", () => {
    const data = { x: 42 };
    const encoded = encodeMessagePack(data, { sortKeys: true });
    const decoded = decodeMessagePack<typeof data>(encoded, {});
    expect(decoded.x).toStrictEqual(42);
  });

  it("should preserve Date objects through cleanObject", () => {
    const now = new Date();
    const data = { timestamp: now, value: 42 };
    const encoded = encodeMessagePack(data);
    expect(encoded instanceof Uint8Array).toStrictEqual(true);
    expect(encoded.length > 0).toStrictEqual(true);
  });

  it("should throw on invalid decode", () => {
    expectThrows(
      () => decodeMessagePack(new Uint8Array([0xff, 0xff])),
      Error,
      "Failed to decode",
    );
  });
});

describe("encodeMessagePackCompact", () => {
  it("should encode to compact format", () => {
    const data = { title: "Song", bitrate: 320 };
    const compact = encodeMessagePackCompact(data);
    const normal = encodeMessagePack(data);
    expect(compact instanceof Uint8Array).toStrictEqual(true);
    // Compact should be similar size for small data
    expect(compact.length > 0).toStrictEqual(true);
    expect(normal.length > 0).toStrictEqual(true);
  });
});

describe("encodeBatchTagData", () => {
  it("should encode array of tags", () => {
    const tags = [
      { title: "Song 1", artist: "A" },
      { title: "Song 2", artist: "B" },
    ] as unknown as ExtendedTag[];
    const encoded = encodeBatchTagData(tags);
    expect(encoded instanceof Uint8Array).toStrictEqual(true);
    expect(encoded.length > 0).toStrictEqual(true);
  });
});

describe("encodeMessagePackStream", () => {
  it("should yield encoded chunks for each item", () => {
    const items = [{ a: 1 }, { b: 2 }, { c: 3 }];
    const chunks = [...encodeMessagePackStream(items)];
    expect(chunks.length).toStrictEqual(3);
    for (const chunk of chunks) {
      expect(chunk instanceof Uint8Array).toStrictEqual(true);
    }
  });

  it("should work with empty iterable", () => {
    const chunks = [...encodeMessagePackStream([])];
    expect(chunks.length).toStrictEqual(0);
  });
});

describe("estimateMessagePackSize", () => {
  it("should return size for valid data", () => {
    const data = { title: "Test Song", artist: "Band" };
    const size = estimateMessagePackSize(data);
    expect(typeof size).toStrictEqual("number");
    expect(size > 0).toStrictEqual(true);
  });

  it("should match actual encoded size", () => {
    const data = { x: 42, y: "hello" };
    const size = estimateMessagePackSize(data);
    const actual = encodeMessagePack(data);
    expect(size).toStrictEqual(actual.length);
  });
});

describe("encodeFastTagData / decodeFastTagData", () => {
  it("should roundtrip essential tag fields", () => {
    const tag = {
      title: "T",
      artist: "A",
      album: "Al",
      year: 2025,
      track: 1,
    } as unknown as Pick<
      ExtendedTag,
      "title" | "artist" | "album" | "year" | "track"
    >;
    const encoded = encodeFastTagData(tag);
    const decoded = decodeFastTagData(encoded) as Record<string, unknown>;
    expect(decoded.title).toStrictEqual("T");
    expect(decoded.artist).toStrictEqual("A");
    expect(decoded.album).toStrictEqual("Al");
    expect(decoded.year).toStrictEqual(2025);
    expect(decoded.track).toStrictEqual(1);
  });

  it("should throw on invalid decode", () => {
    expectThrows(
      () => decodeFastTagData(new Uint8Array([0xff, 0xff])),
      Error,
      "Failed to decode",
    );
  });
});

describe("canEncodeToMessagePack", () => {
  it("should return true for valid data", () => {
    expect(canEncodeToMessagePack({ a: 1 })).toStrictEqual(true);
    expect(canEncodeToMessagePack("hello")).toStrictEqual(true);
    expect(canEncodeToMessagePack(42)).toStrictEqual(true);
    expect(canEncodeToMessagePack([1, 2, 3])).toStrictEqual(true);
  });

  it("should return true for null and undefined", () => {
    expect(canEncodeToMessagePack(null)).toStrictEqual(true);
    expect(canEncodeToMessagePack(undefined)).toStrictEqual(true);
  });
});

describe("compareEncodingEfficiency", () => {
  it("should return size comparison metrics", () => {
    const data = { title: "Song", artist: "Band", year: 2025 };
    const result = compareEncodingEfficiency(data);
    expect(typeof result.messagePackSize).toStrictEqual("number");
    expect(typeof result.jsonSize).toStrictEqual("number");
    expect(typeof result.sizeReduction).toStrictEqual("number");
    expect(result.speedImprovement).toStrictEqual(10);
    expect(result.messagePackSize > 0).toStrictEqual(true);
    expect(result.jsonSize > 0).toStrictEqual(true);
    expect(result.sizeReduction >= 0).toStrictEqual(true);
  });
});

describe("decodeMessagePackAuto", () => {
  it("should detect audio properties", () => {
    const props: AudioProperties = {
      duration: 120,
      bitrate: 256,
      sampleRate: 48000,
      channels: 2,
      bitsPerSample: 16,
      codec: "MP3",
      containerFormat: "MP3",
      isLossless: false,
    };
    const encoded = encode(props);
    const decoded = decodeMessagePackAuto(encoded);
    expect((decoded as AudioProperties).bitrate).toStrictEqual(256);
  });

  it("should migrate length to duration in audio properties", () => {
    const oldProps = encode({
      length: 180,
      bitrate: 128,
      sampleRate: 44100,
      channels: 2,
    });
    const decoded = decodeMessagePackAuto(oldProps) as AudioProperties;
    expect(decoded.duration).toStrictEqual(180);
    expect(
      (decoded as unknown as Record<string, unknown>).length,
    ).toStrictEqual(undefined);
  });

  it("should detect picture data", () => {
    const pic = {
      mimeType: "image/jpeg",
      data: new Uint8Array([1, 2]),
      type: "FrontCover" as PictureType,
    };
    const encoded = encode(pic);
    const decoded = decodeMessagePackAuto(encoded);
    expect((decoded as Picture).mimeType).toStrictEqual("image/jpeg");
  });

  it("should detect tag-like data", () => {
    const tag = { title: "Test", artist: "Band" };
    const encoded = encode(tag);
    const decoded = decodeMessagePackAuto(encoded);
    expect((decoded as Record<string, unknown>).title).toStrictEqual("Test");
  });

  it("should detect property map", () => {
    const propMap = { TITLE: ["Test"], ARTIST: ["Band"] };
    const encoded = encode(propMap);
    const decoded = decodeMessagePackAuto(encoded);
    expect((decoded as Record<string, string[]>).TITLE).toStrictEqual(["Test"]);
  });

  it("should throw on non-object decoded data", () => {
    const encoded = encode(42);
    expectThrows(
      () => decodeMessagePackAuto(encoded),
      Error,
      "Unexpected non-object",
    );
  });

  it("should throw on invalid data", () => {
    expectThrows(
      () => decodeMessagePackAuto(new Uint8Array([0xff, 0xff])),
      Error,
      "Failed to decode",
    );
  });
});

describe("isValidMessagePack", () => {
  it("should return true for valid msgpack", () => {
    const encoded = encode({ a: 1 });
    expect(isValidMessagePack(encoded)).toStrictEqual(true);
  });

  it("should return false for invalid data", () => {
    expect(isValidMessagePack(new Uint8Array([0xff, 0xff]))).toStrictEqual(
      false,
    );
  });
});

describe("getMessagePackInfo", () => {
  it("should identify map type", () => {
    const encoded = encode({ key: "val" });
    const info = getMessagePackInfo(encoded);
    expect(info.isValid).toStrictEqual(true);
    expect(info.type).toStrictEqual("map");
  });

  it("should identify array type", () => {
    const encoded = encode([1, 2, 3]);
    const info = getMessagePackInfo(encoded);
    expect(info.isValid).toStrictEqual(true);
    expect(info.type).toStrictEqual("array");
  });

  it("should identify string type", () => {
    const encoded = encode("hello");
    const info = getMessagePackInfo(encoded);
    expect(info.isValid).toStrictEqual(true);
    expect(info.type).toStrictEqual("string");
  });

  it("should identify number type", () => {
    const encoded = encode(42);
    const info = getMessagePackInfo(encoded);
    expect(info.isValid).toStrictEqual(true);
    expect(info.type).toStrictEqual("number");
  });

  it("should identify boolean type", () => {
    const encoded = encode(true);
    const info = getMessagePackInfo(encoded);
    expect(info.isValid).toStrictEqual(true);
    expect(info.type).toStrictEqual("boolean");
  });

  it("should identify null type", () => {
    const encoded = encode(null);
    const info = getMessagePackInfo(encoded);
    expect(info.isValid).toStrictEqual(true);
    expect(info.type).toStrictEqual("null");
  });

  it("should identify binary type", () => {
    const encoded = encode(new Uint8Array([1, 2, 3]));
    const info = getMessagePackInfo(encoded);
    expect(info.isValid).toStrictEqual(true);
    expect(info.type).toStrictEqual("binary");
  });

  it("should return unknown for empty buffer", () => {
    const info = getMessagePackInfo(new Uint8Array(0));
    expect(info.isValid).toStrictEqual(false);
    expect(info.type).toStrictEqual("unknown");
  });

  it("should return invalid for bad data", () => {
    const info = getMessagePackInfo(new Uint8Array([0xff, 0xff]));
    expect(info.isValid).toStrictEqual(false);
  });
});

describe("MessagePackUtils.safeDecodeAudioProperties", () => {
  it("should decode valid audio properties", () => {
    const props: AudioProperties = {
      duration: 180,
      bitrate: 320,
      sampleRate: 44100,
      channels: 2,
      bitsPerSample: 16,
      codec: "MP3",
      containerFormat: "MP3",
      isLossless: false,
    };
    const encoded = encodeAudioProperties(props);
    const result = MessagePackUtils.safeDecodeAudioProperties(encoded);
    expect(result?.duration).toStrictEqual(180);
    expect(result?.bitrate).toStrictEqual(320);
    expect(result?.sampleRate).toStrictEqual(44100);
  });

  it("should return null for invalid msgpack", () => {
    expect(
      MessagePackUtils.safeDecodeAudioProperties(new Uint8Array([0xff, 0xff])),
    ).toStrictEqual(null);
  });

  it("should return null for empty buffer", () => {
    expect(
      MessagePackUtils.safeDecodeAudioProperties(new Uint8Array(0)),
    ).toStrictEqual(null);
  });
});

describe("MessagePackUtils.safeDecodePicture", () => {
  it("should decode valid picture data", () => {
    const pic: Picture = {
      mimeType: "image/jpeg",
      data: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
      type: "FrontCover" as PictureType,
      description: "Cover",
    };
    const encoded = encodePicture(pic);
    const result = MessagePackUtils.safeDecodePicture(encoded);
    expect(result?.mimeType).toStrictEqual("image/jpeg");
    expect(result?.type).toStrictEqual("FrontCover");
  });

  it("should return null for invalid msgpack", () => {
    expect(
      MessagePackUtils.safeDecodePicture(new Uint8Array([0xff, 0xff])),
    ).toStrictEqual(null);
  });

  it("should return null for empty buffer", () => {
    expect(MessagePackUtils.safeDecodePicture(new Uint8Array(0))).toStrictEqual(
      null,
    );
  });
});

describe("MessagePackUtils.getPerformanceComparison", () => {
  it("should return comparison metrics", () => {
    const tag = { title: "Song", artist: "Band" } as unknown as ExtendedTag;
    const result = MessagePackUtils.getPerformanceComparison(tag);
    expect(typeof result.messagePackSize).toStrictEqual("number");
    expect(typeof result.jsonSize).toStrictEqual("number");
    expect(typeof result.sizeReduction).toStrictEqual("number");
    expect(typeof result.estimatedSpeedImprovement).toStrictEqual("number");
    expect(result.messagePackSize > 0).toStrictEqual(true);
    expect(result.jsonSize > 0).toStrictEqual(true);
  });
});

describe("MessagePackUtils.toJson", () => {
  it("should convert valid msgpack to JSON string", () => {
    const tag = { title: "Test" } as unknown as ExtendedTag;
    const encoded = encodeTagData(tag);
    const json = MessagePackUtils.toJson(encoded);
    const parsed = JSON.parse(json);
    expect(parsed.title).toStrictEqual("Test");
  });

  it("should throw MetadataError for invalid msgpack", () => {
    const err = expectThrows(
      () => MessagePackUtils.toJson(new Uint8Array([0xff, 0xff])),
      Error,
    );
    expect(err.message).toContain("Failed to convert to JSON");
  });
});

describe("MessagePackUtils.fromJson", () => {
  it("should convert JSON string to msgpack", () => {
    const json = JSON.stringify({ title: "Hello" });
    const result = MessagePackUtils.fromJson(json);
    expect(result instanceof Uint8Array).toStrictEqual(true);
    const decoded = decodeTagData(result) as Record<string, unknown>;
    expect(decoded.title).toStrictEqual("Hello");
  });

  it("should throw MetadataError for invalid JSON", () => {
    const err = expectThrows(
      () => MessagePackUtils.fromJson("{bad json!!!"),
      Error,
    );
    expect(err.message).toContain("Failed to convert from JSON");
  });
});

describe("MessagePackUtils.batchDecode", () => {
  it("should decode multiple valid buffers", () => {
    const tag1 = encodeTagData({ title: "A" } as unknown as ExtendedTag);
    const tag2 = encodeTagData({ title: "B" } as unknown as ExtendedTag);
    const results = MessagePackUtils.batchDecode([tag1, tag2]);
    expect(results.length).toStrictEqual(2);
    expect(results[0].success).toStrictEqual(true);
    expect(results[1].success).toStrictEqual(true);
    expect((results[0].data as Record<string, unknown>).title).toStrictEqual(
      "A",
    );
  });

  it("should capture errors for invalid buffers", () => {
    const valid = encodeTagData({ title: "OK" } as unknown as ExtendedTag);
    const invalid = new Uint8Array([0xff, 0xff]);
    const results = MessagePackUtils.batchDecode([valid, invalid]);
    expect(results[0].success).toStrictEqual(true);
    expect(results[1].success).toStrictEqual(false);
    expect(typeof results[1].error).toStrictEqual("string");
  });

  it("should return empty array for empty input", () => {
    expect(MessagePackUtils.batchDecode([]).length).toStrictEqual(0);
  });
});

describe("MessagePackUtils.isTagLibCompatible", () => {
  it("should return true for tag-like objects", () => {
    expect(MessagePackUtils.isTagLibCompatible({ title: "X" })).toStrictEqual(
      true,
    );
    expect(MessagePackUtils.isTagLibCompatible({ artist: "Y" })).toStrictEqual(
      true,
    );
    expect(MessagePackUtils.isTagLibCompatible({ album: "Z" })).toStrictEqual(
      true,
    );
  });

  it("should return true for audio property objects", () => {
    expect(
      MessagePackUtils.isTagLibCompatible({ bitrate: 320, sampleRate: 44100 }),
    ).toStrictEqual(true);
  });

  it("should return true for picture objects", () => {
    expect(
      MessagePackUtils.isTagLibCompatible({
        mimeType: "image/jpeg",
        data: new Uint8Array(0),
      }),
    ).toStrictEqual(true);
  });

  it("should return false for non-objects", () => {
    expect(MessagePackUtils.isTagLibCompatible(null)).toStrictEqual(false);
    expect(MessagePackUtils.isTagLibCompatible(42)).toStrictEqual(false);
    expect(MessagePackUtils.isTagLibCompatible("string")).toStrictEqual(false);
  });

  it("should return false for unrecognized objects", () => {
    expect(MessagePackUtils.isTagLibCompatible({ foo: "bar" })).toStrictEqual(
      false,
    );
  });
});

describe("estimateMessagePackSize fallback", () => {
  it("should fall back to JSON estimation when msgpack encode fails", () => {
    // Symbol values cause msgpack encode to fail but JSON.stringify skips them
    const data = { val: Symbol("test") };
    const size = estimateMessagePackSize(data);
    // JSON.stringify({ val: Symbol("test") }) => "{}" (2 chars)
    // Math.floor(2 * 0.75) = 1
    expect(size).toStrictEqual(1);
  });
});
