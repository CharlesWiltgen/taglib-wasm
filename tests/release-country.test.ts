/**
 * @fileoverview Typed releaseCountry property (taglib-m0c2).
 *
 * RELEASECOUNTRY is a first-class TagLib 2.3.2 PropertyMap key — listed in
 * TagLib's standard-key docs (tpropertymap.h) and translated natively on
 * every format (ID3v2 TXXX 'MUSICBRAINZ ALBUM RELEASE COUNTRY' plus the
 * uppercase TXXX:RELEASECOUNTRY fallback, MP4 freeform 'MusicBrainz Album
 * Release Country', ASF 'MusicBrainz/Album Release Country', WAV ICNT,
 * Vorbis/Matroska raw) — but there was no typed entry in the PROPERTIES
 * table, so readTags() surfaced it only as an untyped ALL_CAPS pass-through
 * and the camelCase key silently read undefined.
 */

import { describe, expect, it } from "vite-plus/test";
import { readFile } from "node:fs/promises";
import { TagLib } from "../src/taglib.ts";
import { applyTags, readTags } from "../src/simple/index.ts";
import {
  mapPropertiesToExtendedTag,
  normalizeTagInput,
} from "../src/utils/tag-mapping.ts";
import { FIXTURE_PATH } from "./shared-fixtures.ts";

const BACKENDS = ["wasi", "emscripten"] as const;
const OTHER: Record<string, "wasi" | "emscripten"> = {
  wasi: "emscripten",
  emscripten: "wasi",
};

describe("RELEASECOUNTRY typed mapping (taglib-m0c2)", () => {
  it("read: raw RELEASECOUNTRY surfaces as releaseCountry string[]", () => {
    const tag = mapPropertiesToExtendedTag({ RELEASECOUNTRY: ["US"] });
    expect(tag.releaseCountry).toStrictEqual(["US"]);
  });

  it("read: camelCase property-map key also resolves", () => {
    const tag = mapPropertiesToExtendedTag({ releaseCountry: ["US"] });
    expect(tag.releaseCountry).toStrictEqual(["US"]);
  });

  it("write: string and string[] forms both normalize", () => {
    expect(normalizeTagInput({ releaseCountry: "US" }).releaseCountry)
      .toStrictEqual([
        "US",
      ]);
    expect(normalizeTagInput({ releaseCountry: ["US", "XW"] }).releaseCountry)
      .toStrictEqual(["US", "XW"]);
  });

  it("absent when not present", () => {
    const tag = mapPropertiesToExtendedTag({ TITLE: ["Kiss"] });
    expect(tag.releaseCountry).toStrictEqual(undefined);
  });
});

// Wire-name byte checks per format. TXXX descriptions (MP3) and ASF
// attribute names are encoding-dependent, so those formats are covered by
// the read-back assertion only; the rest have plain-ASCII wire names.
const WIRE_BYTES: Record<string, string | undefined> = {
  m4a: "MusicBrainz Album Release Country",
  wv: "RELEASECOUNTRY",
  mka: "RELEASECOUNTRY",
  opus: "RELEASECOUNTRY",
  flac: "RELEASECOUNTRY",
};

async function roundTrip(
  writeBackend: "wasi" | "emscripten",
  format: keyof typeof FIXTURE_PATH & string,
): Promise<{ readBack: Record<string, string[]>; buffer: Uint8Array }> {
  const src = new Uint8Array(
    await readFile(
      FIXTURE_PATH[format as keyof typeof FIXTURE_PATH],
    ),
  );
  const tl = await TagLib.initialize({ forceWasmType: writeBackend });
  const file = await tl.open(new Uint8Array(src));
  file.setProperties({ RELEASECOUNTRY: ["US"] });
  file.save();
  const buf = file.getFileBuffer();
  file.dispose();

  const tlR = await TagLib.initialize({ forceWasmType: OTHER[writeBackend] });
  const reopened = await tlR.open(buf);
  const readBack = reopened.properties() as Record<string, string[]>;
  reopened.dispose();
  return { readBack, buffer: buf };
}

describe("RELEASECOUNTRY cross-backend round-trip (taglib-m0c2)", () => {
  const FORMATS = ["mp3", "m4a", "wv", "mka", "opus", "wma", "flac"] as const;
  for (const backend of BACKENDS) {
    for (const format of FORMATS) {
      it(`[${backend}] ${format}: US survives save and reads back on the other backend`, async () => {
        const { readBack, buffer } = await roundTrip(backend, format);
        expect(readBack.releaseCountry).toStrictEqual(["US"]);
        const wire = WIRE_BYTES[format];
        if (wire) {
          expect(
            new TextDecoder().decode(buffer).includes(wire),
            `${format} bytes should carry ${wire}`,
          ).toBeTruthy();
        }
      });
    }
  }
});

describe("RELEASECOUNTRY typed simple-API round-trip (taglib-m0c2)", () => {
  it("applyTags(string) -> readTags returns [string]", async () => {
    const src = new Uint8Array(await readFile(FIXTURE_PATH.flac));
    const modified = await applyTags(src, { releaseCountry: "US" });
    const tags = await readTags(modified);
    expect(tags.releaseCountry).toStrictEqual(["US"]);
  });

  it("applyTags(string[]) -> readTags returns the array verbatim", async () => {
    const src = new Uint8Array(await readFile(FIXTURE_PATH.mp3));
    const modified = await applyTags(src, { releaseCountry: ["US"] });
    const tags = await readTags(modified);
    expect(tags.releaseCountry).toStrictEqual(["US"]);
  });
});
