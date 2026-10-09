/**
 * @fileoverview Content advisory tri-state (taglib-an30).
 *
 * Pinned wire contract (reviewer correction 2026-08-04): rtng 0/1/2 <->
 * ITUNESADVISORY "0"/"1"/"2" string values. The typed surface is
 * advisory: "explicit" | "clean" | "unspecified" — "1" -> explicit,
 * "2" -> clean, "0" -> unspecified; unspecified on write clears the
 * representation (removes the rtng item / ITUNESADVISORY frame/atom).
 * MP4 stores the advisory in the native rtng atom; other formats use
 * ITUNESADVISORY (TXXX/freeform/Vorbis/APE, and ASF attributes since
 * taglib-984r).
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

/** Read the 1-byte value of the MP4 rtng item if present.
 * ilst item layout: size(4) key(4) size(4) 'data' type(4) locale(4) value. */
function rtngByte(buf: Uint8Array): number | undefined {
  const idx = findBytes(buf, new TextEncoder().encode("rtng"));
  if (idx === -1) return undefined;
  const data = new TextDecoder().decode(buf.slice(idx + 8, idx + 12));
  if (data !== "data") return undefined;
  return buf[idx + 20];
}

function findBytes(haystack: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/**
 * Insert a third-party-style freeform ITUNESADVISORY atom
 * (----:com.apple.iTunes:ITUNESADVISORY) into the moov/udta/meta/ilst tree,
 * fixing container sizes. The library can no longer CREATE this atom
 * (advisory writes go to rtng), so the clear-contract half needs byte
 * surgery: a file written by another tool may carry both.
 */
function addFreeformITunesAdvisory(buf: Uint8Array, value: number): Uint8Array {
  const enc = new TextEncoder();
  const u8 = buf;
  const sizeAt = (p: number): number =>
    new DataView(u8.buffer, u8.byteOffset + p, 8).getUint32(0, false);
  const find = (start: number, end: number, type: string): number => {
    let p = start;
    while (p + 8 <= end) {
      const s = sizeAt(p);
      if (s < 8) return -1;
      if (new TextDecoder().decode(u8.slice(p + 4, p + 8)) === type) return p;
      p += s;
    }
    return -1;
  };

  const moov = find(0, u8.length, "moov");
  if (moov < 0) throw new Error("no moov in fixture");
  const moovEnd = moov + sizeAt(moov);
  const udta = find(moov + 8, moovEnd, "udta");
  if (udta < 0) throw new Error("no udta in fixture");
  const udtaEnd = udta + sizeAt(udta);
  const meta = find(udta + 8, udtaEnd, "meta");
  if (meta < 0) throw new Error("no meta in fixture");
  const metaEnd = meta + sizeAt(meta);
  // meta carries a 4-byte version/flags header before its children.
  const ilst = find(meta + 12, metaEnd, "ilst");
  if (ilst < 0) throw new Error("no ilst in fixture");

  // Build the item: [size]['----'] with mean/name/data subatoms, mirroring
  // the layout TagLib writes for freeform atoms.
  const chunk = (type: string, payload: Uint8Array): Uint8Array => {
    const out = new Uint8Array(8 + payload.length);
    new DataView(out.buffer).setUint32(0, 8 + payload.length, false);
    out.set(enc.encode(type), 4);
    out.set(payload, 8);
    return out;
  };
  const ver = new Uint8Array(4);
  const mean = chunk(
    "mean",
    new Uint8Array([...ver, ...enc.encode("com.apple.iTunes")]),
  );
  const name = chunk(
    "name",
    new Uint8Array([...ver, ...enc.encode("ITUNESADVISORY")]),
  );
  const data = chunk("data", new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, value]));
  const item = chunk("----", new Uint8Array([...mean, ...name, ...data]));

  // Insert at the end of the ilst payload; grow the container sizes.
  const ilstSize = sizeAt(ilst);
  const ilstPayloadEnd = ilst + 8 + (ilstSize - 8);
  const out = new Uint8Array(u8.length + item.length);
  out.set(u8.slice(0, ilstPayloadEnd), 0);
  out.set(item, ilstPayloadEnd);
  out.set(u8.slice(ilstPayloadEnd), ilstPayloadEnd + item.length);
  for (const p of [ilst, meta, udta, moov]) {
    new DataView(out.buffer, out.byteOffset + p, 8).setUint32(
      0,
      sizeAt(p) + item.length,
      false,
    );
  }
  return out;
}

