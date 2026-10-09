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
    // The suite is split across tests/ (integration) and src/ (colocated unit
    // tests). These globs replace the per-batch include list the migration grew.
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    // Test files that must NOT run under Vitest:
    //  - bun-integration.test.ts registers with bun:test (npm run test:bun)
    //  - cross-runtime/ runs under three runtimes via tests/cross-runtime/run.sh
    //  - the four Deno-gated files import Deno-only modules, so `deno task test`
    //    owns them until phase 2 deletes or rewrites them.
    exclude: [
      "tests/bun-integration.test.ts",
      "tests/cross-runtime/**",
      "tests/deno-detect.test.ts",
      "tests/deno-compat-patches.test.ts",
      "tests/wasi-fs-provider.test.ts",
      "tests/offline-support.test.ts",
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
