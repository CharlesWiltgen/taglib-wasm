import { describe, expect, it } from "vite-plus/test";
import {
  mapPropertiesToExtendedTag,
  normalizeTagInput,
} from "./tag-mapping.ts";

describe(mapPropertiesToExtendedTag.name, () => {
  it("should map basic fields", () => {
    const result = mapPropertiesToExtendedTag({
      title: ["Hello"],
      artist: ["Artist"],
      date: ["2025"],
      trackNumber: ["3"],
    });
    expect(result).toStrictEqual({
      title: ["Hello"],
      artist: ["Artist"],
      year: 2025,
      date: "2025",
      track: 3,
      // The raw string rides alongside the narrowed number, exactly as `date`
      // does beside `year` — without it a readTags() -> applyTags() round-trip
      // rewrites "3/12" as "3" (taglib-qpl).
      trackNumber: "3",
    });
  });

  it("should preserve a full ISO date string alongside the numeric year", () => {
    const result = mapPropertiesToExtendedTag({ date: ["1975-10-31"] });
    expect(result).toStrictEqual({ year: 1975, date: "1975-10-31" });
  });

  it("should map extended string fields", () => {
    const result = mapPropertiesToExtendedTag({
      albumArtist: ["Various Artists"],
      composer: ["Bach", "Handel"],
      musicbrainzTrackId: ["abc-123"],
      replayGainTrackGain: ["-6.54 dB"],
    });
    expect(result).toStrictEqual({
      albumArtist: ["Various Artists"],
      composer: ["Bach", "Handel"],
      musicbrainzTrackId: ["abc-123"],
      replayGainTrackGain: ["-6.54 dB"],
    });
  });

  it("should map numeric extended fields", () => {
    const result = mapPropertiesToExtendedTag({
      discNumber: ["2"],
      totalTracks: ["12"],
      totalDiscs: ["3"],
      bpm: ["128"],
    });
    expect(result).toStrictEqual({
      discNumber: 2,
      totalTracks: 12,
      totalDiscs: 3,
      bpm: 128,
    });
  });

  it("should map compilation to boolean", () => {
    expect(mapPropertiesToExtendedTag({ compilation: ["1"] }).compilation)
      .toStrictEqual(true);
    expect(mapPropertiesToExtendedTag({ compilation: ["0"] }).compilation)
      .toStrictEqual(false);
    // Non-canonical disk values (literal "true" COMPILATION fields) must
    // read the same on both backends: WASI canonicalizes to "1", Emscripten
    // surfaces "true" verbatim (taglib-c9b).
    expect(mapPropertiesToExtendedTag({ compilation: ["true"] }).compilation)
      .toStrictEqual(true);
    expect(mapPropertiesToExtendedTag({ compilation: ["false"] }).compilation)
      .toStrictEqual(false);
  });

  it("should pass through unknown camelCase property keys", () => {
    const result = mapPropertiesToExtendedTag({
      title: ["X"],
      someUnknownKey: ["kept"],
    });
    expect(result.title).toStrictEqual(["X"]);
    expect((result as Record<string, unknown>).someUnknownKey).toStrictEqual([
      "kept",
    ]);
  });

  it("should skip fields with empty values arrays", () => {
    const result = mapPropertiesToExtendedTag({
      title: [],
      albumArtist: [],
      discNumber: [],
      compilation: [],
    });
    expect(result).toStrictEqual({});
  });

  it("should drop non-numeric year/track but preserve both raw strings", () => {
    const result = mapPropertiesToExtendedTag({
      date: ["not-a-number"],
      trackNumber: ["abc"],
    });
    // Numeric mirrors are dropped when they do not parse; the raw strings are
    // still the authoritative values and must survive.
    expect(result).toStrictEqual({ date: "not-a-number", trackNumber: "abc" });
  });
});

