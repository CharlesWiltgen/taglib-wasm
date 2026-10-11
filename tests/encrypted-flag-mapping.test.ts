/**
 * taglib-rcz: `isEncrypted` must not be gated on a hardcoded MP4/ASF container
 * list. The C++ sides emit the flag for whichever formats carry it, so the TS
 * adapters pass a reported value through for any container — a format the C++
 * populates later must not be silently dropped here. MP4/ASF keep defaulting
 * to `false` when the parse did not set the flag, because the typed surface
 * promises those two formats the field.
 *
 * Both mappings are pure TS (the WASI snapshot mapper and the Embind handle
 * wrapper over a fake properties object), so the same scenarios run on both
 * backends without a wasm module and any divergence fails the test.
 */

import { describe, expect, it } from "vite-plus/test";
import { getAudioProperties } from "../src/runtime/wasi-adapter/audio-properties.ts";
import {
  type EmbindFileHandle,
  wrapEmbindHandle,
} from "../src/taglib/embind-adapter.ts";
import type { AudioProperties } from "../src/types.ts";

function wasiMapping(
  containerFormat: string,
  encrypted: boolean | undefined,
): AudioProperties | null {
  return getAudioProperties({
    length: 1,
    lengthMs: 1000,
    bitrate: 128,
    sampleRate: 44100,
    channels: 2,
    bitsPerSample: 16,
    codec: "MP3",
    containerFormat,
    isLossless: false,
    ...(encrypted !== undefined ? { isEncrypted: encrypted } : {}),
  });
}

function embindMapping(
  containerFormat: string,
  encrypted: boolean,
): AudioProperties | null {
  const pw = {
    containerFormat: () => containerFormat,
    codec: () => "MP3",
    mpegVersion: () => 0,
    formatVersion: () => 0,
    bitrateMode: () => "",
    lengthInSeconds: () => 1,
    lengthInMilliseconds: () => 1000,
    bitrate: () => 128,
    sampleRate: () => 44100,
    channels: () => 2,
    bitsPerSample: () => 16,
    isLossless: () => false,
    isEncrypted: () => encrypted,
    outputGainDb: () => 0,
  };
  const fake = {
    getAudioProperties: () => pw,
  } as unknown as EmbindFileHandle;
  return wrapEmbindHandle(fake).getAudioProperties();
}

/** The field as a consumer sees it: `undefined` when the key is absent. */
function visible(props: AudioProperties | null): boolean | undefined {
  return props && "isEncrypted" in props ? props.isEncrypted : undefined;
}

const scenarios: Array<{
  name: string;
  containerFormat: string;
  snapshot: boolean | undefined;
  wrapper: boolean;
  expected: boolean | undefined;
}> = [
  {
    name: "MP4 with the flag set",
    containerFormat: "MP4",
    snapshot: true,
    wrapper: true,
    expected: true,
  },
  {
    name: "MP4 without the flag defaults to false",
    containerFormat: "MP4",
    snapshot: undefined,
    wrapper: false,
    expected: false,
  },
  {
    name: "ASF without the flag defaults to false",
    containerFormat: "ASF",
    snapshot: undefined,
    wrapper: false,
    expected: false,
  },
  {
    name: "WAV reporting the flag is passed through (no container gate)",
    containerFormat: "WAV",
    snapshot: true,
    wrapper: true,
    expected: true,
  },
  {
    name: "WAV without the flag stays absent (never fabricated as false)",
    containerFormat: "WAV",
    snapshot: undefined,
    wrapper: false,
    expected: undefined,
  },
  {
    name: "WAV with an explicit false is dropped (both adapters omit it)",
    containerFormat: "WAV",
    snapshot: false,
    wrapper: false,
    expected: undefined,
  },
];

describe("isEncrypted mapping parity (taglib-rcz)", () => {
  for (const scenario of scenarios) {
    it(`${scenario.name} — both adapters agree`, () => {
      const wasi = visible(
        wasiMapping(scenario.containerFormat, scenario.snapshot),
      );
      const embind = visible(
        embindMapping(scenario.containerFormat, scenario.wrapper),
      );

      expect(wasi).toStrictEqual(scenario.expected);
      expect(embind).toStrictEqual(scenario.expected);
      expect(wasi).toStrictEqual(embind);
    });
  }
});
