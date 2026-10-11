/**
 * @fileoverview WAV codec labels: the three-way mapping (PCM / IEEEFloat /
 * WAV) and the lossless flag that follows it must be identical on both
 * backends.
 *
 * The WASI shim hardcoded codec "PCM" plus lossless for every WAV
 * (src/capi/taglib_audio_props.cpp), so a float WAV was indistinguishable from
 * integer PCM and an A-law WAV claimed lossless; the Emscripten binding maps
 * the RIFF format code (1 -> PCM, 3 -> IEEEFloat, else WAV) and derives
 * lossless from the codec name (build/taglib_embind.cpp). This landed with the
 * WASI rebuild (taglib-e2cg).
 *
 * The float oracle is TagLib's own test data (float64.wav); alaw.wav covers
 * the default branch and the repo's kiss-snippet.wav the PCM branch.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { forEachBackend } from "./backend-adapter.ts";

/** One case per branch of the mapping, all sharing the WAV container. */
const CASES = [
  {
    file: join("tests", "test-files", "wav", "kiss-snippet.wav"),
    codec: "PCM",
    isLossless: true,
  },
  {
    file: join("lib", "taglib", "tests", "data", "float64.wav"),
    codec: "IEEEFloat",
    isLossless: true,
  },
  {
    file: join("lib", "taglib", "tests", "data", "alaw.wav"),
    codec: "WAV",
    isLossless: false,
  },
] as const;

forEachBackend("WAV codec labels", (adapter) => {
  beforeAll(async () => {
    await adapter.init();
  });

  afterAll(async () => {
    await adapter.dispose();
  });

  for (const { file, codec, isLossless } of CASES) {
    it(`reports ${codec} for ${file}`, async () => {
      const buffer = new Uint8Array(await readFile(file));

      const props = await adapter.readExtendedAudioProperties(buffer, "wav");
      expect(props.containerFormat).toStrictEqual("WAV");
      expect(props.codec).toStrictEqual(codec);
      expect(props.isLossless).toStrictEqual(isLossless);
    });
  }
});
