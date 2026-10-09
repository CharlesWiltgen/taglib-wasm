/**
 * @fileoverview Consolidated test suite for TagLib-Wasm
 * Combines format testing, API testing, and edge cases with proper Vitest assertions
 *
 * Run with: npx vp test tests/taglib.test.ts
 * Or: npm test
 */

import { afterAll, describe, expect, it } from "vite-plus/test";
import { readFile, rm, writeFile } from "node:fs/promises";
import { expectDefined } from "./_assert-helpers.ts";
import { cleanupTempFiles, createTempFile } from "./test-utils.ts";
import { TagLib } from "../src/taglib.ts";
import type { AudioFile } from "../src/taglib.ts";
import {
  applyTags,
  isValidAudioFile,
  readFormat,
  readProperties,
  readTags,
  setBufferMode,
} from "../src/simple/index.ts";
import { EXPECTED_FORMATS, TEST_FILES } from "./test-utils.ts";

// Force Emscripten backend for Simple API calls
setBufferMode(true);

afterAll(cleanupTempFiles);

describe("Initialization", () => {
  it("TagLib: Initialization", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });
    expectDefined(taglib, "TagLib instance should exist after init");
  });
});

describe("Full API", () => {
  it("Basic Operations", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });
    expectDefined(taglib, "TagLib instance should exist");

    const version = taglib.version();
    expect(
      /^\d+\.\d+\.\d+\S* \(TagLib \d+\.\d+\.\d+\)$/.test(version),
      `Version should match format 'X.Y.Z (TagLib X.Y.Z)', got: ${version}`,
    ).toBeTruthy();
  });

  it("Format Detection", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });

    for (const [format, path] of Object.entries(TEST_FILES)) {
      const audioData = new Uint8Array(await readFile(path));
      const file = await taglib.open(audioData.buffer);

      expect(file.isValid(), `${format} file should be valid`).toStrictEqual(
        true,
      );
      expect(
        file.getFormat(),
        `Should detect ${format} format correctly`,
      ).toStrictEqual(
        EXPECTED_FORMATS[format as keyof typeof EXPECTED_FORMATS],
      );

      file.dispose();
    }
  });

  it("Audio Properties", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });
    const audioData = new Uint8Array(await readFile(TEST_FILES.mp3));
    const file = await taglib.open(audioData.buffer);

    const props = file.audioProperties();
    expectDefined(props, "Should have audio properties");
    expect(props.duration > 0, "Duration should be positive").toBeTruthy();
    expect(props.bitrate > 0, "Bitrate should be positive").toBeTruthy();
    expect(props.sampleRate > 0, "Sample rate should be positive").toBeTruthy();
    expect(props.channels > 0, "Channels should be positive").toBeTruthy();

    file.dispose();
  });

  it("Tag Reading", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });
    const audioData = new Uint8Array(await readFile(TEST_FILES.mp3));
    const file = await taglib.open(audioData.buffer);

    const tags = file.tag();
    expectDefined(tags, "Should have tags");
    expect(typeof tags.title, "Title should be string").toStrictEqual("string");
    expect(typeof tags.artist, "Artist should be string").toStrictEqual(
      "string",
    );
    expect(typeof tags.album, "Album should be string").toStrictEqual("string");
    expect(typeof tags.year, "Year should be number").toStrictEqual("number");
    expect(typeof tags.track, "Track should be number").toStrictEqual("number");
    expect(typeof tags.genre, "Genre should be string").toStrictEqual("string");
    expect(typeof tags.comment, "Comment should be string").toStrictEqual(
      "string",
    );

    file.dispose();
  });

  it("Tag Writing", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });
    const audioData = new Uint8Array(await readFile(TEST_FILES.mp3));
    const file = await taglib.open(audioData.buffer);

    const tag = file.tag();
    tag.setTitle("Test Title");
    tag.setArtist("Test Artist");
    tag.setAlbum("Test Album");
    tag.setYear(2024);
    tag.setTrack(1);
    tag.setGenre("Test Genre");
    tag.setComment("Test Comment");

    const updatedTags = file.tag();
    expect(updatedTags.title, "Title should be updated").toStrictEqual(
      "Test Title",
    );
    expect(updatedTags.artist, "Artist should be updated").toStrictEqual(
      "Test Artist",
    );
    expect(updatedTags.album, "Album should be updated").toStrictEqual(
      "Test Album",
    );
    expect(updatedTags.year, "Year should be updated").toStrictEqual(2024);
    expect(updatedTags.track, "Track should be updated").toStrictEqual(1);
    expect(updatedTags.genre, "Genre should be updated").toStrictEqual(
      "Test Genre",
    );
    expect(updatedTags.comment, "Comment should be updated").toStrictEqual(
      "Test Comment",
    );

    file.dispose();
  });

  it("Extended Tag Support", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });
    const audioData = new Uint8Array(await readFile(TEST_FILES.mp3));
    const file = await taglib.open(audioData.buffer);

    const tags = file.tag();
    expectDefined(tags, "Should have tags object");

    file.dispose();
  });

  it("Memory Management", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });

    for (let i = 0; i < 10; i++) {
      const audioData = new Uint8Array(await readFile(TEST_FILES.mp3));
      const file = await taglib.open(audioData.buffer);
      expect(file.isValid(), `File ${i} should be valid`).toBeTruthy();
      file.dispose();
    }

    expect(true, "Memory management test passed").toBeTruthy();
  });

  it("Symbol.dispose enables using statement", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });
    const audioData = new Uint8Array(await readFile(TEST_FILES.mp3));

    let fileRef: AudioFile | null = null;
    {
      using file = await taglib.open(audioData.buffer);
      expect(
        file.isValid(),
        "File should be valid inside using block",
      ).toBeTruthy();
      fileRef = file;
    }
    let threw = false;
    try {
      fileRef!.isValid();
    } catch {
      threw = true;
    }
    expect(
      threw,
      "Calling isValid() on disposed file should throw",
    ).toBeTruthy();
  });

  it("Double disposal is safe", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });
    const audioData = new Uint8Array(await readFile(TEST_FILES.mp3));

    {
      using file = await taglib.open(audioData.buffer);
      expect(file.isValid(), "File should be valid").toBeTruthy();
      file.dispose();
    }
  });

  it("Symbol.dispose cleans up on exception", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });
    const audioData = new Uint8Array(await readFile(TEST_FILES.mp3));

    let fileRef: AudioFile | null = null;
    try {
      using file = await taglib.open(audioData.buffer);
      fileRef = file;
      throw new Error("Simulated error");
    } catch {
      // Expected
    }
    let threw = false;
    try {
      fileRef!.isValid();
    } catch {
      threw = true;
    }
    expect(threw, "File should be disposed after exception").toBeTruthy();
  });
});

