import { describe, expect, it } from "vite-plus/test";
import { expectRejects, expectThrows } from "./_assert-helpers.ts";
import {
  canvasToPicture,
  createPictureDownloadURL,
  dataURLToPicture,
  displayPicture,
  imageFileToPicture,
  pictureToDataURL,
  setCoverArtFromCanvas,
} from "../src/web-utils/index.ts";
import type { Picture } from "../src/types.ts";

function makePicture(
  overrides: Partial<Picture> & { data: Uint8Array } = {
    data: new Uint8Array([0xff, 0xd8, 0xff]),
  },
): Picture {
  return {
    mimeType: "image/jpeg",
    type: "FrontCover",
    ...overrides,
  };
}

describe("pictureToDataURL", () => {
  it("should produce a valid data URL with correct MIME type", () => {
    const picture = makePicture({ data: new Uint8Array([0x89, 0x50, 0x4e]) });
    const result = pictureToDataURL(picture);

    expect(result.startsWith("data:image/jpeg;base64,")).toStrictEqual(true);
  });

  it("should be byte-identical to per-byte conversion across the chunk boundary (taglib-1zc.5lx)", () => {
    // The chunked loop's second iteration is the only genuinely new code; a
    // per-byte reference pins it. Lengths: one chunk + remainder, and an
    // exact multiple of the 0x8000 chunk size (off-by-one / arg-limit
    // regressions would land here).
    const CHUNK = 0x8000;
    const patterned = (length: number): Uint8Array => {
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i++) bytes[i] = (i * 31 + 7) & 0xff;
      return bytes;
    };
    const reference = (data: Uint8Array): string => {
      let binary = "";
      for (const byte of data) binary += String.fromCodePoint(byte);
      return btoa(binary);
    };

    for (const length of [CHUNK + 3, CHUNK * 2, CHUNK * 2 + 1, 1]) {
      const data = patterned(length);
      const result = pictureToDataURL(makePicture({ data }));
      expect(result, `length ${length}`).toStrictEqual(
        `data:image/jpeg;base64,${reference(data)}`,
      );
    }
  });

  it("should encode image/png MIME type", () => {
    const picture = makePicture({
      mimeType: "image/png",
      data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    });
    const result = pictureToDataURL(picture);

    expect(result.startsWith("data:image/png;base64,")).toStrictEqual(true);
  });

  it("should produce valid base64 for known input", () => {
    const data = new Uint8Array([72, 101, 108, 108, 111]);
    const picture = makePicture({ data });
    const result = pictureToDataURL(picture);

    expect(result).toStrictEqual("data:image/jpeg;base64,SGVsbG8=");
  });

  it("should handle empty data", () => {
    const picture = makePicture({ data: new Uint8Array(0) });
    const result = pictureToDataURL(picture);

    expect(result).toStrictEqual("data:image/jpeg;base64,");
  });

  it("should handle single byte data", () => {
    const picture = makePicture({ data: new Uint8Array([0xff]) });
    const result = pictureToDataURL(picture);

    expect(result).toStrictEqual("data:image/jpeg;base64,/w==");
  });

  it("should handle all byte values 0-255", () => {
    const allBytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) allBytes[i] = i;
    const picture = makePicture({ data: allBytes });
    const result = pictureToDataURL(picture);

    expect(result.startsWith("data:image/jpeg;base64,")).toStrictEqual(true);
    expect(result.length > 23).toStrictEqual(true);
  });
});

