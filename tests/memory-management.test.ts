import { describe, expect, it } from "vite-plus/test";
import { WasmAlloc, WasmArena } from "../src/runtime/wasi-memory.ts";
import type { WasmExports } from "../src/runtime/wasi-memory.ts";

function createMockWasmExports(): WasmExports & {
  getAllocatedPointers(): Set<number>;
} {
  const wasmMemory = new WebAssembly.Memory({ initial: 16 });
  const allocatedPointers = new Set<number>();
  let nextPointer = 1000;

  return {
    memory: wasmMemory,
    malloc: (size: number) => {
      const ptr = nextPointer;
      nextPointer += size;
      allocatedPointers.add(ptr);
      return ptr;
    },
    free: (ptr: number) => {
      allocatedPointers.delete(ptr);
    },
    getAllocatedPointers: () => allocatedPointers,
  };
}

describe("WasmAlloc RAII", () => {
  it("allocates and frees memory automatically", () => {
    const exports = createMockWasmExports();

    const testData = new Uint8Array([1, 2, 3, 4, 5]);
    {
      using alloc = new WasmAlloc(exports, testData.length);
      alloc.write(testData);

      const result = alloc.read();
      expect(result[0]).toStrictEqual(1);
      expect(result[4]).toStrictEqual(5);
      expect(alloc.size).toStrictEqual(testData.length);
    }
    expect(exports.getAllocatedPointers().size).toStrictEqual(0);
  });

  it("writeCString and readCString round-trip", () => {
    const exports = createMockWasmExports();

    const testString = "Hello, RAII!";
    const encoded = new TextEncoder().encode(testString);
    {
      using alloc = new WasmAlloc(exports, encoded.length + 1);
      alloc.writeCString(testString);

      const result = alloc.readCString();
      expect(result).toStrictEqual(testString);
    }
    expect(exports.getAllocatedPointers().size).toStrictEqual(0);
  });

  it("handles multi-byte UTF-8 (emoji, CJK)", () => {
    const exports = createMockWasmExports();

    const testCases = [
      "\u{1F3B5} Music",
      "\u4F60\u597D\u4E16\u754C",
      "caf\u00E9",
    ];

    for (const str of testCases) {
      const encoded = new TextEncoder().encode(str);
      {
        using alloc = new WasmAlloc(exports, encoded.length + 1);
        alloc.writeCString(encoded);
        expect(alloc.readCString()).toStrictEqual(str);
      }
    }
    expect(exports.getAllocatedPointers().size).toStrictEqual(0);
  });
});

describe("WasmArena RAII", () => {
  it("allocString works and frees all on scope exit", () => {
    const exports = createMockWasmExports();

    {
      using arena = new WasmArena(exports);
      const titleAlloc = arena.allocString("My Title");
      const artistAlloc = arena.allocString("My Artist");

      expect(titleAlloc.readCString()).toStrictEqual("My Title");
      expect(artistAlloc.readCString()).toStrictEqual("My Artist");
      expect(exports.getAllocatedPointers().size).toStrictEqual(2);
    }
    expect(exports.getAllocatedPointers().size).toStrictEqual(0);
  });
});
