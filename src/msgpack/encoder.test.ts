import { describe, expect, it } from "vite-plus/test";
import { expectThrows } from "../../tests/_assert-helpers.ts";
import { decode } from "@msgpack/msgpack";
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
} from "./encoder.ts";
import type { ExtendedTag, Picture } from "../types.ts";

describe("encodeTagData key transformation", () => {
  it("should encode acoustidFingerprint as ACOUSTID_FINGERPRINT", () => {
    const tag = { acoustidFingerprint: "AQADtNQYhYkYRcg" } as Record<
      string,
      unknown
    >;
    const encoded = decode(
      encodeTagData(tag as unknown as ExtendedTag),
    ) as Record<string, unknown>;
    expect(encoded["ACOUSTID_FINGERPRINT"]).toStrictEqual("AQADtNQYhYkYRcg");
    expect("acoustidFingerprint" in encoded).toStrictEqual(false);
  });

  it("should encode discNumber as DISCNUMBER", () => {
    const tag = { discNumber: 2 } as Record<string, unknown>;
    const encoded = decode(
      encodeTagData(tag as unknown as ExtendedTag),
    ) as Record<string, unknown>;
    expect(encoded["DISCNUMBER"]).toStrictEqual(2);
    expect("discNumber" in encoded).toStrictEqual(false);
  });

  it("should encode basic fields to UPPERCASE", () => {
    const tag = {
      title: "Test",
      artist: "Artist",
      album: "Album",
      year: 2025,
      track: 3,
    } as Record<string, unknown>;
    const encoded = decode(
      encodeTagData(tag as unknown as ExtendedTag),
    ) as Record<string, unknown>;
    expect(encoded["TITLE"]).toStrictEqual("Test");
    expect(encoded["ARTIST"]).toStrictEqual("Artist");
    expect(encoded["ALBUM"]).toStrictEqual("Album");
    expect(encoded["DATE"]).toStrictEqual(2025);
    expect(encoded["TRACKNUMBER"]).toStrictEqual(3);
  });

  it("should preserve pictures and ratings keys as-is", () => {
    const tag = {
      title: "Test",
      pictures: [
        {
          mimeType: "image/jpeg",
          data: new Uint8Array([1, 2, 3]),
          type: 3,
        },
      ],
      ratings: [{ rating: 0.8, email: "", counter: 0 }],
    } as Record<string, unknown>;
    const encoded = decode(
      encodeTagData(tag as unknown as ExtendedTag),
    ) as Record<string, unknown>;
    expect("pictures" in encoded).toStrictEqual(true);
    expect("ratings" in encoded).toStrictEqual(true);
  });

  it("should encode MusicBrainz fields to UPPERCASE", () => {
    const tag = {
      musicbrainzTrackId: "abc-123",
      musicbrainzReleaseId: "def-456",
    } as Record<string, unknown>;
    const encoded = decode(
      encodeTagData(tag as unknown as ExtendedTag),
    ) as Record<string, unknown>;
    expect(encoded["MUSICBRAINZ_TRACKID"]).toStrictEqual("abc-123");
    expect(encoded["MUSICBRAINZ_ALBUMID"]).toStrictEqual("def-456");
  });

  it("should encode ReplayGain fields to UPPERCASE", () => {
    const tag = {
      replayGainTrackGain: "-6.54 dB",
      replayGainTrackPeak: "0.98765",
    } as Record<string, unknown>;
    const encoded = decode(
      encodeTagData(tag as unknown as ExtendedTag),
    ) as Record<string, unknown>;
    expect(encoded["REPLAYGAIN_TRACK_GAIN"]).toStrictEqual("-6.54 dB");
    expect(encoded["REPLAYGAIN_TRACK_PEAK"]).toStrictEqual("0.98765");
  });

  it("should encode sort fields to UPPERCASE", () => {
    const tag = {
      titleSort: "Title, The",
      artistSort: "Beatles, The",
      albumSort: "Abbey Road",
    } as Record<string, unknown>;
    const encoded = decode(
      encodeTagData(tag as unknown as ExtendedTag),
    ) as Record<string, unknown>;
    expect(encoded["TITLESORT"]).toStrictEqual("Title, The");
    expect(encoded["ARTISTSORT"]).toStrictEqual("Beatles, The");
    expect(encoded["ALBUMSORT"]).toStrictEqual("Abbey Road");
  });

  it("should pass through unknown keys as-is", () => {
    const tag = { title: "Test", CUSTOM_FIELD: "value" } as Record<
      string,
      unknown
    >;
    const encoded = decode(
      encodeTagData(tag as unknown as ExtendedTag),
    ) as Record<string, unknown>;
    expect(encoded["CUSTOM_FIELD"]).toStrictEqual("value");
  });

  it("should omit empty string values via cleanObject", () => {
    const tag = { title: "Keep", artist: "", album: "Also Keep" } as Record<
      string,
      unknown
    >;
    const encoded = decode(
      encodeTagData(tag as unknown as ExtendedTag),
    ) as Record<string, unknown>;
    expect(encoded["TITLE"]).toStrictEqual("Keep");
    expect(encoded["ALBUM"]).toStrictEqual("Also Keep");
    expect("ARTIST" in encoded).toStrictEqual(false);
  });

  it("should preserve null values in cleanObject", () => {
    const tag = { title: "Keep", artist: null } as Record<string, unknown>;
    const encoded = decode(
      encodeTagData(tag as unknown as ExtendedTag),
    ) as Record<string, unknown>;
    expect(encoded["TITLE"]).toStrictEqual("Keep");
    expect(encoded["ARTIST"]).toStrictEqual(null);
  });

  it("should handle nested objects in cleanObject", () => {
    const tag = {
      title: "Test",
      nested: { inner: "value", empty: "", gone: undefined },
    } as Record<string, unknown>;
    const encoded = decode(
      encodeTagData(tag as unknown as ExtendedTag),
    ) as Record<string, unknown>;
    const nested = encoded["nested"] as Record<string, unknown>;
    expect(nested["inner"]).toStrictEqual("value");
    expect("empty" in nested).toStrictEqual(false);
    expect("gone" in nested).toStrictEqual(false);
  });
});