describe("dataURLToPicture", () => {
  it("should parse a valid JPEG data URL", () => {
    const dataURL = "data:image/jpeg;base64,SGVsbG8=";
    const result = dataURLToPicture(dataURL);

    expect(result.mimeType).toStrictEqual("image/jpeg");
    expect(result.data).toStrictEqual(new Uint8Array([72, 101, 108, 108, 111]));
    expect(result.type).toStrictEqual("FrontCover");
    expect(result.description).toStrictEqual(undefined);
  });

  it("should parse a valid PNG data URL", () => {
    const dataURL = "data:image/png;base64,AAEC";
    const result = dataURLToPicture(dataURL);

    expect(result.mimeType).toStrictEqual("image/png");
    expect(result.data).toStrictEqual(new Uint8Array([0x00, 0x01, 0x02]));
  });

  it("should default to FrontCover type when no type specified", () => {
    const dataURL = "data:image/jpeg;base64,AA==";
    const result = dataURLToPicture(dataURL);

    expect(result.type).toStrictEqual("FrontCover");
  });

  it("should accept a string PictureType", () => {
    const dataURL = "data:image/jpeg;base64,AA==";
    const result = dataURLToPicture(dataURL, "BackCover");

    expect(result.type).toStrictEqual("BackCover");
  });

  it("should accept a PictureType string", () => {
    const dataURL = "data:image/jpeg;base64,AA==";
    const result = dataURLToPicture(dataURL, "LeadArtist");

    expect(result.type).toStrictEqual("LeadArtist");
  });

  it("should include description when provided", () => {
    const dataURL = "data:image/jpeg;base64,AA==";
    const result = dataURLToPicture(dataURL, "FrontCover", "Album cover art");

    expect(result.description).toStrictEqual("Album cover art");
  });

  it("should throw on missing data: prefix", () => {
    expectThrows(
      () => dataURLToPicture("image/jpeg;base64,AA=="),
      Error,
      "Invalid data URL format",
    );
  });

  it("should throw on missing base64 marker", () => {
    expectThrows(
      () => dataURLToPicture("data:image/jpeg,AA=="),
      Error,
      "Invalid data URL format",
    );
  });

  it("should throw on empty string", () => {
    expectThrows(() => dataURLToPicture(""), Error, "Invalid data URL format");
  });

  it("should throw on plain text", () => {
    expectThrows(
      () => dataURLToPicture("not a data url at all"),
      Error,
      "Invalid data URL format",
    );
  });

  it("should throw on data URL with empty base64 payload", () => {
    expectThrows(
      () => dataURLToPicture("data:image/jpeg;base64,"),
      Error,
      "Invalid data URL format",
    );
  });
});

describe("pictureToDataURL and dataURLToPicture roundtrip", () => {
  it("should preserve data through encode/decode cycle", () => {
    const originalData = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const original = makePicture({
      mimeType: "image/jpeg",
      data: originalData,
    });

    const dataURL = pictureToDataURL(original);
    const restored = dataURLToPicture(dataURL);

    expect(restored.mimeType).toStrictEqual(original.mimeType);
    expect(restored.data).toStrictEqual(original.data);
  });

  it("should preserve PNG data through roundtrip", () => {
    const originalData = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const original = makePicture({
      mimeType: "image/png",
      data: originalData,
    });

    const dataURL = pictureToDataURL(original);
    const restored = dataURLToPicture(dataURL);

    expect(restored.mimeType).toStrictEqual("image/png");
    expect(restored.data).toStrictEqual(originalData);
  });

  it("should preserve all 256 byte values through roundtrip", () => {
    const allBytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) allBytes[i] = i;
    const original = makePicture({ data: allBytes });

    const dataURL = pictureToDataURL(original);
    const restored = dataURLToPicture(dataURL);

    expect(restored.data).toStrictEqual(allBytes);
  });

  it("should preserve single byte through roundtrip", () => {
    const original = makePicture({ data: new Uint8Array([0x00]) });

    const dataURL = pictureToDataURL(original);
    const restored = dataURLToPicture(dataURL);

    expect(restored.data).toStrictEqual(new Uint8Array([0x00]));
  });

  it("should preserve image/webp MIME type through roundtrip", () => {
    const original = makePicture({
      mimeType: "image/webp",
      data: new Uint8Array([0x52, 0x49, 0x46, 0x46]),
    });

    const dataURL = pictureToDataURL(original);
    const restored = dataURLToPicture(dataURL);

    expect(restored.mimeType).toStrictEqual("image/webp");
    expect(restored.data).toStrictEqual(original.data);
  });
});

