# Contributing to TagLib-Wasm

Thank you for your interest in contributing to TagLib-Wasm! This document
provides guidelines and instructions for contributing.

## 🤝 Code of Conduct

Be respectful and constructive in all interactions. We're here to build great
software together.

## 🚀 Getting Started

### Prerequisites

- **Node.js 24+** - Primary development runtime (Active LTS; matches the CI matrix)
- **npm 11+** - The package manager; run `npm ci` before any `vp` command
- **Deno 2.x** - Still required for the TypeScript bundle scripts, the auxiliary scripts, and JSR publishing (retired in phase 3)
- **Emscripten SDK** - For building the Emscripten Wasm backend
- **WASI SDK 34** - For building the WASI Wasm backend (optional for TS-only changes)
- **Git** - With submodule support

### Development Setup

1. **Clone the repository** (includes TagLib, mpack, and msgpack submodules)

   ```bash
   git clone --recurse-submodules https://github.com/CharlesWiltgen/TagLib-Wasm.git
   cd TagLib-Wasm
   ```

2. **Install Emscripten** (required for Wasm builds)

   ```bash
   # Follow instructions at https://emscripten.org/docs/getting_started/downloads.html
   # Or use brew on macOS:
   brew install emscripten
   ```

3. **Install WASI SDK** (only needed if modifying the WASI backend)

   ```bash
   bash build/setup-wasi-sdk.sh        # Downloads WASI SDK 34 (stock sysroot ships C++ exceptions)
   ```

4. **Build the project**

   ```bash
   npm ci                        # Install dependencies (Node 24+, npm)
   npm run build:wasm            # Rebuild both Wasm backends
   npm run build:wasm:emscripten # Rebuild Emscripten Wasm only
   npm run build:wasm:wasi       # Rebuild WASI Wasm only
   ```

   > After changing `lib/taglib` or `src/capi/`, rebuild **both** backends and
   > commit both binaries. They are committed artifacts, and shipping one built
   > from a different TagLib than the other is a silent cross-backend skew. CI's
   > `wasm-freshness` job fails a commit that moves `lib/taglib` without them.

5. **Run the pre-push gates**

   ```bash
   npx vp fmt --check                        # format gate (`npx vp fmt` fixes)
   npx vp lint --type-aware                  # lint gate
   npx tsc --noEmit -p tsconfig.check.json   # type gate (tests included)
   npx vp test                               # tests (Vitest)
   npm run build:ts                          # bundle gate (bundler-resolution check)
   ```

   > `npm ci` must run before any `npx vp` command — `vp` loads
   > `vite.config.ts` strictly and aborts without the `vite-plus`
   > devDependency. `npx vp test` is a **Vite+ built-in**, not the npm `test`
   > script (run that one with `vpr test`). Deno is no longer the dev toolchain
   > for tests, formatting, linting or type checking; it remains only for the
   > TypeScript bundle scripts, the auxiliary scripts, and JSR publishing
   > (`deno publish`) until phase 3. `npm run build:ts` builds the shippable
   > bundles and catches bundler-resolution breaks (e.g. a JSR import that isn't
   > an npm dependency) that pass the tests but break the published package.

## 📝 Development Guidelines

### Code Style

- **TypeScript**: Strict mode enabled, no `any` types without justification
- **Formatting**: Use the Vite+ formatter (`npx vp fmt` to fix, `npx vp fmt --check` to verify)
- **Linting**: Pass `npx vp lint --type-aware`
- **Comments**: JSDoc for all public APIs

### Project Structure

```
TagLib-Wasm/
├── src/            # TypeScript source (core runtime, types, errors)
│   ├── capi/       # C/C++ binding layer (Wasm shim, MessagePack, boundary)
│   └── runtime/    # WASI host implementation
├── build/          # Build scripts (Emscripten + WASI)
├── tests/          # Test files
├── docs/           # Documentation site
├── examples/       # Usage examples
├── simple.ts       # Simple API entry point
├── index.ts        # Full API entry point
├── folder.ts       # Folder API entry point
└── lib/            # Git submodules (taglib, mpack, msgpack)
```

### Key Files

- `build/taglib_embind.cpp` - Emscripten C++ wrapper using Embind
- `src/capi/taglib_shim.cpp` - WASI C++ shim (FileRef-based)
- `src/capi/core/taglib_boundary.c` - Pure C WASI exports
- `src/taglib.ts` - Core TypeScript API
- `simple.ts` - Simple API entry point
- `tests/index.test.ts` - Main test suite

## 🧪 Testing

### Running Tests

```bash
# Tests (Vitest): 97 files across tests/ and src/
npx vp test

# Watch mode
npx vp test --watch

# Run a specific test file
npx vp test tests/basic-tags.test.ts

# The bun:test-registered integration file and the cross-runtime suite are
# excluded from the Vitest gate; run them separately:
npm run test:bun
bash tests/cross-runtime/run.sh
```