describe("Simple API", () => {
  it("File Validation", async () => {
    for (const [format, path] of Object.entries(TEST_FILES)) {
      const isValid = await isValidAudioFile(path);
      expect(isValid, `${format} file should be valid`).toStrictEqual(true);
    }

    const isValid = await isValidAudioFile("./package.json");
    expect(isValid, "Non-audio file should be invalid").toStrictEqual(false);
  });

  it("Format Detection", async () => {
    for (const [format, path] of Object.entries(TEST_FILES)) {
      const detectedFormat = await readFormat(path);
      expect(
        detectedFormat,
        `Should detect ${format} format correctly`,
      ).toStrictEqual(
        EXPECTED_FORMATS[format as keyof typeof EXPECTED_FORMATS],
      );
    }
  });

  it("Tag Reading", async () => {
    const tags = await readTags(TEST_FILES.mp3);
    expectDefined(tags, "Should return tags object");
    expect(Array.isArray(tags.title), "Title should be string[]").toBeTruthy();
    expect(
      Array.isArray(tags.artist),
      "Artist should be string[]",
    ).toBeTruthy();
    expect(Array.isArray(tags.album), "Album should be string[]").toBeTruthy();
    expect(typeof tags.year, "Year should be number").toStrictEqual("number");
    expect(typeof tags.track, "Track should be number").toStrictEqual("number");
    expect(Array.isArray(tags.genre), "Genre should be string[]").toBeTruthy();
    expect(
      tags.comment === undefined || Array.isArray(tags.comment),
      "Comment should be string[] or undefined",
    ).toBeTruthy();
  });

  it("Tag Writing", async () => {
    const modifiedBuffer = await applyTags(TEST_FILES.mp3, {
      title: "Simple API Test",
      artist: "Test Suite",
      album: "Test Album",
      year: 2024,
      track: 5,
      genre: "Electronic",
      comment: "Modified by Simple API",
    });

    expect(
      modifiedBuffer.length > 0,
      "Modified buffer should have content",
    ).toBeTruthy();
    expect(modifiedBuffer.length > 0, "Should return a buffer").toBeTruthy();
  });

  it("Audio Properties", async () => {
    const props = await readProperties(TEST_FILES.mp3);
    expectDefined(props, "Should return properties");
    expect(props.duration > 0, "Duration should be positive").toBeTruthy();
    expect(props.bitrate > 0, "Bitrate should be positive").toBeTruthy();
    expect(props.sampleRate > 0, "Sample rate should be positive").toBeTruthy();
    expect(props.channels > 0, "Channels should be positive").toBeTruthy();
  });

  it("Buffer Input", async () => {
    const tagsFromPath = await readTags(TEST_FILES.mp3);
    expectDefined(tagsFromPath, "Should read tags from path");

    const buffer = new Uint8Array(await readFile(TEST_FILES.mp3));
    const tagsFromBuffer = await readTags(buffer);
    expectDefined(tagsFromBuffer, "Should read tags from buffer");

    expect(
      tagsFromPath.genre,
      "Genre should match between path and buffer",
    ).toStrictEqual(tagsFromBuffer.genre);
  });
});

