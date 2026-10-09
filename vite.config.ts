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
    // They default to `error`, the severity the retired eslint.config.mjs ran
    // them at, so a `src/` non-test violation fails the gate. Two deviations,
    // both scoped by `overrides` below rather than by lowering the default:
    //   * `scripts/`, `examples/`, `tools/` — excluded by both retired linters
    //     (eslint.config.mjs `ignores`, deno.json `lint.exclude`), so the rules
    //     are off there;
    //   * `tests/**` and every `*.test.ts` — never linted by the type-checked
    //     set (eslint.config.mjs ignored them), so the rules that carry
    //     pre-existing findings report at `warn`: new coverage, reported but
    //     not gating.
    rules: {
      "typescript/await-thenable": "error",
      "typescript/no-array-delete": "error",
      "typescript/no-base-to-string": "error",
      "typescript/no-duplicate-type-constituents": "error",
      "typescript/no-floating-promises": "error",
      "typescript/no-for-in-array": "error",
      "typescript/no-implied-eval": "error",
      "typescript/no-misused-promises": "error",
      "typescript/no-redundant-type-constituents": "error",
      "typescript/no-unnecessary-type-assertion": "error",
      "typescript/no-unsafe-argument": "error",
      "typescript/no-unsafe-assignment": "error",
      "typescript/no-unsafe-call": "error",
      "typescript/no-unsafe-enum-comparison": "error",
      "typescript/no-unsafe-member-access": "error",
      "typescript/no-unsafe-return": "error",
      "typescript/no-unsafe-unary-minus": "error",
      "typescript/only-throw-error": "error",
      "typescript/prefer-promise-reject-errors": "error",
      "typescript/restrict-plus-operands": "error",
      "typescript/restrict-template-expressions": "error",
      "typescript/unbound-method": "error",

      // Decisions inherited from the retired eslint.config.mjs (parity).
      // require-await is one of the 23 above but the old config switched it
      // off, so it stays off here.
      "typescript/require-await": "off",
      "typescript/no-explicit-any": "off",
      "no-unused-vars": "off",
    },
    overrides: [
      {
        // Excluded by both retired linters, so the type-checked set is not
        // enforced here — same scope the old `eslint .` and `deno lint` had.
        files: ["scripts/**", "examples/**", "tools/**"],
        rules: {
          "typescript/await-thenable": "off",
          "typescript/no-array-delete": "off",
          "typescript/no-base-to-string": "off",
          "typescript/no-duplicate-type-constituents": "off",
          "typescript/no-floating-promises": "off",
          "typescript/no-for-in-array": "off",
          "typescript/no-implied-eval": "off",
          "typescript/no-misused-promises": "off",
          "typescript/no-redundant-type-constituents": "off",
          "typescript/no-unnecessary-type-assertion": "off",
          "typescript/no-unsafe-argument": "off",
          "typescript/no-unsafe-assignment": "off",
          "typescript/no-unsafe-call": "off",
          "typescript/no-unsafe-enum-comparison": "off",
          "typescript/no-unsafe-member-access": "off",
          "typescript/no-unsafe-return": "off",
          "typescript/no-unsafe-unary-minus": "off",
          "typescript/only-throw-error": "off",
          "typescript/prefer-promise-reject-errors": "off",
          "typescript/restrict-plus-operands": "off",
          "typescript/restrict-template-expressions": "off",
          "typescript/unbound-method": "off",
        },
      },
      {
        // Tests were never type-checked by the retired eslint.config.mjs
        // (it ignored `tests/` and `**/*.test.ts`), so these rules are new
        // coverage over them. The twelve that carry pre-existing findings are
        // reported at `warn` so the gate stays green; the rest stay `error`.
        files: ["tests/**", "**/*.test.ts"],
        rules: {
          "typescript/no-base-to-string": "warn",
          "typescript/no-floating-promises": "warn",
          "typescript/no-implied-eval": "warn",
          "typescript/no-redundant-type-constituents": "warn",
          "typescript/no-unnecessary-type-assertion": "warn",
          "typescript/no-unsafe-argument": "warn",
          "typescript/no-unsafe-assignment": "warn",
          "typescript/no-unsafe-call": "warn",
          "typescript/no-unsafe-member-access": "warn",
          "typescript/no-unsafe-return": "warn",
          "typescript/restrict-template-expressions": "warn",
          "typescript/unbound-method": "warn",
        },
      },
      {
        // The only rule with a genuine dist/ dependence: these two assertions
        // are flagged only while the gitignored `dist/taglib-wrapper.js` is
        // present, so at `error` the local gate reds on a build artifact while
        // CI (no dist/) stays green. `warn` keeps the finding visible on both.
        files: [
          "src/runtime/module-loader-browser.ts",
          "src/runtime/unified-loader/module-loading.ts",
        ],
        rules: {
          "typescript/no-unnecessary-type-assertion": "warn",
        },
      },
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