describe("encodeAudioProperties", () => {
  it("should encode audio properties to MessagePack", () => {
    const props = {
      duration: 180,
      bitrate: 320,
      sampleRate: 44100,
      channels: 2,
      bitsPerSample: 16,
      codec: "MP3",
      containerFormat: "MP3",
      isLossless: false,
    };
    const result = encodeAudioProperties(
      props as unknown as Parameters<typeof encodeAudioProperties>[0],
    );
    expect(result).toBeInstanceOf(Uint8Array);
    const decoded = decode(result) as Record<string, unknown>;
    expect(decoded["duration"]).toStrictEqual(180);
    expect(decoded["bitrate"]).toStrictEqual(320);
    expect(decoded["sampleRate"]).toStrictEqual(44100);
    expect(decoded["channels"]).toStrictEqual(2);
  });
});

describe("encodePropertyMap", () => {
  it("should encode a property map to MessagePack", () => {
    const map = { TITLE: ["Test Song"], ARTIST: ["Test Artist"] };
    const result = encodePropertyMap(map);
    expect(result).toBeInstanceOf(Uint8Array);
    const decoded = decode(result) as Record<string, unknown>;
    expect(decoded["TITLE"]).toStrictEqual(["Test Song"]);
    expect(decoded["ARTIST"]).toStrictEqual(["Test Artist"]);
  });

  it("should handle empty property map", () => {
    const result = encodePropertyMap({});
    expect(result).toBeInstanceOf(Uint8Array);
    expect(decode(result)).toStrictEqual({});
  });
});

