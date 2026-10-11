/**
 * @fileoverview Batch writes: writeTagsBatch + editTagsBatch (taglib-pmhp).
 *
 * The Simple API's read side has batch surfaces (readTagsBatch,
 * readMetadataBatch); the write side had none — consumers hand-rolled
 * open -> mutate -> saveToFile loops with per-file try/catch, status
 * counts, and abort checks. writeTagsBatch ships the same BatchOptions
 * contract (concurrency/continueOnError/onProgress/signal) for writes,
 * with per-file status, atomicity (a failed file stays pre-write), and
 * abort between files. updateFolderTags is removed in favor of this
 * surface (single batch-write convention).
 */

import { beforeAll, describe, expect, it } from "vite-plus/test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expectRejects } from "./_assert-helpers.ts";
import { TagLib } from "../src/taglib.ts";
import {
  editTagsBatch,
  readTags,
  writeTagsBatch,
} from "../src/simple/index.ts";
import { FIXTURE_PATH } from "./shared-fixtures.ts";
import { useSimpleBackend } from "./simple-backend.ts";

interface TempFiles {
  mp3: string;
  flac: string;
  corrupt: string;
}

async function makeTempFiles(): Promise<TempFiles> {
  const dir = await mkdtemp(join(tmpdir(), "taglib-"));
  const mp3 = `${dir}/song1.mp3`;
  const flac = `${dir}/song2.flac`;
  const corrupt = `${dir}/broken.mp3`;
  await writeFile(mp3, new Uint8Array(await readFile(FIXTURE_PATH.mp3)));
  await writeFile(flac, new Uint8Array(await readFile(FIXTURE_PATH.flac)));
  await writeFile(corrupt, new Uint8Array(4096)); // not audio
  return { mp3, flac, corrupt };
}

async function bytesOf(path: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path));
}

