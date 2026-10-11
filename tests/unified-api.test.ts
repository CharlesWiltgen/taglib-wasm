/**
 * @fileoverview Tests for unified API with runtime detection and WASI optimization
 *
 * Tests the Phase 3.4 unified API implementation that maintains backward
 * compatibility while adding WASI optimizations for server environments.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { TagLibInitializationError } from "../src/errors/classes.ts";
import { detectRuntime } from "../src/runtime/detector.ts";
import {
  getRecommendedConfig,
  isWasiAvailable,
  loadUnifiedTagLibModule,
  ModuleLoadError,
} from "../src/runtime/unified-loader/index.ts";
import { loadTagLibModule, TagLib } from "../src/index.ts";
import { expectRejects } from "./_assert-helpers.ts";

describe("Runtime detection", () => {
  it("detects Node environment correctly", () => {
    const runtime = detectRuntime();

    expect(runtime.environment).toStrictEqual("node-wasi");
    expect(runtime.supportsFilesystem).toStrictEqual(true);
    expect(runtime.supportsStreaming).toStrictEqual(true);
    expect(runtime.performanceTier >= 1).toStrictEqual(true);

    console.log(
      `Detected runtime: ${runtime.environment}, performance tier: ${runtime.performanceTier}`,
    );
  });

  it("checks WASI availability", () => {
    const available = isWasiAvailable();

    expect(available).toStrictEqual(true);

    console.log(`WASI available: ${available}`);
  });

  it("provides recommended configuration for current environment", () => {
    const config = getRecommendedConfig();

    expect(config).not.toBeNull();
    expect(config).toBeDefined();
    expect(typeof config.disableOptimizations).toStrictEqual("boolean");

    console.log(`Recommended config:`, config);
  });
});

describe("Unified loader", () => {
  it("auto-detects optimal implementation", async () => {
    const module = await loadUnifiedTagLibModule();

    expect(module.isWasi).toStrictEqual(true);
    expect(module.isEmscripten).toStrictEqual(false);
    expect(module.runtime.environment).toStrictEqual("node-wasi");

    // The WASI unified module exposes metrics; assert the method exists
    // instead of probing it, so a missing method fails here rather than
    // silently skipping the assertions (taglib-ecnq).
    expect(typeof module.getPerformanceMetrics).toStrictEqual("function");
    const metrics = module.getPerformanceMetrics!();
    expect(typeof metrics.initTime).toStrictEqual("number");
    expect(metrics.wasmType).toStrictEqual("wasi");
    expect(metrics.environment).toStrictEqual("node-wasi");
  });

  it("supports forced Emscripten mode", async () => {
    const module = await loadUnifiedTagLibModule({
      forceWasmType: "emscripten",
    });

    expect(module.isWasi).toStrictEqual(false);
    expect(module.isEmscripten).toStrictEqual(true);
  });

  it("compares performance between implementations", async () => {
    const startWasi = performance.now();
    const wasiModule = await loadUnifiedTagLibModule({
      forceWasmType: "wasi",
    });
    const wasiTime = performance.now() - startWasi;

    const startEmscripten = performance.now();
    const emscriptenModule = await loadUnifiedTagLibModule({
      forceWasmType: "emscripten",
    });
    const emscriptenTime = performance.now() - startEmscripten;

    expect(wasiTime < 1000).toBeTruthy();
    expect(emscriptenTime < 1000).toBeTruthy();
    expect(wasiModule.isWasi).toStrictEqual(true);
    expect(emscriptenModule.isEmscripten).toStrictEqual(true);
  });

  it("selects Emscripten deterministically when wasmBinary is supplied in auto mode (taglib-pbz)", async () => {
    // The README offline pattern: bytes in, no forceWasmType. The WASI host
    // cannot consume bytes, so selection must route to Emscripten — not pick
    // WASI and silently ignore the caller's binary.
    const wasmBinary = new Uint8Array(
      readFileSync(new URL("../build/taglib-web.wasm", import.meta.url)),
    );
    const module = await loadUnifiedTagLibModule({ wasmBinary });
    expect(module.isEmscripten).toStrictEqual(true);
    expect(module.isWasi).toStrictEqual(false);
    expect(module.createFileHandle).not.toBeNull();
    expect(module.createFileHandle).toBeDefined();
  });

  it("rejects wasmBinary combined with forceWasmType 'wasi' (taglib-pbz)", async () => {
    await expectRejects(
      () =>
        loadUnifiedTagLibModule({
          forceWasmType: "wasi",
          wasmBinary: new Uint8Array([1, 2, 3]),
        }),
      ModuleLoadError,
      "wasmBinary",
    );
  });

  it("rejects a failing load when WASI is forced (no silent Emscripten fallback)", async () => {
    // Auto mode may fall back gracefully; an explicit forceWasmType "wasi"
    // must fail loudly instead of serving the other backend (taglib-3o4).
    await expectRejects(
      () =>
        loadUnifiedTagLibModule({
          forceWasmType: "wasi",
          wasmUrl: "/nonexistent/path.wasm",
        }),
      ModuleLoadError,
      "WASI",
    );
  });
});

describe("Main API", () => {
  it("rejects instead of falling back to Emscripten when forceWasmType 'wasi' fails (taglib-3o4)", async () => {
    // A nonexistent wasm path makes the WASI host fail. Without the guard,
    // the loader silently returned an Emscripten module here, masking
    // WASI-only failures (this hid a data-loss bug in the taglib-b67 review).
    await expectRejects(
      () =>
        loadTagLibModule({
          forceWasmType: "wasi",
          wasmUrl: "/nonexistent/taglib-wasi.wasm",
        }),
      TagLibInitializationError,
      "WASI",
    );
  });

  it("rejects wasmBinary + forceWasmType 'wasi' at the public API (taglib-pbz)", async () => {
    await expectRejects(
      () =>
        loadTagLibModule({
          forceWasmType: "wasi",
          wasmBinary: new Uint8Array([1, 2, 3]),
        }),
      TagLibInitializationError,
      "wasmBinary",
    );
  });

  it("maintains backward compatibility with auto-selection", async () => {
    const module = await loadTagLibModule();

    const fileHandle = module.createFileHandle();
    expect(typeof fileHandle.loadFromBuffer).toStrictEqual("function");
    expect(typeof fileHandle.isValid).toStrictEqual("function");
    expect(module.isWasi).toStrictEqual(true);
  });

  it("supports buffer mode", async () => {
    const module = await loadTagLibModule({ forceWasmType: "emscripten" });

    expect("runtime" in module).toStrictEqual(false);
    expect("isWasi" in module).toStrictEqual(false);
    expect("isEmscripten" in module).toStrictEqual(false);
    expect(typeof module.createFileHandle).toStrictEqual("function");
  });
});

describe("TagLib.initialize", () => {
  it("works with unified loader", async () => {
    const taglib = await TagLib.initialize();

    expect(typeof taglib.version).toStrictEqual("function");
    expect(
      /^\d+\.\d+\.\d+\S* \(TagLib \d+\.\d+\.\d+\)$/.test(taglib.version()),
    ).toBeTruthy();
  });

  it("works with options", async () => {
    const taglib1 = await TagLib.initialize({ forceWasmType: "wasi" });
    const taglib2 = await TagLib.initialize({ forceWasmType: "emscripten" });
    const taglib3 = await TagLib.initialize({ disableOptimizations: true });

    for (const taglib of [taglib1, taglib2, taglib3]) {
      expect(
        /^\d+\.\d+\.\d+\S* \(TagLib \d+\.\d+\.\d+\)$/.test(taglib.version()),
      ).toBeTruthy();
    }
  });

  it("returns dynamic version from WASI backend", async () => {
    const taglib = await TagLib.initialize({ forceWasmType: "wasi" });
    const version = taglib.version();
    expect(
      /^\d+\.\d+\.\d+\S* \(TagLib \d+\.\d+\.\d+\)$/.test(version),
    ).toBeTruthy();
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    expect(version.startsWith(packageJson.version)).toBeTruthy();
  });
});