describe("advisory tri-state mapping (taglib-an30)", () => {
  it("read: ITUNESADVISORY values narrow to the tri-state", () => {
    expect(mapPropertiesToExtendedTag({ itunesAdvisory: ["1"] }).advisory)
      .toStrictEqual("explicit");
    expect(mapPropertiesToExtendedTag({ itunesAdvisory: ["2"] }).advisory)
      .toStrictEqual("clean");
    expect(mapPropertiesToExtendedTag({ itunesAdvisory: ["0"] }).advisory)
      .toStrictEqual("unspecified");
  });

  it("read: absent or unknown values leave advisory unset but keep the raw field", () => {
    const absent = mapPropertiesToExtendedTag({ TITLE: ["Kiss"] });
    expect(absent.advisory).toStrictEqual(undefined);
    const unknown = mapPropertiesToExtendedTag({ itunesAdvisory: ["3"] });
    expect(unknown.advisory).toStrictEqual(undefined);
    expect(unknown.itunesAdvisory).toStrictEqual(["3"]);
  });

  it("write: explicit/clean become '1'/'2', unspecified clears", () => {
    expect(normalizeTagInput({ advisory: "explicit" }).itunesAdvisory)
      .toStrictEqual([
        "1",
      ]);
    expect(normalizeTagInput({ advisory: "clean" }).itunesAdvisory)
      .toStrictEqual([
        "2",
      ]);
    // Unspecified is an explicit clear (the empty-list semantics WASI's
    // merge model requires, taglib-nc5), not an "unchanged".
    expect(normalizeTagInput({ advisory: "unspecified" }).itunesAdvisory)
      .toStrictEqual([]);
  });
});

async function mp4RoundTrip(
  backend: "wasi" | "emscripten",
  value: string,
): Promise<{ readBack: Record<string, string[]>; buffer: Uint8Array }> {
  const src = new Uint8Array(await readFile(FIXTURE_PATH.m4a));
  const tl = await TagLib.initialize({ forceWasmType: backend });
  const file = await tl.open(new Uint8Array(src));
  file.setProperties({ ITUNESADVISORY: [value] });
  file.save();
  const buf = file.getFileBuffer();
  file.dispose();

  const tlR = await TagLib.initialize({ forceWasmType: OTHER[backend] });
  const reopened = await tlR.open(buf);
  const readBack = reopened.properties() as Record<string, string[]>;
  reopened.dispose();
  return { readBack, buffer: buf };
}

