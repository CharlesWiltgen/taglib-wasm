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
