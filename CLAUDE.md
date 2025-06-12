# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commit Message Guidelines

**Use [Conventional Commits](https://www.conventionalcommits.org/) specification for all commit messages:**

```text
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Common Types

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that do not affect the meaning of the code (white-space, formatting, etc)
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `test`: Adding missing tests or correcting existing tests
- `chore`: Changes to the build process or auxiliary tools and libraries
- `perf`: A code change that improves performance
- `ci`: Changes to CI configuration files and scripts

### Examples

- `feat(api): add ReplayGain metadata support`
- `fix(wasm): resolve memory corruption in buffer allocation`
- `docs(readme): update installation instructions for JSR`
- `refactor(tests): move test-files to tests directory`
- `chore(deps): update TagLib to v2.1`

## Project Overview

**✅ STATUS: PRODUCTION READY & PUBLISHED** - This is a complete WebAssembly port of TagLib v2.1 with TypeScript bindings for universal audio metadata handling across browsers, Node.js, Deno, Bun, and Cloudflare Workers. The project successfully compiles the C++ TagLib library to WASM and provides a modern TypeScript API wrapper.

**📦 Published Packages:**

- **JSR**: `jsr:@charleswiltgen/taglib-wasm` (Deno-optimized)
- **NPM**: `taglib-wasm` (Node.js, Bun, browsers)

**🎯 All major functionality is working:**

- ✅ File loading from memory buffers (5/5 formats: WAV, MP3, FLAC, OGG, M4A)
- ✅ Audio properties reading (duration, bitrate, sample rate, etc.)
- ✅ Basic tag reading/writing (title, artist, album, year, genre, etc.)
- ✅ Advanced metadata support (AcoustID, MusicBrainz, ReplayGain)
- ✅ Memory management with proper cleanup
- ✅ Multi-runtime support (Deno 2, Node.js, Bun, browsers, Cloudflare Workers)
- ✅ Format-agnostic metadata handling
- ✅ Comprehensive test suite
- ✅ Professional documentation

## Architecture

### Entry Points (Ecosystem-Specific)

- **`index.ts`**: NPM entry point (Node.js, Bun, browsers) - uses Emscripten JS
- **`mod.ts`**: JSR entry point (Deno) - JSR-compatible WASM loading

### Core Implementation

- **`src/`**: Complete TypeScript wrapper and API definitions (✅ IMPLEMENTED)
  - `taglib.ts` - Core TagLib and AudioFile classes (NPM version)
  - `taglib-jsr.ts` - JSR-optimized TagLib implementation
  - `types.ts` - Complete TypeScript type definitions
  - `wasm.ts` - Emscripten WASM module interface
  - `wasm-jsr.ts` - JSR-compatible WASM loading
  - `workers.ts` - Cloudflare Workers compatibility layer
  - `enhanced-api.ts` - Advanced metadata features

### Build System

- **`build/`**: WASM compilation and C++ wrapper (✅ PRODUCTION READY)
  - `build-wasm.sh` - Complete build script with C++ wrapper implementation
  - `taglib.js` - Generated Emscripten JavaScript module
  - `taglib.wasm` - Compiled WebAssembly binary

### Documentation & Examples

- **`docs/`**: Comprehensive documentation
  - `Automatic-Tag-Mapping.md` - Format-agnostic metadata guide
  - `Runtime-Compatibility.md` - Runtime-specific information
  - `Implementation.md` - Technical implementation details
  - `Publishing.md` - Package publishing guide
- **`examples/`**: Production-ready usage examples
  - `basic-usage.ts` - Core functionality demo
  - `advanced-metadata.ts` - Advanced features demo
  - `replaygain-soundcheck.ts` - Volume normalization demo
  - `deno/`, `bun/`, `node/`, `browser/`, `workers/` - Runtime-specific examples

### **Testing**

- **`tests/`**: Comprehensive test suite and test data (✅ ALL PASSING)
  - `test-systematic.ts` - Complete format testing
  - `test-workers.ts` - Cloudflare Workers compatibility
  - `test-files/` - Sample audio files (WAV, MP3, FLAC, OGG, M4A)
  - `taglib_test.ts` - Deno test framework integration

### Dependencies

- **`lib/taglib/`**: Git subtree containing TagLib v2.1 C++ source code

The project uses Emscripten to compile TagLib C++ to WebAssembly with a custom C++ wrapper that bridges TagLib's object-oriented API to C functions suitable for WASM exports. The TypeScript wrapper provides a modern async API that works across all JavaScript runtimes.

## Development Commands

### Deno (Primary Development Environment)

- `deno task build:wasm` - Compile TagLib C++ to WebAssembly using Emscripten
- `deno task build:ts` - Compile TypeScript wrapper to JavaScript
- `deno task build` - Full build (WASM + TypeScript)
- `deno task test` - Run all tests in tests/ directory
- `deno task test:watch` - Run tests in watch mode
- `deno task test:systematic` - Run comprehensive format testing
- `deno task dev` - Development mode with file watching
- `deno task fmt` - Format code with Deno formatter
- `deno task lint` - Lint code with Deno linter
- `deno task check` - Type check the project

### NPM (Multi-Runtime Compatibility)

- `npm run build:wasm` - Compile TagLib C++ to WebAssembly using Emscripten
- `npm run build:ts` - Compile TypeScript wrapper to JavaScript
- `npm run build` - Full build (WASM + TypeScript)
- `npm run test` - Run systematic test with Deno
- `npm run test:bun` - Run systematic test with Bun
- `npm run test:node` - Run systematic test with Node.js

### Publishing

- `npm run publish:npm` - Publish to NPM registry
- `npm run publish:jsr` - Publish to JSR registry
- `npm run publish:all` - Publish to both registries

### TagLib Management

- `./scripts/update-taglib.sh [version]` - Update TagLib subtree to new version (defaults to v2.1)

## Key Technical Details

### Package Management

- **Dual Distribution**: NPM (`taglib-wasm`) + JSR (`@charleswiltgen/taglib-wasm`)
- **Ecosystem-Specific Entry Points**: `index.ts` (NPM) + `mod.ts` (JSR)
- **Git Subtree**: TagLib dependency managed at `lib/taglib/`

### Build & Compatibility

- **Target**: ES2020 with ESNext modules for broad compatibility
- **Build Tool**: Emscripten SDK for WASM compilation
- **Runtime Management**: mise for Node.js/Deno version management
- **Supported Runtimes**: Deno 2, Node.js, Bun, browsers, Cloudflare Workers

### Audio Format Support

- **Fully Tested**: WAV, MP3 (ID3v1/v2), MP4/M4A, FLAC, OGG Vorbis (5/5 working)
- **Additional Formats**: Opus, APE, MPC, WavPack, TrueAudio, etc. (via TagLib)
- **Format Detection**: Automatic based on file content

### Metadata Features

- **Basic Tags**: Title, artist, album, year, genre, track, comment
- **Automatic Tag Mapping**: AcoustID fingerprints, MusicBrainz IDs
- **Volume Normalization**: ReplayGain, Apple Sound Check
- **Format-Agnostic**: Single API works across all audio formats

## Development Environment & Setup

### Required Tools

- **Deno 2** (primary development runtime)
- **Node.js** (latest LTS for NPM compatibility)
- **Emscripten SDK** (for WASM compilation)
- **mise** (runtime version management via `mise.toml`)

### Development Workflow

1. **Setup**: Install Deno, Node.js, Emscripten SDK
2. **Build**: `deno task build` (compiles WASM + TypeScript)
3. **Test**: `deno task test` (runs comprehensive test suite)
4. **Format**: `deno task fmt` (formats all code)
5. **Lint**: `deno task lint` (checks code quality)

### VSCode Integration

- **Settings**: `.vscode/settings.json` configures Deno formatting
- **Markdown**: Soft-wrapped at 80 characters with MD013 disabled
- **Extensions**: Deno extension recommended for full TypeScript support

## Critical Implementation Details

### ✅ Memory Management Solution

The most critical discovery was that **manual memory copying with `HEAPU8.set()` causes data corruption**. The solution is to use **Emscripten's `allocate()` function**:

```typescript
// ❌ WRONG - causes data corruption
const ptr = module._malloc(buffer.length);
module.HEAPU8.set(buffer, ptr);

// ✅ CORRECT - reliable data transfer
const ptr = module.allocate(buffer, module.ALLOC_NORMAL);
```

This applies to:

- File buffer loading in `TagLib.openFile()`
- String conversion in `jsToCString()`

### ✅ C++ Wrapper Architecture

TagLib's C++ API is bridged through custom C functions that:

- Use `TagLib::ByteVectorStream` for in-memory file processing
- Manage C++ objects via integer IDs for memory safety
- Handle UTF-8 string conversion automatically
- Support all major audio formats through format detection
- Export format-agnostic metadata APIs

### ✅ Build System

The `build-wasm.sh` script:

- Compiles TagLib with all format support enabled
- Includes a complete C++ wrapper implementation
- Exports all necessary functions via Emscripten
- Generates optimized WASM + JavaScript modules
- Supports both Emscripten JS and JSR-compatible builds

### ✅ Dual Distribution Strategy

#### NPM Package (`taglib-wasm`)

- Entry: `index.ts`
- Uses: Emscripten-generated `taglib.js`
- Runtimes: Node.js, Bun, browsers
- Includes: Generated JavaScript for full compatibility

#### JSR Package (`@charleswiltgen/taglib-wasm`)

- Entry: `mod.ts`
- Uses: Direct WASM loading
- Runtime: Deno (JSR requirements)
- Excludes: Generated JavaScript (JSR restriction)

## Current Status

**✅ PRODUCTION READY & PUBLISHED** – All major functionality is implemented, tested, and published:

### Functionality

- ✅ 5/5 audio formats working (WAV, MP3, FLAC, OGG, M4A)
- ✅ Complete TypeScript API with full type safety
- ✅ Advanced metadata features (AcoustID, MusicBrainz, ReplayGain)
- ✅ Format-agnostic tag handling
- ✅ Memory management with proper cleanup

### Quality Assurance

- ✅ Comprehensive test suite (all tests passing)
- ✅ Multi-runtime testing (Deno, Node.js, Bun)
- ✅ Production examples for all runtimes
- ✅ Cloudflare Workers compatibility

### Documentation

- ✅ Complete README with installation & usage
- ✅ Advanced metadata documentation
- ✅ Runtime compatibility guide
- ✅ Technical implementation details
- ✅ Publishing & maintenance guides

### Distribution

- ✅ Published to JSR (`@charleswiltgen/taglib-wasm`)
- ✅ Published to NPM (`taglib-wasm`)
- ✅ Ecosystem-appropriate entry points
- ✅ ShowHN-ready repository structure

### Project Organization

- ✅ Clean repository structure (tests/, docs/, examples/)
- ✅ Conventional Commits for version control
- ✅ Development environment configuration
- ✅ Automated formatting and linting

## Important Development Guidelines

### Code Quality

- **Formatting**: Use `deno fmt` for all code formatting
- **Linting**: Run `deno lint` before commits
- **Testing**: Ensure `deno task test` passes before publishing
- **Type Safety**: Maintain strict TypeScript compliance

### File Organization

- **Tests**: All test-related files in `tests/` directory
- **Documentation**: All `.md` files in `docs/` except README.md and CLAUDE.md
- **Examples**: Runtime-specific examples in appropriate subdirectories
- **Entry Points**: Ecosystem-specific (`index.ts` for NPM, `mod.ts` for JSR)

### Commit Guidelines

- **Format**: Use Conventional Commits specification
- **Scope**: Include relevant scope when applicable
- **Description**: Clear, concise action description
- **Footer**: Include breaking changes and issue references
- **IMPORTANT**: DO NOT include Claude Code credits in commit messages. The user will handle attribution separately

### Publishing Workflow

1. Update version in `package.json` and `deno.json`
2. Run full test suite: `deno task test`
3. Build all targets: `deno task build`
4. Publish to registries: `npm run publish:all`
5. Tag release with conventional commit format

## important-instruction-reminders

- Do what has been asked; nothing more, nothing less.
- NEVER create files unless they're absolutely necessary for achieving your goal.
- ALWAYS prefer editing an existing file to creating a new one.
- NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
- ALWAYS use Conventional Commits specification for commit messages.
