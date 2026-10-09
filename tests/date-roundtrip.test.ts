/**
 * @fileoverview Regression tests for GitHub #23 (taglib-bk7): full ISO DATE
 * strings (e.g. "1975-10-31") must survive read/write instead of being
 * truncated to the year.
 *
 * Cross-backend: the same assertions run against BOTH the WASI and Emscripten
 * backends. The bug was WASI-only; these tests lock in parity so the public
 * `properties()` contract behaves identically regardless of backend.
 */

import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vite-plus/test";
import { TagLib } from "../src/taglib.ts";
import { mergeTagUpdates } from "../src/utils/tag-mapping.ts";
import { readTags } from "../src/simple/index.ts";
import { FIXTURE_PATH } from "./shared-fixtures.ts";
import { HAS_EMSCRIPTEN, HAS_WASI } from "./backend-adapter.ts";

const FULL_DATE = "1975-10-31";
const EXPECTED_YEAR = 1975;
const FORMATS = ["mp3", "flac", "m4a"] as const;

type WasmType = "wasi" | "emscripten";

// Gate on the artifacts themselves. Forcing these suites to run in CI via
// GITHUB_ACTIONS would not make a missing artifact fail: TagLib.initialize
// ({ forceWasmType: "wasi" }) resolves the committed build/taglib-wasi.wasm
// (src/runtime/unified-loader/module-loading.ts), not the dist/wasi file HAS_WASI
// checks — so the disjunct could only turn a skip into a green run. A missing
// artifact is failed by tests/backend-registration.test.ts instead
// (independent review, 2026-09-17).
const BACKENDS: { kind: WasmType; available: boolean }[] = [
  { kind: "wasi", available: HAS_WASI },
  { kind: "emscripten", available: HAS_EMSCRIPTEN },
];