describe(normalizeTagInput.name, () => {
  it("should map basic string fields to camelCase PropertyMap keys", () => {
    const result = normalizeTagInput({
      title: "Hello",
      artist: ["A", "B"],
      album: "Album",
    });
    expect(result.title).toStrictEqual(["Hello"]);
    expect(result.artist).toStrictEqual(["A", "B"]);
    expect(result.album).toStrictEqual(["Album"]);
  });

  it("should map year and track as string arrays", () => {
    const result = normalizeTagInput({ year: 2025, track: 3 });
    expect(result.date).toStrictEqual(["2025"]);
    expect(result.trackNumber).toStrictEqual(["3"]);
  });

  it("should map a full date string to the date PropertyMap key", () => {
    const result = normalizeTagInput({ date: "1975-10-31" });
    expect(result.date).toStrictEqual(["1975-10-31"]);
  });

  it("should let date win over year when both are provided", () => {
    const result = normalizeTagInput({ year: 2024, date: "1975-10-31" });
    expect(result.date).toStrictEqual(["1975-10-31"]);
  });

  it("should map extended string fields to camelCase PropertyMap keys", () => {
    const result = normalizeTagInput({
      albumArtist: "VA",
      composer: ["Bach", "Handel"],
      conductor: "Karajan",
      lyricist: ["A", "B"],
    });
    expect(result.albumArtist).toStrictEqual(["VA"]);
    expect(result.composer).toStrictEqual(["Bach", "Handel"]);
    expect(result.conductor).toStrictEqual(["Karajan"]);
    expect(result.lyricist).toStrictEqual(["A", "B"]);
  });

  it("should map numeric extended fields as string arrays", () => {
    const result = normalizeTagInput({
      discNumber: 2,
      totalTracks: 12,
      totalDiscs: 3,
      bpm: 128,
    });
    expect(result.discNumber).toStrictEqual(["2"]);
    expect(result.totalTracks).toStrictEqual(["12"]);
    expect(result.totalDiscs).toStrictEqual(["3"]);
    expect(result.bpm).toStrictEqual(["128"]);
  });

  it("should handle numeric 0 values", () => {
    const result = normalizeTagInput({ bpm: 0, discNumber: 0 });
    expect(result.bpm).toStrictEqual(["0"]);
    expect(result.discNumber).toStrictEqual(["0"]);
  });

  it("should truncate fractional bpm to an integer (taglib-ory8)", () => {
    // ID3v2 TBPM is an integer numeric string and MP4 tmpo is an integer
    // atom: a fractional typed value would be stored verbatim by one and
    // truncated by the other — same input, different files. The typed write
    // canonicalizes with the read side's narrowing rule (parseLeadingInt),
    // so wire "120.5" reads back as 120 and a typed write of 120.5 writes
    // "120" everywhere (taglib-ory8).
    expect(normalizeTagInput({ bpm: 120.5 }).bpm).toStrictEqual(["120"]);
    expect(normalizeTagInput({ bpm: 120.99 }).bpm).toStrictEqual(["120"]);
    expect(normalizeTagInput({ bpm: -3.7 }).bpm).toStrictEqual(["-3"]);
    expect(normalizeTagInput({ bpm: 120 }).bpm).toStrictEqual(["120"]);
    expect(normalizeTagInput({ bpm: 0 }).bpm).toStrictEqual(["0"]);
  });

  it("should map compilation true to '1'", () => {
    const result = normalizeTagInput({ compilation: true });
    expect(result.compilation).toStrictEqual(["1"]);
  });

  it("should map compilation false to '0'", () => {
    const result = normalizeTagInput({ compilation: false });
    expect(result.compilation).toStrictEqual(["0"]);
  });

  it("should pass through empty arrays", () => {
    const result = normalizeTagInput({ albumArtist: [] });
    expect(result.albumArtist).toStrictEqual([]);
  });

  it("should skip undefined fields", () => {
    const result = normalizeTagInput({ title: "X" });
    expect(Object.keys(result)).toStrictEqual(["title"]);
  });

  it("should map MusicBrainz and ReplayGain fields", () => {
    const result = normalizeTagInput({
      musicbrainzTrackId: "abc-123",
      replayGainTrackGain: "-6.54 dB",
    });
    expect(result.musicbrainzTrackId).toStrictEqual(["abc-123"]);
    expect(result.replayGainTrackGain).toStrictEqual(["-6.54 dB"]);
  });

  it("should not duplicate basic fields handled by the initial loop", () => {
    const result = normalizeTagInput({ title: "T", artist: ["A", "B"] });
    expect(result.title).toStrictEqual(["T"]);
    expect(result.artist).toStrictEqual(["A", "B"]);
    expect(Object.keys(result).length).toStrictEqual(2);
  });
});
