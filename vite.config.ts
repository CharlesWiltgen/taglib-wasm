import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    printWidth: 80,
    // Vendored trees, generated artifacts, and repo-hygiene scratch that
    // `deno fmt` never scanned (its `fmt.exclude`), plus `lib/taglib/doc/`
    // and `lib/taglib/bindings/README`, which hard-error oxfmt's HTML/parser
    // pass (`SyntaxError: Unexpected closing tag "body"`, check exit 2).
    // oxfmt reads these as gitignore-style `ignorePatterns`, not `exclude`.
    ignorePatterns: [
      "lib/",
      "build/",
      "dist/",
      "docs/.vuepress/",
      "docs/index.html",
      ".ast-grep/rule-tests/__snapshots__/",
      ".beads/",
      ".omp/",
      ".serena/",
      ".worktrees/",
      ".coverage/",
      ".superpowers/",
    ],
  },
  lint: {
    options: { typeAware: true },
    // `options.typeAware` only makes the type-checked rules AVAILABLE, it does
    // not enable them, and oxlint's own defaults are mostly `warn`, so nothing
    // below exits non-zero on its own. `categories.correctness` is the lever
    // for the 111 rules oxlint enables by default (no-const-assign, the
    // no-unsafe-* family where it has a non-type-aware form, unicorn's
    // default set, …): they ran at `warn` and never failed the gate, while
    // both retired linters failed CI at `error`. Setting the category to
    // `error` restores that. `overrides` cannot set a category (oxlint accepts
    // only `files`/`rules`/… there), so the trees the retired linters never
    // linted at all are excluded from linting outright below.
    categories: { correctness: "error" },
    // Excluded by both retired linters (eslint.config.mjs `ignores` and
    // deno.json `lint.exclude`), so nothing in them was ever enforced —
    // keeping them unlinted is the pre-existing scope, not a new exemption.
    // Same scope the old `eslint .` and `deno lint` had.
    ignorePatterns: ["scripts/", "examples/", "tools/"],
    // Rules that oxlint does NOT enable by default (category `pedantic`,
    // `style`, `restriction`, or `correctness` with `default: false`) but
    // that a retired linter ran at `error`. Two sources:
    //   * the non-type-checked half of typescript-eslint's
    //     `recommendedTypeChecked` (the retired eslint.config.mjs extended that
    //     preset, so all 43 of its `error` rules were enforced for `src/`
    //     non-test). The 22 type-checked ones are listed first; the rest are
    //     below. Two of the preset's rules have no `typescript/` form in
    //     oxlint (`@typescript-eslint/no-array-constructor`,
    //     `@typescript-eslint/no-unused-expressions`), so their eslint core
    //     equivalents are enabled instead; `typescript/no-unused-vars` is off
    //     (both retired linters turned it off, and oxlint's `no-unused-vars`
    //     does not understand the `void x` idiom this repo uses).
    //   * deno lint's `recommended` set (87 rules, `deno lint` ran it at
    //     `error` over `src/` AND `tests/`). Its TS/ESLint rules that oxlint
    //     does not default-enable are enabled here, except `no-redeclare`:
    //     oxlint only ships the JS form, which reads `declare global {
    //     namespace Deno }` in src/global.d.ts as a redeclaration — legal TS
    //     that tsc checks, and the same reason typescript-eslint switches the
    //     core rule off for `.ts` files. Its rules that oxlint does not ship at
    //     all (`ban-untagged-ignore`, `no-sloppy-imports`, `no-window*`, the
    //     `jsx-*` set — this repo has no JSX, …) cannot be restored;
    //     `ban-types` / `no-empty-interface` are covered by their
    //     typescript-eslint v8 successors `no-unsafe-function-type`,
    //     `no-wrapper-object-types` and `no-empty-object-type`, which are
    //     already on via the category.
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

      // The `@typescript-eslint/ban-ts-comment` form of the retired eslint
      // config banned `@ts-nocheck` outright; deno lint's version (which also
      // covered `tests/`) allowed a directive that carries an explanation, and
      // the surviving four directives in this repo all carry one. Match deno's
      // semantics so those pre-existing, previously-green comments stay green.
      "typescript/ban-ts-comment": [
        "error",
        {
          "ts-check": "allow-with-description",
          "ts-expect-error": "allow-with-description",
          "ts-ignore": "allow-with-description",
          "ts-nocheck": "allow-with-description",
        },
      ],
      "typescript/adjacent-overload-signatures": "error",
      "typescript/no-empty-object-type": "error",
      "typescript/no-namespace": "error",
      "typescript/no-require-imports": "error",
      "typescript/no-unnecessary-type-constraint": "error",
      "typescript/no-unsafe-function-type": "error",
      "eslint/no-array-constructor": "error",
      "eslint/no-case-declarations": "error",
      "eslint/no-empty": "error",
      "eslint/no-fallthrough": "error",
      "eslint/no-inner-declarations": "error",
      "eslint/no-prototype-builtins": "error",
      "eslint/no-regex-spaces": "error",
      "eslint/no-var": "error",
      "eslint/prefer-const": "error",
      "eslint/prefer-rest-params": "error",
      "eslint/prefer-spread": "error",

      // Decisions inherited from the retired eslint.config.mjs (parity).
      // require-await is one of the 22 type-checked rules above in the preset
      // but the old config switched it off, so it stays off here.
      "typescript/require-await": "off",
      "typescript/no-explicit-any": "off",
      "no-unused-vars": "off",
    },
    overrides: [
      {
        // Tests were never type-checked by the retired eslint.config.mjs (it
        // ignored `tests/` and `**/*.test.ts`), so rules carrying pre-existing
        // findings there report at `warn`: new coverage, reported but not
        // gating. Every rule below with a finding in `tests/` was verified
        // against the pre-branch tree — the offending lines are byte-identical
        // at the base commit, so nothing here is a regression introduced by
        // this branch.
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
          "no-unused-expressions": "warn",
          "no-useless-escape": "warn",
          "unicorn/no-new-array": "warn",
          "unicorn/no-useless-length-check": "warn",
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
      // Rules that neither retired linter enforced for `src/` (unicorn's
      // default set is oxlint-only; deno lint's `no-useless-escape` is not in
      // its `recommended` tag and eslint.config.mjs did not enforce core
      // rules for `.ts`). Each finding below is byte-identical at the base
      // commit, so `warn` keeps the pre-existing finding visible instead of
      // gating the branch on it.
      {
        files: ["src/simple/batch-operations.ts"],
        rules: { "unicorn/no-new-array": "warn" },
      },
      {
        files: ["src/folder-api/folder-disc.ts"],
        rules: { "no-useless-escape": "warn" },
      },
      {
        files: ["src/runtime/wasi-adapter/structured-fields.ts"],
        rules: { "unicorn/no-useless-fallback-in-spread": "warn" },
      },
      {
        files: ["src/folder-api/album-identity.ts"],
        rules: { "unicorn/no-useless-spread": "warn" },
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
    pool: "forks",
    execArgv: ["--expose-gc"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    coverage: { provider: "v8", reporter: ["lcov", "text"] },
    reporters: ["default", "junit"],
    outputFile: { junit: "./junit.xml" },
  },
});