describe("Error Handling", () => {
  it("Non-existent File", async () => {
    try {
      await readTags("non-existent-file.mp3");
      expect(false, "Should have thrown an error").toBeTruthy();
    } catch (error) {
      if (!(error instanceof Error)) throw new Error("Should throw Error");
      expect(
        error.message.includes("No such file") ||
          error.message.includes("ENOENT") ||
          error.message.includes("cannot find the file"),
        "Error should indicate file not found",
      ).toBeTruthy();
    }
  });

  it("Invalid Audio Data", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });
    const invalidData = new Uint8Array([0, 1, 2, 3, 4, 5]);

    try {
      const file = await taglib.open(invalidData.buffer);
      expect(file.isValid(), "Invalid data should not be valid").toStrictEqual(
        false,
      );
      file.dispose();
    } catch (error) {
      if (!(error instanceof Error)) {
        throw new Error("Should throw Error for invalid data");
      }
      expect(
        error.message.includes("Failed to load"),
        "Error should indicate load failure",
      ).toBeTruthy();
    }
  });

  it("Empty Buffer", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });
    const emptyData = new Uint8Array(0);

    try {
      const file = await taglib.open(emptyData.buffer);
      expect(file.isValid(), "Empty buffer should not be valid").toStrictEqual(
        false,
      );
      file.dispose();
    } catch (error) {
      if (!(error instanceof Error)) {
        throw new Error("Should throw Error for empty buffer");
      }
      expect(
        error.message.includes("Failed to load"),
        "Error should indicate load failure",
      ).toBeTruthy();
    }
  });
});

describe("Performance", () => {
  it("Format Processing Speed", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });
    const results: Record<string, number> = {};

    for (const [format, path] of Object.entries(TEST_FILES)) {
      const start = performance.now();
      const audioData = new Uint8Array(await readFile(path));
      const file = await taglib.open(audioData.buffer);

      file.tag();
      file.audioProperties();
      file.dispose();

      results[format] = performance.now() - start;
    }

    console.log("Format processing times:", results);

    const totalMs = Object.values(results).reduce((a, b) => a + b, 0);
    expect(
      totalMs < 5000,
      `All formats should process in under 5s. Total: ${totalMs}ms`,
    ).toBeTruthy();
  });

  it("API Comparison", async () => {
    const audioData = new Uint8Array(await readFile(TEST_FILES.mp3));

    const coreStart = performance.now();
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });
    const file = await taglib.open(audioData.buffer);
    file.tag();
    file.dispose();
    const coreTime = performance.now() - coreStart;

    const simpleStart = performance.now();
    await readTags(TEST_FILES.mp3);
    const simpleTime = performance.now() - simpleStart;

    console.log(`Full API: ${coreTime.toFixed(2)}ms`);
    console.log(`Simple API: ${simpleTime.toFixed(2)}ms`);

    expect(coreTime < 1000, "Full API should be fast").toBeTruthy();
    expect(simpleTime < 1000, "Simple API should be fast").toBeTruthy();
  });
});