### Writing Tests

- Import `describe`/`it`/`expect` from **`vite-plus/test`** (not `vitest`)
- Use `tests/_assert-helpers.ts` for the assertion strengths Vitest's built-ins
  do not cover (`expectDefined`, `expectThrows`, `expectRejects`)
- Place tests in `tests/` directory
- Follow existing test patterns
- Test both success and error cases
- Include edge cases for new features

Example test:

```typescript
import { describe, expect, it } from "vite-plus/test";

describe("Feature", () => {
  it("description", async () => {
    const taglib = await TagLib.initialize();
    const audioFile = await taglib.open(testFile);
    try {
      // Test your feature
      expect(result).toStrictEqual(expected);
    } finally {
      audioFile.dispose();
    }
  });
});
```

## 💻 Making Changes

### Workflow

1. **Fork the repository**
2. **Create a feature branch**

   ```bash
   git checkout -b feat/your-feature-name
   # or
   git checkout -b fix/issue-description
   ```

3. **Make your changes**
   - Write code following the style guide
   - Add tests for new functionality
   - Update documentation as needed

4. **Test your changes**

   ```bash
   npx vp fmt --check                        # format gate (`npx vp fmt` fixes)
   npx vp lint --type-aware                  # lint gate
   npx tsc --noEmit -p tsconfig.check.json   # type gate (tests included)
   npx vp test                               # tests (Vitest)
   npm run build:ts                          # bundle gate (bundler-resolution check)
   ```

   > `npx vp test` runs the Vitest suite; `npm run test:bun` runs the
   > bun:test-registered file and `tests/cross-runtime/run.sh` runs the
   > cross-runtime suite. `npm ci` must precede every `npx vp` command
   > (`vp` loads `vite.config.ts` strictly). `npm run build:ts` builds the
   > shippable bundles and catches bundler-resolution breaks (e.g. a JSR import
   > that isn't an npm dependency) that pass the tests but break the published
   > package.

5. **Commit your changes**
   - Follow [Conventional Commits](https://www.conventionalcommits.org/)
   - See commit examples below

6. **Push and create PR**
   ```bash
   git push origin feat/your-feature-name
   ```

### Commit Message Format

Use the Conventional Commits specification:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

#### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Test additions or modifications
- `chore`: Maintenance tasks
- `perf`: Performance improvements

#### Examples

```
feat: add FLAC metadata support
fix: resolve memory leak in dispose method
docs: update API reference for SimpleAPI
test: add edge cases for Unicode handling
chore: update TagLib to v2.1.1
```

## 🔧 Building WebAssembly

The project has two Wasm backends:

| Backend    | Script                          | Used by           | C++ entry point            |
| ---------- | ------------------------------- | ----------------- | -------------------------- |
| Emscripten | `npm run build:wasm:emscripten` | Browsers, Workers | `build/taglib_embind.cpp`  |
| WASI       | `npm run build:wasm:wasi`       | Node.js           | `src/capi/taglib_shim.cpp` |

After C++ changes, rebuild the affected backend and test thoroughly.

### C++ Guidelines

- All C++ files **must** use `-fwasm-exceptions` (not `-fexceptions`) for consistent EH
- The WASI boundary layer (`taglib_boundary.c`) is pure C — keep it that way
- Validate all inputs from JavaScript/TypeScript side
- See `.claude/rules/wasm-exception-handling.md` for detailed EH constraints

## 📚 Documentation

### When to Update Docs

Update documentation when you:

- Add new features
- Change API behavior
- Fix confusing aspects
- Add examples

### Documentation Structure

- `README.md` - Main project documentation
- `docs/api/` - API reference
- `docs/guide/` - User guides and tutorials
- `examples/` - Working code examples

## 🐛 Reporting Issues

### Before Creating an Issue

1. Check existing issues
2. Try with the latest version
3. Verify it's not a TagLib limitation

### Issue Template

```markdown
**Description** Clear description of the issue

**Steps to Reproduce**

1. Code example
2. Expected behavior
3. Actual behavior

**Environment**

- taglib-wasm version:
- Runtime: [Node.js/Bun/Browser]
- OS:

**Additional Context** Error messages, logs, etc.
```

## 🚀 Pull Request Process

1. **Ensure all tests pass**
2. **Update documentation** if needed
3. **Add tests** for new features
4. **Keep PRs focused** - one feature/fix per PR
5. **Fill out PR template** completely

### PR Template

```markdown
## Description

Brief description of changes

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing

- [ ] All tests pass
- [ ] Added new tests
- [ ] Tested on [Node.js/Bun/Browser]

## Checklist

- [ ] Follows code style
- [ ] Updated documentation
- [ ] Added to CHANGELOG (if applicable)
```

## 🔄 Updating TagLib

TagLib is a git submodule at `lib/taglib/`. To update:

```bash
cd lib/taglib
git fetch --tags
git checkout v2.2.1  # or desired version
cd ../..
git add lib/taglib
git commit -m "chore: update TagLib to v2.2.1"
```

## 🚀 Releasing

Releases are cut from `main` with one command — **but the automated path is
currently non-functional** (see the warning below):

```bash
deno task release              # auto-increment patch version
deno task release 2.3.0        # explicit version
deno task release:quick 2.3.0  # same gates and same flow, but do not wait for the result
```

> **Blocked pending phase 3.** `scripts/release-safe.sh` still runs the retired
> gates as its first checks — `deno fmt --check` (`:83`), `deno lint` (`:92`) and
> `deno check` (`:101`). `deno fmt --check` fails by design on the vp-formatted
> tree, so every `deno task release` exits 1 at its first check.
>
> The failure output suggests **`Run 'deno task fmt' to fix formatting` — do not
> run it.** `deno task fmt` reformats the whole tree back to Deno style and
> breaks the `npx vp fmt --check` gate. Release automation is migrated in phase
> 3; until then, releases are blocked. JSR publishing still uses `deno publish`
> (`release-safe.sh`) until phase 3 replaces that leg.

`scripts/release-safe.sh` runs the gates, bumps the version, pushes the bump
commit, **waits for CI to pass on that commit**, verifies the npm publish path
(`scripts/check-publish-access.sh`), and then dispatches
`publish-everywhere.yml` and waits for the result.

That workflow builds the package, publishes JSR → npm → GitHub Packages, and —
**only once every registry has the version** — creates the tag and the GitHub
release, with notes taken from the CHANGELOG section for that version. Nothing
is tagged before the release is real, so a failed publish leg cannot leave a
released-but-unpublished version. The tag points at the commit the workflow
built, not at whatever `main` happens to be when the run finishes.

A manually created GitHub release still triggers the same workflow
(`on: release: types: [published]`), which is the escape hatch if you need to
publish from a release object someone else created. Use
`deno task release:quick <version>` (equivalent to `SKIP_PUBLISH_WATCH=1`) to
dispatch without waiting — the gates and the publish flow are identical.

### npm authentication

There is no publish token. The npm leg uses OIDC trusted publishing, authorized
by a per-package trusted-publisher entry that pins the repository **and the
workflow filename**. If the entry is missing or names something else, the npm
leg fails. Check it before releasing:

```bash
scripts/check-publish-access.sh
```

Reading trust configs needs `npm login --auth-type=web` plus a fresh browser 2FA
approval, which is why this is a preflight step rather than a CI gate.
`release-safe.sh` runs it automatically and refuses to continue on a definitive
failure.

That entry currently pins the repository and workflow filename only. A GitHub
Environment with required reviewers — which would make an _approved_ publish,
rather than repository write access, the thing that grants publish rights — is
prepared but **not landed**; `.claude/skills/publish/SKILL.md` § "Release
Approval Gate" carries the three-step sequence, the npm-side command, and why it
is gated. When it lands, every `npm trust github` command here and in the
recovery section below needs `--env release` added.

### Recovering a release

Nothing is tagged or released until every registry has the version, so a failure
means a clean retry rather than a half-published version:

1. **Partial publish** (some registries lack the version) — re-run the failed
   legs of the same run:

   ```bash
   gh run rerun <run-id> --failed
   ```

   A re-run keeps the original `should-publish` decision, so it still runs even
   though the version is already live on npm. A _fresh_ dispatch would skip every
   publish leg — the workflow turns itself off when npm already has the version.

2. **Missing or mismatched trusted publisher** — create the entry, then re-run:

   ```bash
   npm login --auth-type=web
   npm trust github taglib-wasm --file publish-everywhere.yml \
     --repository CharlesWiltgen/TagLib-Wasm --allow-publish -y
   ```

   `--allow-publish` matters: entries created in the npm web UI default to
   stage-publish only, which refuses `npm publish`.

3. A failed leg writes a failure summary (with rollback commands) to the run
   summary, and no tag or release is created. A tag conflict — the version's tag
   already exists at a different commit — also fails the run instead of
   publishing a release for the wrong commit.

Registry reads lag the publish: verify a version with the immutable endpoint
(`https://registry.npmjs.org/taglib-wasm/<version>`), never `npm view` — the
packument is CDN-cached and can answer "not found" for minutes after a
successful publish.

## ❓ Questions?

- Open a discussion on GitHub
- Check existing issues
- Review the documentation

## 🙏 Thank You!

Your contributions make taglib-wasm better for everyone. We appreciate your time
and effort!
