/**
 * @fileoverview Tests for runtime detection logic
 *
 * Tests all runtime environment detection scenarios and ensures
 * optimal WASM binary selection for each environment type.
 */

import { describe, expect, it } from "vite-plus/test";
import {
  canLoadWasmType,
  checkNodeVersion,
  detectRuntime,
  getEnvironmentDescription,
  type RuntimeEnvironment,
} from "../src/runtime/detector.ts";

describe("RuntimeDetector", () => {
  it("detectRuntime - returns valid result structure", () => {
    const result = detectRuntime();

    // Verify all required fields are present
    expect(result.environment).not.toBeNull();
    expect(result.environment).toBeDefined();
    expect(result.wasmType).not.toBeNull();
    expect(result.wasmType).toBeDefined();
    expect(typeof result.supportsFilesystem).toStrictEqual("boolean");
    expect(typeof result.supportsStreaming).toStrictEqual("boolean");
    expect(typeof result.performanceTier).toStrictEqual("number");

    // Verify performance tier is valid
    expect([1, 2, 3].includes(result.performanceTier)).toStrictEqual(true);

    // Verify wasmType is valid
    expect(["wasi", "emscripten"].includes(result.wasmType)).toStrictEqual(
      true,
    );
  });

  it("detectRuntime - Node environment detection", () => {
    const result = detectRuntime();

    // In the Vitest/Node runtime, should detect node-wasi
    expect(result.environment).toStrictEqual("node-wasi");
    expect(result.wasmType).toStrictEqual("wasi");
    expect(result.supportsFilesystem).toStrictEqual(true);
    expect(result.supportsStreaming).toStrictEqual(true);
    expect(result.performanceTier).toStrictEqual(1);
  });

  it("detectRuntime - Bun environment returns bun-wasi", () => {
    const globalAny = globalThis as Record<string, unknown>;
    try {
      // Deno runtime support removed in phase 2; this case no longer has a subject.
      globalAny.Bun = { version: "1.3.8" };

      const result = detectRuntime();
      expect(result.environment).toStrictEqual("bun-wasi");
      expect(result.wasmType).toStrictEqual("wasi");
      expect(result.supportsFilesystem).toStrictEqual(true);
      expect(result.supportsStreaming).toStrictEqual(true);
      expect(result.performanceTier).toStrictEqual(1);
    } finally {
      delete globalAny.Bun;
    }
  });

  it("getEnvironmentDescription - provides human-readable descriptions", () => {
    const environments: RuntimeEnvironment[] = [
      "node-wasi",
      "bun-wasi",
      "browser",
      "worker",
      "cloudflare",
      "node-emscripten",
    ];

    for (const env of environments) {
      const description = getEnvironmentDescription(env);
      expect(typeof description).toStrictEqual("string");
      expect(description.length > 0).toStrictEqual(true);
      // Description should contain the environment name
      expect(
        description.toLowerCase().includes(env.split("-")[0]),
      ).toStrictEqual(true);
    }
  });

  it("canLoadWasmType - WASI availability check", () => {
    // Under Node, WASI should be available
    expect(canLoadWasmType("wasi")).toStrictEqual(true);

    // Emscripten should always be available
    expect(canLoadWasmType("emscripten")).toStrictEqual(true);
  });

  it("checkNodeVersion - accepts valid versions", () => {
    expect(checkNodeVersion("22.6.0")).toStrictEqual(undefined);
    expect(checkNodeVersion("22.11.0")).toStrictEqual(undefined);
    expect(checkNodeVersion("23.0.0")).toStrictEqual(undefined);
    expect(checkNodeVersion("24.1.3")).toStrictEqual(undefined);
  });

  it("checkNodeVersion - rejects versions below 22.6.0", () => {
    const err20 = checkNodeVersion("20.18.1");
    expect(err20 !== undefined).toStrictEqual(true);
    expect(err20!.includes("22.6.0")).toStrictEqual(true);
    expect(err20!.includes("20.18.1")).toStrictEqual(true);

    const err22old = checkNodeVersion("22.5.9");
    expect(err22old !== undefined).toStrictEqual(true);

    const err18 = checkNodeVersion("18.20.0");
    expect(err18 !== undefined).toStrictEqual(true);
  });

  it("checkNodeVersion - returns undefined for non-Node environments", () => {
    expect(checkNodeVersion(undefined)).toStrictEqual(undefined);
  });
});
