/**
 * @fileoverview RAII Memory Management Tests
 *
 * Tests the RAII pattern implementation for WASM memory management.
 * Verifies automatic cleanup, error handling, and memory leak prevention.
 */

import { describe, expect, it } from "vite-plus/test";
import { expectThrows } from "./_assert-helpers.ts";
import { MemoryError } from "../src/errors/classes.ts";
import {
  heapViews,
  WasmAlloc,
  WasmArena,
  type WasmExports,
} from "../src/runtime/wasi-memory.ts";

// Mock WASM exports for testing
class MockWasmExports implements WasmExports {
  private allocatedPointers = new Set<number>();
  private nextPtr = 1000;
  private _memory = new WebAssembly.Memory({ initial: 1 });

  get memory(): WebAssembly.Memory {
    return this._memory;
  }

  malloc(size: number): number {
    if (size <= 0) return 0;

    const ptr = this.nextPtr;
    this.nextPtr += size;
    this.allocatedPointers.add(ptr);
    return ptr;
  }

  free(ptr: number): void {
    this.allocatedPointers.delete(ptr);
  }

  getAllocatedCount(): number {
    return this.allocatedPointers.size;
  }

  isAllocated(ptr: number): boolean {
    return this.allocatedPointers.has(ptr);
  }
}

describe("WasmAlloc", () => {
  it("automatic cleanup on disposal", () => {
    const wasm = new MockWasmExports();
    expect(wasm.getAllocatedCount()).toStrictEqual(0);

    {
      using alloc = new WasmAlloc(wasm, 100);
      expect(wasm.getAllocatedCount()).toStrictEqual(1);
      expect(wasm.isAllocated(alloc.ptr)).toBeTruthy();
    }

    expect(wasm.getAllocatedCount()).toStrictEqual(0);
  });

  it("cleanup on exception", () => {
    const wasm = new MockWasmExports();

    expect(() => {
      using _alloc = new WasmAlloc(wasm, 100);
      expect(wasm.getAllocatedCount()).toStrictEqual(1);
      throw new Error("Test exception");
    }).toThrow();

    expect(wasm.getAllocatedCount()).toStrictEqual(0);
  });

  it("read/write operations", () => {
    const wasm = new MockWasmExports();
    using alloc = new WasmAlloc(wasm, 100);

    const testData = new Uint8Array([1, 2, 3, 4, 5]);
    alloc.write(testData);

    const readData = alloc.read(testData.length);
    expect(readData).toStrictEqual(testData);
  });

  it("C string operations", () => {
    const wasm = new MockWasmExports();
    using alloc = new WasmAlloc(wasm, 100);

    const testString = "Hello, World! 🌍";
    alloc.writeCString(testString);

    const readString = alloc.readCString();
    expect(readString).toStrictEqual(testString);
  });

  it("bounds checking", () => {
    const wasm = new MockWasmExports();
    using alloc = new WasmAlloc(wasm, 10);

    const largeData = new Uint8Array(20);

    expectThrows(
      () => {
        alloc.write(largeData);
      },
      MemoryError,
      "Write exceeds allocation bounds",
    );

    expectThrows(
      () => {
        alloc.read(20);
      },
      MemoryError,
      "Read exceeds allocation bounds",
    );
  });

  it("integer operations", () => {
    const wasm = new MockWasmExports();
    using alloc = new WasmAlloc(wasm, 8);

    alloc.writeUint32(0x12345678);
    expect(alloc.readUint32()).toStrictEqual(0x12345678);

    alloc.writeUint32(0x87654321, 4);
    expect(alloc.readUint32(4)).toStrictEqual(0x87654321);
  });
});