describe("encodePicture", () => {
  it("should encode a picture with Uint8Array data", () => {
    const pic: Picture = {
      mimeType: "image/jpeg",
      data: new Uint8Array([0xff, 0xd8, 0xff]),
      type: "FrontCover",
    };
    const result = encodePicture(pic);
    expect(result).toBeInstanceOf(Uint8Array);
    const decoded = decode(result) as Record<string, unknown>;
    expect(decoded["mimeType"]).toStrictEqual("image/jpeg");
    expect(decoded["type"]).toStrictEqual("FrontCover");
  });

  it("should convert ArrayBuffer data to Uint8Array", () => {
    const bytes = new Uint8Array([0xff, 0xd8]);
    const pic = {
      mimeType: "image/png",
      data: bytes.buffer,
      type: "FrontCover",
    } as unknown as Picture;
    const result = encodePicture(pic);
    const decoded = decode(result) as Record<string, unknown>;
    expect(decoded["mimeType"]).toStrictEqual("image/png");
    expect(decoded["data"]).toBeInstanceOf(Uint8Array);
  });

  it("should throw MetadataError on unencodable data", () => {
    const unencodable = makeDeepNested();
    expectThrows(
      () => encodePicture(unencodable as unknown as Picture),
      Error,
      "Failed to encode picture",
    );
  });
});

describe("encodePictureArray", () => {
  it("should encode multiple pictures", () => {
    const pics: Picture[] = [
      {
        mimeType: "image/jpeg",
        data: new Uint8Array([1, 2, 3]),
        type: "FrontCover",
      },
      {
        mimeType: "image/png",
        data: new Uint8Array([4, 5, 6]),
        type: "BackCover",
      },
    ];
    const result = encodePictureArray(pics);
    expect(result).toBeInstanceOf(Uint8Array);
    const decoded = decode(result) as Array<Record<string, unknown>>;
    expect(decoded.length).toStrictEqual(2);
    expect(decoded[0]["mimeType"]).toStrictEqual("image/jpeg");
    expect(decoded[1]["mimeType"]).toStrictEqual("image/png");
  });

  it("should convert ArrayBuffer data to Uint8Array", () => {
    const bytes = new Uint8Array([0xff, 0xd8]);
    const pics = [
      { mimeType: "image/png", data: bytes.buffer, type: "FrontCover" },
    ] as unknown as Picture[];
    const result = encodePictureArray(pics);
    const decoded = decode(result) as Array<Record<string, unknown>>;
    expect(decoded.length).toStrictEqual(1);
    expect(decoded[0]["data"]).toBeInstanceOf(Uint8Array);
  });

  it("should throw MetadataError on unencodable data", () => {
    const unencodable = makeDeepNested();
    expectThrows(
      () => encodePictureArray([unencodable] as unknown as Picture[]),
      Error,
      "Failed to encode picture array",
    );
  });
});

describe("encodeMessagePack", () => {
  it("should encode arbitrary data with default options", () => {
    const data = { key: "value", num: 42 };
    const result = encodeMessagePack(data);
    expect(result).toBeInstanceOf(Uint8Array);
    const decoded = decode(result) as Record<string, unknown>;
    expect(decoded["key"]).toStrictEqual("value");
    expect(decoded["num"]).toStrictEqual(42);
  });

  it("should accept custom options", () => {
    const result = encodeMessagePack({ key: "value" }, { sortKeys: true });
    expect(result).toBeInstanceOf(Uint8Array);
  });
});

describe("encodeMessagePackCompact", () => {
  it("should encode data in compact format", () => {
    const result = encodeMessagePackCompact({ z: 1, a: 2, m: 3 });
    expect(result).toBeInstanceOf(Uint8Array);
    const decoded = decode(result) as Record<string, unknown>;
    expect(decoded["a"]).toStrictEqual(2);
    expect(decoded["z"]).toStrictEqual(1);
  });
});