describe("MP4 native rtng atom (taglib-an30)", () => {
  for (const backend of BACKENDS) {
    it(`[${backend}] writing ITUNESADVISORY stores rtng, not a freeform atom`, async () => {
      const { readBack, buffer } = await mp4RoundTrip(backend, "1");
      // The byte-level truth: an rtng item exists with value 1, and no
      // freeform ITUNESADVISORY atom was written.
      expect(rtngByte(buffer)).toStrictEqual(1);
      expect(!new TextDecoder().decode(buffer).includes("ITUNESADVISORY"))
        .toBeTruthy();
      // Read back on the other backend through the native atom.
      expect(readBack.itunesAdvisory).toStrictEqual(["1"]);
      expect(mapPropertiesToExtendedTag(readBack as never).advisory)
        .toStrictEqual("explicit");
    });

    it(`[${backend}] rtng=2 reads as clean`, async () => {
      const { readBack, buffer } = await mp4RoundTrip(backend, "2");
      expect(rtngByte(buffer)).toStrictEqual(2);
      expect(mapPropertiesToExtendedTag(readBack as never).advisory)
        .toStrictEqual("clean");
    });

    it(`[${backend}] rtng=0 reads as unspecified (pinned contract)`, async () => {
      const { readBack, buffer } = await mp4RoundTrip(backend, "0");
      expect(rtngByte(buffer)).toStrictEqual(0);
      expect(readBack.itunesAdvisory).toStrictEqual(["0"]);
      expect(mapPropertiesToExtendedTag(readBack as never).advisory)
        .toStrictEqual("unspecified");
    });

    it(`[${backend}] clearing removes the rtng item`, async () => {
      const src = new Uint8Array(await readFile(FIXTURE_PATH.m4a));
      const tl = await TagLib.initialize({ forceWasmType: backend });
      const file = await tl.open(new Uint8Array(src));
      file.setProperties({ ITUNESADVISORY: ["1"] });
      file.save();
      file.setProperties({ ITUNESADVISORY: [] });
      file.save();
      const buf = file.getFileBuffer();
      file.dispose();
      expect(rtngByte(buf)).toStrictEqual(undefined);

      const tlR = await TagLib.initialize({ forceWasmType: OTHER[backend] });
      const reopened = await tlR.open(buf);
      const props = reopened.properties() as Record<string, string[]>;
      expect(props.itunesAdvisory).toStrictEqual(undefined);
      reopened.dispose();
    });

    it(`[${backend}] clearing removes a third-party freeform ITUNESADVISORY atom too`, async () => {
      const src = new Uint8Array(await readFile(FIXTURE_PATH.m4a));
      // A file written by another tool may carry the freeform atom
      // (----:com.apple.iTunes:ITUNESADVISORY); the clear must remove it
      // alongside rtng (freeform items are keyed by their FULL name in the
      // item map — taglib-an30 review).
      const patched = addFreeformITunesAdvisory(src, 2);
      expect(new TextDecoder().decode(patched).includes("ITUNESADVISORY"))
        .toBeTruthy();

      const tl = await TagLib.initialize({ forceWasmType: backend });
      const file = await tl.open(patched);
      file.setProperties({ ITUNESADVISORY: [] });
      file.save();
      const buf = file.getFileBuffer();
      file.dispose();

      expect(!new TextDecoder().decode(buf).includes("ITUNESADVISORY"))
        .toBeTruthy();
      const tlR = await TagLib.initialize({ forceWasmType: OTHER[backend] });
      const reopened = await tlR.open(buf);
      const props = reopened.properties() as Record<string, string[]>;
      expect(props.itunesAdvisory).toStrictEqual(undefined);
      reopened.dispose();
    });
  }
});

describe("advisory typed simple-API round-trips (taglib-an30)", () => {
  it("mp3: TXXX ITUNESADVISORY round-trips explicit", async () => {
    const src = new Uint8Array(await readFile(FIXTURE_PATH.mp3));
    const modified = await applyTags(src, { advisory: "explicit" });
    const tags = await readTags(modified);
    expect(tags.advisory).toStrictEqual("explicit");
    expect(tags.itunesAdvisory).toStrictEqual(["1"]);
    // The typed round-trip preserves the state.
    const back = await applyTags(modified, tags);
    expect((await readTags(back)).advisory).toStrictEqual("explicit");
  });

  it("opus: Vorbis comment carries clean", async () => {
    const src = new Uint8Array(await readFile(FIXTURE_PATH.opus));
    const modified = await applyTags(src, { advisory: "clean" });
    const tags = await readTags(modified);
    expect(tags.advisory).toStrictEqual("clean");
    expect(new TextDecoder().decode(modified).includes("ITUNESADVISORY=2"))
      .toBeTruthy();
  });

  it("wma: ASF attribute path carries explicit (taglib-984r)", async () => {
    const src = new Uint8Array(await readFile(FIXTURE_PATH.wma));
    const modified = await applyTags(src, { advisory: "explicit" });
    const tags = await readTags(modified);
    expect(tags.advisory).toStrictEqual("explicit");
  });

  it("unspecified clears the representation", async () => {
    const src = new Uint8Array(await readFile(FIXTURE_PATH.mp3));
    const flagged = await applyTags(src, { advisory: "explicit" });
    const cleared = await applyTags(flagged, { advisory: "unspecified" });
    const tags = await readTags(cleared);
    expect(tags.advisory).toStrictEqual(undefined);
    expect(tags.itunesAdvisory).toStrictEqual(undefined);
    expect(!new TextDecoder().decode(cleared).includes("ITUNESADVISORY"))
      .toBeTruthy();
  });
});
