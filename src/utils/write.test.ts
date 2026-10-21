import { afterEach, describe, expect, it } from "vite-plus/test";
import { EnvironmentError, FileOperationError } from "../errors/classes.ts";
import {
  _resetPlatformIO,
  _setPlatformIOForTesting,
  type PlatformIO,
} from "../runtime/platform-io.ts";
import { writeFileData } from "./write.ts";

function ioWithWrite(writeFile: PlatformIO["writeFile"]): PlatformIO {
  return {
    readFile: async () => new Uint8Array(),
    writeFile,
    stat: async () => ({ size: 0 }),
    async *readDir() {},
  };
}

afterEach(() => {
  _resetPlatformIO();
});

describe("writeFileData", () => {
  it("wraps a provider failure in FileOperationError", async () => {
    _setPlatformIOForTesting(
      ioWithWrite(async () => {
        throw new Error("disk full");
      }),
    );

    let thrown: unknown;
    try {
      await writeFileData("/music/song.mp3", new Uint8Array([1]));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(FileOperationError);
    if (!(thrown instanceof FileOperationError)) return;
    expect(thrown.operation).toStrictEqual("write");
    expect(thrown.path).toStrictEqual("/music/song.mp3");
    expect(thrown.message.includes("disk full")).toStrictEqual(true);
  });

  it("passes EnvironmentError through unchanged", async () => {
    const passthrough = new EnvironmentError(
      "browser",
      "does not support filesystem operations",
      "filesystem access",
    );
    _setPlatformIOForTesting(
      ioWithWrite(async () => {
        throw passthrough;
      }),
    );

    let thrown: unknown;
    try {
      await writeFileData("/music/song.mp3", new Uint8Array([1]));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(passthrough);
  });
});