describe("encodeBatchTagData", () => {
  it("should encode an array of tag data", () => {
    const tags = [
      { title: "Song 1", artist: "Artist 1" },
      { title: "Song 2", artist: "Artist 2" },
    ] as unknown as ExtendedTag[];
    const result = encodeBatchTagData(tags);
    expect(result).toBeInstanceOf(Uint8Array);
    const decoded = decode(result) as Record<string, unknown>[];
    expect(decoded.length).toStrictEqual(2);
    // encodeBatchTagData uses cleanObject, not encodeTagData — no key remapping
    expect(decoded[0]["title"]).toStrictEqual("Song 1");
    expect(decoded[1]["artist"]).toStrictEqual("Artist 2");
  });
});

describe("encodeMessagePackStream", () => {
  it("should yield encoded chunks for each item", () => {
    const items = [{ a: 1 }, { b: 2 }, { c: 3 }];
    const chunks = [...encodeMessagePackStream(items)];
    expect(chunks.map((c) => decode(c))).toStrictEqual([
      { a: 1 },
      { b: 2 },
      {
        c: 3,
      },
    ]);
  });

  it("should handle empty iterable", () => {
    const chunks = [...encodeMessagePackStream([])];
    expect(chunks.length).toStrictEqual(0);
  });
});

describe("estimateMessagePackSize", () => {
  it("should return a positive size for valid data", () => {
    const size = estimateMessagePackSize({ title: "Test", artist: "Artist" });
    expect(size > 0).toBeTruthy();
  });

  it("should return a consistent size for the same data", () => {
    const data = { title: "Test", artist: "Artist", year: 2025 };
    expect(estimateMessagePackSize(data)).toStrictEqual(
      estimateMessagePackSize(data),
    );
  });
});

describe("encodeFastTagData", () => {
  it("should encode basic tag fields", () => {
    const result = encodeFastTagData({
      title: ["Fast"],
      artist: ["Quick"],
      album: ["Speed"],
      year: 2025,
      track: 1,
    });
    expect(result).toBeInstanceOf(Uint8Array);
    const decoded = decode(result) as Record<string, unknown>;
    expect(decoded["title"]).toStrictEqual(["Fast"]);
    expect(decoded["year"]).toStrictEqual(2025);
  });
});

describe("canEncodeToMessagePack", () => {
  it("should return true for encodable data", () => {
    expect(canEncodeToMessagePack({ a: 1 })).toStrictEqual(true);
    expect(canEncodeToMessagePack("hello")).toStrictEqual(true);
    expect(canEncodeToMessagePack(42)).toStrictEqual(true);
    expect(canEncodeToMessagePack(null)).toStrictEqual(true);
    expect(canEncodeToMessagePack([1, 2, 3])).toStrictEqual(true);
    expect(canEncodeToMessagePack(undefined)).toStrictEqual(true);
    expect(canEncodeToMessagePack(true)).toStrictEqual(true);
    expect(canEncodeToMessagePack(0)).toStrictEqual(true);
  });

  it("should return false for circular references", () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular["self"] = circular;
    expect(canEncodeToMessagePack(circular)).toStrictEqual(false);
  });
});

describe("compareEncodingEfficiency", () => {
  it("should return size comparison metrics", () => {
    const data = { title: "Test Song", artist: "Test Artist", year: 2025 };
    const result = compareEncodingEfficiency(data);
    expect(result.messagePackSize > 0).toBeTruthy();
    expect(result.jsonSize > 0).toBeTruthy();
    expect(result.sizeReduction >= 0).toBeTruthy();
    expect(result.speedImprovement).toStrictEqual(10);
  });

  it("should clamp sizeReduction to 0 when msgpack is larger", () => {
    // Very small data where msgpack overhead > JSON
    const result = compareEncodingEfficiency(1);
    expect(result.sizeReduction).toStrictEqual(0);
  });
});

// --- Error path coverage ---

/** Build an object nested beyond msgpack maxDepth (32) to trigger encode errors. */
function makeDeepNested(): Record<string, unknown> {
  let obj: Record<string, unknown> = { val: "leaf" };
  for (let i = 0; i < 40; i++) {
    obj = { nested: obj };
  }
  return obj;
}

