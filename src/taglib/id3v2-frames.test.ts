import { describe, expect, it } from "vite-plus/test";
import { expectThrows } from "../../tests/_assert-helpers.ts";
import { assertFrameId, assertMp3, toPublicFrame } from "./id3v2-frames.ts";
import { MetadataError, UnsupportedFormatError } from "../errors/classes.ts";

describe("assertFrameId", () => {
  it("accepts valid 4-char IDs", () => {
    for (const id of ["TIT2", "TXXX", "RGAD", "WFED", "ID32"]) {
      assertFrameId(id, "write"); // does not throw
    }
  });

  it("rejects malformed IDs", () => {
    for (const id of ["", "TIT", "TIT22", "tit2", "TI 2", "TI-2", "ТIT2"]) {
      expectThrows(() => assertFrameId(id, "write"), MetadataError);
    }
  });
});

describe("assertMp3", () => {
  it("passes for MP3 and throws UnsupportedFormatError otherwise", () => {
    assertMp3("MP3");
    expectThrows(() => assertMp3("FLAC"), UnsupportedFormatError);
    expectThrows(() => assertMp3("WAV"), UnsupportedFormatError);
  });
});

describe("toPublicFrame", () => {
  it("drops zero flags and preserves non-zero flags", () => {
    const data = new Uint8Array([1]);
    expect(toPublicFrame({ id: "RGAD", data, flags: 0 })).toStrictEqual({
      id: "RGAD",
      data,
    });
    expect(toPublicFrame({ id: "RGAD", data, flags: 0x4000 })).toStrictEqual({
      id: "RGAD",
      data,
      flags: 0x4000,
    });
    expect(toPublicFrame({ id: "RGAD", data })).toStrictEqual({
      id: "RGAD",
      data,
    });
  });
});
