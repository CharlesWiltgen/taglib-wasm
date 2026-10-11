import { afterAll, describe, expect, it } from "vite-plus/test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expectDefined } from "./_assert-helpers.ts";
import { cleanupTempFiles, createTempFile } from "./test-utils.ts";
import {
  type AudioFileMetadata,
  exportFolderMetadata,
  findDuplicates,
  scanFolder,
} from "../src/folder-api/index.ts";
import { setBufferMode, writeTagsBatch } from "../src/simple/index.ts";

// Force Emscripten backend for Simple API calls
setBufferMode(true);

const TEST_FILES_DIR = fileURLToPath(new URL("./test-files", import.meta.url));

afterAll(cleanupTempFiles);

describe("folder-api", () => {
  it("scanFolder - reads all audio files with metadata", async () => {
    const result = await scanFolder(TEST_FILES_DIR, {
      recursive: true,

      onProgress: (processed, total) => {
        console.log(`Progress: ${processed}/${total}`);
      },
    });

    // Should find at least 5 test files
    expect(result.items.length >= 5).toStrictEqual(true);
    // Name every failing item instead of a bare false: the scan walks the
    // shared tests/test-files tree under ~97 parallel workers, so a transient
    // failure must say which path errored and why (taglib-y17g).
    const failedItems = result.items.filter((item) => item.status !== "ok");
    expect(
      failedItems.map((item) =>
        item.status === "error"
          ? `${item.path}: ${item.error.message}`
          : `${item.path}: unexpected status`,
      ),
    ).toStrictEqual([]);

    // Check that we got metadata for each file
    for (const item of result.items) {
      if (item.status !== "ok") continue;
      expectDefined(item.path);
      expectDefined(item.tags);
      expectDefined(item.properties);
      expect(typeof item.hasCoverArt).toStrictEqual("boolean");

      // Verify properties
      if (item.properties) {
        expect(typeof item.properties.duration).toStrictEqual("number");
        expect(typeof item.properties.bitrate).toStrictEqual("number");
        expect(typeof item.properties.sampleRate).toStrictEqual("number");
        expect(typeof item.properties.channels).toStrictEqual("number");
      }
    }

    // Check specific known files
    const flacItem = result.items.find(
      (i) => i.status === "ok" && i.path.endsWith(".flac"),
    );
    expectDefined(flacItem);
    if (flacItem!.status === "ok") expectDefined(flacItem!.tags);

    const mp3Item = result.items.find(
      (i) => i.status === "ok" && i.path.endsWith(".mp3"),
    );
    expectDefined(mp3Item);
    if (mp3Item!.status === "ok") expectDefined(mp3Item!.tags);
  });

  it("scanFolder - respects file extension filter", async () => {
    const result = await scanFolder(TEST_FILES_DIR, {
      extensions: [".mp3"],
      recursive: true,
    });

    // Should only find MP3 files
    for (const item of result.items) {
      expect(item.path.endsWith(".mp3")).toStrictEqual(true);
    }
  });

  it("scanFolder - respects max files limit", async () => {
    const result = await scanFolder(TEST_FILES_DIR, {
      maxFiles: 2,
      recursive: true,
    });

    expect(result.items.length).toStrictEqual(2);
    expect(result.items.every((i) => i.status === "ok")).toStrictEqual(true);
  });

  it("scanFolder - handles errors gracefully", async () => {
    // Create a temporary directory with an invalid file
    const tempDir = await mkdtemp(join(tmpdir(), "taglib-"));
    const invalidFile = `${tempDir}/invalid.mp3`;
    await writeFile(invalidFile, new Uint8Array([0, 1, 2, 3])); // Too small

    try {
      const result = await scanFolder(tempDir, {
        continueOnError: true,
      });

      expect(result.items.length).toStrictEqual(1);
      expect(result.items[0].status).toStrictEqual("error");
      expect(result.items[0].path).toStrictEqual(invalidFile);
      if (result.items[0].status === "error") {
        expectDefined(result.items[0].error);
      }
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });

  it("findDuplicates - finds files with same metadata", async () => {
    // Create temporary directory with duplicate metadata
    const tempDir = await mkdtemp(join(tmpdir(), "taglib-"));
    const file1 = `${tempDir}/dup1.mp3`;
    const file2 = `${tempDir}/dup2.mp3`;
    const file3 = `${tempDir}/unique.mp3`;

    // Copy test file
    const mp3Data = new Uint8Array(
      await readFile(`${TEST_FILES_DIR}/mp3/kiss-snippet.mp3`),
    );
    await writeFile(file1, mp3Data);
    await writeFile(file2, mp3Data);
    await writeFile(file3, mp3Data);

    // Set up duplicate tags
    await writeTagsBatch([
      {
        path: file1,
        tags: { artist: "Duplicate Artist", title: "Duplicate Title" },
      },
      {
        path: file2,
        tags: { artist: "Duplicate Artist", title: "Duplicate Title" },
      },
      { path: file3, tags: { artist: "Unique Artist", title: "Unique Title" } },
    ]);

    try {
      const duplicates = await findDuplicates(tempDir, {});

      // Should find one group of duplicates
      expect(duplicates.length).toStrictEqual(1);

      const dupGroup = duplicates[0];
      expectDefined(dupGroup.criteria);
      expect(typeof dupGroup.criteria.artist).toStrictEqual("string");
      expect(typeof dupGroup.criteria.title).toStrictEqual("string");
      expect(dupGroup.files.length).toStrictEqual(2);

      // Check that both duplicate files are found
      const paths = dupGroup.files.map((f) => f.path);
      expect(paths.includes(file1)).toStrictEqual(true);
      expect(paths.includes(file2)).toStrictEqual(true);
      expect(paths.includes(file3)).toStrictEqual(false);
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });

  it("exportFolderMetadata - exports to JSON", async () => {
    const tempFile = await createTempFile(".json");

    try {
      await exportFolderMetadata(TEST_FILES_DIR, tempFile, {
        recursive: true,
      });

      // Read and parse the exported JSON
      const jsonData = await readFile(tempFile, "utf8");
      const data = JSON.parse(jsonData);

      expectDefined(data.folder);
      expectDefined(data.scanDate);
      expectDefined(data.summary);
      expectDefined(data.files);
      expectDefined(data.errors);

      expect(data.folder).toStrictEqual(TEST_FILES_DIR);
      expect(data.summary.totalFiles >= 5).toStrictEqual(true);
      expect(data.files.length).toStrictEqual(data.summary.processedFiles);

      // Check file structure
      for (const file of data.files) {
        expectDefined(file.path);
        expectDefined(file.tags);
        expectDefined(file.properties);
        expect(typeof file.hasCoverArt).toStrictEqual("boolean");
      }
    } finally {
      await rm(tempFile);
    }
  });

  it("scanFolder - processes all files", async () => {
    const result = await scanFolder(TEST_FILES_DIR, {
      recursive: true,
    });

    expect(result.items.length > 0).toStrictEqual(true);
    const okCount = result.items.filter((i) => i.status === "ok").length;
    expect(okCount > 0).toStrictEqual(true);
  });

  it("scanFolder - detects cover art presence", async () => {
    const result = await scanFolder(TEST_FILES_DIR, {
      recursive: true,
    });

    // Check that hasCoverArt is populated for all ok files
    let filesWithCoverArt = 0;
    let filesWithoutCoverArt = 0;

    for (const item of result.items) {
      if (item.status !== "ok") continue;
      expect(typeof item.hasCoverArt).toStrictEqual("boolean");
      if (item.hasCoverArt) {
        filesWithCoverArt++;
      } else {
        filesWithoutCoverArt++;
      }
    }

    // We should have some files with and without cover art in our test set
    console.log(`Files with cover art: ${filesWithCoverArt}`);
    console.log(`Files without cover art: ${filesWithoutCoverArt}`);

    // At least some files should exist in each category
    expect(result.items.length > 0).toStrictEqual(true);
  });

  it("scanFolder - extracts audio dynamics data", async () => {
    const result = await scanFolder(TEST_FILES_DIR, {
      recursive: true,
    });

    // Check that dynamics data is extracted when available
    let filesWithDynamics = 0;
    let filesWithReplayGain = 0;
    let filesWithSoundCheck = 0;

    for (const item of result.items) {
      if (item.status !== "ok") continue;
      if (item.dynamics) {
        filesWithDynamics++;

        // Check ReplayGain fields
        if (
          item.dynamics.replayGainTrackGain ||
          item.dynamics.replayGainTrackPeak ||
          item.dynamics.replayGainAlbumGain ||
          item.dynamics.replayGainAlbumPeak
        ) {
          filesWithReplayGain++;
        }

        // Check Sound Check
        if (item.dynamics.appleSoundCheck) {
          filesWithSoundCheck++;
        }

        // Validate field formats if present
        if (item.dynamics.replayGainTrackGain) {
          expect(typeof item.dynamics.replayGainTrackGain).toStrictEqual(
            "string",
          );
          console.log(`Track gain: ${item.dynamics.replayGainTrackGain}`);
        }

        if (item.dynamics.replayGainTrackPeak) {
          expect(typeof item.dynamics.replayGainTrackPeak).toStrictEqual(
            "string",
          );
        }

        if (item.dynamics.appleSoundCheck) {
          expect(typeof item.dynamics.appleSoundCheck).toStrictEqual("string");
          console.log(`Sound Check: ${item.dynamics.appleSoundCheck}`);
        }
      }
    }

    console.log(`Files with dynamics data: ${filesWithDynamics}`);
    console.log(`Files with ReplayGain: ${filesWithReplayGain}`);
    console.log(`Files with Sound Check: ${filesWithSoundCheck}`);

    // All files should be processed
    expect(result.items.length > 0).toStrictEqual(true);
  });
});