describe("Format Tests", () => {
  it("File Headers", async () => {
    const expectedHeaders: Record<string, string> = {
      wav: "52 49 46 46", // RIFF
      mp3: "ff fb", // MP3 sync word (may also be ID3)
      flac: "66 4c 61 43", // fLaC
      ogg: "4f 67 67 53", // OggS
      m4a: "00 00 00", // MP4/M4A (variable)
      mka: "1a 45 df a3", // EBML (Matroska/WebM)
      mkv: "1a 45 df a3", // EBML (Matroska/WebM)
      webm: "1a 45 df a3", // EBML (Matroska/WebM)
    };

    for (const [format, path] of Object.entries(TEST_FILES)) {
      const audioData = new Uint8Array(await readFile(path));
      const header = Array.from(audioData.slice(0, 4))
        .map((b: number) => b.toString(16).padStart(2, "0"))
        .join(" ");

      if (format === "mp3") {
        expect(
          header.startsWith("ff fb") || header.startsWith("49 44 33"),
          `${format} should have valid header`,
        ).toBeTruthy();
      } else if (format === "m4a") {
        expect(
          audioData.length > 0,
          `${format} should have content`,
        ).toBeTruthy();
      } else {
        expect(
          header.startsWith(expectedHeaders[format]),
          `${format} should have expected header: ${
            expectedHeaders[format]
          }, got ${header}`,
        ).toBeTruthy();
      }
    }
  });

  it("Systematic All Formats", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });
    const results: Record<string, boolean> = {};

    console.log("\n🎵 Systematic Format Testing");
    console.log("=".repeat(50));

    for (const [format, path] of Object.entries(TEST_FILES)) {
      console.log(`\n🔍 Testing ${format.toUpperCase()} format...`);

      try {
        const audioData = new Uint8Array(await readFile(path));
        console.log(`📊 File size: ${audioData.length} bytes`);

        const file = await taglib.open(audioData.buffer);

        if (file.isValid()) {
          console.log(`✅ SUCCESS: ${format} loaded successfully`);

          const detectedFormat = file.getFormat();
          const props = file.audioProperties();
          const tags = file.tag();

          console.log(`📄 Format: ${detectedFormat}`);
          console.log(
            `🎧 Properties: ${props?.duration ?? 0}s, ${
              props?.bitrate ?? 0
            }kbps, ${props?.sampleRate ?? 0}Hz`,
          );
          console.log(
            `🏷️  Tags: "${tags.title || "(empty)"}" by ${
              tags.artist || "(empty)"
            }`,
          );

          results[format] = true;
          file.dispose();
        } else {
          console.log(`❌ FAILED: ${format} is not valid`);
          results[format] = false;
        }
      } catch (error) {
        console.log(`❌ ERROR: ${(error as Error).message}`);
        results[format] = false;
      }
    }

    console.log("\n" + "=".repeat(50));
    console.log("📋 Test Results Summary:");

    let passedTests = 0;
    const totalTests = Object.keys(results).length;

    for (const [format, success] of Object.entries(results)) {
      if (success) passedTests++;
      const status = success ? "✅ PASS" : "❌ FAIL";
      console.log(`${status} ${format.toUpperCase()}`);
    }

    console.log(`\n🎯 Overall: ${passedTests}/${totalTests} formats working`);
    expect(passedTests, "All formats should be working").toStrictEqual(
      totalTests,
    );
  });
});

