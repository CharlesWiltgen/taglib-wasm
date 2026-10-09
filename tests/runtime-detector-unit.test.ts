import { describe, expect, it } from "vite-plus/test";
import { EnvironmentError } from "../src/errors/classes.ts";
import {
  canLoadWasmType,
  detectRuntime,
  type EnvironmentProfile,
  environmentProfile,
  getEnvironmentDescription,
  type RuntimeDetectionResult,
  type RuntimeEnvironment,
  supportsExnref,
} from "../src/runtime/detector.ts";
import { createPlatformIOFor } from "../src/runtime/platform-io.ts";
import {
  getRecommendedConfig,
  isWasiAvailable,
} from "../src/runtime/unified-loader/index.ts";
import { expectThrows } from "./_assert-helpers.ts";

describe("detectRuntime", () => {
  it("should detect node-wasi in the Node environment", () => {
    const result = detectRuntime();
    expect(result.environment).toStrictEqual("node-wasi");
    expect(result.wasmType).toStrictEqual("wasi");
    expect(result.supportsFilesystem).toStrictEqual(true);
    expect(result.supportsStreaming).toStrictEqual(true);
    expect(result.performanceTier).toStrictEqual(1);
  });
});

describe("getEnvironmentDescription", () => {
  it("should describe node-wasi", () => {
    expect(
      getEnvironmentDescription("node-wasi").includes("Node"),
    ).toStrictEqual(true);
  });

  it("should describe bun-wasi", () => {
    expect(getEnvironmentDescription("bun-wasi").includes("Bun")).toStrictEqual(
      true,
    );
  });

  it("should describe browser", () => {
    expect(
      getEnvironmentDescription("browser").includes("Browser"),
    ).toStrictEqual(true);
  });

  it("should describe worker", () => {
    expect(
      getEnvironmentDescription("worker").includes("Worker"),
    ).toStrictEqual(true);
  });

  it("should describe cloudflare", () => {
    expect(
      getEnvironmentDescription("cloudflare").includes("Cloudflare"),
    ).toStrictEqual(true);
  });

  it("should describe node-emscripten", () => {
    const desc = getEnvironmentDescription("node-emscripten");
    expect(desc.includes("Node")).toStrictEqual(true);
    expect(desc.includes("Emscripten")).toStrictEqual(true);
  });

  it("should handle unknown environment", () => {
    const desc = getEnvironmentDescription("unknown" as RuntimeEnvironment);
    expect(desc.includes("Unknown")).toStrictEqual(true);
  });
});

describe("canLoadWasmType", () => {
  it("should report wasi loadable in Node", () => {
    expect(canLoadWasmType("wasi")).toStrictEqual(true);
  });

  it("should always report emscripten as loadable", () => {
    expect(canLoadWasmType("emscripten")).toStrictEqual(true);
  });
});

describe("supportsExnref", () => {
  it("should return consistent results across calls", () => {
    expect(supportsExnref()).toStrictEqual(supportsExnref());
  });

  it("should return true in Node (supports exnref natively)", () => {
    expect(supportsExnref()).toStrictEqual(true);
  });
});

/**
 * Exhaustive environment->backend table (taglib-2b4). The values are the
 * CONTRACT: which environments get the WASI backend, which get a
 * filesystem, what streaming/tier they advertise. detectRuntime() is just
 * the sniffer that picks the row.
 */
const ALL_ENVIRONMENTS: RuntimeEnvironment[] = [
  "node-wasi",
  "bun-wasi",
  "browser",
  "worker",
  "cloudflare",
  "node-emscripten",
];

const WASI_ENVIRONMENTS: RuntimeEnvironment[] = ["node-wasi", "bun-wasi"];

const FILESYSTEM_ENVIRONMENTS: RuntimeEnvironment[] = [
  "node-wasi",
  "bun-wasi",
  "node-emscripten",
];

function profileFor(env: RuntimeEnvironment): EnvironmentProfile {
  return environmentProfile(env);
}

function resultFor(env: RuntimeEnvironment): RuntimeDetectionResult {
  return { environment: env, ...profileFor(env) };
}

