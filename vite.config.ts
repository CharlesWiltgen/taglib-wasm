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
    // Grows as files migrate; see the "migrated" glob below.
    include: ["tests/_assert-helpers.test.ts"],
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
