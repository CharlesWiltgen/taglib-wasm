/**
 * @fileoverview Cross-backend integration tests for BWF `bext` + iXML on WAV
 * and FLAC. Fixtures: tests/test-files/{wav,flac}/bext-ixml.* (regenerate with
 * tests/test-files/_gen/make-bwf-fixtures.sh --regen).
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { expectThrows } from "./_assert-helpers.ts";
import { TagLib } from "../src/taglib.ts";
import { UnsupportedFormatError } from "../src/errors.ts";
import type { BroadcastAudioExtension } from "../index.ts";

const FILES = {
  wav: join("tests", "test-files", "wav", "bext-ixml.wav"),
  flac: join("tests", "test-files", "flac", "bext-ixml.flac"),
  plainWav: join("tests", "test-files", "wav", "kiss-snippet.wav"),
  plainFlac: join("tests", "test-files", "flac", "kiss-snippet.flac"),
  mp3: join("tests", "test-files", "mp3", "kiss-snippet.mp3"),
} as const;
const BACKENDS = ["wasi", "emscripten"] as const;

const SAMPLE_BEXT: BroadcastAudioExtension = {
  description: "Round trip",
  originator: "test",
  originatorReference: "RT-1",
  originationDate: "2026-05-12",
  originationTime: "09:00:00",
  timeReferenceSamples: 123456n,
  version: 2,
  umid: "ab".repeat(64),
  loudnessValueDb: -16.5,
  loudnessRangeDb: 8.25,
  maxTruePeakLevelDbtp: -1.5,
  maxMomentaryLoudnessDb: -14,
  maxShortTermLoudnessDb: -15,
  codingHistory: "A=PCM,F=44100\r\n",
};

async function open(backend: typeof BACKENDS[number], path: string) {
  const taglib = await TagLib.initialize({ forceWasmType: backend });
  return taglib.open(new Uint8Array(await readFile(path)));
}

async function reopened(
  backend: typeof BACKENDS[number],
  path: string,
  mutate: (f: Awaited<ReturnType<typeof open>>) => void,
) {
  const taglib = await TagLib.initialize({ forceWasmType: backend });
  const f = await taglib.open(new Uint8Array(await readFile(path)));
  let out: Uint8Array;
  try {
    mutate(f);
    f.save();
    out = f.getFileBuffer();
  } finally {
    f.dispose();
  }
  return taglib.open(out);
}

const plainOf = (fmt: "wav" | "flac") =>
  fmt === "wav" ? FILES.plainWav : FILES.plainFlac;

for (const backend of BACKENDS) {
  for (const fmt of ["wav", "flac"] as const) {
    const F = fmt.toUpperCase();

    it(`[${backend}] ${F}: reads bext + iXML from a fixture`, async () => {
      const f = await open(backend, FILES[fmt]);
      try {
        const b = f.getBext()!;
        expect(b.description).toStrictEqual("Test BWF");
        expect(b.version).toStrictEqual(2);
        expect(b.loudnessValueDb).toStrictEqual(-14);
        expect(typeof f.getIxml()).toStrictEqual("string");
        expect((f.getIxml() ?? "").includes("IXML_VERSION")).toStrictEqual(
          true,
        );
        expect((f.getBextData()?.length ?? 0) >= 602).toStrictEqual(true);
      } finally {
        f.dispose();
      }
    });

    it(`[${backend}] ${F}: setBext round-trips through save`, async () => {
      const f = await reopened(
        backend,
        plainOf(fmt),
        (x) => x.setBext(SAMPLE_BEXT),
      );
      try {
        expect(f.getBext()).toStrictEqual(SAMPLE_BEXT);
      } finally {
        f.dispose();
      }
    });

    it(`[${backend}] ${F}: setBextData(null) removes the chunk`, async () => {
      const f = await reopened(backend, FILES[fmt], (x) => x.setBextData(null));
      try {
        expect(f.getBextData()).toStrictEqual(undefined);
        expect(f.getBext()).toStrictEqual(undefined);
      } finally {
        f.dispose();
      }
    });

    it(`[${backend}] ${F}: setIxml(null) removes the chunk`, async () => {
      const f = await reopened(backend, FILES[fmt], (x) => x.setIxml(null));
      try {
        expect(f.getIxml()).toStrictEqual(undefined);
      } finally {
        f.dispose();
      }
    });

    it(`[${backend}] ${F}: a plain file has no bext/iXML`, async () => {
      const f = await open(backend, plainOf(fmt));
      try {
        expect(f.getBext()).toStrictEqual(undefined);
        expect(f.getBextData()).toStrictEqual(undefined);
        expect(f.getIxml()).toStrictEqual(undefined);
      } finally {
        f.dispose();
      }
    });

    it(`[${backend}] ${F}: write→read→write yields identical bextData`, async () => {
      const taglib = await TagLib.initialize({ forceWasmType: backend });
      const f1 = await taglib.open(
        new Uint8Array(await readFile(plainOf(fmt))),
      );
      f1.setBext(SAMPLE_BEXT);
      f1.save();
      const buf1 = f1.getFileBuffer();
      f1.dispose();
      const f2 = await taglib.open(buf1);
      const data2 = f2.getBextData()!;
      f2.setBextData(data2);
      f2.save();
      const buf2 = f2.getFileBuffer();
      f2.dispose();
      const f3 = await taglib.open(buf2);
      try {
        expect(f3.getBextData()).toStrictEqual(data2);
      } finally {
        f3.dispose();
      }
    });

    it(`[${backend}] ${F}: reading bext does not leak into properties()`, async () => {
      const f = await open(backend, FILES[fmt]);
      try {
        const props = f.properties();
        expect("bextData" in props).toStrictEqual(false);
        expect("ixml" in props).toStrictEqual(false);
        expect("BEXTDATA" in props).toStrictEqual(false);
        expect("IXML" in props).toStrictEqual(false);
      } finally {
        f.dispose();
      }
    });
  }

  it(`[${backend}] setBext/setBextData/setIxml throw on MP3`, async () => {
    const f = await open(backend, FILES.mp3);
    try {
      expectThrows(() => f.setBext(SAMPLE_BEXT), UnsupportedFormatError);
      expectThrows(
        () => f.setBextData(new Uint8Array(602)),
        UnsupportedFormatError,
      );
      expectThrows(() => f.setIxml("<x/>"), UnsupportedFormatError);
    } finally {
      f.dispose();
    }
  });
}