describe("WasmArena", () => {
  it("bulk allocation and cleanup", () => {
    const wasm = new MockWasmExports();
    expect(wasm.getAllocatedCount()).toStrictEqual(0);

    {
      using arena = new WasmArena(wasm);

      const alloc1 = arena.alloc(100);
      const alloc2 = arena.alloc(200);
      const alloc3 = arena.alloc(50);

      expect(wasm.getAllocatedCount()).toStrictEqual(3);
      expect(wasm.isAllocated(alloc1.ptr)).toBeTruthy();
      expect(wasm.isAllocated(alloc2.ptr)).toBeTruthy();
      expect(wasm.isAllocated(alloc3.ptr)).toBeTruthy();
    }

    expect(wasm.getAllocatedCount()).toStrictEqual(0);
  });

  it("convenience allocation methods", () => {
    const wasm = new MockWasmExports();

    using arena = new WasmArena(wasm);

    const strAlloc = arena.allocString("test");
    expect(strAlloc.readCString()).toStrictEqual("test");

    const buffer = new Uint8Array([1, 2, 3, 4]);
    const bufAlloc = arena.allocBuffer(buffer);
    expect(bufAlloc.read()).toStrictEqual(buffer);

    const intAlloc = arena.allocUint32(42);
    expect(intAlloc.readUint32()).toStrictEqual(42);

    expect(wasm.getAllocatedCount()).toStrictEqual(3);
  });

  it("cleanup on exception with multiple allocations", () => {
    const wasm = new MockWasmExports();

    expect(() => {
      using arena = new WasmArena(wasm);
      arena.alloc(100);
      arena.alloc(200);
      arena.alloc(300);
      expect(wasm.getAllocatedCount()).toStrictEqual(3);
      throw new Error("Test exception");
    }).toThrow();

    expect(wasm.getAllocatedCount()).toStrictEqual(0);
  });
});

describe("heapViews", () => {
  it("creates typed heap views", () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const views = heapViews(memory);

    expect(views.u8 instanceof Uint8Array).toBeTruthy();
    expect(views.i8 instanceof Int8Array).toBeTruthy();
    expect(views.u16 instanceof Uint16Array).toBeTruthy();
    expect(views.i16 instanceof Int16Array).toBeTruthy();
    expect(views.u32 instanceof Uint32Array).toBeTruthy();
    expect(views.dv instanceof DataView).toBeTruthy();

    expect(views.u8.buffer).toStrictEqual(memory.buffer);
    expect(views.dv.buffer).toStrictEqual(memory.buffer);
  });

  it("views reflect memory changes", () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const views = heapViews(memory);

    views.u8[100] = 42;
    expect(views.i8[100]).toStrictEqual(42);

    views.dv.setUint32(200, 0x12345678, true);
    expect(views.u32[50]).toStrictEqual(0x12345678); // 200/4 = 50
  });
});

describe("RAII Error Scenarios", () => {
  it("allocation failure handling", () => {
    const wasm: WasmExports = {
      memory: new WebAssembly.Memory({ initial: 1 }),
      malloc: () => 0, // Always fail
      free: () => {},
    };

    expectThrows(
      () => {
        new WasmAlloc(wasm, 100);
      },
      MemoryError,
      "malloc returned null",
    );
  });

  it("double disposal protection", () => {
    const wasm = new MockWasmExports();
    using alloc = new WasmAlloc(wasm, 100);

    expect(wasm.getAllocatedCount()).toStrictEqual(1);
    alloc[Symbol.dispose]();
    expect(wasm.getAllocatedCount()).toStrictEqual(0);

    alloc[Symbol.dispose]();
    expect(wasm.getAllocatedCount()).toStrictEqual(0);
  });
});

describe("RAII Integration", () => {
  it("nested scopes with early returns", () => {
    const wasm = new MockWasmExports();

    function processData(shouldFail: boolean): number {
      using arena = new WasmArena(wasm);

      arena.alloc(100);
      arena.alloc(200);

      expect(wasm.getAllocatedCount()).toStrictEqual(2);

      if (shouldFail) {
        return -1;
      }

      const buf3 = arena.alloc(300);
      expect(wasm.getAllocatedCount()).toStrictEqual(3);

      return buf3.size;
    }

    expect(processData(true)).toStrictEqual(-1);
    expect(wasm.getAllocatedCount()).toStrictEqual(0);

    expect(processData(false)).toStrictEqual(300);
    expect(wasm.getAllocatedCount()).toStrictEqual(0);
  });

  it("composition of RAII objects", () => {
    const wasm = new MockWasmExports();

    function complexOperation(): Uint8Array {
      using arena1 = new WasmArena(wasm);
      using arena2 = new WasmArena(wasm);

      const input = arena1.allocBuffer(new Uint8Array([1, 2, 3, 4]));
      const output = arena2.alloc(input.size * 2);

      const inputData = input.read();
      const processedData = new Uint8Array(inputData.length * 2);
      processedData.set(inputData, 0);
      processedData.set(inputData, inputData.length);

      output.write(processedData);

      expect(wasm.getAllocatedCount()).toStrictEqual(2);
      return new Uint8Array(output.read().slice());
    }

    const result = complexOperation();
    expect(result).toStrictEqual(new Uint8Array([1, 2, 3, 4, 1, 2, 3, 4]));
    expect(wasm.getAllocatedCount()).toStrictEqual(0);
  });
});