describe("encodeTagData error path", () => {
  it("should throw MetadataError on unencodable data", () => {
    const unencodable = makeDeepNested();
    expectThrows(
      () => encodeTagData(unencodable as unknown as ExtendedTag),
      Error,
      "Failed to encode tag data",
    );
  });
});

describe("encodeAudioProperties error path", () => {
  it("should throw MetadataError on unencodable data", () => {
    const unencodable = makeDeepNested();
    expectThrows(
      () =>
        encodeAudioProperties(
          unencodable as unknown as Parameters<typeof encodeAudioProperties>[0],
        ),
      Error,
      "Failed to encode audio properties",
    );
  });
});

describe("encodePropertyMap error path", () => {
  it("should throw MetadataError on unencodable data", () => {
    const unencodable = makeDeepNested();
    expectThrows(
      () =>
        encodePropertyMap(
          unencodable as unknown as Parameters<typeof encodePropertyMap>[0],
        ),
      Error,
      "Failed to encode property map",
    );
  });
});

describe("encodeMessagePack error path", () => {
  it("should throw MetadataError on unencodable data", () => {
    const unencodable = makeDeepNested();
    expectThrows(
      () => encodeMessagePack(unencodable),
      Error,
      "Failed to encode data",
    );
  });
});

describe("encodeMessagePackCompact error path", () => {
  it("should throw MetadataError on unencodable data", () => {
    const unencodable = makeDeepNested();
    expectThrows(
      () => encodeMessagePackCompact(unencodable),
      Error,
      "Failed to encode compact data",
    );
  });
});

describe("encodeBatchTagData error path", () => {
  it("should throw MetadataError on unencodable data", () => {
    const unencodable = makeDeepNested();
    expectThrows(
      () => encodeBatchTagData([unencodable] as unknown as ExtendedTag[]),
      Error,
      "Failed to encode batch tag data",
    );
  });
});

describe("encodeMessagePackStream error path", () => {
  it("should throw MetadataError on unencodable data", () => {
    const unencodable = makeDeepNested();
    expectThrows(
      () => [...encodeMessagePackStream([unencodable])],
      Error,
      "Failed to encode streaming data",
    );
  });
});

describe("estimateMessagePackSize fallback", () => {
  it("should fall back to JSON-based estimation when encode throws", () => {
    // Depth 40 exceeds MSGPACK_ENCODE_OPTIONS maxDepth (32), triggering
    // the catch path which falls back to JSON.stringify length estimation
    const deep = makeDeepNested();
    const size = estimateMessagePackSize(deep);
    expect(size > 0).toBeTruthy();
  });
});

describe("encodeFastTagData error path", () => {
  it("should throw MetadataError on unencodable data", () => {
    const unencodable = makeDeepNested();
    expectThrows(
      () =>
        encodeFastTagData(
          unencodable as unknown as Parameters<typeof encodeFastTagData>[0],
        ),
      Error,
      "Failed to encode fast tag data",
    );
  });
});

describe("cleanObject edge cases via encodeMessagePack", () => {
  it("should pass through Date objects", () => {
    const date = new Date("2025-01-01T00:00:00Z");
    const result = encodeMessagePack({ date });
    const decoded = decode(result) as Record<string, unknown>;
    expect(decoded["date"]).toBeInstanceOf(Date);
  });

  it("should pass through Uint8Array values", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const result = encodeMessagePack({ data: bytes });
    const decoded = decode(result) as Record<string, unknown>;
    expect(decoded["data"]).toBeInstanceOf(Uint8Array);
  });

  it("should pass through arrays", () => {
    const arr = [1, "two", 3];
    const result = encodeMessagePack({ items: arr });
    const decoded = decode(result) as Record<string, unknown>;
    expect(decoded["items"]).toStrictEqual([1, "two", 3]);
  });

  it("should handle null at top level", () => {
    const result = encodeMessagePack(null);
    expect(decode(result)).toStrictEqual(null);
  });

  it("should handle primitive at top level", () => {
    const result = encodeMessagePack(42);
    expect(decode(result)).toStrictEqual(42);
  });
});