for (const { kind, available } of BACKENDS) {
  describe(
    `DATE full-string round-trip [${kind}]`,
    { skip: !available },
    () => {
      async function open(buffer: Uint8Array) {
        const taglib = await TagLib.initialize({ forceWasmType: kind });
        return await taglib.open(buffer);
      }

      for (const format of FORMATS) {
        it(`preserves full ISO date through setProperties/properties (${format})`, async () => {
          const src = new Uint8Array(await readFile(FIXTURE_PATH[format]));

          const f1 = await open(new Uint8Array(src));
          f1.setProperties({ ...f1.properties(), date: [FULL_DATE] });
          f1.save();
          const out = new Uint8Array(f1.getFileBuffer());
          f1.dispose();

          const f2 = await open(out);
          try {
            expect(f2.properties().date, `${format}: date truncated`)
              .toStrictEqual([FULL_DATE]);
            expect(f2.tag().year, `${format}: year mismatch`).toStrictEqual(
              EXPECTED_YEAR,
            );
          } finally {
            f2.dispose();
          }
        });

        it(`preserves full date when editing an unrelated tag (${format})`, async () => {
          const src = new Uint8Array(await readFile(FIXTURE_PATH[format]));

          const f1 = await open(new Uint8Array(src));
          f1.setProperties({ ...f1.properties(), date: [FULL_DATE] });
          f1.save();
          const withDate = new Uint8Array(f1.getFileBuffer());
          f1.dispose();

          const f2 = await open(withDate);
          f2.setProperties({ ...f2.properties(), artist: ["New Artist"] });
          f2.save();
          const edited = new Uint8Array(f2.getFileBuffer());
          f2.dispose();

          const f3 = await open(edited);
          try {
            expect(
              f3.properties().date,
              `${format}: date lost after unrelated edit`,
            ).toStrictEqual([FULL_DATE]);
            expect(f3.properties().artist, `${format}: artist not written`)
              .toStrictEqual(["New Artist"]);
          } finally {
            f3.dispose();
          }
        });
      }

      it("writes a full date via the TagInput.date field (mergeTagUpdates)", async () => {
        const src = new Uint8Array(await readFile(FIXTURE_PATH.mp3));

        const f1 = await open(new Uint8Array(src));
        mergeTagUpdates(f1, { date: FULL_DATE, artist: "Writer" });
        f1.save();
        const out = new Uint8Array(f1.getFileBuffer());
        f1.dispose();

        const f2 = await open(out);
        try {
          expect(f2.properties().date).toStrictEqual([FULL_DATE]);
          expect(f2.tag().year).toStrictEqual(EXPECTED_YEAR);
        } finally {
          f2.dispose();
        }
      });

      it("tag().setYear() overrides a previously-stored full date", async () => {
        const src = new Uint8Array(await readFile(FIXTURE_PATH.mp3));

        // Store a full ISO date first.
        const f1 = await open(new Uint8Array(src));
        f1.setProperties({ ...f1.properties(), date: [FULL_DATE] });
        f1.save();
        const withDate = new Uint8Array(f1.getFileBuffer());
        f1.dispose();

        // Then set the numeric year via the Tag API — it must win, not be
        // shadowed by the stale full-date string (cross-backend parity).
        const f2 = await open(withDate);
        f2.tag().setYear(2024);
        f2.save();
        const edited = new Uint8Array(f2.getFileBuffer());
        f2.dispose();

        const f3 = await open(edited);
        try {
          expect(f3.tag().year).toStrictEqual(2024);
          expect(f3.properties().date).toStrictEqual(["2024"]);
        } finally {
          f3.dispose();
        }
      });

      it("tag().setDate writes the full date and resyncs year in-memory (mp3)", async () => {
        const src = new Uint8Array(await readFile(FIXTURE_PATH.mp3));
        const f = await open(new Uint8Array(src));
        try {
          const t = f.tag();
          t.setDate(FULL_DATE);
          // The SAME in-memory tag() object must reflect both surfaces.
          expect(t.date, "date getter").toStrictEqual(FULL_DATE);
          expect(t.year, "year resynced from date").toStrictEqual(
            EXPECTED_YEAR,
          );
        } finally {
          f.dispose();
        }
      });

      it('tag().setDate("") clears both date and year (mp3)', async () => {
        const src = new Uint8Array(await readFile(FIXTURE_PATH.mp3));
        const f = await open(new Uint8Array(src));
        try {
          const t = f.tag();
          t.setDate(FULL_DATE);
          t.setDate(""); // coherent clear: same underlying tag, both precisions go away
          expect(t.date, "date cleared").toStrictEqual(undefined);
          expect(t.year, "year cleared").toStrictEqual(0);
        } finally {
          f.dispose();
        }
      });

      for (const format of FORMATS) {
        it(`tag().setDate survives save/reopen (${format})`, async () => {
          const src = new Uint8Array(await readFile(FIXTURE_PATH[format]));
          const f1 = await open(new Uint8Array(src));
          f1.tag().setDate(FULL_DATE);
          f1.save();
          const out = new Uint8Array(f1.getFileBuffer());
          f1.dispose();

          const f2 = await open(out);
          try {
            expect(f2.tag().date, `${format}: date lost on roundtrip`)
              .toStrictEqual(FULL_DATE);
            expect(f2.tag().year, `${format}: year lost on roundtrip`)
              .toStrictEqual(EXPECTED_YEAR);
          } finally {
            f2.dispose();
          }
        });
      }

      it("tag().setYear after setDate truncates date on roundtrip (mp3)", async () => {
        const src = new Uint8Array(await readFile(FIXTURE_PATH.mp3));
        const f1 = await open(new Uint8Array(src));
        const t = f1.tag();
        t.setDate(FULL_DATE);
        t.setYear(EXPECTED_YEAR); // last-setter-wins: truncate to the year
        f1.save();
        const out = new Uint8Array(f1.getFileBuffer());
        f1.dispose();

        const f2 = await open(out);
        try {
          expect(f2.tag().year).toStrictEqual(EXPECTED_YEAR);
          expect(f2.tag().date, "date should truncate to year").toStrictEqual(
            String(EXPECTED_YEAR),
          );
        } finally {
          f2.dispose();
        }
      });

      it("tag().date agrees with Simple API readTags().date (mp3)", async () => {
        const src = new Uint8Array(await readFile(FIXTURE_PATH.mp3));
        const f1 = await open(new Uint8Array(src));
        f1.tag().setDate(FULL_DATE);
        f1.save();
        const out = new Uint8Array(f1.getFileBuffer());
        f1.dispose();

        const f2 = await open(out);
        try {
          expect(f2.tag().date).toStrictEqual(FULL_DATE);
        } finally {
          f2.dispose();
        }
        // readTags uses the default backend (typically WASI), not necessarily `kind`;
        // both backends agree on this written value, so the cross-API check is valid.
        // Normalize string | string[] from the Simple API before comparing.
        const d = (await readTags(out)).date;
        expect(Array.isArray(d) ? d[0] : d, "Simple/Full date mismatch")
          .toStrictEqual(FULL_DATE);
      });
    },
  );
}