describe("environmentProfile (taglib-2b4)", () => {
  it("maps every environment to a complete profile", () => {
    for (const env of ALL_ENVIRONMENTS) {
      const profile = profileFor(env);
      expect(typeof profile.wasmType).toStrictEqual("string");
      expect(typeof profile.supportsFilesystem).toStrictEqual("boolean");
      expect(typeof profile.supportsStreaming).toStrictEqual("boolean");
      expect([1, 2, 3].includes(profile.performanceTier)).toStrictEqual(true);
    }
  });

  it("selects the wasi binary only for the wasi-capable environments", () => {
    for (const env of ALL_ENVIRONMENTS) {
      const expected = WASI_ENVIRONMENTS.includes(env) ? "wasi" : "emscripten";
      expect(profileFor(env).wasmType).toStrictEqual(expected);
    }
  });

  it("grants filesystem support to wasi environments plus node-emscripten", () => {
    for (const env of ALL_ENVIRONMENTS) {
      expect(profileFor(env).supportsFilesystem).toStrictEqual(
        FILESYSTEM_ENVIRONMENTS.includes(env),
      );
    }
  });

  it("marks cloudflare as the only non-streaming environment", () => {
    for (const env of ALL_ENVIRONMENTS) {
      expect(profileFor(env).supportsStreaming).toStrictEqual(
        env !== "cloudflare",
      );
    }
  });

  it("detectRuntime derives its result from the profile table", () => {
    const result = detectRuntime();
    expect(result).toStrictEqual(resultFor(result.environment));
  });
});

describe("canLoadWasmType with synthetic environment (taglib-2b4)", () => {
  it("reports wasi loadable only in wasi environments", () => {
    for (const env of ALL_ENVIRONMENTS) {
      expect(canLoadWasmType("wasi", env)).toStrictEqual(
        WASI_ENVIRONMENTS.includes(env),
      );
    }
  });

  it("reports emscripten loadable everywhere", () => {
    for (const env of ALL_ENVIRONMENTS) {
      expect(canLoadWasmType("emscripten", env)).toStrictEqual(true);
    }
  });

  it("defaults to the detected environment", () => {
    expect(canLoadWasmType("wasi")).toStrictEqual(
      canLoadWasmType("wasi", detectRuntime().environment),
    );
  });
});

describe("selection helpers with synthetic runtime (taglib-2b4)", () => {
  it("isWasiAvailable follows the wasi + filesystem predicate", () => {
    for (const env of ALL_ENVIRONMENTS) {
      expect(isWasiAvailable(resultFor(env))).toStrictEqual(
        WASI_ENVIRONMENTS.includes(env),
      );
    }
  });

  it("getRecommendedConfig forces emscripten in browsers", () => {
    expect(getRecommendedConfig(resultFor("browser"))).toStrictEqual({
      forceWasmType: "emscripten",
      disableOptimizations: false,
    });
  });

  it("getRecommendedConfig forces wasi where wasi + filesystem hold", () => {
    for (const env of WASI_ENVIRONMENTS) {
      expect(getRecommendedConfig(resultFor(env))).toStrictEqual({
        forceWasmType: "wasi",
        disableOptimizations: false,
      });
    }
  });

  it("getRecommendedConfig never forces wasi without a wasi backend", () => {
    // node-emscripten has a filesystem but no wasi — forcing wasi there
    // would select a binary the runtime cannot load (taglib-2b4).
    for (const env of ["node-emscripten", "worker", "cloudflare"] as const) {
      expect(getRecommendedConfig(resultFor(env))).toStrictEqual({
        disableOptimizations: false,
      });
    }
  });
});

describe("createPlatformIOFor routing (taglib-2b4)", () => {
  it("provides an IO implementation for every filesystem environment", () => {
    for (const env of FILESYSTEM_ENVIRONMENTS) {
      const io = createPlatformIOFor(env);
      expect(typeof io.readFile).toStrictEqual("function");
      expect(typeof io.writeFile).toStrictEqual("function");
      expect(typeof io.stat).toStrictEqual("function");
    }
  });

  it("throws EnvironmentError for filesystem-less environments", () => {
    for (const env of ["browser", "worker", "cloudflare"] as const) {
      expectThrows(
        () => createPlatformIOFor(env),
        EnvironmentError,
        "does not support filesystem operations",
      );
    }
  });
});