describe("imageFileToPicture", () => {
  it("should convert a File to a Picture with default type", async () => {
    const fileData = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    const file = new File([fileData], "cover.jpg", { type: "image/jpeg" });

    const result = await imageFileToPicture(file);

    expect(result.mimeType).toStrictEqual("image/jpeg");
    expect(result.data).toStrictEqual(fileData);
    expect(result.type).toStrictEqual("FrontCover");
    expect(result.description).toStrictEqual("cover.jpg");
  });

  it("should use provided type and description", async () => {
    const fileData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const file = new File([fileData], "back.png", { type: "image/png" });

    const result = await imageFileToPicture(file, "BackCover", "Back cover");

    expect(result.mimeType).toStrictEqual("image/png");
    expect(result.type).toStrictEqual("BackCover");
    expect(result.description).toStrictEqual("Back cover");
  });

  it("should fall back to file name when description is omitted", async () => {
    const file = new File([new Uint8Array([1])], "art.webp", {
      type: "image/webp",
    });

    const result = await imageFileToPicture(file);

    expect(result.description).toStrictEqual("art.webp");
  });

  it("should handle empty file", async () => {
    const file = new File([], "empty.jpg", { type: "image/jpeg" });

    const result = await imageFileToPicture(file);

    expect(result.data).toStrictEqual(new Uint8Array(0));
    expect(result.mimeType).toStrictEqual("image/jpeg");
  });
});

describe("canvasToPicture", () => {
  function mockCanvas(blobData: Uint8Array | null): HTMLCanvasElement {
    return {
      toBlob(
        callback: (blob: Blob | null) => void,
        _format?: string,
        _quality?: number,
      ) {
        if (blobData === null) {
          callback(null);
        } else {
          callback(
            new Blob([blobData.buffer as ArrayBuffer], { type: "image/jpeg" }),
          );
        }
      },
    } as unknown as HTMLCanvasElement;
  }

  it("should convert canvas blob to Picture with defaults", async () => {
    const pixelData = new Uint8Array([0xff, 0x00, 0xff]);
    const canvas = mockCanvas(pixelData);

    const result = await canvasToPicture(canvas);

    expect(result.mimeType).toStrictEqual("image/jpeg");
    expect(result.data).toStrictEqual(pixelData);
    expect(result.type).toStrictEqual("FrontCover");
    expect(result.description).toStrictEqual(undefined);
  });

  it("should use provided options", async () => {
    const pixelData = new Uint8Array([0x89, 0x50]);
    const canvas = mockCanvas(pixelData);

    const result = await canvasToPicture(canvas, {
      format: "image/png",
      quality: 1.0,
      type: "BackCover",
      description: "Canvas art",
    });

    expect(result.mimeType).toStrictEqual("image/png");
    expect(result.type).toStrictEqual("BackCover");
    expect(result.description).toStrictEqual("Canvas art");
  });

  it("should reject when canvas produces null blob", async () => {
    const canvas = mockCanvas(null);

    await expectRejects(
      () => canvasToPicture(canvas),
      Error,
      "Failed to convert canvas to blob",
    );
  });
});

describe("setCoverArtFromCanvas", () => {
  it("should call toDataURL with correct format and quality", async () => {
    const calls: { format: string; quality: number }[] = [];
    const canvas = {
      toDataURL(format: string, quality: number): string {
        calls.push({ format, quality });
        return "data:image/jpeg;base64,AAEC";
      },
    } as unknown as HTMLCanvasElement;

    try {
      await setCoverArtFromCanvas(new Uint8Array([1]), canvas, {
        format: "image/png",
        quality: 0.8,
      });
    } catch {
      // applyPictures will throw because TagLib is not initialized
    }

    expect(calls.length).toStrictEqual(1);
    expect(calls[0].format).toStrictEqual("image/png");
    expect(calls[0].quality).toStrictEqual(0.8);
  });

  it("should use default format and quality", async () => {
    const calls: { format: string; quality: number }[] = [];
    const canvas = {
      toDataURL(format: string, quality: number): string {
        calls.push({ format, quality });
        return "data:image/jpeg;base64,AAEC";
      },
    } as unknown as HTMLCanvasElement;

    try {
      await setCoverArtFromCanvas(new Uint8Array([1]), canvas);
    } catch {
      // applyPictures will throw because TagLib is not initialized
    }

    expect(calls.length).toStrictEqual(1);
    expect(calls[0].format).toStrictEqual("image/jpeg");
    expect(calls[0].quality).toStrictEqual(0.92);
  });
});

