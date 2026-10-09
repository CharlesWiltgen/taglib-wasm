import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { copyFile, readFile, rm } from "node:fs/promises";
import { cleanupTempFiles, createTempFile } from "./test-utils.ts";
import { TagLib } from "../src/taglib.ts";
import type { WasmModule } from "../src/wasm.ts";
import { FIXTURE_PATH } from "./shared-fixtures.ts";

let taglib: TagLib;

afterAll(cleanupTempFiles);

beforeAll(async () => {
  taglib = await TagLib.initialize({ forceWasmType: "emscripten" });
});

describe("TagLib.edit() with buffer input", () => {
  it("should return modified Uint8Array when editing a buffer", async () => {
    const original = new Uint8Array(await readFile(FIXTURE_PATH.mp3));

    const result = await taglib.edit(
      new Uint8Array(original),
      (file) => {
        file.tag().setTitle("Buffer Edit Test").setArtist("Test Artist");
      },
    );

    expect(result).toBeInstanceOf(Uint8Array);
  });

  it("should return modified buffer with ArrayBuffer input", async () => {
    const original = new Uint8Array(await readFile(FIXTURE_PATH.flac));

    const result = await taglib.edit(
      original.buffer,
      (file) => {
        file.tag().setAlbum("New Album");
      },
    );

    expect(result).toBeInstanceOf(Uint8Array);
  });

  it("should reflect tag changes in the returned buffer", async () => {
    const original = new Uint8Array(await readFile(FIXTURE_PATH.ogg));

    const modified = await taglib.edit(
      new Uint8Array(original),
      (file) => {
        file.tag().setTitle("Roundtrip Test").setYear(2025);
      },
    );

    const verifyFile = await taglib.open(modified);
    try {
      expect({ title: verifyFile.tag().title, year: verifyFile.tag().year })
        .toStrictEqual({ title: "Roundtrip Test", year: 2025 });
    } finally {
      verifyFile.dispose();
    }
  });
});

describe("TagLib.edit() with partial tag updates", () => {
  it("should preserve untouched fields when updating one field", async () => {
    const original = new Uint8Array(await readFile(FIXTURE_PATH.mp3));

    const modified = await taglib.edit(
      new Uint8Array(original),
      (file) => {
        file.tag()
          .setTitle("Original")
          .setArtist("Original Artist")
          .setAlbum("Original Album");
      },
    );

    const remodified = await taglib.edit(
      modified,
      (file) => {
        file.tag().setTitle("Only Title Changed");
      },
    );

    const verifyFile = await taglib.open(remodified);
    try {
      const tag = verifyFile.tag();
      expect({ title: tag.title, artist: tag.artist, album: tag.album })
        .toStrictEqual({
          title: "Only Title Changed",
          artist: "Original Artist",
          album: "Original Album",
        });
    } finally {
      verifyFile.dispose();
    }
  });

  it("should handle year and track as numeric fields", async () => {
    const original = new Uint8Array(await readFile(FIXTURE_PATH.flac));

    const modified = await taglib.edit(
      new Uint8Array(original),
      (file) => {
        file.tag().setYear(1999).setTrack(7);
      },
    );

    const verifyFile = await taglib.open(modified);
    try {
      expect({ year: verifyFile.tag().year, track: verifyFile.tag().track })
        .toStrictEqual({ year: 1999, track: 7 });
    } finally {
      verifyFile.dispose();
    }
  });
});

describe("updateFile with extended fields", () => {
  it("should write albumArtist through updateFile", async () => {
    const tmpFile = await createTempFile(".flac");
    try {
      await copyFile(FIXTURE_PATH.flac, tmpFile);

      await taglib.updateFile(tmpFile, {
        title: "Test Title",
        albumArtist: "Various Artists",
        composer: "Test Composer",
      });

      const verifyFile = await taglib.open(tmpFile);
      try {
        expect(verifyFile.tag().title).toStrictEqual("Test Title");
        expect(verifyFile.getProperty("albumArtist")?.[0]).toStrictEqual(
          "Various Artists",
        );
        expect(verifyFile.getProperty("composer")?.[0]).toStrictEqual(
          "Test Composer",
        );
      } finally {
        verifyFile.dispose();
      }
    } finally {
      await rm(tmpFile);
    }
  });

  it("should write numeric extended fields through updateFile", async () => {
    const tmpFile = await createTempFile(".flac");
    try {
      await copyFile(FIXTURE_PATH.flac, tmpFile);

      await taglib.updateFile(tmpFile, {
        discNumber: 2,
        totalTracks: 12,
        bpm: 128,
        compilation: true,
      });

      const verifyFile = await taglib.open(tmpFile);
      try {
        expect(verifyFile.getProperty("discNumber")?.[0]).toStrictEqual("2");
        expect(verifyFile.getProperty("TRACKTOTAL")?.[0]).toStrictEqual("12");
        expect(verifyFile.getProperty("bpm")?.[0]).toStrictEqual("128");
        expect(verifyFile.getProperty("COMPILATION")?.[0]).toStrictEqual("1");
      } finally {
        verifyFile.dispose();
      }
    } finally {
      await rm(tmpFile);
    }
  });
});

describe("TagLib.version()", () => {
  it("should return package version with TagLib version from Wasm", () => {
    const version = taglib.version();
    expect(
      /^\d+\.\d+\.\d+\S* \(TagLib \d+\.\d+\.\d+\)$/.test(version),
      `Version should match format 'X.Y.Z (TagLib X.Y.Z)', got: ${version}`,
    ).toBeTruthy();
  });

  it("should use deno.json version as package version", async () => {
    const denoJson = JSON.parse(
      await readFile(new URL("../deno.json", import.meta.url), "utf8"),
    );
    const version = taglib.version();
    expect(
      version.startsWith(denoJson.version),
      `Version should start with deno.json version '${denoJson.version}', got: ${version}`,
    ).toBeTruthy();
  });

  it("should return 'unknown' TagLib version when module has no version method", () => {
    const mockModule = {} as WasmModule;
    const instance = new TagLib(mockModule);
    expect(
      instance.version().endsWith("(TagLib unknown)"),
      `Expected version to end with '(TagLib unknown)', got: ${instance.version()}`,
    ).toBeTruthy();
  });
});