describe("Integration", () => {
  it("Complete Workflow", async () => {
    const isValid = await isValidAudioFile(TEST_FILES.mp3);
    expect(isValid, "File should be valid").toStrictEqual(true);

    const format = await readFormat(TEST_FILES.mp3);
    expect(format, "Should detect MP3 format").toStrictEqual("MP3");

    const props = await readProperties(TEST_FILES.mp3);
    expect(props.bitrate > 0, "Should have valid properties").toBeTruthy();

    const originalTags = await readTags(TEST_FILES.mp3);
    expectDefined(originalTags, "Should read original tags");

    const newTags = {
      title: "Integration Test",
      artist: "Test Suite",
      year: 2024,
    };
    const modifiedBuffer = await applyTags(TEST_FILES.mp3, newTags);

    expect(modifiedBuffer.length > 0, "Should return a buffer").toBeTruthy();
  });

  it("All Formats", async () => {
    for (const [format, path] of Object.entries(TEST_FILES)) {
      const isValid = await isValidAudioFile(path);
      expect(isValid, `${format} should be valid`).toStrictEqual(true);

      const tags = await readTags(path);
      expectDefined(tags, `${format} should have tags`);

      const props = await readProperties(path);
      expect(props.duration > 0, `${format} should have duration`).toBeTruthy();

      try {
        const modified = await applyTags(path, {
          title: `${format} Test`,
        });
        expect(
          modified.length > 0,
          `${format} should support writing`,
        ).toBeTruthy();
      } catch {
        console.log(`Note: ${format} might not support tag writing`);
      }
    }
  });

  it("Music Library Processing", async () => {
    const { applyTags, readTags, applyCoverArt } =
      await import("../src/simple/index.ts");
    const { RED_PNG, createTestFiles, measureTime } =
      await import("./test-utils.ts");

    const albumFiles = await createTestFiles(5, "mp3");
    const albumMetadata = {
      album: "Integration Test Album",
      artist: "Test Artist",
      year: 2024,
      genre: "Electronic",
    };

    const processedFiles = await Promise.all(
      albumFiles.map(async (buffer, index) => {
        const trackTags = {
          ...albumMetadata,
          title: `Track ${index + 1}`,
          track: index + 1,
        };

        const tagged = await applyTags(buffer, trackTags);

        if (index === 0) {
          return await applyCoverArt(tagged, RED_PNG, "image/png");
        } else {
          return tagged;
        }
      }),
    );

    for (let i = 0; i < processedFiles.length; i++) {
      const tags = await readTags(processedFiles[i]);
      expect(tags.album).toStrictEqual([albumMetadata.album]);
      expect(tags.artist).toStrictEqual([albumMetadata.artist]);
      expect(tags.track).toStrictEqual(i + 1);
    }
  });

  it("Batch Tag Updates", async () => {
    const { applyTags, readTags } = await import("../src/simple/index.ts");
    const { createTestFiles } = await import("./test-utils.ts");

    const files = await createTestFiles(10, "flac");

    const updates = {
      genre: "Updated Genre",
      year: 2025,
      comment: "Batch updated",
    };

    const updatedFiles = await Promise.all(
      files.map((buffer) => applyTags(buffer, updates)),
    );

    for (const buffer of updatedFiles) {
      const tags = await readTags(buffer);
      expect(tags.genre).toStrictEqual([updates.genre]);
      expect(tags.year).toStrictEqual(updates.year);
      expect(tags.comment).toStrictEqual([updates.comment]);
    }
  });

  it("Cross-Format Tag Transfer", async () => {
    const { readTags, applyTags } = await import("../src/simple/index.ts");
    const { readFileData } = await import("../src/utils/file.ts");
    const { TEST_TAGS } = await import("./test-utils.ts");

    const sourceBuffer = await readFileData(TEST_FILES.mp3);
    const sourceWithTags = await applyTags(sourceBuffer, TEST_TAGS.basic);
    const sourceTags = await readTags(sourceWithTags);

    const targetBuffer = await readFileData(TEST_FILES.flac);
    const targetWithTags = await applyTags(targetBuffer, sourceTags);

    const targetTags = await readTags(targetWithTags);
    expect(targetTags.title).toStrictEqual(sourceTags.title);
    expect(targetTags.artist).toStrictEqual(sourceTags.artist);
    expect(targetTags.album).toStrictEqual(sourceTags.album);
  });

  it.skipIf(process.env.CI === "true")("Concurrent Operations", async () => {
    let taglib: TagLib | undefined;
    try {
      taglib = await TagLib.initialize({ forceWasmType: "emscripten" });
      const { createTestFiles, measureTime } = await import("./test-utils.ts");

      const files = await createTestFiles(20, "mp3");

      const { timeMs } = await measureTime(async () => {
        await Promise.all(
          files.map(async (buffer) => {
            const file = await taglib!.open(buffer);
            try {
              const tag = file.tag();
              tag.setTitle(`Concurrent ${Math.random()}`);
              file.save();
            } finally {
              file.dispose();
            }
          }),
        );
      });

      const timeLimit = 4000;
      expect(
        timeMs < timeLimit,
        `Concurrent operations took ${timeMs}ms (limit: ${timeLimit}ms)`,
      ).toBeTruthy();
    } catch (error) {
      console.error("Error in concurrent operations test:", error);
      throw error;
    }
  });

  it("readMetadataBatch - includes cover art and dynamics data", async () => {
    const { readMetadataBatch } = await import("../src/simple/index.ts");

    const testFiles = [
      "./tests/test-files/mp3/kiss-snippet.mp3",
      "./tests/test-files/flac/kiss-snippet.flac",
      "./tests/test-files/mp4/kiss-snippet.m4a",
    ];

    const result = await readMetadataBatch(testFiles, {
      concurrency: 3,
    });

    expect(result.items.length).toStrictEqual(testFiles.length);
    expect(result.items.every((item) => item.status === "ok")).toStrictEqual(
      true,
    );

    for (const item of result.items) {
      if (item.status !== "ok") continue;
      expectDefined(item.data.tags);
      expectDefined(item.data.properties);
      expect(typeof item.data.hasCoverArt).toStrictEqual("boolean");

      if (item.data.dynamics) {
        expect(typeof item.data.dynamics).toStrictEqual("object");

        if (item.data.dynamics.replayGainTrackGain) {
          expect(typeof item.data.dynamics.replayGainTrackGain).toStrictEqual(
            "string",
          );
        }
        if (item.data.dynamics.appleSoundCheck) {
          expect(typeof item.data.dynamics.appleSoundCheck).toStrictEqual(
            "string",
          );
        }
      }

      console.log(
        `${item.path}: hasCoverArt=${item.data.hasCoverArt}, dynamics=${
          item.data.dynamics ? "yes" : "no"
        }`,
      );
    }
  });

  it("readMetadataBatch - processes files with dynamics metadata", async () => {
    const { readMetadataBatch } = await import("../src/simple/index.ts");
    const { TagLib } = await import("../src/taglib.ts");

    const tempFile = await createTempFile(".mp3");
    const testData = new Uint8Array(
      await readFile("./tests/test-files/mp3/kiss-snippet.mp3"),
    );
    await writeFile(tempFile, testData);

    try {
      const taglib = await TagLib.initialize({ forceWasmType: "emscripten" });
      const audioFile = await taglib.open(tempFile);
      audioFile.setProperty("replayGainTrackGain", "-6.5 dB");
      audioFile.setProperty("replayGainTrackPeak", "0.95");
      audioFile.save();
      await audioFile.saveToFile(tempFile);
      audioFile.dispose();

      const result = await readMetadataBatch([tempFile]);

      expect(result.items.length).toStrictEqual(1);
      expect(result.items[0].status).toStrictEqual("ok");
      if (result.items[0].status === "ok") {
        const data = result.items[0].data;

        expectDefined(data.dynamics);
        expect(data.dynamics.replayGainTrackGain).toStrictEqual("-6.5 dB");
        expect(data.dynamics.replayGainTrackPeak).toStrictEqual("0.95");
      }
    } finally {
      await rm(tempFile);
    }
  });
});