describe("displayPicture", () => {
  it("should set imgElement.src to a blob URL", () => {
    const picture = makePicture({ data: new Uint8Array([0xff, 0xd8]) });
    const listeners: { event: string; fn: () => void }[] = [];
    const imgElement = {
      src: "",
      addEventListener(
        event: string,
        fn: () => void,
        _opts?: { once: boolean },
      ) {
        listeners.push({ event, fn });
      },
    } as unknown as HTMLImageElement;

    displayPicture(picture, imgElement);

    expect(imgElement.src.startsWith("blob:")).toStrictEqual(true);
    expect(listeners.length).toStrictEqual(1);
    expect(listeners[0].event).toStrictEqual("load");
  });

  it("should revoke previous blob URL before setting new one", () => {
    const revokedURLs: string[] = [];
    const originalRevoke = URL.revokeObjectURL;
    URL.revokeObjectURL = (url: string) => {
      revokedURLs.push(url);
    };

    try {
      const picture = makePicture({ data: new Uint8Array([0xff]) });
      const imgElement = {
        src: "blob:http://localhost/old-uuid",
        addEventListener() {},
      } as unknown as HTMLImageElement;

      displayPicture(picture, imgElement);

      expect(
        revokedURLs.includes("blob:http://localhost/old-uuid"),
      ).toStrictEqual(true);
      expect(imgElement.src.startsWith("blob:")).toStrictEqual(true);
    } finally {
      URL.revokeObjectURL = originalRevoke;
    }
  });

  it("should not revoke non-blob src", () => {
    const revokedURLs: string[] = [];
    const originalRevoke = URL.revokeObjectURL;
    URL.revokeObjectURL = (url: string) => {
      revokedURLs.push(url);
    };

    try {
      const picture = makePicture({ data: new Uint8Array([0xff]) });
      const imgElement = {
        src: "https://example.com/image.jpg",
        addEventListener() {},
      } as unknown as HTMLImageElement;

      displayPicture(picture, imgElement);

      expect(revokedURLs.length).toStrictEqual(0);
    } finally {
      URL.revokeObjectURL = originalRevoke;
    }
  });
});

describe("createPictureDownloadURL", () => {
  it("should return a blob URL", () => {
    const picture = makePicture({
      data: new Uint8Array([0xff, 0xd8, 0xff]),
    });

    const url = createPictureDownloadURL(picture);

    expect(url.startsWith("blob:")).toStrictEqual(true);
    URL.revokeObjectURL(url);
  });

  it("should create distinct URLs for different pictures", () => {
    const picture1 = makePicture({ data: new Uint8Array([1, 2, 3]) });
    const picture2 = makePicture({ data: new Uint8Array([4, 5, 6]) });

    const url1 = createPictureDownloadURL(picture1);
    const url2 = createPictureDownloadURL(picture2);

    expect(url1 !== url2).toStrictEqual(true);
    URL.revokeObjectURL(url1);
    URL.revokeObjectURL(url2);
  });

  it("should work with PNG MIME type", () => {
    const picture = makePicture({
      mimeType: "image/png",
      data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    });

    const url = createPictureDownloadURL(picture, "cover.png");

    expect(url.startsWith("blob:")).toStrictEqual(true);
    URL.revokeObjectURL(url);
  });
});
