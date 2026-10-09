import { afterAll, describe, expect, it } from "vite-plus/test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expectRejects } from "./_assert-helpers.ts";
import {
  getFileSize,
  readFileData,
  readPartialFileData,
} from "../src/utils/file.ts";
import { writeFileData } from "../src/utils/write.ts";
import { FIXTURE_PATH } from "./shared-fixtures.ts";

const TEMP_DIR = await mkdtemp(join(tmpdir(), "taglib-"));
const MP3_PATH = FIXTURE_PATH.mp3;

afterAll(async () => {
  await rm(TEMP_DIR, { recursive: true });
});

describe("readFileData", () => {
  it("should read from file path", async () => {
    const data = await readFileData(MP3_PATH);
    expect(data instanceof Uint8Array).toStrictEqual(true);
    expect(data.length > 0).toStrictEqual(true);
  });

  it("should return Uint8Array input unchanged", async () => {
    const input = new Uint8Array([1, 2, 3, 4]);
    const result = await readFileData(input);
    expect(result).toStrictEqual(input);
  });

  it("should convert ArrayBuffer to Uint8Array", async () => {
    const buffer = new ArrayBuffer(4);
    new Uint8Array(buffer).set([10, 20, 30, 40]);
    const result = await readFileData(buffer);
    expect(result).toStrictEqual(new Uint8Array([10, 20, 30, 40]));
  });

  it("should throw FileOperationError for non-existent path", async () => {
    await expectRejects(
      () => readFileData("/nonexistent/path/file.mp3"),
      Error,
    );
  });
});

describe("getFileSize", () => {
  it("should return correct file size", async () => {
    const size = await getFileSize(MP3_PATH);
    expect(typeof size).toStrictEqual("number");
    expect(size > 0).toStrictEqual(true);
  });

  it("should match actual file data length", async () => {
    const size = await getFileSize(MP3_PATH);
    const data = await readFileData(MP3_PATH);
    expect(size).toStrictEqual(data.length);
  });

  it("should throw for non-existent file", async () => {
    await expectRejects(() => getFileSize("/nonexistent/file.mp3"), Error);
  });
});

describe("readPartialFileData", () => {
  it("should read header and footer sections", async () => {
    const fullData = await readFileData(MP3_PATH);
    const headerSize = 1024;
    const footerSize = 512;

    const partial = await readPartialFileData(MP3_PATH, headerSize, footerSize);

    if (fullData.length > headerSize + footerSize) {
      expect(partial.length).toStrictEqual(headerSize + footerSize);
      expect(partial.slice(0, headerSize)).toStrictEqual(
        fullData.slice(0, headerSize),
      );
    }
  });

  it("should return full file for small files", async () => {
    const smallPath = `${TEMP_DIR}/small.bin`;
    const smallData = new Uint8Array([1, 2, 3, 4, 5]);
    await writeFile(smallPath, smallData);

    const partial = await readPartialFileData(smallPath, 1024, 1024);
    expect(partial.length).toStrictEqual(smallData.length);
  });

  it("should throw for non-existent file", async () => {
    await expectRejects(
      () => readPartialFileData("/nonexistent/file.mp3", 1024, 512),
      Error,
    );
  });
});

describe("writeFileData", () => {
  it("should write data to file", async () => {
    const path = `${TEMP_DIR}/write-test.bin`;
    const data = new Uint8Array([100, 200, 150, 50]);
    await writeFileData(path, data);

    const readBack = new Uint8Array(await readFile(path));
    expect(new Uint8Array(readBack)).toStrictEqual(data);
  });

  it("should overwrite existing file", async () => {
    const path = `${TEMP_DIR}/overwrite-test.bin`;
    await writeFileData(path, new Uint8Array([1, 2, 3]));
    await writeFileData(path, new Uint8Array([4, 5, 6, 7]));

    const readBack = new Uint8Array(await readFile(path));
    expect(new Uint8Array(readBack)).toStrictEqual(
      new Uint8Array([4, 5, 6, 7]),
    );
  });

  it("should handle empty data", async () => {
    const path = `${TEMP_DIR}/empty-test.bin`;
    await writeFileData(path, new Uint8Array(0));

    const readBack = new Uint8Array(await readFile(path));
    expect(readBack.length).toStrictEqual(0);
  });

  it("should roundtrip with readFileData", async () => {
    const path = `${TEMP_DIR}/roundtrip-test.bin`;
    const original = new Uint8Array(256);
    for (let i = 0; i < 256; i++) original[i] = i;

    await writeFileData(path, original);
    const result = await readFileData(path);
    expect(result).toStrictEqual(original);
  });
});
