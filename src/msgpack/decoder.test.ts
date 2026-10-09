import { describe, expect, it } from "vite-plus/test";
import { encode } from "@msgpack/msgpack";
import { decodeTagData } from "./decoder.ts";

describe("decodeTagData key normalization", () => {
  it("should decode ACOUSTID_FINGERPRINT to acoustidFingerprint", () => {
    const msgpack = encode({ ACOUSTID_FINGERPRINT: "AQADtNQYhYkYRcg" });
    const decoded = decodeTagData(new Uint8Array(msgpack)) as Record<
      string,
      unknown
    >;
    expect(decoded.acoustidFingerprint).toStrictEqual("AQADtNQYhYkYRcg");
    expect("ACOUSTID_FINGERPRINT" in decoded).toStrictEqual(false);
  });

  it("should decode disc to discNumber", () => {
    const msgpack = encode({ disc: 2 });
    const decoded = decodeTagData(new Uint8Array(msgpack)) as Record<
      string,
      unknown
    >;
    expect(decoded.discNumber).toStrictEqual(2);
    expect("disc" in decoded).toStrictEqual(false);
  });

  it("should decode DISCNUMBER to discNumber", () => {
    const msgpack = encode({ DISCNUMBER: 3 });
    const decoded = decodeTagData(new Uint8Array(msgpack)) as Record<
      string,
      unknown
    >;
    expect(decoded.discNumber).toStrictEqual(3);
  });

  it("should decode basic UPPERCASE keys to camelCase", () => {
    const msgpack = encode({
      TITLE: "Test",
      ARTIST: "Artist",
      ALBUM: "Album",
      DATE: 2025,
      TRACKNUMBER: 3,
    });
    const decoded = decodeTagData(new Uint8Array(msgpack)) as Record<
      string,
      unknown
    >;
    expect(decoded.title).toStrictEqual("Test");
    expect(decoded.artist).toStrictEqual("Artist");
    expect(decoded.album).toStrictEqual("Album");
    expect(decoded.date).toStrictEqual(2025);
    expect(decoded.trackNumber).toStrictEqual(3);
  });

  it("should decode MusicBrainz fields to camelCase", () => {
    const msgpack = encode({
      MUSICBRAINZ_TRACKID: "abc-123",
      MUSICBRAINZ_ALBUMID: "def-456",
    });
    const decoded = decodeTagData(new Uint8Array(msgpack)) as Record<
      string,
      unknown
    >;
    expect(decoded.musicbrainzTrackId).toStrictEqual("abc-123");
    expect(decoded.musicbrainzReleaseId).toStrictEqual("def-456");
  });

  it("should decode ReplayGain fields to camelCase", () => {
    const msgpack = encode({
      REPLAYGAIN_TRACK_GAIN: "-6.54 dB",
      REPLAYGAIN_TRACK_PEAK: "0.98765",
    });
    const decoded = decodeTagData(new Uint8Array(msgpack)) as Record<
      string,
      unknown
    >;
    expect(decoded.replayGainTrackGain).toStrictEqual("-6.54 dB");
    expect(decoded.replayGainTrackPeak).toStrictEqual("0.98765");
  });

  it("should leave already-camelCase keys as-is", () => {
    const msgpack = encode({
      title: "Test",
      artist: "Artist",
      albumArtist: "VA",
    });
    const decoded = decodeTagData(new Uint8Array(msgpack)) as Record<
      string,
      unknown
    >;
    expect(decoded.title).toStrictEqual("Test");
    expect(decoded.artist).toStrictEqual("Artist");
    expect(decoded.albumArtist).toStrictEqual("VA");
  });

  it("should pass through unknown keys as-is", () => {
    const msgpack = encode({ CUSTOM_UNKNOWN: "value" });
    const decoded = decodeTagData(new Uint8Array(msgpack)) as Record<
      string,
      unknown
    >;
    expect(decoded["CUSTOM_UNKNOWN"]).toStrictEqual("value");
  });
});