function runScenarios(): void {
  it("writeTagsBatch applies tags to every file; ok items preserve input order", async () => {
    const { mp3, flac } = await makeTempFiles();
    const result = await writeTagsBatch([
      { path: mp3, tags: { title: "New Title" } },
      { path: flac, tags: { artist: "New Artist" } },
    ]);
    expect(result.items.length).toStrictEqual(2);
    expect(result.items.every((i) => i.status === "ok")).toStrictEqual(true);
    expect(result.items[0].path).toStrictEqual(mp3);
    expect(result.items[1].path).toStrictEqual(flac);
    const mp3Tags = await readTags(mp3);
    const flacTags = await readTags(flac);
    expect(mp3Tags.title).toStrictEqual(["New Title"]);
    expect(flacTags.artist).toStrictEqual(["New Artist"]);
  });

  it("onProgress reports processed/total with the current file", async () => {
    const { mp3, flac } = await makeTempFiles();
    const calls: Array<[number, number, string]> = [];
    await writeTagsBatch(
      [
        { path: mp3, tags: { title: "A" } },
        { path: flac, tags: { title: "B" } },
      ],
      {
        concurrency: 1,
        onProgress: (processed, total, file) =>
          calls.push([processed, total, file]),
      },
    );
    expect(calls).toStrictEqual([
      [1, 2, mp3],
      [2, 2, flac],
    ]);
  });

  it("failed file is left in its pre-write state; others still succeed", async () => {
    const { mp3, corrupt } = await makeTempFiles();
    const before = await bytesOf(corrupt);
    const result = await writeTagsBatch([
      { path: corrupt, tags: { title: "X" } },
      { path: mp3, tags: { title: "OK" } },
    ]);
    expect(result.items[0].status).toStrictEqual("error");
    expect(result.items[1].status).toStrictEqual("ok");
    // Atomicity: the failed file's bytes are untouched.
    expect(await bytesOf(corrupt)).toStrictEqual(before);
    const tags = await readTags(mp3);
    expect(tags.title).toStrictEqual(["OK"]);
  });

  it("continueOnError=false rejects on the first failure", async () => {
    const { mp3, corrupt } = await makeTempFiles();
    await expect(() =>
      writeTagsBatch(
        [
          { path: corrupt, tags: { title: "X" } },
          { path: mp3, tags: { title: "OK" } },
        ],
        { continueOnError: false },
      ),
    ).rejects.toThrow();
  });

  it("AbortSignal stops between files, never mid-save", async () => {
    const { mp3, flac } = await makeTempFiles();
    const flacBefore = await bytesOf(flac);
    const controller = new AbortController();
    await expectRejects(
      () =>
        writeTagsBatch(
          [
            { path: mp3, tags: { title: "First" } },
            { path: flac, tags: { title: "Second" } },
          ],
          {
            concurrency: 1,
            signal: controller.signal,
            onProgress: (processed) => {
              if (processed === 1) controller.abort();
            },
          },
        ),
      DOMException,
      "aborted",
    );
    // First file was written, second never opened: bytes unchanged.
    const tags = await readTags(mp3);
    expect(tags.title).toStrictEqual(["First"]);
    expect(await bytesOf(flac)).toStrictEqual(flacBefore);
  });

  it("editTagsBatch mutator variant applies per-file edits and saves", async () => {
    const { mp3, flac } = await makeTempFiles();
    const result = await editTagsBatch([mp3, flac], (audioFile) =>
      audioFile.tag().setTitle("Mutated"),
    );
    expect(result.items.length).toStrictEqual(2);
    expect(result.items.every((i) => i.status === "ok")).toStrictEqual(true);
    const mp3Tags = await readTags(mp3);
    const flacTags = await readTags(flac);
    expect(mp3Tags.title).toStrictEqual(["Mutated"]);
    expect(flacTags.title).toStrictEqual(["Mutated"]);
  });

  it("empty input returns an empty result", async () => {
    const result = await writeTagsBatch([]);
    expect(result.items).toStrictEqual([]);
  });

  // --- Post-review contracts (tuneup write-model review) ---

  it("editTagsBatch delivers the correct path per invocation under concurrency", async () => {
    const { mp3, flac } = await makeTempFiles();
    const third = `${mp3.replace("song1", "song3")}`.replace(".mp3", ".flac");
    await writeFile(third, new Uint8Array(await readFile(FIXTURE_PATH.flac)));
    const seen = new Map<string, string>();
    await editTagsBatch(
      [mp3, flac, third],
      (audioFile, path) => {
        seen.set(path, "called");
        // Title is derived from the path, so an order-coupled (wrong) path
        // assignment would produce a mismatched title.
        audioFile.tag().setTitle(`title-of-${path.split("/").pop()}`);
      },
      { concurrency: 3 },
    );
    expect(seen.size).toStrictEqual(3);
    for (const path of [mp3, flac, third]) {
      const tags = await readTags(path);
      expect(tags.title).toStrictEqual([`title-of-${path.split("/").pop()}`]);
    }
  });

  it("writeTagsBatch properties: raw wire-key sets (modeled + multi-value)", async () => {
    const { mp3 } = await makeTempFiles();
    const result = await writeTagsBatch([
      {
        path: mp3,
        properties: { BARCODE: ["LC1234"], PERFORMER: ["A", "B"] },
      },
    ]);
    expect(result.items[0].status).toStrictEqual("ok");
    const tags = await readTags(mp3, {
      includeProperties: ["BARCODE", "PERFORMER"],
    });
    expect(tags.extraProperties).toStrictEqual({
      BARCODE: ["LC1234"],
      PERFORMER: ["A", "B"],
    });
  });

  it("writeTagsBatch properties: removal via empty array, no carrier", async () => {
    const { mp3 } = await makeTempFiles();
    // Seed a COMPILATION frame.
    const tl = await TagLib.initialize();
    const seed = await tl.open(mp3);
    seed.setProperty("COMPILATION", "1");
    await seed.saveToFile(mp3);
    seed.dispose();

    const result = await writeTagsBatch([
      { path: mp3, properties: { COMPILATION: [] } },
    ]);
    expect(result.items[0].status).toStrictEqual("ok");

    const reopened = await tl.open(mp3);
    const props = reopened.properties() as Record<string, string[]>;
    reopened.dispose();
    expect(props.compilation).toStrictEqual(undefined); // no key, no [""] carrier
    const tags = await readTags(mp3);
    expect(tags.compilation).toStrictEqual(undefined);
  });

  it("writeTagsBatch PUBLISHER+LABEL pair in a single save", async () => {
    const { mp3 } = await makeTempFiles();
    // Seed a stale legacy PUBLISHER frame.
    const tl = await TagLib.initialize();
    const seed = await tl.open(mp3);
    seed.setProperty("PUBLISHER", "Legacy");
    await seed.saveToFile(mp3);
    seed.dispose();

    const result = await writeTagsBatch([
      {
        path: mp3,
        properties: { LABEL: ["Apple"], PUBLISHER: [] },
      },
    ]);
    expect(result.items[0].status).toStrictEqual("ok");

    const reopened = await tl.open(mp3);
    const props = reopened.properties() as Record<string, string[]>;
    reopened.dispose();
    expect(props.label).toStrictEqual(["Apple"]);
    expect(props.publisher).toStrictEqual(undefined); // removed, no carrier
  });

  it("writeTagsBatch combines tags + properties in one update", async () => {
    const { mp3 } = await makeTempFiles();
    const tl = await TagLib.initialize();
    const seed = await tl.open(mp3);
    seed.setProperty("COMPILATION", "1");
    await seed.saveToFile(mp3);
    seed.dispose();

    const result = await writeTagsBatch([
      {
        path: mp3,
        tags: { title: "Combined" },
        properties: { BARCODE: ["X1"], COMPILATION: [] },
      },
    ]);
    expect(result.items[0].status).toStrictEqual("ok");

    const reopened = await tl.open(mp3);
    const props = reopened.properties() as Record<string, string[]>;
    reopened.dispose();
    expect(props.title).toStrictEqual(["Combined"]);
    expect(props.barcode).toStrictEqual(["X1"]);
    expect(props.compilation).toStrictEqual(undefined);
  });

  it("writeTagsBatch properties take precedence over tags for the same key", async () => {
    const { mp3 } = await makeTempFiles();
    const result = await writeTagsBatch([
      {
        path: mp3,
        tags: { compilation: true },
        properties: { COMPILATION: [] },
      },
    ]);
    expect(result.items[0].status).toStrictEqual("ok");
    // The raw removal wins over the typed set (fold order): the flag is
    // gone entirely, not stored as a "1" or "0" carrier.
    const tl = await TagLib.initialize();
    const file = await tl.open(mp3);
    const props = file.properties() as Record<string, string[]>;
    file.dispose();
    expect(props.compilation).toStrictEqual(undefined);
    const tags = await readTags(mp3);
    expect(tags.compilation).toStrictEqual(undefined);
  });
}

describe("writeTagsBatch (taglib-pmhp) [wasi]", () => {
  beforeAll(() => useSimpleBackend(false));
  runScenarios();
});

describe("writeTagsBatch (taglib-pmhp) [emscripten]", () => {
  beforeAll(() => useSimpleBackend(true));
  runScenarios();
});
