/**
 * @fileoverview Parameterized format detection tests across both backends.
 */

import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { expectDefined } from "./_assert-helpers.ts";
import type { FileType } from "../src/types.ts";
import {
  type BackendAdapter,
  extForFormat,
  forEachBackend,
  readFixture,
} from "./backend-adapter.ts";
import { fileExists, type Format, FORMATS } from "./shared-fixtures.ts";

/**
 * `FileType` members whose only reachable fixture is upstream TagLib's own test
 * corpus (`lib/taglib/tests/data/`) — nothing in `tests/test-files/` covers
 * them, which is why their `getFormat()` reachability went unexercised. The
 * expected value is the declaration spelling from `src/types/audio-formats.ts`,
 * not the container string the snapshot carries: WASI maps the latter to the
 * former and answered "unknown" for every one of these nine while
 * `CONTAINER_TO_FORMAT` had no key for them (taglib-uat8).
 */
const NICHE_FORMATS: ReadonlyArray<{ format: FileType; path: string }> = [
  { format: "APE", path: "lib/taglib/tests/data/mac-399.ape" },
  { format: "DSF", path: "lib/taglib/tests/data/empty10ms.dsf" },
  { format: "DSDIFF", path: "lib/taglib/tests/data/empty10ms.dff" },
  { format: "MPC", path: "lib/taglib/tests/data/click.mpc" },
  { format: "SHN", path: "lib/taglib/tests/data/2sec-silence.shn" },
  { format: "MOD", path: "lib/taglib/tests/data/test.mod" },
  { format: "S3M", path: "lib/taglib/tests/data/test.s3m" },
  { format: "IT", path: "lib/taglib/tests/data/test.it" },
  { format: "XM", path: "lib/taglib/tests/data/test.xm" },
];

forEachBackend("Format Detection", (adapter: BackendAdapter) => {
  beforeAll(async () => {
    await adapter.init();
  });

  afterAll(async () => {
    await adapter.dispose();
  });

  for (const format of FORMATS) {
    it(`should detect ${format} format from valid file`, async () => {
      const buffer = await readFixture(format);
      const tags = await adapter.readTags(buffer, extForFormat(format));
      expectDefined(tags, `${format}: should successfully read tags`);
    });
  }

  it("should reject empty buffer", async () => {
    const empty = new Uint8Array(0);
    let threw = false;
    try {
      await adapter.readTags(empty, "mp3");
    } catch {
      threw = true;
    }
    expect(threw, "empty buffer should throw").toStrictEqual(true);
  });

  it("should reject non-audio bytes", async () => {
    // Deterministic payload. This test used `crypto.getRandomValues`, which made
    // it flaky by construction: 256 random bytes occasionally begin with a real
    // signature (0xFF MPEG sync, "ID3", "fLaC", …) and then legitimately open —
    // observed failing on ubuntu in run 35249582084 while macOS and Windows
    // passed the same code. A PNG signature can never be audio, so the
    // assertion now tests rejection rather than luck.
    const notAudio = new Uint8Array(256);
    notAudio.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    let threw = false;
    try {
      await adapter.readTags(notAudio, "mp3");
    } catch {
      threw = true;
    }
    expect(threw, "non-audio bytes should throw").toStrictEqual(true);
  });

  it("should reject tiny buffer", async () => {
    const tiny = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    let threw = false;
    try {
      await adapter.readTags(tiny, "mp3");
    } catch {
      threw = true;
    }
    expect(threw, "tiny buffer should throw").toStrictEqual(true);
  });
});

forEachBackend("Niche Format Detection", (adapter: BackendAdapter) => {
  beforeAll(async () => {
    await adapter.init();
  });

  afterAll(async () => {
    await adapter.dispose();
  });

  for (const { format, path } of NICHE_FORMATS) {
    it(`should report ${format} for ${path.split("/").pop()}`, async () => {
      if (!fileExists(path)) return;
      const buffer = new Uint8Array(await readFile(path));
      const ext = path.slice(path.lastIndexOf(".") + 1);
      expect(await adapter.readFormat(buffer, ext)).toStrictEqual(format);
    });
  }
});
