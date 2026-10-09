import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: { printWidth: 80 },
  lint: {
    options: { typeAware: true },
    // typeAware makes the type-checked rules AVAILABLE, not ENABLED.
    // Task 9 lists them explicitly after diffing against the current eslint output.
    rules: {},
  },
  test: {
    // Migrated files: grown as later tasks move tests off Deno onto Vitest.
    include: [
      "tests/_assert-helpers.test.ts",
      "tests/runtime-detector.test.ts",
      "tests/runtime-detector-unit.test.ts",
      "tests/unified-api.test.ts",
      "tests/unified-loader-components.test.ts",
      "tests/error-handling.test.ts",
      "tests/node-fs-acquisition.test.ts",
      "src/runtime/platform-io.test.ts",
      "tests/backend-adapter.ts",
      "tests/adts-label.test.ts",
      "tests/audio-properties.test.ts",
      "tests/auto-dispose.test.ts",
      "tests/backend-registration.test.ts",
      "tests/basic-tags.test.ts",
      "tests/checksum-input-contract.test.ts",
      "tests/cross-backend-parity.test.ts",
      "tests/date-roundtrip.test.ts",
      "tests/format-detection.test.ts",
      "tests/id3-format-detection.test.ts",
      "tests/input-validation.test.ts",
      "tests/integration-workflow.test.ts",
      "tests/media-checksum.test.ts",
      "tests/mp4-codec.test.ts",
      "tests/mp4-genre-precedence.test.ts",
      "tests/ogg-flavor-parity.test.ts",
      "tests/tag-roundtrip-property.test.ts",
      "tests/unicode-comprehensive.test.ts",
    ],
    passWithNoTests: true,
    pool: "forks",
    execArgv: ["--expose-gc"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    coverage: { provider: "v8", reporter: ["lcov", "text"] },
    reporters: ["default", "junit"],
    outputFile: { junit: "./junit.xml" },
  },
});
