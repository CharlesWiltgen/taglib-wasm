import { describe, expect, it } from "vite-plus/test";
import { getFormat } from "./audio-properties.ts";

/** A 16-byte buffer with the given magic prefix, so ASF's length gate applies. */
function withMagic(bytes: number[]): Uint8Array {
  const data = new Uint8Array(16);
  data.set(bytes);
  return data;
}

describe("getFormat magic-byte fallback", () => {
  it("detects WavPack from the wvpk signature", () => {
    expect(getFormat(null, withMagic([0x77, 0x76, 0x70, 0x6b]))).toStrictEqual(
      "WV",
    );
  });

  it("detects TrueAudio from the TTA1 signature", () => {
    expect(getFormat(null, withMagic([0x54, 0x54, 0x41, 0x31]))).toStrictEqual(
      "TTA",
    );
  });

  it("detects ASF from its header object GUID prefix", () => {
    expect(getFormat(null, withMagic([0x30, 0x26, 0xb2, 0x75]))).toStrictEqual(
      "ASF",
    );
  });

  it("detects Matroska from the EBML signature", () => {
    expect(getFormat(null, withMagic([0x1a, 0x45, 0xdf, 0xa3]))).toStrictEqual(
      "MATROSKA",
    );
  });

  it("returns unknown for unrecognized bytes", () => {
    expect(getFormat(null, withMagic([0, 0, 0, 0]))).toStrictEqual("unknown");
  });
});
