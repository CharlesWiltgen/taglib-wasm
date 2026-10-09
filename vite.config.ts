import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: { printWidth: 80 },
  lint: {
    options: { typeAware: true },
    // `options.typeAware` only makes the type-checked rules AVAILABLE, it does
    // not enable them, so the type-checked set of typescript-eslint's
    // `recommendedTypeChecked` is listed by name below. Measured against the
    // installed typescript-eslint v8 preset: 23 rules carry
    // `requiresTypeChecking` (not 24 — the brief listed `no-throw-literal`,
    // which v8 removed from the preset in favour of `only-throw-error` and
    // which oxlint does not ship as a `typescript/` rule at all).
    //
    // Severity is the strictest that keeps `vp lint --type-aware` green: a rule
    // is `error` when it has no findings anywhere, `warn` when it has
    // pre-existing findings. 12 of the 23 fire; every one of those findings
    // predates this task and all but 3 of them live outside the `src/` scope
    // the retired eslint.config.mjs policed. Promoting them to `error` would
    // fail the gate on code this task is not allowed to rewrite.
    rules: {
      // --- no findings: kept at the preset's severity ---------------------
      "typescript/await-thenable": "error",
      "typescript/no-array-delete": "error",
      "typescript/no-duplicate-type-constituents": "error",
      "typescript/no-for-in-array": "error",
      "typescript/no-misused-promises": "error",
      "typescript/no-unsafe-enum-comparison": "error",
      "typescript/no-unsafe-unary-minus": "error",
      "typescript/only-throw-error": "error",
      "typescript/prefer-promise-reject-errors": "error",
      "typescript/restrict-plus-operands": "error",

      // --- pre-existing findings (counts from the all-error probe) --------
      "typescript/no-unsafe-call": "warn", // 586
      "typescript/no-unsafe-member-access": "warn", // 563
      "typescript/no-unsafe-assignment": "warn", // 261
      "typescript/no-unsafe-argument": "warn", // 129
      "typescript/no-unnecessary-type-assertion": "warn", // 85 (3 in src/)
      "typescript/restrict-template-expressions": "warn", // 22
      "typescript/unbound-method": "warn", // 16
      "typescript/no-unsafe-return": "warn", // 14
      "typescript/no-redundant-type-constituents": "warn", // 3
      "typescript/no-implied-eval": "warn", // 1
      "typescript/no-floating-promises": "warn", // 1
      "typescript/no-base-to-string": "warn", // 1

      // --- decisions inherited from the retired eslint.config.mjs ---------
      // `require-await` is one of the 23 above, but the old config switched it
      // off (as it did the two below), so it stays off for parity.
      "typescript/require-await": "off",
      "typescript/no-explicit-any": "off",
      "no-unused-vars": "off",
    },
    overrides: [
      {
        // Multi-runtime boundary code that necessarily uses `any` for
        // globalThis.Deno / .Bun / .process runtime detection. The old ESLint
        // config turned the whole `no-unsafe-*` family off for these five
        // files; oxlint's per-file `overrides` express the same thing.
        files: [
          "src/folder-api/file-processors.ts",
          "src/msgpack/decoder.ts",
          "src/msgpack/utils.ts",
          "src/runtime/detector.ts",
          "src/runtime/module-loader.ts",
        ],
        rules: {
          "typescript/no-unsafe-argument": "off",
          "typescript/no-unsafe-assignment": "off",
          "typescript/no-unsafe-call": "off",
          "typescript/no-unsafe-member-access": "off",
          "typescript/no-unsafe-return": "off",
        },
      },
    ],
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
