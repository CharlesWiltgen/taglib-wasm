/**
 * @fileoverview Parameterized audio properties tests across both backends.
 */

import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { expectDefined } from "./_assert-helpers.ts";
import {
  type BackendAdapter,
  extForFormat,
  forEachBackend,
  readFixture,
} from "./backend-adapter.ts";
import {
  EXPECTED_AUDIO_PROPS,
  type Format,
  FORMATS,
} from "./shared-fixtures.ts";

forEachBackend("Audio Properties", (adapter: BackendAdapter) => {
  beforeAll(async () => {
    await adapter.init();
  });

  afterAll(async () => {
    await adapter.dispose();
  });

  for (const format of FORMATS) {
    it(`should read audio properties (${format})`, async () => {
      const buffer = await readFixture(format);
      const props = await adapter.readAudioProperties(
        buffer,
        extForFormat(format),
      );
      const expected = EXPECTED_AUDIO_PROPS[format];

      expectDefined(props, `${format}: no audio properties`);
      expect(
        props.sampleRate === expected.sampleRate,
        `${format}: sampleRate ${props.sampleRate} !== ${expected.sampleRate}`,
      ).toBeTruthy();
      expect(
        props.channels === expected.channels,
        `${format}: channels ${props.channels} !== ${expected.channels}`,
      ).toBeTruthy();
      expect(
        props.bitrate >= expected.bitrateMin &&
          props.bitrate <= expected.bitrateMax,
        `${format}: bitrate ${props.bitrate} out of range [${expected.bitrateMin}, ${expected.bitrateMax}]`,
      ).toBeTruthy();
      expect(
        props.duration >= expected.lengthMin &&
          props.duration <= expected.lengthMax,
        `${format}: duration ${props.duration} out of range [${expected.lengthMin}, ${expected.lengthMax}]`,
      ).toBeTruthy();
    });
  }

  it("should return positive integers for all properties", async () => {
    const buffer = await readFixture("mp3");
    const props = await adapter.readAudioProperties(buffer, "mp3");

    expect(props.duration > 0, "duration should be positive").toBeTruthy();
    expect(props.bitrate > 0, "bitrate should be positive").toBeTruthy();
    expect(props.sampleRate > 0, "sampleRate should be positive").toBeTruthy();
    expect(props.channels > 0, "channels should be positive").toBeTruthy();
  });
});
